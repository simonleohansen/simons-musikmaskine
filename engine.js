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

// ---------- ARRANGEMENT (Ableton-model: frie clips pr. spor) ----------
// st.arr = {
//   clips:   [{id, tr, at, len, p, n, lvl, cut}]  — at/len i 16.-dels-steps (snap = takt),
//            clip'en looper kilde-patternets spor-raekke: idx = (s - at) % sporlaengde
//   markers: [{at, name}]                          — navngivne locators
//   tempo:   [{at, bpm}]                           — tempo-skift paa tidslinjen
//   fx:      [{at, type:'riser'|'boom', len}]      — build-effekter
//   auto:    {mf:[{at,v}], vol:[{at,v}], pump:[{at,v}]} — frie breakpoints
//   loopA/loopB: takt-indeks for loop-brace (null = intet loop)
// }
export const BAR = 16;
export function emptyArr() {
  return { clips: [], markers: [], tempo: [], fx: [], auto: { mf: [], vol: [], pump: [] }, loopA: null, loopB: null };
}
// gamle projekters song-kaede (til migration i app-laget)
export function songEntry(e) {
  return typeof e === 'number' ? { p: e, reps: 1, mutes: null } : e;
}
export function entrySteps(st, e) { return st.patterns[e.p].len * (e.reps || 1); }

export function arrLenSteps(st) {
  const a = st.arr;
  let m = 0;
  for (const c of a.clips) m = Math.max(m, c.at + c.len);
  for (const f of a.fx) m = Math.max(m, f.at + (f.len || BAR));
  for (const mk of a.markers) m = Math.max(m, mk.at + BAR);
  return Math.max(BAR, Math.ceil(m / BAR) * BAR);
}
export function clipAt(st, tr, s) {
  for (const c of st.arr.clips) {
    if (c.tr === tr && s >= c.at && s < c.at + c.len) return c;
  }
  return null;
}
export function tempoAt(st, s) {
  let b = st.bpm;
  let bestAt = -1;
  for (const t of st.arr.tempo) {
    if (t.at <= s && t.at > bestAt && t.bpm) { b = t.bpm; bestAt = t.at; }
  }
  return b;
}
// frie automations-punkter: hold foer foerste, lineaer imellem, hold efter sidste
export function autoValAt(pts, s) {
  if (!pts || !pts.length) return null;
  if (s <= pts[0].at) return pts[0].v;
  for (let i = 1; i < pts.length; i++) {
    if (s <= pts[i].at) {
      const a = pts[i - 1], b = pts[i];
      const span = b.at - a.at;
      return span <= 0 ? b.v : a.v + (b.v - a.v) * ((s - a.at) / span);
    }
  }
  return pts[pts.length - 1].v;
}
export function songDurationSec(st) {
  const total = arrLenSteps(st);
  let sec = 0;
  for (let s = 0; s < total; s++) sec += 60 / tempoAt(st, s) / 4;
  return sec;
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
  const usedSample = p.smp ? smpSource(ctx, p, midi, t, stopT, mix, driftC) : false;
  if (!usedSample && (p.wave ?? 'saw') !== 'noise') {
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
  if ((p.noise ?? 0) > 0.02 || (!usedSample && p.wave === 'noise')) {
    const ns = ctx.createBufferSource();
    ns.buffer = noiseBuf(ctx); ns.loop = true;
    ns.start(t); ns.stop(stopT);
    const ng = ctx.createGain();
    ng.gain.value = (!usedSample && p.wave === 'noise') ? 1 : p.noise;
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

// ---------- sample-bibliotek (patch.smp = url; spiller gennem hele voice-kaeden) ----------
export const sampleBuffers = new Map();
let sampleDecodeCtx = null;
export async function loadSample(url) {
  if (sampleBuffers.has(url)) return sampleBuffers.get(url);
  if (!sampleDecodeCtx) sampleDecodeCtx = new (window.AudioContext || window.webkitAudioContext)();
  const ab = await (await fetch(url)).arrayBuffer();
  const buf = await sampleDecodeCtx.decodeAudioData(ab);
  sampleBuffers.set(url, buf);
  return buf;
}
// forudindlaes alle samples et projekt bruger (spor-patches) — kraeves foer offline eksport
export async function preloadSamples(st) {
  const urls = new Set();
  for (const tr of st.tracks) if (tr.patch.smp) urls.add(tr.patch.smp);
  for (const c of Object.values(st.clips || {})) {
    for (const s of c.steps || []) if (s?.l?.smp) urls.add(s.l.smp);
  }
  await Promise.all([...urls].map(u => loadSample(u).catch(() => {})));
}
// byg sample-kilde i en voice: pitch via playbackRate, drift via detune
function smpSource(ctx, p, midi, t, stopT, mix, driftC) {
  const buf = sampleBuffers.get(p.smp);
  if (!buf) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = Math.pow(2, (midi - (p.note ?? 48)) / 12);
  if (driftC) src.detune.value = (Math.random() * 2 - 1) * driftC;
  src.start(t);
  src.stop(stopT);
  src.connect(mix);
  return true;
}

// ---------- live MIDI-stemme (holdes til noteOff) ----------
export function liveVoice(rig, trIdx, p, midi, vel = 1) {
  const ctx = rig.ctx;
  const t = ctx.currentTime + 0.004;
  const f = midiToFreq(midi);
  const att = Math.max(0.001, p.att ?? 0.002);
  const dec = Math.max(0.03, p.dec ?? 0.3);
  const sus = p.sus ?? 0;
  const rel = Math.max(0.03, p.rel ?? 0.25);
  const held = sus > 0.02;
  const hardStop = t + 30;
  const driftC = (p.drift ?? 0) * 12;
  const sources = [];
  const mix = ctx.createGain();
  mix.gain.value = 1;
  let liveUsedSample = false;
  if (p.smp && sampleBuffers.has(p.smp)) {
    const sb = ctx.createBufferSource();
    sb.buffer = sampleBuffers.get(p.smp);
    sb.playbackRate.value = Math.pow(2, (midi - (p.note ?? 48)) / 12);
    sb.start(t); sb.stop(hardStop);
    sb.connect(mix);
    sources.push(sb);
    liveUsedSample = true;
  }
  if (!liveUsedSample && (p.wave ?? 'saw') !== 'noise') {
    const o = ctx.createOscillator();
    o.type = { saw: 'sawtooth', sqr: 'square', tri: 'triangle', sin: 'sine' }[p.wave] || 'sawtooth';
    o.frequency.value = f;
    if (driftC) o.detune.value = (Math.random() * 2 - 1) * driftC;
    o.start(t); o.stop(hardStop);
    o.connect(mix);
    sources.push(o);
    if ((p.sub ?? 0) > 0.02) {
      const s = ctx.createOscillator();
      s.type = 'sine'; s.frequency.value = f / 2;
      s.start(t); s.stop(hardStop);
      const sg = ctx.createGain(); sg.gain.value = p.sub;
      s.connect(sg); sg.connect(mix);
      sources.push(s);
    }
  }
  if ((p.wave2 ?? 'off') !== 'off') {
    const o2 = ctx.createOscillator();
    o2.type = { saw: 'sawtooth', sqr: 'square', tri: 'triangle', sin: 'sine' }[p.wave2] || 'sawtooth';
    o2.frequency.value = f * Math.pow(2, (p.semi2 ?? 0) / 12);
    o2.detune.value = (p.det2 ?? 0) + (driftC ? (Math.random() * 2 - 1) * driftC : 0);
    o2.start(t); o2.stop(hardStop);
    const g2 = ctx.createGain(); g2.gain.value = p.mix2 ?? 0.5;
    o2.connect(g2); g2.connect(mix);
    sources.push(o2);
  }
  if ((p.noise ?? 0) > 0.02 || (!liveUsedSample && p.wave === 'noise')) {
    const ns = ctx.createBufferSource();
    ns.buffer = noiseBuf(ctx); ns.loop = true;
    ns.start(t); ns.stop(hardStop);
    const ng = ctx.createGain();
    ng.gain.value = (!liveUsedSample && p.wave === 'noise') ? 1 : p.noise;
    ns.connect(ng); ng.connect(mix);
    sources.push(ns);
  }
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
    flt.frequency.setValueAtTime(peak, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(baseCut, 40), t + Math.max(0.02, p.fdec ?? 0.15));
  } else {
    flt.frequency.value = baseCut;
  }
  const amp = ctx.createGain();
  const peakG = 0.75 * vel * (p.gainMul ?? 1);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(peakG, t + att);
  if (held) {
    amp.gain.setTargetAtTime(peakG * sus, t + att, Math.max(0.01, dec / 3));
  } else {
    amp.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
  }
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
  if ((p.sendD ?? 0) > 0.02) {
    const g = ctx.createGain(); g.gain.value = p.sendD;
    pan.connect(g); g.connect(rig.dIn);
  }
  if ((p.sendV ?? 0) > 0.02) {
    const g = ctx.createGain(); g.gain.value = p.sendV;
    pan.connect(g); g.connect(rig.vIn);
  }
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      const ts = ctx.currentTime + 0.002;
      try { amp.gain.cancelAndHoldAtTime(ts); } catch (e) { try { amp.gain.cancelScheduledValues(ts); } catch (e2) {} }
      amp.gain.setTargetAtTime(0.0001, ts, rel / 3);
      for (const s of sources) { try { s.stop(ts + rel * 2.5 + 0.25); } catch (e) {} }
    },
  };
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
// en CLIP er den musikalske atom-enhed (Ableton-model): ét spors steps + laengde
// st.clips = { id: {tr, name, len (16|32), tlen (polymeter|null), steps[32], dis (deaktiveret)} }
// st.session = { scenes: [{name, slots: [clipId|null ×8]}] }
export function clipLen(c) { return c.tlen || c.len; }
// runtime launch-tilstand pr. spor: {play: clipId|null, next: clipId|'stop'|undefined, at: launch-step}
export function liveOf(st) {
  if (!st._live || st._live.length !== st.tracks.length) {
    st._live = st.tracks.map(() => ({ play: null, next: undefined, at: 0 }));
  }
  return st._live;
}
// FOLLOW ACTIONS: clips der selv skifter/stopper efter N gennemloeb (Ableton-manualen).
// Koeres ved takt-graensen FOER applyQueued — brugerens egen koe vinder altid.
export function applyFollowActions(st, absStep) {
  const live = liveOf(st);
  const scenes = (st.session && st.session.scenes) || [];
  live.forEach((L, tr) => {
    if (!L.play || L.next !== undefined) return;
    const clip = st.clips[L.play];
    if (!clip || !clip.fa || !clip.fa.act || clip.fa.act === 'none') return;
    const rel = absStep - L.at;
    if (rel <= 0 || rel % clip.len !== 0) return;
    const loops = rel / clip.len;
    if (loops % (clip.fa.after || 4) !== 0) return;
    if (Math.random() > (clip.fa.chance ?? 1)) return;
    const slots = scenes.map(sc => sc.slots[tr]);
    const si = slots.indexOf(L.play);
    const act = clip.fa.act;
    let target = null;
    if (act === 'stop') target = 'stop';
    else if (act === 'first') target = slots.find(x => x) || null;
    else if (act === 'any') {
      const opts = slots.filter(x => x && x !== L.play);
      target = opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
    } else { // 'next' (nedad, wrapper) — spring slots med samme clip over
      for (let k = 1; k <= slots.length; k++) {
        const cand = slots[(si + k) % slots.length];
        if (cand && cand !== L.play) { target = cand; break; }
      }
    }
    if (target) L.next = target;
  });
}
// anvend koeede launches/stops ved takt-graensen (launch-kvantisering = kernen i Ableton-foelelsen)
export function applyQueued(st, absStep) {
  const live = liveOf(st);
  for (const L of live) {
    if (L.next === undefined) continue;
    if (L.next === 'stop' || L.next === null) {
      L.play = null;
    } else {
      L.play = L.next;
      L.at = absStep;
    }
    L.next = undefined;
  }
}
// planlaeg ét step i JAM (session): hvert spor spiller sin launched clip
export function schedJamStep(rig, st, absStep, t, stepDur, lastFreqs) {
  const fill = !!st._fill;
  const src = st.duckTrack ?? 0;
  const live = liveOf(st);
  for (let tr = 0; tr < st.tracks.length; tr++) {
    const L = live[tr];
    if (!L.play) continue;
    const clip = st.clips[L.play];
    if (!clip || clip.dis) continue;
    const rel = absStep - L.at;
    const idx = rel % clipLen(clip);
    const step = clip.steps[idx];
    const loops = Math.floor(rel / clip.len);
    if (!stepFires(step, loops, fill)) continue;
    const track = st.tracks[tr];
    const r = Math.max(1, Math.min(8, step.r ?? 1));
    for (let k = 0; k < r; k++) {
      const subT = t + (k * stepDur) / r;
      const subStep = k === 0 ? step : { ...step, v: (step.v ?? 1) * Math.max(0.3, 1 - k * 0.13) };
      lastFreqs[tr] = trig(rig, tr, track.patch, subStep, subT, st, lastFreqs[tr], stepDur);
      if (tr === src) schedDuck(rig, st, subT);
    }
  }
}
// ---------- optagelser (stemme → audio-clips) ----------
// audio-clip: {id, tr, at, len, audio: recId, n (pitch ±st), lvl, cut, off (ms finjustering), skip (steps ind i bufferen)}
export const recBuffers = new Map();
export function registerRecBuffer(id, buf) { recBuffers.set(id, buf); }
function schedAudioClip(rig, c, s, t, stepDur) {
  const buf = recBuffers.get(c.audio);
  if (!buf) return;
  const ctx = rig.ctx;
  const rate = Math.pow(2, (c.n || 0) / 12);
  const posInClip = (s - c.at) * stepDur;                    // sekunder inde i clip'en
  const offSec = (c.off || 0) / 1000;
  const skipSec = (c.skip || 0) * stepDur;
  let bufPos = (posInClip - offSec + skipSec) * rate;        // position i bufferen
  let startT = t;
  if (bufPos < 0) { startT = t - bufPos / rate; bufPos = 0; }
  if (bufPos >= buf.duration) return;
  const remainWall = (c.at + c.len - s) * stepDur - (startT - t);
  if (remainWall <= 0.01) return;
  const src2 = ctx.createBufferSource();
  src2.buffer = buf;
  src2.playbackRate.value = rate;
  const g = ctx.createGain();
  const lvl = (c.lvl ?? 1) * 0.9;
  g.gain.setValueAtTime(0.0001, startT);
  g.gain.linearRampToValueAtTime(lvl, startT + 0.006);
  g.gain.setTargetAtTime(0.0001, startT + remainWall - 0.015, 0.005);
  let head = src2;
  if (c.cut != null) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutHz(c.cut); f.Q.value = 1;
    head.connect(f); head = f;
  }
  head.connect(g); g.connect(rig.trackIns[c.tr]);
  src2.start(startT, bufPos, Math.max(0.02, remainWall * rate));
}
// planlaeg ét absolut step i ARRANGEMENTET: hvert spor spiller sin clip (hvis nogen).
// entering = foerste step efter start/hop/loop-wrap (audio-clips skal genstartes med offset)
export function schedArrStep(rig, st, s, t, stepDur, lastFreqs, entering = false) {
  const fill = !!st._fill;
  const src = st.duckTrack ?? 0;
  for (let tr = 0; tr < st.tracks.length; tr++) {
    const c = clipAt(st, tr, s);
    if (!c) { lastFreqs[tr] = lastFreqs[tr]; continue; }
    if (c.audio) {
      if (s === c.at || entering) schedAudioClip(rig, c, s, t, stepDur);
      continue;
    }
    const clipObj = st.clips[c.clip];
    if (!clipObj || clipObj.dis) continue;
    const rel = s - c.at;
    const idx = rel % clipLen(clipObj);
    const step = clipObj.steps[idx];
    const loops = Math.floor(rel / clipObj.len);
    if (!stepFires(step, loops, fill)) continue;
    const track = st.tracks[tr];
    const vScale = c.lvl ?? 1;
    const nOff = c.n ?? 0;
    const clipL = c.cut != null ? { ...(step.l || {}), cut: c.cut } : step.l;
    const r = Math.max(1, Math.min(8, step.r ?? 1));
    for (let k = 0; k < r; k++) {
      const subT = t + (k * stepDur) / r;
      let subStep = step;
      if (k > 0 || vScale !== 1 || nOff || clipL !== step.l) {
        subStep = { ...step,
          v: (step.v ?? 1) * vScale * (k > 0 ? Math.max(0.3, 1 - k * 0.13) : 1),
          n: (step.n || 0) + nOff,
          l: clipL };
      }
      lastFreqs[tr] = trig(rig, tr, track.patch, subStep, subT, st, lastFreqs[tr], stepDur);
      if (tr === src) schedDuck(rig, st, subT);
    }
  }
}
// fx-events (riser/boom) der starter paa steppet
export function schedArrFx(rig, st, s, t, stepDur) {
  for (const f of st.arr.fx) {
    if (f.at !== s) continue;
    if (f.type === 'riser') schedRiser(rig, t, (f.len || 4 * BAR) * stepDur);
    if (f.type === 'boom') schedBoom(rig, t);
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
  async play(startStep = 0) {
    const ctx = this.ensureCtx();
    this.stop();
    const st = this.getState();
    st.tracks.forEach(tr => { tr._emute = false; });
    st._pumpAuto = null;
    this.rig = await buildRig(ctx, st);
    this.playing = true;
    this.absStep = 0;      // absolut 16.-dels-taeller i jam (session)
    this.arrStep = Math.max(0, startStep); // absolut step i arrangementet (song-mode)
    this._enter = true;    // foerste step: audio-clips genstartes med korrekt offset
    this.autoMF = null;
    this.autoVol = null;
    this.curBpm = st.bpm;
    this.lastFreqs = new Array(st.tracks.length).fill(null);
    this.nextTime = ctx.currentTime + 0.1;
    this.stepLog = [];
    this.timer = setInterval(() => this._tick(), 25);
    this._tick();
  }
  // hop i arrangementet: koeet ved naeste takt-graense under afspilning
  jumpTo(step) {
    const st = this.getState();
    if (!this.playing) return;
    st._jumpStep = Math.max(0, step);
  }
  _tick() {
    const ctx = this.ctx;
    const st = this.getState();
    if (!this.rig) return;
    const songMode = st.mode === 'song' && st.arr && st.arr.clips.length > 0;
    while (this.nextTime < ctx.currentTime + 0.14) {
      if (songMode) {
        // ----- ARRANGEMENT-afspilning -----
        const s = this.arrStep;
        const effBpm = tempoAt(st, s);
        this.curBpm = effBpm;
        const stepDur = 60 / effBpm / 4;
        schedArrFx(this.rig, st, s, this.nextTime, stepDur);
        // automation (frie breakpoints)
        const vMf = autoValAt(st.arr.auto.mf, s + 1);
        if (vMf != null) {
          const f = mfFreqs(vMf);
          this.rig.lp.frequency.setTargetAtTime(f.lpF, this.nextTime, 0.05);
          this.rig.hp.frequency.setTargetAtTime(f.hpF, this.nextTime, 0.05);
          this.autoMF = vMf;
        }
        const vVol = autoValAt(st.arr.auto.vol, s + 1);
        if (vVol != null) {
          this.rig.master.gain.setTargetAtTime(vVol, this.nextTime, 0.05);
          this.autoVol = vVol;
        }
        st._pumpAuto = autoValAt(st.arr.auto.pump, s + 1);
        const swingOff = (s % 2 === 1) ? (st.swing ?? 0) * stepDur * 0.6 : 0;
        schedArrStep(this.rig, st, s, this.nextTime + swingOff, stepDur, this.lastFreqs, this._enter);
        this._enter = false;
        this.stepLog.push({ t: this.nextTime, step: s % BAR, abs: s, pattern: null, songStep: s });
        if (this.stepLog.length > 80) this.stepLog.shift();
        this.nextTime += stepDur;
        this.arrStep++;
        if (this.arrStep % BAR === 0) {
          // takt-graense: koeet hop, loop-brace, slut
          if (st._jumpStep != null) {
            this.arrStep = st._jumpStep;
            st._jumpStep = null;
            this._enter = true;
          } else {
            const a = st.arr.loopA, b = st.arr.loopB;
            if (a != null && b != null && b > a && this.arrStep >= b * BAR && this.arrStep - BAR < b * BAR) {
              this.arrStep = a * BAR;
              this._enter = true;
            } else if (this.arrStep >= arrLenSteps(st)) {
              if (!st.songLoop) { this.stopAt = this.nextTime; }
              else { this.arrStep = 0; this._enter = true; }
            }
          }
        }
      } else {
        // ----- JAM (session): hvert spor spiller sin launched clip, koeer anvendes pr. takt -----
        this.curBpm = st.bpm;
        const stepDur = 60 / st.bpm / 4;
        if (this.absStep % BAR === 0) {
          applyFollowActions(st, this.absStep);
          applyQueued(st, this.absStep);
        }
        const swingOff = (this.absStep % 2 === 1) ? (st.swing ?? 0) * stepDur * 0.6 : 0;
        schedJamStep(this.rig, st, this.absStep, this.nextTime + swingOff, stepDur, this.lastFreqs);
        this.stepLog.push({ t: this.nextTime, step: this.absStep % BAR, abs: this.absStep, pattern: null, songStep: null, jam: true });
        if (this.stepLog.length > 80) this.stepLog.shift();
        this.nextTime += stepDur;
        this.absStep++;
      }
      if (this.stopAt && this.nextTime >= this.stopAt) break;
    }
    if (this.stopAt && ctx.currentTime >= this.stopAt) this.stop();
    // live-opdatering af delay-tid, master-filter og -volumen (automationen vinder i song-mode)
    this.rig.delay.delayTime.value = delayTimeSec(st, this.curBpm);
    this.rig.fb.gain.value = st.delayFb ?? 0.4;
    if (!(songMode && st.arr.auto.mf.length)) setMasterFilter(this.rig, st.masterFilter ?? 0.5);
    if (!(songMode && st.arr.auto.vol.length)) this.rig.master.gain.value = st.masterVol ?? 0.9;
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
  // live MIDI: spil en holdt tone paa et spor (gennem spillets rig hvis der spilles, ellers audition-riggen)
  async liveNoteOn(trIdx, midi, vel = 1) {
    const ctx = this.ensureCtx();
    const st = this.getState();
    let rig = this.playing ? this.rig : null;
    if (!rig) {
      if (!this.audRigP) this.audRigP = buildRig(ctx, st);
      this.audRig = await this.audRigP;
      st.tracks.forEach((tr, i) => { this.audRig.trackGains[i].gain.value = Math.max(0.0001, tr.level); });
      setMasterFilter(this.audRig, st.masterFilter ?? 0.5);
      rig = this.audRig;
    }
    return liveVoice(rig, trIdx, st.tracks[trIdx].patch, midi, vel);
  }
  // hoer det valgte spors lyd én gang (med evt. step-lock og evt. patch-override til preview)
  async audition(trIdx, step = null, patchOverride = null) {
    const ctx = this.ensureCtx();
    const st = this.getState();
    if (!this.audRigP) this.audRigP = buildRig(ctx, st);
    this.audRig = await this.audRigP;
    // opdater gains i audition-riggen
    st.tracks.forEach((tr, i) => { this.audRig.trackGains[i].gain.value = Math.max(0.0001, tr.level); });
    setMasterFilter(this.audRig, st.masterFilter ?? 0.5);
    trig(this.audRig, trIdx, patchOverride || st.tracks[trIdx].patch, step || { on: true, v: 1, n: 0, l: null },
      ctx.currentTime + 0.02, st, null, 60 / st.bpm / 4);
  }
}

// ---------- offline eksport ----------
// what='song' rendrer arrangementet; what='scene' rendrer scenens clips ×2 gennemloeb
export async function renderWav(st, what = 'song', sceneIdx = 0) {
  const sr = 44100;
  const isSong = what === 'song' && st.arr && st.arr.clips.length > 0;
  const scene = st.session && st.session.scenes[sceneIdx];
  const sceneClips = !isSong && scene ? scene.slots.map(id => (id && st.clips[id]) || null) : [];
  const sceneLen = Math.max(16, ...sceneClips.filter(Boolean).map(c => c.len));
  const stR = { ...st, _fill: false, _pumpAuto: null };
  st.tracks.forEach(tr => { tr._emute = false; });
  let total;
  if (isSong) total = songDurationSec(st) + 3;
  else total = sceneLen * 2 * (60 / st.bpm / 4) + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
  const rig = await buildRig(ctx, stR);
  const lastFreqs = new Array(st.tracks.length).fill(null);
  let t = 0.05;
  if (isSong) {
    const totalSteps = arrLenSteps(st);
    for (let s = 0; s < totalSteps; s++) {
      const stepDur = 60 / tempoAt(st, s) / 4;
      schedArrFx(rig, stR, s, t, stepDur);
      const vMf = autoValAt(st.arr.auto.mf, s + 1);
      if (vMf != null) {
        const f = mfFreqs(vMf);
        rig.lp.frequency.setTargetAtTime(f.lpF, t, 0.05);
        rig.hp.frequency.setTargetAtTime(f.hpF, t, 0.05);
      }
      const vVol = autoValAt(st.arr.auto.vol, s + 1);
      if (vVol != null) rig.master.gain.setTargetAtTime(vVol, t, 0.05);
      stR._pumpAuto = autoValAt(st.arr.auto.pump, s + 1);
      const swingOff = (s % 2 === 1) ? (st.swing ?? 0) * stepDur * 0.6 : 0;
      schedArrStep(rig, stR, s, t + swingOff, stepDur, lastFreqs, s === 0);
      t += stepDur;
    }
  } else {
    // scene ×2: brug jam-planlaeggeren med en fastlaast live-tilstand
    stR._live = sceneClips.map((c, tr) => ({ play: c ? (scene.slots[tr]) : null, next: undefined, at: 0 }));
    const stepDur = 60 / st.bpm / 4;
    for (let s = 0; s < sceneLen * 2; s++) {
      const swingOff = (s % 2 === 1) ? (st.swing ?? 0) * stepDur * 0.6 : 0;
      schedJamStep(rig, stR, s, t + swingOff, stepDur, lastFreqs);
      t += stepDur;
    }
  }
  const buf = await ctx.startRendering();
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
