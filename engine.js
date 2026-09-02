// SIMONS MUSIKMASKINE — lydmotor v2
// Voice-baseret synth pr. trig med parameter-locks, 2 oscillatorer + drift, glide,
// pitch/filter-envelopes (LP/HP/BP), ADSR med gate, choke-grupper, drive + bitcrusher,
// kick-ducking (sidechain-pump) paa spor og fx-busser, probability/ratchets/conditions,
// polymeter (laengde pr. spor), tempo-synkede delay/reverb-sends og master-filter → limiter.
// Alt kan renderes offline 1:1 til WAV-eksport.

export function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function noteName(m) { return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1); }

// ---------- små helpers ----------
const noiseCache = new WeakMap();
function noiseBuf(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}
const irCache = new WeakMap();
function getIR(ctx) {
  let b = irCache.get(ctx);
  if (!b) {
    const sr = ctx.sampleRate, len = Math.floor(sr * 2.2);
    b = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    irCache.set(ctx, b);
  }
  return b;
}
function driveCurve(amount) {
  const k = 1 + amount * 30, n = 256, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * k) / Math.tanh(k) * (1 - amount * 0.25) + x * amount * 0.05;
  }
  return c;
}
// eksponentiel cutoff-mapping 0..1 -> 40..18000 Hz
export function cutHz(v) { return 40 * Math.pow(18000 / 40, Math.max(0, Math.min(1, v))); }

// ---------- bitcrusher (AudioWorklet, virker ogsaa i OfflineAudioContext) ----------
const CRUSH_SRC = `registerProcessor('smcrush', class extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 16, minValue: 1.5, maxValue: 16 },
      { name: 'down', defaultValue: 1, minValue: 1, maxValue: 50 },
    ];
  }
  constructor() { super(); this.hold = [0, 0]; this.cnt = [0, 0]; }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    const bits = params.bits, down = params.down;
    for (let ch = 0; ch < out.length; ch++) {
      const x = inp[ch] || inp[0], y = out[ch];
      if (!x) { y.fill(0); continue; }
      for (let i = 0; i < y.length; i++) {
        const b = bits.length > 1 ? bits[i] : bits[0];
        const d = down.length > 1 ? down[i] : down[0];
        if (--this.cnt[ch] <= 0) {
          this.cnt[ch] = Math.max(1, Math.round(d));
          const q = Math.pow(2, b - 1);
          this.hold[ch] = Math.round(x[i] * q) / q;
        }
        y[i] = this.hold[ch];
      }
    }
    return true;
  }
});`;
let crushUrl = null;
async function ensureCrush(ctx) {
  if (ctx.__crushOk !== undefined) return ctx.__crushOk;
  try {
    if (!crushUrl) crushUrl = URL.createObjectURL(new Blob([CRUSH_SRC], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(crushUrl);
    ctx.__crushOk = true;
  } catch (e) {
    ctx.__crushOk = false;
  }
  return ctx.__crushOk;
}

// ---------- master + fx-busser + spor-kaeder ----------
export async function buildRig(ctx, st) {
  const crushOk = await ensureCrush(ctx);
  const master = ctx.createGain();
  master.gain.value = st.masterVol ?? 0.9;
  // master-filter: 0.5 = aabent, <0.5 lowpass, >0.5 highpass (DJ-style)
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.9;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = 0.9;
  setMasterFilter({ lp, hp }, st.masterFilter ?? 0.5);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4; limiter.knee.value = 2; limiter.ratio.value = 20;
  limiter.attack.value = 0.002; limiter.release.value = 0.18;
  master.connect(lp); lp.connect(hp); hp.connect(limiter); limiter.connect(ctx.destination);

  // delay-bus (tempo-synket) med feedback + toneformning + duck
  const dIn = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.value = delayTimeSec(st);
  const fb = ctx.createGain(); fb.gain.value = st.delayFb ?? 0.4;
  const dHp = ctx.createBiquadFilter(); dHp.type = 'highpass'; dHp.frequency.value = 180;
  const dLp = ctx.createBiquadFilter(); dLp.type = 'lowpass'; dLp.frequency.value = 6500;
  const dOut = ctx.createGain(); dOut.gain.value = 0.9;
  const duckD = ctx.createGain();
  dIn.connect(delay); delay.connect(dHp); dHp.connect(dLp); dLp.connect(dOut);
  dLp.connect(fb); fb.connect(delay);
  dOut.connect(duckD); duckD.connect(master);

  // reverb-bus + duck
  const vIn = ctx.createGain();
  const conv = ctx.createConvolver(); conv.buffer = getIR(ctx);
  const vOut = ctx.createGain(); vOut.gain.value = 0.9;
  const duckV = ctx.createGain();
  vIn.connect(conv); conv.connect(vOut); vOut.connect(duckV); duckV.connect(master);

  // spor-kaeder: voices -> trackIn -> [crush] -> duckGain -> trackGain -> master
  const trackIns = [], crush = [], duckGains = [], trackGains = [];
  st.tracks.forEach(tr => {
    const tin = ctx.createGain();
    const dg = ctx.createGain();
    const g = ctx.createGain();
    g.gain.value = trackGainVal(st, tr);
    let head = tin;
    let cr = null;
    if (crushOk) {
      try {
        cr = new AudioWorkletNode(ctx, 'smcrush', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
        head.connect(cr); head = cr;
      } catch (e) { cr = null; }
    }
    head.connect(dg); dg.connect(g); g.connect(master);
    trackIns.push(tin); crush.push(cr); duckGains.push(dg); trackGains.push(g);
  });
  return { ctx, master, lp, hp, limiter, delay, fb, dIn, vIn, duckD, duckV, trackIns, crush, duckGains, trackGains, choke: {} };
}
export function trackGainVal(st, tr) {
  const anySolo = st.tracks.some(t => t.solo);
  const audible = anySolo ? tr.solo : !(tr.mute || tr._emute); // _emute = song-trins mute-maske
  return audible ? tr.level : 0;
}
export function delayTimeSec(st, bpm = null) {
  // punkteret 8.-del som standard; st.delayDiv i 16.-dele (3 = punkteret 8.)
  return (60 / (bpm || st.bpm) / 4) * (st.delayDiv ?? 3);
}
export function mfFreqs(v) {
  let lpF = 18000, hpF = 22;
  if (v < 0.5) lpF = 60 * Math.pow(18000 / 60, v / 0.5);
  else if (v > 0.5) hpF = 22 * Math.pow(6000 / 22, (v - 0.5) / 0.5);
  return { lpF, hpF };
}
export function setMasterFilter(rig, v) {
  const f = mfFreqs(v);
  rig.lp.frequency.value = f.lpF;
  rig.hp.frequency.value = f.hpF;
}

// ---------- song-kaede (arrangements-trin) ----------
// et trin: {p: patternIdx, reps: antal gennemloeb, mutes: [8×bool]|null, name,
//           bpm: tempo-override for trinnet (null = sangens BPM),
//           mf/vol/pump: automations-vaerdier ved trinnets SLUT (null = ingen breakpoint),
//           riser: bool, boom: bool, fillLast: bool}
export function songEntry(e) {
  return typeof e === 'number' ? { p: e, reps: 1, mutes: null } : e;
}
export function entrySteps(st, e) { return st.patterns[e.p].len * (e.reps || 1); }
export function entryStartSteps(st, idx) {
  let a = 0;
  for (let i = 0; i < Math.min(idx, st.song.length); i++) a += entrySteps(st, songEntry(st.song[i]));
  return a;
}
export function songDurationSec(st) {
  let sec = 0;
  for (const raw of st.song) {
    const e = songEntry(raw);
    sec += entrySteps(st, e) * (60 / (e.bpm || st.bpm) / 4);
  }
  return sec;
}
// automation: breakpoints ved trin-slut, lineaer interpolation imellem (mf/vol/pump)
export function buildAuto(st, key) {
  const pts = [];
  let acc = 0;
  for (const raw of st.song) {
    const e = songEntry(raw);
    acc += entrySteps(st, e);
    if (e[key] !== undefined && e[key] !== null) pts.push({ atStep: acc, v: e[key] });
  }
  return { pts, total: acc };
}
export function autoAt(auto, initV, s) {
  const { pts } = auto;
  if (!pts.length) return null;
  let prevStep = 0, prevV = initV;
  for (const p of pts) {
    if (s <= p.atStep) {
      const span = p.atStep - prevStep;
      return span <= 0 ? p.v : prevV + (p.v - prevV) * ((s - prevStep) / span);
    }
    prevStep = p.atStep; prevV = p.v;
  }
  return pts[pts.length - 1].v;
}

// ---------- build-vaerktoejer: riser + boom ----------
export function schedRiser(rig, t, dur) {
  const ctx = rig.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf(ctx); src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
  bp.frequency.setValueAtTime(180, t);
  bp.frequency.exponentialRampToValueAtTime(7500, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + dur);   // eksponentiel = foeles lineaer
  g.gain.setTargetAtTime(0.0001, t + dur, 0.02);       // klip praecis ved nedslaget
  src.connect(bp); bp.connect(g); g.connect(rig.master);
  const vs = ctx.createGain(); vs.gain.value = 0.3;
  g.connect(vs); vs.connect(rig.vIn);
  src.start(t); src.stop(t + dur + 0.4);
}
export function schedBoom(rig, t) {
  const ctx = rig.ctx;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(36, t + 0.35);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.9, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  o.connect(og); og.connect(rig.master);
  o.start(t); o.stop(t + 1.6);
  const ns = ctx.createBufferSource(); ns.buffer = noiseBuf(ctx);
  const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 2600;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.5, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  ns.connect(nf); nf.connect(ng); ng.connect(rig.master);
  const vs = ctx.createGain(); vs.gain.value = 0.5;
  ng.connect(vs); vs.connect(rig.vIn);
  ns.start(t); ns.stop(t + 0.6);
}
// ved indgang til et song-trin: mute-maske + riser/boom
export function enterEntry(rig, st, entry, t, entryDurSec) {
  st.tracks.forEach((tr, i) => {
    tr._emute = !!(entry.mutes && entry.mutes[i]);
    rig.trackGains[i].gain.setTargetAtTime(trackGainVal(st, tr), Math.max(t, 0), 0.01);
  });
  if (entry.riser) schedRiser(rig, t, entryDurSec);
  if (entry.boom) schedBoom(rig, t);
}

// ---------- kick-duck (sidechain-pump) ----------
function duckOne(g, depth, t, rel) {
  if (!depth || depth <= 0.01) return;
  try { g.cancelScheduledValues(t); } catch (e) {}
  g.setValueAtTime(1, t);
  g.linearRampToValueAtTime(1 - depth * 0.96, t + 0.006);
  g.setTargetAtTime(1, t + 0.02, rel / 3);
}
export function schedDuck(rig, st, t) {
  const rel = Math.max(0.05, (60 / st.bpm) * 0.55);
  const src = st.duckTrack ?? 0;
  const pump = st._pumpAuto ?? st.pumpFx ?? 0; // _pumpAuto = song-automationens vaerdi
  st.tracks.forEach((tr, i) => {
    if (i === src) return;
    duckOne(rig.duckGains[i].gain, tr.patch.duck ?? 0, t, rel);
  });
  duckOne(rig.duckD.gain, pump, t, rel);
  duckOne(rig.duckV.gain, pump, t, rel);
}

// ---------- selve stemmen ----------
// patch: {wave, note, sub, noise, drift, wave2, semi2, det2, mix2,
//         glide, penv, pdec, ftype, cut, res, fenv, fdec,
//         att, dec, sus, rel, gate, drive, crush, down,
//         lrate, lamt, ldst, pan, duck, choke, sendD, sendV}
// step:  {v (0..1), n (halvtone-offset), l (locks), p (chance), r (ratchet), c (condition)}
const OSC_TYPES = { saw: 'sawtooth', sqr: 'square', tri: 'triangle', sin: 'sine' };
export function trig(rig, trIdx, patch, step, t, st, glideFrom = null, stepDur = 0.125) {
  const ctx = rig.ctx;
  const p = { ...patch, ...(step && step.l ? step.l : null) };
  const vel = step ? (step.v ?? 1) : 1;
  const midi = (p.note ?? 48) + (step?.n || 0);
  const f = midiToFreq(midi);
  const dec = Math.max(0.03, p.dec ?? 0.3);
  const att = Math.max(0.001, p.att ?? 0.002);
  const sus = p.sus ?? 0;
  const rel = Math.max(0.02, p.rel ?? 0.25);
  const gateDur = Math.max(att + 0.01, (p.gate ?? 1) * stepDur);
  const holdOn = sus > 0.02;
  const stopT = holdOn ? t + gateDur + rel * 2.5 + 0.3 : t + att + dec + 0.6;
  const driftC = (p.drift ?? 0) * 12; // op til ±12 cents pr. anslag

  const mix = ctx.createGain();
  mix.gain.value = 1;
  const freqParams = [];
  if ((p.wave ?? 'saw') !== 'noise') {
    const o = ctx.createOscillator();
    o.type = OSC_TYPES[p.wave] || 'sawtooth';
    o.frequency.value = f;
    if (driftC) o.detune.value = (Math.random() * 2 - 1) * driftC;
    o.start(t); o.stop(stopT);
    o.connect(mix);
    freqParams.push({ fp: o.frequency, mul: 1 });
    if ((p.sub ?? 0) > 0.02) {
      const s = ctx.createOscillator();
      s.type = 'sine'; s.frequency.value = f / 2;
      s.start(t); s.stop(stopT);
      const sg = ctx.createGain(); sg.gain.value = p.sub;
      s.connect(sg); sg.connect(mix);
      freqParams.push({ fp: s.frequency, mul: 0.5 });
    }
  }
  // oscillator 2 (detune/interval — hoover, stabs, bredde)
  if ((p.wave2 ?? 'off') !== 'off') {
    const mul2 = Math.pow(2, (p.semi2 ?? 0) / 12);
    const o2 = ctx.createOscillator();
    o2.type = OSC_TYPES[p.wave2] || 'sawtooth';
    o2.frequency.value = f * mul2;
    o2.detune.value = (p.det2 ?? 0) + (driftC ? (Math.random() * 2 - 1) * driftC : 0);
    o2.start(t); o2.stop(stopT);
    const g2 = ctx.createGain(); g2.gain.value = p.mix2 ?? 0.5;
    o2.connect(g2); g2.connect(mix);
    freqParams.push({ fp: o2.frequency, mul: mul2 });
  }
  if ((p.noise ?? 0) > 0.02 || p.wave === 'noise') {
    const ns = ctx.createBufferSource();
    ns.buffer = noiseBuf(ctx); ns.loop = true;
    ns.start(t); ns.stop(stopT);
    const ng = ctx.createGain();
    ng.gain.value = p.wave === 'noise' ? 1 : p.noise;
    ns.connect(ng); ng.connect(mix);
  }
  // glide (portamento) — fra forrige tone paa sporet
  if (glideFrom && (p.glide ?? 0) > 0.01) {
    for (const { fp, mul } of freqParams) {
      fp.setValueAtTime(glideFrom * mul, t);
      fp.exponentialRampToValueAtTime(f * mul, t + 0.02 + p.glide * 0.3);
    }
  }
  // pitch-envelope (kick/tom/zap)
  if ((p.penv ?? 0) > 0.1) {
    for (const { fp, mul } of freqParams) {
      fp.setValueAtTime(f * mul * Math.pow(2, p.penv / 12), t);
      fp.exponentialRampToValueAtTime(f * mul, t + Math.max(0.01, p.pdec ?? 0.06));
    }
  }
  // LFO
  let lfoG = null;
  if ((p.lamt ?? 0) > 0.02 && (p.ldst ?? 'off') !== 'off') {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = p.lrate ?? 5;
    lfo.start(t); lfo.stop(stopT);
    lfoG = ctx.createGain();
    lfo.connect(lfoG);
    if (p.ldst === 'pitch') {
      lfoG.gain.value = p.lamt * f * 0.06;
      freqParams.forEach(({ fp }) => lfoG.connect(fp));
    }
  }
  // drive -> filter -> amp
  let head = mix;
  if ((p.drive ?? 0) > 0.02) {
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(p.drive);
    const comp = ctx.createGain(); comp.gain.value = 1 / (1 + p.drive * 0.8);
    head.connect(ws); ws.connect(comp); head = comp;
  }
  const flt = ctx.createBiquadFilter();
  flt.type = { lp: 'lowpass', hp: 'highpass', bp: 'bandpass' }[p.ftype ?? 'lp'] || 'lowpass';
  flt.Q.value = (p.res ?? 0) * 18;
  const baseCut = cutHz(p.cut ?? 0.8);
  if ((p.fenv ?? 0) > 0.02) {
    const peak = Math.min(18000, baseCut * Math.pow(2, p.fenv * 6));
    flt.frequency.setValueAtTime(Math.max(baseCut, 40), t);
    flt.frequency.setValueAtTime(peak, t + 0.001);
    flt.frequency.exponentialRampToValueAtTime(Math.max(baseCut, 40), t + Math.max(0.02, p.fdec ?? 0.15));
  } else {
    flt.frequency.value = baseCut;
  }
  if (lfoG && p.ldst === 'cut') {
    lfoG.gain.value = p.lamt * baseCut * 0.9;
    lfoG.connect(flt.frequency);
  }
  // amp-envelope: AD (sus=0, som foer) eller ADSR med gate
  const amp = ctx.createGain();
  const peakG = 0.75 * vel * (p.gainMul ?? 1);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(peakG, t + att);
  if (holdOn) {
    amp.gain.setTargetAtTime(peakG * sus, t + att, Math.max(0.01, dec / 3));
    amp.gain.setTargetAtTime(0.0001, t + gateDur, rel / 3);
  } else {
    amp.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
  }
  if (lfoG && p.ldst === 'amp') {
    lfoG.gain.value = p.lamt * peakG * 0.5;
    lfoG.connect(amp.gain);
  }
  // choke-gruppe: nyt trig kvaeler alt der spiller i samme gruppe
  const chokeGrp = p.choke ?? 0;
  if (chokeGrp > 0) {
    const grp = rig.choke[chokeGrp] || (rig.choke[chokeGrp] = []);
    for (const v of grp) {
      try { v.cancelAndHoldAtTime(t); } catch (e) { try { v.cancelScheduledValues(t); } catch (e2) {} }
      v.setTargetAtTime(0.0001, t, 0.005);
    }
    grp.length = 0;
    grp.push(amp.gain);
  }
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, p.pan ?? 0));
  head.connect(flt); flt.connect(amp); amp.connect(pan);
  pan.connect(rig.trackIns[trIdx]);
  // bitcrusher-indstillinger (pr. spor-insert; p-locks skrives paa trig-tidspunktet)
  const cr = rig.crush[trIdx];
  if (cr) {
    try {
      cr.parameters.get('bits').setValueAtTime(16 - (p.crush ?? 0) * 14, t);
      cr.parameters.get('down').setValueAtTime(1 + (p.down ?? 0) * 39, t);
    } catch (e) {}
  }
  // sends (post-fader-agtigt: efter amp, uafhaengigt af spor-gain)
  if ((p.sendD ?? 0) > 0.02) {
    const g = ctx.createGain(); g.gain.value = p.sendD * trackGainVal(st, st.tracks[trIdx]);
    pan.connect(g); g.connect(rig.dIn);
  }
  if ((p.sendV ?? 0) > 0.02) {
    const g = ctx.createGain(); g.gain.value = p.sendV * trackGainVal(st, st.tracks[trIdx]);
    pan.connect(g); g.connect(rig.vIn);
  }
  return f;
}

// ---------- planlaegning ----------
// afgoer om et step fyrer (condition + probability)
export function stepFires(step, loops, fill) {
  if (!step || !step.on) return false;
  const c = step.c;
  if (c === 'fill' && !fill) return false;
  if (c === '!fill' && fill) return false;
  if (c === '1:2' && loops % 2 !== 0) return false;
  if (c === '2:2' && loops % 2 !== 1) return false;
  if (c === '1:4' && loops % 4 !== 0) return false;
  if (c === '4:4' && loops % 4 !== 3) return false;
  if ((step.p ?? 1) < 1 && Math.random() > step.p) return false;
  return true;
}
export function trackLen(pattern, tr) {
  return (pattern.tlen && pattern.tlen[tr]) || pattern.len;
}
// planlaeg ét absolut step for alle spor (polymeter: hvert spor har sin egen laengde).
// entry.cells[tr] kan overstyre et spor i et song-trin (clip-model):
//   {p: kilde-pattern, n: transponering, lvl: niveau 0..1, cut: cutoff-override}
export function schedStepAbs(rig, st, pattern, absStep, t, stepDur, lastFreqs, forceFill = false, entry = null) {
  const loops = Math.floor(absStep / pattern.len);
  const fill = !!st._fill || forceFill;
  const src = st.duckTrack ?? 0;
  for (let tr = 0; tr < st.tracks.length; tr++) {
    const cell = entry && entry.cells ? entry.cells[tr] : null;
    const pat = cell && cell.p != null ? st.patterns[cell.p] : pattern;
    const idx = absStep % trackLen(pat, tr);
    const step = pat.steps[tr][idx];
    if (!stepFires(step, loops, fill)) continue;
    const track = st.tracks[tr];
    const vScale = cell?.lvl ?? 1;
    const nOff = cell?.n ?? 0;
    const cellL = cell && cell.cut != null ? { ...(step.l || {}), cut: cell.cut } : step.l;
    const r = Math.max(1, Math.min(8, step.r ?? 1));
    for (let k = 0; k < r; k++) {
      const subT = t + (k * stepDur) / r;
      let subStep = step;
      if (k > 0 || vScale !== 1 || nOff || cellL !== step.l) {
        subStep = { ...step,
          v: (step.v ?? 1) * vScale * (k > 0 ? Math.max(0.3, 1 - k * 0.13) : 1),
          n: (step.n || 0) + nOff,
          l: cellL };
      }
      lastFreqs[tr] = trig(rig, tr, track.patch, subStep, subT, st, lastFreqs[tr], stepDur);
      if (tr === src) schedDuck(rig, st, subT);
    }
  }
}

export class Player {
  constructor(getState) {
    this.getState = getState;
    this.ctx = null;
    this.playing = false;
    this.stepLog = [];
  }
  ensureCtx() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  async play(startEntry = 0) {
    const ctx = this.ensureCtx();
    this.stop();
    const st = this.getState();
    st.tracks.forEach(tr => { tr._emute = false; });
    st._pumpAuto = null;
    this.rig = await buildRig(ctx, st);
    this.playing = true;
    this.absStep = 0;      // absolut 16.-dels-taeller i det aktuelle pattern
    const se = Math.max(0, Math.min(startEntry, Math.max(0, st.song.length - 1)));
    this.songPtr = se;     // position i song-kaeden
    this.entryLoop = 0;    // gennemloeb inde i det aktuelle song-trin
    this.songStep = entryStartSteps(st, se); // absolut step-taeller gennem sangen (automation)
    this._entryKey = null;
    this._lastPatIdx = null;
    this.autos = { mf: buildAuto(st, 'mf'), vol: buildAuto(st, 'vol'), pump: buildAuto(st, 'pump') };
    this.inits = { mf: st.masterFilter ?? 0.5, vol: st.masterVol ?? 0.9, pump: st.pumpFx ?? 0 };
    this.autoMF = null;
    this.autoVol = null;
    this.curBpm = st.bpm;
    this.lastFreqs = new Array(st.tracks.length).fill(null);
    this.nextTime = ctx.currentTime + 0.1;
    this.stepLog = [];
    this.timer = setInterval(() => this._tick(), 25);
    this._tick();
  }
  // hop til et song-trin: koeet ved naeste pattern-graense under afspilning
  jumpTo(entryIdx) {
    const st = this.getState();
    if (!this.playing) return;
    st._jumpEntry = entryIdx;
  }
  _tick() {
    const ctx = this.ctx;
    const st = this.getState();
    if (!this.rig) return;
    while (this.nextTime < ctx.currentTime + 0.14) {
      const songMode = st.mode === 'song' && st.song.length > 0;
      let entry = null, patIdx;
      if (songMode) {
        entry = songEntry(st.song[this.songPtr % st.song.length]);
        patIdx = entry.p;
      } else {
        patIdx = st.curPattern;
      }
      if (this._lastPatIdx !== null && patIdx !== this._lastPatIdx) {
        this.absStep = 0; // nyt pattern -> alle spor resynkes (Elektron-stil)
      }
      this._lastPatIdx = patIdx;
      const pat = st.patterns[patIdx];
      const effBpm = (songMode && entry.bpm) ? entry.bpm : st.bpm;
      this.curBpm = effBpm;
      const stepDur = 60 / effBpm / 4;
      // song-trin-indgang: mute-maske, riser, boom
      if (songMode && this._entryKey !== this.songPtr) {
        this._entryKey = this.songPtr;
        const dur = pat.len * (entry.reps || 1) * stepDur;
        enterEntry(this.rig, st, entry, this.nextTime, dur);
      }
      if (!songMode && this._entryKey !== null) {
        this._entryKey = null;
        st.tracks.forEach((tr, i) => {
          tr._emute = false;
          this.rig.trackGains[i].gain.setTargetAtTime(trackGainVal(st, tr), this.nextTime, 0.01);
        });
      }
      // song-automation: master-filter, master-volumen og pump
      if (songMode) {
        if (this.autos.mf.pts.length) {
          const v = autoAt(this.autos.mf, this.inits.mf, this.songStep + 1);
          const f = mfFreqs(v);
          this.rig.lp.frequency.setTargetAtTime(f.lpF, this.nextTime, 0.05);
          this.rig.hp.frequency.setTargetAtTime(f.hpF, this.nextTime, 0.05);
          this.autoMF = v;
        }
        if (this.autos.vol.pts.length) {
          const v = autoAt(this.autos.vol, this.inits.vol, this.songStep + 1);
          this.rig.master.gain.setTargetAtTime(v, this.nextTime, 0.05);
          this.autoVol = v;
        }
        st._pumpAuto = this.autos.pump.pts.length
          ? autoAt(this.autos.pump, this.inits.pump, this.songStep + 1) : null;
      }
      // autofill: sidste gennemloeb af et trin med fillLast
      const fillAuto = songMode && !!entry.fillLast && this.entryLoop === (entry.reps || 1) - 1;
      // swing paa de ulige 16.-dele
      const swingOff = (this.absStep % 2 === 1) ? (st.swing ?? 0) * stepDur * 0.6 : 0;
      schedStepAbs(this.rig, st, pat, this.absStep, this.nextTime + swingOff, stepDur, this.lastFreqs, fillAuto, entry);
      this.stepLog.push({ t: this.nextTime, step: this.absStep % pat.len, abs: this.absStep, pattern: patIdx,
        songIdx: songMode ? this.songPtr % st.song.length : null,
        songStep: songMode ? this.songStep : null });
      if (this.stepLog.length > 80) this.stepLog.shift();
      this.nextTime += stepDur;
      this.absStep++;
      if (songMode) this.songStep++;
      if (this.absStep % pat.len === 0) {
        // koeet pattern-skift anvendes ved pattern-graensen (kvantiseret, playhead bevares)
        if (!songMode && st._queuedPattern != null) {
          st.curPattern = st._queuedPattern;
          st._queuedPattern = null;
        }
        if (songMode) {
          if (st._jumpEntry != null) {
            // koeet hop (klik paa linjalen under afspilning)
            this.songPtr = Math.max(0, Math.min(st._jumpEntry, st.song.length - 1));
            st._jumpEntry = null;
            this.entryLoop = 0;
            this.songStep = entryStartSteps(st, this.songPtr);
            this._entryKey = null;
          } else {
            this.entryLoop++;
            if (this.entryLoop >= (entry.reps || 1)) {
              this.entryLoop = 0;
              const loopSet = st.loopA != null && st.loopB != null && st.loopA <= st.loopB
                && st.loopB < st.song.length;
              if (loopSet && this.songPtr === st.loopB) {
                // loop-brace: tilbage til loop-start
                this.songPtr = st.loopA;
                this.songStep = entryStartSteps(st, st.loopA);
                this._entryKey = null;
              } else {
                this.songPtr++;
                if (this.songPtr >= st.song.length) {
                  if (!st.songLoop) { this.stopAt = this.nextTime; }
                  else { this.songPtr = 0; this.songStep = 0; this._entryKey = null; }
                }
              }
            }
          }
        }
      }
      if (this.stopAt && this.nextTime >= this.stopAt) break;
    }
    if (this.stopAt && ctx.currentTime >= this.stopAt) this.stop();
    // live-opdatering af delay-tid, master-filter og -volumen (automationen vinder i song-mode)
    this.rig.delay.delayTime.value = delayTimeSec(st, this.curBpm);
    this.rig.fb.gain.value = st.delayFb ?? 0.4;
    const songAuto = st.mode === 'song' && this.autos;
    if (!(songAuto && this.autos.mf.pts.length)) setMasterFilter(this.rig, st.masterFilter ?? 0.5);
    if (!(songAuto && this.autos.vol.pts.length)) this.rig.master.gain.value = st.masterVol ?? 0.9;
  }
  refreshTrackGains() {
    if (!this.playing || !this.rig) return;
    const st = this.getState();
    st.tracks.forEach((tr, i) => {
      this.rig.trackGains[i].gain.setTargetAtTime(trackGainVal(st, tr), this.ctx.currentTime, 0.02);
    });
  }
  position() {
    if (!this.playing || !this.ctx) return null;
    const now = this.ctx.currentTime;
    const st = this.getState();
    const stepDur = 60 / (this.curBpm || st.bpm) / 4;
    for (let i = this.stepLog.length - 1; i >= 0; i--) {
      const e = this.stepLog[i];
      if (now >= e.t && now < e.t + stepDur) return e;
    }
    return null;
  }
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.stopAt = null;
    this.autoMF = null;
    this.autoVol = null;
    if (this.rig && this.ctx) {
      const m = this.rig.master;
      m.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.03);
      const rig = this.rig;
      setTimeout(() => { try { rig.master.disconnect(); rig.limiter.disconnect(); } catch (e) {} }, 400);
    }
    this.rig = null;
    this.playing = false;
    this.stepLog = [];
  }
  // hoer det valgte spors lyd én gang (med evt. step-lock)
  async audition(trIdx, step = null) {
    const ctx = this.ensureCtx();
    const st = this.getState();
    if (!this.audRigP) this.audRigP = buildRig(ctx, st);
    this.audRig = await this.audRigP;
    // opdater gains i audition-riggen
    st.tracks.forEach((tr, i) => { this.audRig.trackGains[i].gain.value = Math.max(0.0001, tr.level); });
    setMasterFilter(this.audRig, st.masterFilter ?? 0.5);
    trig(this.audRig, trIdx, st.tracks[trIdx].patch, step || { on: true, v: 1, n: 0, l: null },
      ctx.currentTime + 0.02, st, null, 60 / st.bpm / 4);
  }
}

// ---------- offline eksport ----------
export async function renderWav(st, what = 'song') {
  const sr = 44100;
  const isSong = what === 'song' && st.song.length > 0;
  let entries;
  if (isSong) entries = st.song.map(songEntry);
  else entries = [{ p: st.curPattern, reps: 2, mutes: null }]; // pattern to gange
  let totalSec = 0;
  for (const e of entries) {
    totalSec += st.patterns[e.p].len * (e.reps || 1) * (60 / ((isSong && e.bpm) || st.bpm) / 4);
  }
  const total = totalSec + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
  st.tracks.forEach(tr => { tr._emute = false; });
  const stR = { ...st, _fill: false, _pumpAuto: null };
  const rig = await buildRig(ctx, stR);
  const autos = isSong
    ? { mf: buildAuto(stR, 'mf'), vol: buildAuto(stR, 'vol'), pump: buildAuto(stR, 'pump') }
    : { mf: { pts: [] }, vol: { pts: [] }, pump: { pts: [] } };
  const inits = { mf: st.masterFilter ?? 0.5, vol: st.masterVol ?? 0.9, pump: st.pumpFx ?? 0 };
  const lastFreqs = new Array(st.tracks.length).fill(null);
  let t = 0.05, absStep = 0, lastPat = null, songStep = 0;
  for (const e of entries) {
    const pat = st.patterns[e.p];
    if (lastPat !== null && e.p !== lastPat) absStep = 0;
    lastPat = e.p;
    const reps = e.reps || 1;
    const stepDur = 60 / ((isSong && e.bpm) || st.bpm) / 4;
    enterEntry(rig, stR, e, t, pat.len * reps * stepDur);
    for (let rep = 0; rep < reps; rep++) {
      const fillAuto = !!e.fillLast && rep === reps - 1;
      for (let s = 0; s < pat.len; s++) {
        if (autos.mf.pts.length) {
          const f = mfFreqs(autoAt(autos.mf, inits.mf, songStep + 1));
          rig.lp.frequency.setTargetAtTime(f.lpF, t, 0.05);
          rig.hp.frequency.setTargetAtTime(f.hpF, t, 0.05);
        }
        if (autos.vol.pts.length) {
          rig.master.gain.setTargetAtTime(autoAt(autos.vol, inits.vol, songStep + 1), t, 0.05);
        }
        stR._pumpAuto = autos.pump.pts.length ? autoAt(autos.pump, inits.pump, songStep + 1) : null;
        const swingOff = (absStep % 2 === 1) ? (st.swing ?? 0) * stepDur * 0.6 : 0;
        schedStepAbs(rig, stR, pat, absStep, t + swingOff, stepDur, lastFreqs, fillAuto, isSong ? e : null);
        t += stepDur;
        absStep++;
        songStep++;
      }
    }
  }
  const buf = await ctx.startRendering();
  st.tracks.forEach(tr => { tr._emute = false; });
  return encodeWav(buf);
}
export function encodeWav(buf) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
  const bytes = 44 + n * ch * 2;
  const ab = new ArrayBuffer(bytes);
  const dv = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); w(8, 'WAVE');
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, ch, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const chans = [];
  for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  let off = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return ab;
}
