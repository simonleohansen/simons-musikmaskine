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
  const audible = anySolo ? tr.solo : !tr.mute;
  return audible ? tr.level : 0;
}
export function delayTimeSec(st) {
  // punkteret 8.-del som standard; st.delayDiv i 16.-dele (3 = punkteret 8.)
  return (60 / st.bpm / 4) * (st.delayDiv ?? 3);
}
export function setMasterFilter(rig, v) {
  let lpF = 18000, hpF = 22;
  if (v < 0.5) lpF = 60 * Math.pow(18000 / 60, v / 0.5);
  else if (v > 0.5) hpF = 22 * Math.pow(6000 / 22, (v - 0.5) / 0.5);
  rig.lp.frequency.value = lpF;
  rig.hp.frequency.value = hpF;
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
  st.tracks.forEach((tr, i) => {
    if (i === src) return;
    duckOne(rig.duckGains[i].gain, tr.patch.duck ?? 0, t, rel);
  });
  duckOne(rig.duckD.gain, st.pumpFx ?? 0, t, rel);
  duckOne(rig.duckV.gain, st.pumpFx ?? 0, t, rel);
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
// planlaeg ét absolut step for alle spor (polymeter: hvert spor har sin egen laengde)
export function schedStepAbs(rig, st, pattern, absStep, t, stepDur, lastFreqs) {
  const loops = Math.floor(absStep / pattern.len);
  const fill = !!st._fill;
  const src = st.duckTrack ?? 0;
  for (let tr = 0; tr < st.tracks.length; tr++) {
    const idx = absStep % trackLen(pattern, tr);
    const step = pattern.steps[tr][idx];
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
  async play() {
    const ctx = this.ensureCtx();
    this.stop();
    const st = this.getState();
    this.rig = await buildRig(ctx, st);
    this.playing = true;
    this.absStep = 0;      // absolut 16.-dels-taeller i det aktuelle pattern
    this.songPtr = 0;      // position i song-kaeden
    this._lastPatIdx = null;
    this.lastFreqs = new Array(st.tracks.length).fill(null);
    this.nextTime = ctx.currentTime + 0.1;
    this.stepLog = [];
    this.timer = setInterval(() => this._tick(), 25);
    this._tick();
  }
  _patIdx(st) {
    if (st.mode === 'song' && st.song.length) return st.song[this.songPtr % st.song.length];
    return st.curPattern;
  }
  _tick() {
    const ctx = this.ctx;
    const st = this.getState();
    if (!this.rig) return;
    while (this.nextTime < ctx.currentTime + 0.14) {
      const patIdx = this._patIdx(st);
      if (this._lastPatIdx !== null && patIdx !== this._lastPatIdx) {
        this.absStep = 0; // nyt pattern -> alle spor resynkes (Elektron-stil)
      }
      this._lastPatIdx = patIdx;
      const pat = st.patterns[patIdx];
      const stepDur = 60 / st.bpm / 4;
      // swing paa de ulige 16.-dele
      const swingOff = (this.absStep % 2 === 1) ? (st.swing ?? 0) * stepDur * 0.6 : 0;
      schedStepAbs(this.rig, st, pat, this.absStep, this.nextTime + swingOff, stepDur, this.lastFreqs);
      this.stepLog.push({ t: this.nextTime, step: this.absStep % pat.len, abs: this.absStep, pattern: patIdx });
      if (this.stepLog.length > 80) this.stepLog.shift();
      this.nextTime += stepDur;
      this.absStep++;
      if (this.absStep % pat.len === 0 && st.mode === 'song' && st.song.length) {
        this.songPtr++;
        if (this.songPtr >= st.song.length && !st.songLoop) { this.stopAt = this.nextTime; }
      }
      if (this.stopAt && this.nextTime >= this.stopAt) break;
    }
    if (this.stopAt && ctx.currentTime >= this.stopAt) this.stop();
    // live-opdatering af delay-tid og master-filter
    this.rig.delay.delayTime.value = delayTimeSec(st);
    this.rig.fb.gain.value = st.delayFb ?? 0.4;
    setMasterFilter(this.rig, st.masterFilter ?? 0.5);
    this.rig.master.gain.value = st.masterVol ?? 0.9;
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
    const stepDur = 60 / st.bpm / 4;
    for (let i = this.stepLog.length - 1; i >= 0; i--) {
      const e = this.stepLog[i];
      if (now >= e.t && now < e.t + stepDur) return e;
    }
    return null;
  }
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.stopAt = null;
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
  const stepDur = 60 / st.bpm / 4;
  let chain;
  if (what === 'song' && st.song.length) chain = st.song.slice();
  else chain = [st.curPattern, st.curPattern]; // pattern to gange
  let totalSteps = 0;
  for (const pi of chain) totalSteps += st.patterns[pi].len;
  const total = totalSteps * stepDur + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
  const stR = { ...st, _fill: false };
  const rig = await buildRig(ctx, stR);
  const lastFreqs = new Array(st.tracks.length).fill(null);
  let t = 0.05, absStep = 0, lastPat = null;
  for (const pi of chain) {
    if (lastPat !== null && pi !== lastPat) absStep = 0;
    lastPat = pi;
    const pat = st.patterns[pi];
    for (let s = 0; s < pat.len; s++) {
      const swingOff = (absStep % 2 === 1) ? (st.swing ?? 0) * stepDur * 0.6 : 0;
      schedStepAbs(rig, stR, pat, absStep, t + swingOff, stepDur, lastFreqs);
      t += stepDur;
      absStep++;
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
