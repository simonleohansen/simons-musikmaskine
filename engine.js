// SIMONS MUSIKMASKINE — lydmotor
// Voice-baseret synth pr. trig med parameter-locks, glide, pitch/filter-envelopes,
// drive, LFO, tempo-synkede delay/reverb-sends og master-filter → limiter.
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

// ---------- master + fx-busser ----------
export function buildRig(ctx, st) {
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

  // delay-bus (tempo-synket) med feedback + toneformning
  const dIn = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.value = delayTimeSec(st);
  const fb = ctx.createGain(); fb.gain.value = st.delayFb ?? 0.4;
  const dHp = ctx.createBiquadFilter(); dHp.type = 'highpass'; dHp.frequency.value = 180;
  const dLp = ctx.createBiquadFilter(); dLp.type = 'lowpass'; dLp.frequency.value = 6500;
  const dOut = ctx.createGain(); dOut.gain.value = 0.9;
  dIn.connect(delay); delay.connect(dHp); dHp.connect(dLp); dLp.connect(dOut);
  dLp.connect(fb); fb.connect(delay);
  dOut.connect(master);

  // reverb-bus
  const vIn = ctx.createGain();
  const conv = ctx.createConvolver(); conv.buffer = getIR(ctx);
  const vOut = ctx.createGain(); vOut.gain.value = 0.9;
  vIn.connect(conv); conv.connect(vOut); vOut.connect(master);

  // spor-gains
  const trackGains = st.tracks.map(tr => {
    const g = ctx.createGain();
    g.gain.value = trackGainVal(st, tr);
    g.connect(master);
    return g;
  });
  return { ctx, master, lp, hp, limiter, delay, fb, dIn, vIn, trackGains };
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

// ---------- selve stemmen ----------
// patch: {wave, note, glide, penv, pdec, att, dec, cut, res, fenv, fdec,
//         drive, noise, sub, lrate, lamt, ldst, level, pan, sendD, sendV}
// step:  {v (0..1), n (halvtone-offset), l (locks) }
export function trig(rig, trIdx, patch, step, t, st, glideFrom = null) {
  const ctx = rig.ctx;
  const p = step && step.l ? { ...patch, ...step.l } : patch;
  const vel = step ? step.v : 1;
  const midi = (p.note ?? 48) + (step?.n || 0);
  const f = midiToFreq(midi);
  const dec = Math.max(0.03, p.dec ?? 0.3);
  const att = Math.max(0.001, p.att ?? 0.002);
  const stopT = t + att + dec + 0.6;

  const mix = ctx.createGain();
  mix.gain.value = 1;
  const freqParams = [];
  if ((p.wave ?? 'saw') !== 'noise') {
    const type = { saw: 'sawtooth', sqr: 'square', tri: 'triangle', sin: 'sine' }[p.wave] || 'sawtooth';
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
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
  if ((p.lamt ?? 0) > 0.02 && (p.ldst ?? 'off') !== 'off') {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = p.lrate ?? 5;
    lfo.start(t); lfo.stop(stopT);
    const lg = ctx.createGain();
    lfo.connect(lg);
    if (p.ldst === 'pitch') {
      lg.gain.value = p.lamt * f * 0.06;
      freqParams.forEach(({ fp }) => lg.connect(fp));
    }
    p._lfo = { lfo, lg }; // til cut/amp nedenfor
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
  flt.type = 'lowpass';
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
  if (p._lfo && p.ldst === 'cut') {
    p._lfo.lg.gain.value = p.lamt * baseCut * 0.9;
    p._lfo.lg.connect(flt.frequency);
  }
  const amp = ctx.createGain();
  const peakG = 0.75 * vel * (p.gainMul ?? 1);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(peakG, t + att);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
  if (p._lfo && p.ldst === 'amp') {
    p._lfo.lg.gain.value = p.lamt * peakG * 0.5;
    p._lfo.lg.connect(amp.gain);
  }
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, p.pan ?? 0));
  head.connect(flt); flt.connect(amp); amp.connect(pan);
  pan.connect(rig.trackGains[trIdx]);
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
// planlaeg ét pattern-step for alle spor
export function schedStep(rig, st, pattern, stepIdx, t, lastFreqs) {
  for (let tr = 0; tr < st.tracks.length; tr++) {
    const step = pattern.steps[tr][stepIdx];
    if (!step || !step.on) continue;
    const track = st.tracks[tr];
    if (trackGainVal(st, track) <= 0 && !(step.l && (step.l.sendD || step.l.sendV))) {
      // stadig trig'et hvis kun sends? nej — mute = stille
    }
    const from = lastFreqs[tr];
    lastFreqs[tr] = trig(rig, tr, track.patch, step, t, st, from);
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
  play() {
    const ctx = this.ensureCtx();
    this.stop();
    const st = this.getState();
    this.rig = buildRig(ctx, st);
    this.playing = true;
    this.stepPtr = 0;      // 16.-dels-taeller i det aktuelle pattern
    this.songPtr = 0;      // position i song-kaeden
    this.lastFreqs = new Array(st.tracks.length).fill(null);
    this.nextTime = ctx.currentTime + 0.1;
    this.stepLog = [];
    this.timer = setInterval(() => this._tick(), 25);
    this._tick();
  }
  _pattern(st) {
    if (st.mode === 'song' && st.song.length) {
      return st.patterns[st.song[this.songPtr % st.song.length]];
    }
    return st.patterns[st.curPattern];
  }
  _tick() {
    const ctx = this.ctx;
    const st = this.getState();
    while (this.nextTime < ctx.currentTime + 0.14) {
      const pat = this._pattern(st);
      const spb = 60 / st.bpm;
      const stepDur = spb / 4;
      const idx = this.stepPtr % pat.len;
      // swing paa de ulige 16.-dele
      const swingOff = (idx % 2 === 1) ? (st.swing ?? 0) * stepDur * 0.6 : 0;
      schedStep(this.rig, st, pat, idx, this.nextTime + swingOff, this.lastFreqs);
      const patIdx = st.mode === 'song' && st.song.length ? st.song[this.songPtr % st.song.length] : st.curPattern;
      this.stepLog.push({ t: this.nextTime, step: idx, pattern: patIdx });
      if (this.stepLog.length > 80) this.stepLog.shift();
      this.nextTime += stepDur;
      this.stepPtr++;
      if (this.stepPtr >= pat.len) {
        this.stepPtr = 0;
        if (st.mode === 'song' && st.song.length) {
          this.songPtr++;
          if (this.songPtr >= st.song.length && !st.songLoop) { this.stopAt = this.nextTime; }
        }
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
  audition(trIdx, step = null) {
    const ctx = this.ensureCtx();
    const st = this.getState();
    if (!this.audRig) this.audRig = buildRig(ctx, st);
    // opdater gains i audition-riggen
    st.tracks.forEach((tr, i) => { this.audRig.trackGains[i].gain.value = Math.max(0.0001, tr.level); });
    setMasterFilter(this.audRig, st.masterFilter ?? 0.5);
    trig(this.audRig, trIdx, st.tracks[trIdx].patch, step || { on: true, v: 1, n: 0, l: null }, ctx.currentTime + 0.02, st, null);
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
  const rig = buildRig(ctx, st);
  const lastFreqs = new Array(st.tracks.length).fill(null);
  let t = 0.05;
  for (const pi of chain) {
    const pat = st.patterns[pi];
    for (let s = 0; s < pat.len; s++) {
      const swingOff = (s % 2 === 1) ? (st.swing ?? 0) * stepDur * 0.6 : 0;
      schedStep(rig, st, pat, s, t + swingOff, lastFreqs);
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
