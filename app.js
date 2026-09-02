// SIMONS MUSIKMASKINE — UI og tilstand (v9: ÆGTE ABLETON-MODEL)
// JAM (Session View): spor = kolonner, clips = launchbare celler, scener = rækker.
// Ét klik = start (kvantiseret til næste takt, blinker i kø). Clips redigeres MENS de looper.
// SANG (Arrangement): frie clips på tidslinjen. Tab skifter view; det du ser, er det du hører.
import { Player, renderWav, noteName, NOTE_NAMES, stepNotes, faOf, clipQuant, cutHz, songEntry, entrySteps, emptyArr, arrLenSteps, tempoAt, songDurationSec, BAR, recBuffers, registerRecBuffer, encodeWav, liveOf, clipLen, sampleBuffers, loadSample, preloadSamples } from './engine.js?v=16';

const APP_VER = 'v16';
const $ = id => document.getElementById(id);
const PATTERN_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const TRACK_COLORS = ['#e58f8f', '#edc897', '#fffd9e', '#c9ffb7', '#91e4db', '#98c5e7', '#e6ddf1', '#d296bf'];
const MAX_STEPS = 32;

// ---------- patch-parametre (definitionen driver hele panelet) ----------
const PDEF = [
  { g: 'OSC', k: 'wave', type: 'opts', opts: ['saw', 'sqr', 'tri', 'sin', 'noise'] },
  { g: 'OSC', k: 'note', l: 'NOTE', min: 24, max: 96, step: 1, fmt: v => noteName(v) },
  { g: 'OSC', k: 'sub', l: 'SUB', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'OSC', k: 'noise', l: 'NOISE', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'OSC', k: 'drift', l: 'DRIFT', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'OSC 2', k: 'wave2', type: 'opts', opts: ['off', 'saw', 'sqr', 'tri', 'sin'] },
  { g: 'OSC 2', k: 'semi2', l: 'SEMI', min: -24, max: 24, step: 1, fmt: v => (v > 0 ? '+' : '') + v },
  { g: 'OSC 2', k: 'det2', l: 'DETUNE', min: 0, max: 50, step: 0.5, fmt: v => Math.round(v) + 'c' },
  { g: 'OSC 2', k: 'mix2', l: 'MIX', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'PITCH', k: 'glide', l: 'GLIDE', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'PITCH', k: 'penv', l: 'P.ENV', min: 0, max: 48, step: 1, fmt: v => v + 'st' },
  { g: 'PITCH', k: 'pdec', l: 'P.DEC', min: 0.01, max: 0.5, step: 0.005, fmt: ms },
  { g: 'FILTER', k: 'ftype', type: 'opts', opts: ['lp', 'hp', 'bp'] },
  { g: 'FILTER', k: 'cut', l: 'CUTOFF', min: 0, max: 1, step: 0.005, fmt: v => hz(cutHz(v)) },
  { g: 'FILTER', k: 'res', l: 'RESO', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'FILTER', k: 'fenv', l: 'F.ENV', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'FILTER', k: 'fdec', l: 'F.DEC', min: 0.02, max: 1, step: 0.005, fmt: ms },
  { g: 'AMP', k: 'att', l: 'ATTACK', min: 0.001, max: 0.3, step: 0.001, fmt: ms },
  { g: 'AMP', k: 'dec', l: 'DECAY', min: 0.03, max: 1.5, step: 0.005, fmt: ms },
  { g: 'AMP', k: 'sus', l: 'SUSTAIN', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'AMP', k: 'rel', l: 'RELEASE', min: 0.02, max: 2, step: 0.01, fmt: ms },
  { g: 'AMP', k: 'gate', l: 'GATE', min: 0.25, max: 8, step: 0.25, fmt: v => v + ' stp' },
  { g: 'FX', k: 'drive', l: 'DRIVE', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'FX', k: 'crush', l: 'CRUSH', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'FX', k: 'down', l: 'DOWNSMP', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'FX', k: 'ldst', type: 'opts', opts: ['off', 'pitch', 'cut', 'amp'] },
  { g: 'FX', k: 'lrate', l: 'LFO RATE', min: 0.1, max: 24, step: 0.1, fmt: v => v.toFixed(1) + 'Hz' },
  { g: 'FX', k: 'lamt', l: 'LFO AMT', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'MIX', k: 'pan', l: 'PAN', min: -1, max: 1, step: 0.01, fmt: panFmt },
  { g: 'MIX', k: 'duck', l: 'DUCK', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'MIX', k: 'sendD', l: 'DELAY', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'MIX', k: 'sendV', l: 'REVERB', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'MIX', k: 'choke', type: 'opts', opts: [0, 1, 2, 3, 4], labels: ['CHOKE —', '1', '2', '3', '4'] },
];
function pct(v) { return Math.round(v * 100) + '%'; }
function ms(v) { return v >= 1 ? v.toFixed(2) + 's' : Math.round(v * 1000) + 'ms'; }
function hz(v) { return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v) + ''; }
function panFmt(v) { return Math.abs(v) < 0.02 ? 'C' : (v < 0 ? 'V' : 'H') + Math.round(Math.abs(v) * 100); }

// ---------- presets ----------
function patch(over) {
  return { wave: 'saw', note: 48, sub: 0, noise: 0, drift: 0,
    wave2: 'off', semi2: 0, det2: 10, mix2: 0.5,
    glide: 0, penv: 0, pdec: 0.06,
    ftype: 'lp', cut: 0.8, res: 0, fenv: 0, fdec: 0.15,
    att: 0.002, dec: 0.3, sus: 0, rel: 0.25, gate: 1,
    drive: 0, crush: 0, down: 0,
    lrate: 5, lamt: 0, ldst: 'off',
    pan: 0, duck: 0, choke: 0, sendD: 0, sendV: 0, ...over };
}
const PRESETS = [
  { n: 'KICK', c: 'DRUMS', p: patch({ wave: 'sin', note: 36, penv: 30, pdec: 0.055, dec: 0.34, drive: 0.55, cut: 0.85 }) },
  { n: 'KICK RUMBLE', c: 'DRUMS', p: patch({ wave: 'sin', note: 34, penv: 26, pdec: 0.07, dec: 0.6, drive: 0.75, cut: 0.5, sendV: 0.25 }) },
  { n: 'CLAP', c: 'DRUMS', p: patch({ wave: 'noise', dec: 0.22, ftype: 'bp', cut: 0.68, res: 0.35, att: 0.008, sendV: 0.18 }) },
  { n: 'SNARE', c: 'DRUMS', p: patch({ wave: 'noise', note: 55, noise: 1, dec: 0.16, cut: 0.75, penv: 10, pdec: 0.05 }) },
  { n: 'HAT C', c: 'DRUMS', p: patch({ wave: 'noise', dec: 0.05, ftype: 'hp', cut: 0.8, res: 0.2, choke: 1 }) },
  { n: 'HAT O', c: 'DRUMS', p: patch({ wave: 'noise', dec: 0.32, ftype: 'hp', cut: 0.78, res: 0.2, choke: 1 }) },
  { n: 'RIDE', c: 'DRUMS', p: patch({ wave: 'noise', dec: 0.5, ftype: 'hp', cut: 0.85, res: 0.55, sendV: 0.12 }) },
  { n: '303 BASS', c: 'BASS', p: patch({ wave: 'saw', note: 36, glide: 0.35, dec: 0.24, cut: 0.3, res: 0.62, fenv: 0.5, fdec: 0.18, drive: 0.3, duck: 0.45 }) },
  { n: 'SUB BASS', c: 'BASS', p: patch({ wave: 'sin', note: 33, sub: 0.6, dec: 0.4, cut: 0.5, duck: 0.5 }) },
  { n: 'RAVE STAB', c: 'SYNTH', p: patch({ wave: 'saw', note: 60, wave2: 'saw', semi2: 12, det2: 14, mix2: 0.6, dec: 0.22, cut: 0.6, res: 0.3, fenv: 0.45, fdec: 0.12, sendD: 0.35, sendV: 0.2, duck: 0.35 }) },
  { n: 'HOOVER', c: 'SYNTH', p: patch({ wave: 'saw', note: 48, wave2: 'saw', semi2: 0, det2: 22, mix2: 1, sub: 0.35, drift: 0.4, sus: 0.6, rel: 0.3, gate: 2, dec: 0.15, cut: 0.5, res: 0.2, drive: 0.25, duck: 0.4 }) },
  { n: 'DUB STAB', c: 'SYNTH', p: patch({ wave: 'sqr', note: 57, wave2: 'sqr', semi2: 7, mix2: 0.5, dec: 0.28, cut: 0.42, res: 0.3, sendD: 0.55, sendV: 0.25, duck: 0.35 }) },
  { n: 'ACID LEAD', c: 'SYNTH', p: patch({ wave: 'sqr', note: 60, glide: 0.25, dec: 0.18, cut: 0.35, res: 0.7, fenv: 0.6, fdec: 0.1, sendD: 0.4 }) },
  { n: 'BLEEP', c: 'SYNTH', p: patch({ wave: 'sin', note: 84, dec: 0.09, sendD: 0.5 }) },
  { n: 'PERC', c: 'DRUMS', p: patch({ wave: 'tri', note: 74, penv: 14, pdec: 0.03, dec: 0.09, sendD: 0.3 }) },
  { n: 'ZAP', c: 'FX', p: patch({ wave: 'saw', note: 70, penv: 36, pdec: 0.09, dec: 0.12, drive: 0.4 }) },
  { n: 'LOFI PERC', c: 'DRUMS', p: patch({ wave: 'tri', note: 65, penv: 10, pdec: 0.04, dec: 0.12, crush: 0.55, down: 0.4, sendD: 0.3 }) },
  { n: 'NOISE SWEEP', c: 'FX', p: patch({ wave: 'noise', att: 0.25, dec: 1.3, ftype: 'bp', cut: 0.55, res: 0.5, fenv: 0.8, fdec: 1.1, sendV: 0.45, duck: 0.3 }) },
  { n: 'DRONE', c: 'FX', p: patch({ wave: 'saw', note: 36, sub: 0.4, drift: 0.3, att: 0.1, dec: 1.5, sus: 0.7, rel: 0.8, gate: 4, cut: 0.35, res: 0.4, lamt: 0.5, lrate: 0.8, ldst: 'cut', sendV: 0.3, duck: 0.5 }) },
];

// ---------- default-projekt: 3 scener klar til at spille (sparsom → fuld → break) ----------
function stepOn(v = 1, n = 0, l = null) { return { on: true, v, n, l }; }
function mkClip(tr, name, hits, len = 16) {
  const steps = new Array(MAX_STEPS).fill(null);
  for (const h of hits) steps[h[0]] = { on: true, v: h[1] ?? 1, n: h[2] ?? 0, l: h[3] ?? null, ...(h[4] || {}) };
  return { tr, name, len, tlen: null, steps };
}
function defaultProject() {
  const tracks = [
    { name: 'KICK', patch: { ...PRESETS[0].p } },
    { name: 'CLAP', patch: { ...PRESETS[2].p } },
    { name: 'HAT C', patch: { ...PRESETS[4].p } },
    { name: 'HAT O', patch: { ...PRESETS[5].p } },
    { name: '303', patch: { ...PRESETS[7].p } },
    { name: 'STAB', patch: { ...PRESETS[9].p } },
    { name: 'PERC', patch: { ...PRESETS[14].p } },
    { name: 'SWEEP', patch: { ...PRESETS[17].p } },
  ].map((t, i) => ({ ...t, level: 0.8, mute: false, solo: false, color: TRACK_COLORS[i] }));
  const clips = {
    k1: mkClip(0, 'KICK 4/4', [[0], [4], [8], [12]]),
    c1: mkClip(1, 'CLAP 2&4', [[4], [12]]),
    h1: mkClip(2, 'HATS', [[0, 0.55], [1, 0.55], [4, 0.55], [5, 0.55], [8, 0.55], [9, 0.55], [12, 0.55], [13, 0.55]]),
    o1: mkClip(3, 'OFFBEAT', [[2, 0.8], [6, 0.8], [10, 0.8], [14, 0.8], [15, 0.7, 0, null, { c: 'fill', r: 3 }]]),
    b1: mkClip(4, 'ACID A', [[0, 0.9], [3, 0.9], [6, 0.9, 12], [7, 0.9], [10, 0.9, 3], [12, 0.9], [14, 0.9, 15, { cut: 0.55, res: 0.75 }]]),
    b2: mkClip(4, 'ACID B', [[0, 0.9], [2, 0.8, 3], [5, 0.9, 0], [8, 0.9, -2], [11, 0.85, 12], [14, 0.9, 10, { cut: 0.5 }]]),
    s1: mkClip(5, 'STAB', [[8, 0.9, 0, { sendD: 0.5 }]]),
    p1: mkClip(6, 'PERC', [[7, 0.7], [11, 0.6, 0, null, { p: 0.5 }], [15, 0.7, 3]]),
    w1: mkClip(7, 'SWEEP', [[0, 0.9]]),
  };
  const N = () => new Array(8).fill(null);
  const scenes = [
    { name: 'INTRO', slots: ['k1', null, 'h1', null, 'b1', null, null, null] },
    { name: 'FULD', slots: ['k1', 'c1', 'h1', 'o1', 'b1', 's1', 'p1', null] },
    { name: 'BREAK', slots: [null, 'c1', null, 'o1', 'b2', 's1', null, 'w1'] },
    { name: '4', slots: N() },
    { name: '5', slots: N() },
    { name: '6', slots: N() },
  ];
  return {
    v: 4, name: '', bpm: 132, swing: 0.12, masterFilter: 0.5, masterVol: 0.9,
    delayFb: 0.42, delayDiv: 3, pumpFx: 0.4, duckTrack: 0,
    mode: 'jam', songLoop: true,
    clips, session: { scenes },
    arr: emptyArr(),
    tracks,
  };
}
// migration: gamle patterns/entry-sange → clips + scener
function migrate(s) {
  if (!s || !s.tracks) return null;
  const def = patch();
  s.tracks.forEach(tr => { tr.patch = { ...def, ...tr.patch }; });
  if (s.pumpFx === undefined) s.pumpFx = 0.4;
  if (s.duckTrack === undefined) s.duckTrack = 0;
  if (!s.arr) s.arr = emptyArr();
  if (!s.arr.auto) s.arr.auto = { mf: [], vol: [], pump: [] };
  // aeldste format: entry-baseret song → arr med {p, tr}
  if (Array.isArray(s.song) && s.song.length && !s.arr.clips.length && s.patterns) {
    let cum = 0;
    for (const raw of s.song) {
      const e = songEntry(raw);
      const len = entrySteps(s, e);
      for (let tr = 0; tr < 8; tr++) {
        if (e.mutes && e.mutes[tr]) continue;
        const cell = e.cells ? e.cells[tr] : null;
        const p = cell && cell.p != null ? cell.p : e.p;
        if (!s.patterns[p].steps[tr].some(x => x?.on)) continue;
        const c = { id: 'm' + cum + '_' + tr, tr, at: cum, len, p };
        if (cell?.n) c.n = cell.n;
        if (cell?.lvl != null && cell.lvl < 1) c.lvl = cell.lvl;
        if (cell?.cut != null) c.cut = cell.cut;
        s.arr.clips.push(c);
      }
      if (e.name) s.arr.markers.push({ at: cum, name: e.name });
      if (e.bpm) s.arr.tempo.push({ at: cum, bpm: e.bpm });
      if (e.riser) s.arr.fx.push({ at: cum, type: 'riser', len });
      if (e.boom) s.arr.fx.push({ at: cum, type: 'boom' });
      for (const k of ['mf', 'vol', 'pump']) {
        if (e[k] !== undefined && e[k] !== null) s.arr.auto[k].push({ at: cum + len, v: e[k] });
      }
      cum += len;
    }
  }
  delete s.song;
  delete s.loopA;
  delete s.loopB;
  // patterns → clips + scener
  if (s.patterns) {
    s.clips = s.clips || {};
    const scenes = [];
    for (let i = 0; i < s.patterns.length; i++) {
      const P = s.patterns[i];
      const slots = new Array(8).fill(null);
      let any = false;
      for (let tr = 0; tr < 8; tr++) {
        if (!P.steps[tr].some(x => x?.on)) continue;
        const id = `p${i}t${tr}`;
        s.clips[id] = { tr, name: PATTERN_NAMES[i], len: P.len, tlen: (P.tlen && P.tlen[tr]) || null, steps: P.steps[tr] };
        slots[tr] = id;
        any = true;
      }
      if (any || i < 3) scenes.push({ name: '' + (i + 1), slots });
    }
    while (scenes.length < 4) scenes.push({ name: '' + (scenes.length + 1), slots: new Array(8).fill(null) });
    s.session = { scenes };
    for (const c of s.arr.clips) {
      if (c.audio || c.p == null) continue;
      const id = `p${c.p}t${c.tr}`;
      if (!s.clips[id]) {
        s.clips[id] = { tr: c.tr, name: PATTERN_NAMES[c.p], len: s.patterns[c.p].len, tlen: null, steps: s.patterns[c.p].steps[c.tr] };
      }
      c.clip = id;
      delete c.p;
    }
    delete s.patterns;
    delete s.curPattern;
  }
  if (s.clips) {
    for (const c of Object.values(s.clips)) {
      if (/^[A-H]$/.test(c.name || '')) c.name = ((s.tracks[c.tr]?.name || 'CLIP') + ' ' + c.name).slice(0, 14);
    }
  }
  if (!s.clips) s.clips = {};
  if (!s.session) s.session = { scenes: Array.from({ length: 4 }, (_, i) => ({ name: '' + (i + 1), slots: new Array(8).fill(null) })) };
  if (s.mode !== 'song') s.mode = 'jam';
  s._fill = false;
  return s;
}

// ---------- tilstand ----------
let st = null;
try { st = migrate(JSON.parse(localStorage.getItem('simon-project-v1') || 'null')); } catch (e) { console.warn(e); }
if (!st) st = defaultProject();
let curTrack = 0;
let selScene = 0;
let selClipId = null;          // clip'en i editoren
let gridSel = { scene: 0, tr: 0 }; // tastatur-markoer i griddet
let lockSel = null;            // {step} paa den redigerede clip
const player = new Player(() => st);

let saveTimer = null;
const NO_UNDERSCORE = (k, v) => (typeof k === 'string' && k.startsWith('_')) ? undefined : v;
function snapshot(x) { return JSON.parse(JSON.stringify(x, NO_UNDERSCORE)); }
const undoStack = [], redoStack = [];
let lastSnap = JSON.stringify(st, NO_UNDERSCORE);
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const now = JSON.stringify(st, NO_UNDERSCORE);
    if (now !== lastSnap) {
      undoStack.push(lastSnap);
      if (undoStack.length > 60) undoStack.shift();
      redoStack.length = 0;
      lastSnap = now;
    }
    localStorage.setItem('simon-project-v1', now);
  }, 300);
}
function historyJump(toSnap) {
  st = migrate(JSON.parse(toSnap)) || st;
  lastSnap = JSON.stringify(st, NO_UNDERSCORE);
  localStorage.setItem('simon-project-v1', lastSnap);
  if (selClipId && !st.clips[selClipId]) { selClipId = null; lockSel = null; }
  if (selArrClip && !st.arr.clips.some(c => c.id === selArrClip)) selArrClip = null;
  selScene = Math.min(selScene, st.session.scenes.length - 1);
  gridSel.scene = Math.min(gridSel.scene, st.session.scenes.length - 1);
  syncTop(); renderAll();
}
function doUndo() {
  clearTimeout(saveTimer);
  const now = JSON.stringify(st, NO_UNDERSCORE);
  if (now !== lastSnap) { undoStack.push(lastSnap); lastSnap = now; } // uafsluttet aendring med i historikken
  if (!undoStack.length) { toast('Intet at fortryde'); return; }
  redoStack.push(JSON.stringify(st, NO_UNDERSCORE));
  historyJump(undoStack.pop());
  toast('↩ Fortrudt (' + undoStack.length + ' tilbage)');
}
function doRedo() {
  if (!redoStack.length) { toast('Intet at gendanne'); return; }
  undoStack.push(JSON.stringify(st, NO_UNDERSCORE));
  historyJump(redoStack.pop());
  toast('↪ Gendannet');
}
function toast(msg, err = false) {
  const t = $('toast');
  t.textContent = msg; t.className = err ? 'err' : ''; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}
let clipSeq = 1;
function newClipId() { return 'c' + Date.now().toString(36) + (clipSeq++); }
function trackClips(tr) { return Object.entries(st.clips).filter(([, c]) => c.tr === tr); }
function gcClips() {
  const used = new Set();
  for (const sc of st.session.scenes) for (const id of sc.slots) if (id) used.add(id);
  for (const c of st.arr.clips) if (c.clip) used.add(c.clip);
  if (selClipId) used.add(selClipId);
  for (const id of Object.keys(st.clips)) if (!used.has(id)) delete st.clips[id];
}

// ---------- menuer ----------
let ctxMenuEl = null;
function closeMenus() {
  if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
  const e = $('eucPop'); if (e) e.remove();
  const c = $('clipPop'); if (c) c.remove();
}
window.addEventListener('pointerdown', e => {
  if (ctxMenuEl && !ctxMenuEl.contains(e.target)) closeMenus();
  const cp = $('clipPop');
  if (cp && !cp.contains(e.target) && !e.target.closest('.arrClip')) cp.remove();
});
function menuAt(ev, items) {
  closeMenus();
  const m = document.createElement('div');
  m.id = 'ctxMenu';
  for (const [label, fn] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = e2 => { e2.stopPropagation(); closeMenus(); fn(); };
    m.appendChild(b);
  }
  m.style.left = Math.min(ev.clientX, innerWidth - 210) + 'px';
  m.style.top = Math.min(ev.clientY, innerHeight - 60 - items.length * 28) + 'px';
  document.body.appendChild(m);
  ctxMenuEl = m;
}

// ---------- BROWSER (lydbiblioteket, som Ableton's venstre panel) ----------
const KITS = [
  { n: 'TECHNO', d: 'Standard-kittet: kick, clap, hats, 303, stab, perc, sweep', tracks: [
    ['KICK', 0], ['CLAP', 2], ['HAT C', 4], ['HAT O', 5], ['303', 7], ['STAB', 9], ['PERC', 14], ['SWEEP', 17]] },
  { n: 'HARD', d: 'Rumble-kick, snare, ride, hoover — hård techno', tracks: [
    ['KICK', 1], ['SNARE', 3], ['HAT C', 4], ['RIDE', 6], ['SUB', 8], ['HOOVER', 10], ['ZAP', 15], ['SWEEP', 17]] },
  { n: 'DUB', d: 'Dub-stabs, dyb sub, bleeps og drone', tracks: [
    ['KICK', 0], ['CLAP', 2], ['HAT C', 4], ['HAT O', 5], ['SUB', 8], ['DUB STAB', 11], ['BLEEP', 13], ['DRONE', 18]] },
  { n: 'LOFI', d: 'Knasede percs og bløde stabs', tracks: [
    ['KICK', 0], ['SNARE', 3], ['LOFI PERC', 16], ['HAT O', 5], ['303', 7], ['DUB STAB', 11], ['PERC', 14], ['DRONE', 18]] },
];
let browserOpen = true;
let sampleManifest = null;
const openFolders = new Set();
fetch('samples/manifest.json').then(r => r.json()).then(m => { sampleManifest = m; renderBrowser(); }).catch(() => {});
let presetDrag = null;
function loadPresetOnTrack(pi, tr) {
  st.tracks[tr].patch = { ...PRESETS[pi].p };
  st.tracks[tr].name = PRESETS[pi].n.slice(0, 10);
  persist(); renderSession(); renderPanel();
  player.audition(tr);
  toast(PRESETS[pi].n + ' indlæst på spor ' + (tr + 1));
}
function renderBrowser() {
  const el = $('browser');
  el.innerHTML = '';
  el.classList.toggle('collapsed', !browserOpen);
  const tog = document.createElement('button');
  tog.id = 'brTog';
  tog.textContent = browserOpen ? '◀' : '▶';
  tog.title = browserOpen ? 'Skjul browseren' : 'Vis browseren (lydbiblioteket)';
  tog.onclick = () => { browserOpen = !browserOpen; renderBrowser(); };
  el.appendChild(tog);
  if (!browserOpen) return;
  const sec = (title, hint) => {
    const h = document.createElement('div');
    h.className = 'brSec';
    h.textContent = title;
    if (hint) h.title = hint;
    el.appendChild(h);
    const box = document.createElement('div');
    box.className = 'brList';
    el.appendChild(box);
    return box;
  };
  // LYDE: klik = hoer paa valgt spor · dobbeltklik = indlaes · traek til en spor-kolonne
  const sounds = sec('SOUNDS', 'Lyde maskinen SELV laver (indstillinger til synthen — kan skrues på bagefter). Klik: hør · dobbeltklik: læg på valgt spor · træk til et spor');
  ['DRUMS', 'BASS', 'SYNTH', 'FX'].forEach(cat => {
  const ch = document.createElement('div');
  ch.className = 'brCat';
  ch.textContent = cat;
  sounds.appendChild(ch);
  PRESETS.forEach((pr, pi) => {
    if ((pr.c || 'SYNTH') !== cat) return;
    const row = document.createElement('button');
    row.className = 'brRow';
    row.innerHTML = `<span class="brIco">◈</span>${pr.n}`;
    row.title = 'Klik: hør · dobbeltklik: læg på ' + st.tracks[curTrack].name + ' · træk til et spor';
    row.onclick = () => player.audition(curTrack, null, pr.p);
    row.ondblclick = () => loadPresetOnTrack(pi, curTrack);
    row.onpointerdown = ev => {
      presetDrag = { pi, x0: ev.clientX, y0: ev.clientY, moved: false, el: row };
      try { row.setPointerCapture(ev.pointerId); } catch (e2) {}
    };
    row.onpointermove = ev => {
      if (!presetDrag || presetDrag.el !== row) return;
      if (!presetDrag.moved && Math.abs(ev.clientX - presetDrag.x0) < 8 && Math.abs(ev.clientY - presetDrag.y0) < 8) return;
      presetDrag.moved = true;
      row.classList.add('dragging');
      const col = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.sesCol:not(.main)');
      document.querySelectorAll('.sesCol.dropOk').forEach(x => x.classList.remove('dropOk'));
      if (col) {
        col.classList.add('dropOk');
        presetDrag.target = [...document.querySelectorAll('.sesCol')].indexOf(col);
      } else presetDrag.target = null;
    };
    row.onpointerup = () => {
      if (!presetDrag || presetDrag.el !== row) return;
      const d = presetDrag;
      presetDrag = null;
      row.classList.remove('dragging');
      document.querySelectorAll('.sesCol.dropOk').forEach(x => x.classList.remove('dropOk'));
      if (d.moved && d.target != null && d.target < 8) loadPresetOnTrack(d.pi, d.target);
    };
    sounds.appendChild(row);
  });
  });
  // KITS: dobbeltklik = indlaes alle 8 spor
  const kits = sec('KITS', 'Hele lydpakker: 8 sammenhørende synth-lyde, én pr. spor. Dobbeltklik skifter ALLE 8 spors lyde på én gang — dine clips/steps røres ikke, de spiller videre med de nye lyde');
  KITS.forEach(kit => {
    const row = document.createElement('button');
    row.className = 'brRow';
    row.innerHTML = `<span class="brIco">▦</span>${kit.n}`;
    row.title = kit.d + ' — dobbeltklik: indlæs alle 8 spor';
    row.onclick = () => toast('Kit = hel lydpakke til alle 8 spor — DOBBELTKLIK for at indlæse ' + kit.n);
    row.ondblclick = () => {
      kit.tracks.forEach(([nm, pi], tr) => {
        st.tracks[tr].patch = { ...PRESETS[pi].p };
        st.tracks[tr].name = nm;
      });
      persist(); renderSession(); renderPanel();
      toast('Kit "' + kit.n + '" indlæst — dine clips spiller nu med de nye lyde');
    };
    kits.appendChild(row);
  });
  // SAMPLES: rigtige lyde fra samples/-mapperne — klik = hoer · dobbeltklik = laeg paa valgt spor
  if (sampleManifest) {
    const sbox = sec('SAMPLES', 'Rigtige optagede lyde (i modsætning til SYNTHS). Klik: hør · dobbeltklik: gør samplen til det valgte spors lyd — pitches af steps/MIDI, kører gennem filter/envelope/duck');
    for (const [folder, files] of Object.entries(sampleManifest)) {
      const fRow = document.createElement('button');
      fRow.className = 'brRow brFolder';
      fRow.innerHTML = `<span class="brIco">${openFolders.has(folder) ? '▼' : '▶'}</span>${folder} <i>${files.length}</i>`;
      fRow.onclick = () => {
        if (openFolders.has(folder)) openFolders.delete(folder); else openFolders.add(folder);
        renderBrowser();
      };
      sbox.appendChild(fRow);
      if (!openFolders.has(folder)) continue;
      for (const f of files) {
        const url = 'samples/' + folder + '/' + f;
        const nm = f.replace(/\.(flac|wav)$/, '').replace(/_/g, ' ');
        const row = document.createElement('button');
        row.className = 'brRow brFile';
        row.innerHTML = `<span class="brIco">♪</span>${nm}`;
        row.title = 'Klik: hør · dobbeltklik: læg samplen på ' + st.tracks[curTrack].name;
        row.onclick = async () => {
          try {
            const buf = await loadSample(url);
            const ctx = player.ensureCtx();
            const s2 = ctx.createBufferSource();
            s2.buffer = buf;
            const g = ctx.createGain(); g.gain.value = 0.8;
            s2.connect(g); g.connect(ctx.destination);
            s2.start();
          } catch (e2) { toast('Kunne ikke indlæse ' + nm, true); }
        };
        row.ondblclick = async () => {
          try {
            await loadSample(url);
            const p = st.tracks[curTrack].patch;
            p.smp = url;
            st.tracks[curTrack].name = nm.toUpperCase().slice(0, 10);
            persist(); renderSession(); renderPanel();
            player.audition(curTrack);
            toast('♪ ' + nm + ' på spor ' + (curTrack + 1) + ' — steps/MIDI pitcher den, filter/env/duck virker');
          } catch (e2) { toast('Kunne ikke indlæse ' + nm, true); }
        };
        sbox.appendChild(row);
      }
    }
  }
  // CLIPS: alle projektets clips — klik = vaelg/redigér · dobbeltklik = laeg i ledig slot
  const clipsBox = sec('CLIPS', 'Alle projektets musikalske idéer, grupperet pr. spor — klik: åbn i editoren · dobbeltklik: læg i første ledige slot i griddet');
  let anyClips = false;
  for (let tr2 = 0; tr2 < 8; tr2++) {
    const mine = trackClips(tr2);
    if (!mine.length) continue;
    anyClips = true;
    const h = document.createElement('div');
    h.className = 'brTrkHead';
    h.innerHTML = `<span class="brDot" style="background:${st.tracks[tr2].color}"></span>${st.tracks[tr2].name}`;
    clipsBox.appendChild(h);
    for (const [cid, c] of mine) {
      const row = document.createElement('button');
      row.className = 'brRow brFile';
      row.innerHTML = `<span class="brDot" style="background:${c.color || st.tracks[c.tr].color}"></span>${c.name}${c.fa && c.fa.act && c.fa.act !== 'none' ? ' ⟳' : ''}`;
      row.title = st.tracks[c.tr].name + ' · ' + clipLen(c) + ' steps — klik: åbn · dobbeltklik: læg i ledig slot';
      row.onclick = () => { selectClip(cid, c.tr); renderSession(); };
      row.ondblclick = () => {
        let si = st.session.scenes.findIndex(sc => !sc.slots[c.tr]);
        if (si < 0) { addScene(); si = st.session.scenes.length - 1; }
        st.session.scenes[si].slots[c.tr] = cid;
        persist(); selectClip(cid, c.tr, si); renderSession();
      };
      clipsBox.appendChild(row);
    }
  }
  if (!anyClips) {
    const d = document.createElement('div');
    d.className = 'brEmpty';
    d.textContent = 'Ingen clips endnu';
    clipsBox.appendChild(d);
  }
  // OPTAGELSER: klik = hoer · dobbeltklik = laeg i sangen ved startmarkoeren
  const recsBox = sec('🎙 RECORDINGS', 'Dine stemme-optagelser — klik: hør · dobbeltklik: læg som audio-clip i sangen');
  const recIds = [...recBuffers.keys()];
  if (!recIds.length) {
    const d = document.createElement('div');
    d.className = 'brEmpty';
    d.textContent = 'Ingen endnu — brug 🎙 OPTAG';
    recsBox.appendChild(d);
  }
  for (const rid of recIds) {
    const buf = recBuffers.get(rid);
    const row = document.createElement('button');
    row.className = 'brRow';
    row.innerHTML = `<span class="brIco">🎙</span>${buf.duration.toFixed(1)}s`;
    row.title = 'Klik: hør optagelsen · dobbeltklik: læg som audio-clip på ' + st.tracks[curTrack].name + ' ved ▸';
    row.onclick = () => {
      const ctx = player.ensureCtx();
      const s2 = ctx.createBufferSource();
      s2.buffer = buf;
      const g = ctx.createGain(); g.gain.value = 0.8;
      s2.connect(g); g.connect(ctx.destination);
      s2.start();
    };
    row.ondblclick = () => {
      const stepDur = 60 / st.bpm / 4;
      const lenBars = Math.max(1, Math.ceil(buf.duration / (stepDur * BAR)));
      const c = { id: newClipId(), tr: curTrack, at: (st._startBar ?? 0) * BAR, len: lenBars * BAR, audio: rid };
      placeClip(c);
      selArrClip = c.id;
      persist();
      toast('Optagelsen lagt i sangen på ' + st.tracks[curTrack].name + ' — Tab for at se den');
      renderSongUI();
    };
    recsBox.appendChild(row);
  }
}
function trackClipsAll() {
  return Object.entries(st.clips).sort((a, b) => a[1].tr - b[1].tr || a[1].name.localeCompare(b[1].name));
}

// ---------- SESSION-GRID (JAM) ----------
function live() { return liveOf(st); }
function ensurePlaying() {
  if (!player.playing) togglePlay();
}
// launch en clip (Ableton-kernen: kvantiseret, blinker i koe)
function launchClip(sceneIdx, tr) {
  const id = st.session.scenes[sceneIdx].slots[tr];
  if (!id) return;
  selectClip(id, tr, sceneIdx);
  const L = live()[tr];
  const c = st.clips[id];
  if (player.playing && st.mode === 'jam') {
    // Launch Mode (Live): Toggle = klik paa spillende clip stopper den
    if (c && c.lm === 'toggle' && L.play === id && L.next === undefined) L.next = 'stop';
    else L.next = id;            // koe → blink → starter ved kvantiseringspunktet
  } else {
    L.play = id; L.at = 0; L.next = undefined;
    st.mode = 'jam';
    ensurePlaying();
  }
  renderSession();
}
function stopTrack(tr) {
  const L = live()[tr];
  if (player.playing && st.mode === 'jam') L.next = 'stop';
  else { L.play = null; L.next = undefined; }
  renderSession();
}
function launchScene(i) {
  selScene = i;
  const sc = st.session.scenes[i];
  if (sc.bpm) { st.bpm = sc.bpm; $('bpm').value = sc.bpm; persist(); }
  const playing = player.playing && st.mode === 'jam';
  sc.slots.forEach((id, tr) => {
    const L = live()[tr];
    if (playing) L.next = id || 'stop';
    else { L.play = id || null; L.at = 0; L.next = undefined; }
  });
  if (!playing) { st.mode = 'jam'; ensurePlaying(); }
  // Ableton: vaelg naeste scene efter launch, saa Enter/tal spiller sangen nedad
  gridSel.scene = Math.min(i + 1, st.session.scenes.length - 1);
  renderSession();
}
function stopAll() {
  const playing = player.playing && st.mode === 'jam';
  for (const L of live()) {
    if (playing) L.next = 'stop';
    else { L.play = null; L.next = undefined; }
  }
  renderSession();
}
function selectTrack(tr) {
  if (curTrack !== tr) { lockSel = null; }
  curTrack = tr;
  renderSession(); renderPanel(); renderClipEditor();
}
function selectClip(id, tr, sceneIdx = null) {
  if (curTrack !== tr) lockSel = null;
  curTrack = tr;
  if (selClipId !== id) lockSel = null;
  selClipId = id;
  if (sceneIdx != null) { selScene = sceneIdx; gridSel = { scene: sceneIdx, tr }; }
  renderPanel(); renderClipEditor();
}
// tom slot: ét klik skaber en clip og aabner editoren (aldrig en doed ende)
function createClipInSlot(sceneIdx, tr) {
  const id = newClipId();
  const n = trackClips(tr).length + 1;
  st.clips[id] = { tr, name: (st.tracks[tr].name.slice(0, 8) + ' ' + n), len: 16, tlen: null, steps: new Array(MAX_STEPS).fill(null) };
  st.session.scenes[sceneIdx].slots[tr] = id;
  persist();
  selectClip(id, tr, sceneIdx);
  renderSession();
  toast('Ny clip — tænd steps i editoren nederst (start den, og hør ændringerne live)');
}
function dupClipBelow(sceneIdx, tr) {
  const id = st.session.scenes[sceneIdx].slots[tr];
  if (!id) return;
  const src = st.clips[id];
  const nid = newClipId();
  st.clips[nid] = snapshot({ ...src, name: (src.name + ' 2').slice(0, 14) });
  let target = sceneIdx + 1;
  while (target < st.session.scenes.length && st.session.scenes[target].slots[tr]) target++;
  if (target >= st.session.scenes.length) addScene();
  st.session.scenes[target].slots[tr] = nid;
  persist();
  selectClip(nid, tr, target);
  renderSession();
}
function addScene() {
  st.session.scenes.push({ name: '' + (st.session.scenes.length + 1), slots: new Array(8).fill(null) });
  persist();
}
function slotMenu(ev, sceneIdx, tr) {
  const id = st.session.scenes[sceneIdx].slots[tr];
  const items = [];
  if (id) {
    const c = st.clips[id];
    items.push(['▶ START (klik)', () => launchClip(sceneIdx, tr)]);
    items.push(['⧉ DUPLIKÉR NEDENUNDER (cmd+D)', () => dupClipBelow(sceneIdx, tr)]);
    items.push(['✎ OMDØB…', () => {
      const nm = prompt('Clip-navn:', c.name);
      if (nm && nm.trim()) { c.name = nm.trim().slice(0, 14); persist(); renderSession(); renderClipEditor(); }
    }]);
    items.push([c.dis ? '◉ AKTIVÉR (0)' : '◎ DEAKTIVÉR (0)', () => { c.dis = !c.dis; if (!c.dis) delete c.dis; persist(); renderSession(); }]);
    items.push(['🎨 FARVE…', () => openColorPop(ev, c)]);
    items.push(['⟳ FOLLOW ACTION…', () => openFaPop(ev, c)]);
    items.push(['✕ RYD SLOT (Delete)', () => { clearSlot(sceneIdx, tr); }]);
  } else {
    items.push(['+ NY CLIP', () => createClipInSlot(sceneIdx, tr)]);
    const mine = trackClips(tr);
    for (const [cid, c] of mine.slice(0, 6)) {
      items.push([`▣ LÆG "${c.name}" HER`, () => {
        st.session.scenes[sceneIdx].slots[tr] = cid;
        persist(); renderSession();
      }]);
    }
  }
  menuAt(ev, items);
}
function clearSlot(sceneIdx, tr) {
  const id = st.session.scenes[sceneIdx].slots[tr];
  st.session.scenes[sceneIdx].slots[tr] = null;
  const L = live()[tr];
  if (L.play === id) { L.play = null; L.next = undefined; }
  if (selClipId === id) { selClipId = null; lockSel = null; }
  gcClips();
  persist();
  renderSession(); renderClipEditor();
}
function sceneMenu(ev, i) {
  menuAt(ev, [
    ['▶ START SCENE', () => launchScene(i)],
    ['⧉ DUPLIKÉR SCENE', () => {
      st.session.scenes.splice(i + 1, 0, { name: st.session.scenes[i].name + ' 2', slots: [...st.session.scenes[i].slots] });
      persist(); renderSession();
    }],
    ['✎ OMDØB…', () => {
      const nm = prompt('Scene-navn (fx INTRO, DROP):', st.session.scenes[i].name);
      if (nm != null) { st.session.scenes[i].name = nm.trim().toUpperCase().slice(0, 10); persist(); renderSession(); }
    }],
    ['♩ SCENE TEMPO…', () => {
      const cur = st.session.scenes[i].bpm || '';
      const v = prompt('Scene Tempo (BPM, tom = ingen ændring ved launch):', cur);
      if (v == null) return;
      const n = parseInt(v, 10);
      if (!v.trim() || !n) delete st.session.scenes[i].bpm;
      else st.session.scenes[i].bpm = Math.max(60, Math.min(200, n));
      persist(); renderSession();
    }],
    ['◌ RYD SCENE', () => { st.session.scenes[i].slots = new Array(8).fill(null); gcClips(); persist(); renderSession(); }],
    ['✕ SLET SCENE', () => {
      if (st.session.scenes.length <= 1) return;
      st.session.scenes.splice(i, 1);
      selScene = Math.min(selScene, st.session.scenes.length - 1);
      gridSel.scene = Math.min(gridSel.scene, st.session.scenes.length - 1);
      gcClips(); persist(); renderSession();
    }],
  ]);
}
const CLIP_PALETTE = ['#e58f8f', '#edc897', '#fffd9e', '#c9ffb7', '#a8fed3', '#91e4db', '#98c5e7', '#c1d1e0', '#e6ddf1', '#d296bf', '#dfc5c1', '#d9e4b7'];
function openColorPop(ev, c) {
  closeMenus();
  const pop = document.createElement('div');
  pop.id = 'eucPop';
  pop.innerHTML = '<div class="eucTitle">CLIP-FARVE</div><div class="colRow"></div><div class="eucBtns"><button id="colTrk">SPORFARVE</button><button id="colClose">LUK</button></div>';
  const row = pop.querySelector('.colRow');
  for (const col of CLIP_PALETTE) {
    const b = document.createElement('button');
    b.className = 'colSw';
    b.style.background = col;
    b.onclick = () => { c.color = col; persist(); renderSession(); renderBrowser(); pop.remove(); };
    row.appendChild(b);
  }
  pop.querySelector('#colTrk').onclick = () => { delete c.color; persist(); renderSession(); renderBrowser(); pop.remove(); };
  pop.querySelector('#colClose').onclick = () => pop.remove();
  pop.style.left = Math.min(ev.clientX, innerWidth - 240) + 'px';
  pop.style.top = Math.min(ev.clientY, innerHeight - 160) + 'px';
  pop.onpointerdown = e2 => e2.stopPropagation();
  document.body.appendChild(pop);
}
// FOLLOW ACTIONS (Ableton-manualen): clip'en skifter selv efter N gennemloeb
function openFaPop(ev, c) {
  closeMenus();
  const id = Object.keys(st.clips).find(k => st.clips[k] === c);
  const si = st.session.scenes.findIndex(sc => sc.slots[c.tr] === id);
  selectClip(id, c.tr, si >= 0 ? si : null);
  const p = document.getElementById('pnlLaunch');
  if (p) { p.classList.add('flash'); setTimeout(() => p.classList.remove('flash'), 1400); }
}
let slotDrag = null;
// lille drejeknap (Live-look): traek lodret for at skrue
function knobEl(get, set, title, size = 22) {
  const w = document.createElement('div');
  w.className = 'knob';
  w.title = title;
  const draw = () => {
    const v = Math.max(0, Math.min(1, get()));
    const a0 = 0.75 * Math.PI, a1 = a0 + v * 1.5 * Math.PI;
    const r = size / 2, ar = r - 3;
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    const x0 = r + ar * Math.cos(a0), y0 = r + ar * Math.sin(a0);
    const x1 = r + ar * Math.cos(a1), y1 = r + ar * Math.sin(a1);
    w.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <circle cx="${r}" cy="${r}" r="${r - 1.5}" class="kbg"/>
      <path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${ar} ${ar} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" class="karc"/>
      <line x1="${r}" y1="${r}" x2="${(r + (ar - 1) * Math.cos(a1)).toFixed(1)}" y2="${(r + (ar - 1) * Math.sin(a1)).toFixed(1)}" class="kptr"/>
    </svg>`;
  };
  let kd = null;
  w.onpointerdown = ev => {
    ev.preventDefault();
    kd = { y0: ev.clientY, v0: get() };
    try { w.setPointerCapture(ev.pointerId); } catch (e2) {}
  };
  w.onpointermove = ev => {
    if (!kd) return;
    set(Math.max(0, Math.min(1, kd.v0 + (kd.y0 - ev.clientY) / 120)));
    draw();
  };
  w.onpointerup = () => { kd = null; persist(); };
  draw();
  return w;
}
function dbLabel(level) {
  if (level <= 0.001) return '-inf';
  return (20 * Math.log10(level)).toFixed(1);
}
function renderSession() {
  const el = $('session');
  el.innerHTML = '';
  const scenes = st.session.scenes;
  const L = live();
  const grid = document.createElement('div');
  grid.id = 'sesGrid';
  const mixer = document.createElement('div');
  mixer.id = 'sesMixer';
  st.tracks.forEach((tr, ti) => {
    // ---- kolonnens slot-del ----
    const col = document.createElement('div');
    col.className = 'sesCol' + (ti === curTrack ? ' sel' : '');
    const head = document.createElement('div');
    head.className = 'sesHead';
    head.innerHTML = `${ti + 1} ${tr.name}`;
    head.style.background = tr.color;
    head.title = 'Klik: vælg sporet (lyd-panelet + MIDI) · dobbeltklik: omdøb';
    head.onclick = () => selectTrack(ti);
    head.ondblclick = () => {
      const name = prompt('Spornavn:', tr.name);
      if (name && name.trim()) { tr.name = name.trim().toUpperCase().slice(0, 12); persist(); renderSession(); renderPanel(); }
    };
    col.appendChild(head);
    scenes.forEach((sc, si) => {
      const id = sc.slots[ti];
      const slot = document.createElement('button');
      const isSel = gridSel.scene === si && gridSel.tr === ti;
      slot.className = 'slot' + (id ? ' has' : ' empty') + (isSel ? ' gsel' : '');
      slot.dataset.si = si;
      slot.dataset.ti = ti;
      if (id) {
        const c = st.clips[id];
        const playingHere = L[ti].play === id && player.playing && st.mode === 'jam';
        const queuedHere = L[ti].next === id;
        slot.classList.toggle('playing', playingHere);
        slot.classList.toggle('queued', queuedHere);
        slot.classList.toggle('dis', !!c.dis);
        slot.classList.toggle('edit', selClipId === id);
        slot.style.setProperty('--cc', c.color || tr.color);
        slot.innerHTML = `<span class="lz${faOf(c) ? ' fa' : ''}"><span class="tri">▶</span></span><span class="nm">${c.name}</span><span class="prog"></span>`;
        slot.title = `${c.name} — klik ▶: launch (kvantiseret) · klik navnet: vælg · dobbeltklik: redigér · højreklik: menu`;
        slot.onpointerdown = ev => {
          if (ev.button !== 0) return;
          slotDrag = { si, ti, id, x0: ev.clientX, y0: ev.clientY, moved: false, el: slot, target: null, fromLZ: !!(ev.target.closest && ev.target.closest('.lz')) };
          try { slot.setPointerCapture(ev.pointerId); } catch (e2) {}
        };
        slot.onpointermove = ev => {
          if (!slotDrag || slotDrag.el !== slot) return;
          if (!slotDrag.moved && Math.abs(ev.clientX - slotDrag.x0) < 7 && Math.abs(ev.clientY - slotDrag.y0) < 7) return;
          slotDrag.moved = true;
          slot.classList.add('dragging');
          const t2 = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.slot');
          document.querySelectorAll('.slot.dropOk').forEach(x => x.classList.remove('dropOk'));
          if (t2 && t2 !== slot) { t2.classList.add('dropOk'); slotDrag.target = { si: +t2.dataset.si, ti: +t2.dataset.ti }; }
          else slotDrag.target = null;
        };
        const endSlot = ev => {
          if (!slotDrag || slotDrag.el !== slot) return;
          const d = slotDrag;
          slotDrag = null;
          slot.classList.remove('dragging');
          if (d.moved) {
            if (d.target) {
              const { si: tsi, ti: tti } = d.target;
              if (ev && ev.altKey) {
                const nid = newClipId();
                st.clips[nid] = snapshot({ ...st.clips[d.id], tr: tti });
                st.session.scenes[tsi].slots[tti] = nid;
              } else {
                st.session.scenes[d.si].slots[d.ti] = null;
                st.clips[d.id].tr = tti;
                st.session.scenes[tsi].slots[tti] = d.id;
                const Ld = live()[d.ti];
                if (Ld.play === d.id) Ld.play = null;
              }
              gcClips(); persist();
            }
            renderSession();
            return;
          }
          if (d.fromLZ) launchClip(si, ti);
          else selectClip(id, ti, si);
        };
        slot.onpointerup = endSlot;
        slot.onpointercancel = () => { slotDrag = null; slot.classList.remove('dragging'); };
        slot.ondblclick = () => selectClip(id, ti, si);
      } else {
        // tom slot = ■ stop-knap (praecis som Live) · dobbeltklik = ny clip
        const stops = L[ti].next === 'stop';
        slot.innerHTML = `<span class="stopSq${stops ? ' q' : ''}"></span>`;
        slot.title = '■ stopper sporets clip (på næste takt) · dobbeltklik: ny clip · højreklik: menu';
        slot.onclick = () => stopTrack(ti);
        slot.ondblclick = () => createClipInSlot(si, ti);
      }
      slot.oncontextmenu = ev => { ev.preventDefault(); selectTrack(ti); slotMenu(ev, si, ti); };
      col.appendChild(slot);
    });
    // Track Status Field (Live): ■ + gennemløb + pie + looplængde i beats
    const stat = document.createElement('div');
    stat.className = 'statusField';
    stat.dataset.ti = ti;
    stat.title = 'Track Status: ■ stop · antal gennemløb · loop-fremdrift · looplængde i beats';
    stat.innerHTML = '<button class="stStop">■</button><span class="stLoops"></span><span class="stPie"></span><span class="stLen"></span>';
    stat.querySelector('.stStop').onclick = () => stopTrack(ti);
    col.appendChild(stat);
    grid.appendChild(col);
    // ---- kolonnens mixer-del (Live-stil) ----
    const mc = document.createElement('div');
    mc.className = 'mixCol' + (ti === curTrack ? ' sel' : '');
    const stopRow = document.createElement('button');
    stopRow.className = 'mxStop' + (L[ti].next === 'stop' ? ' q' : '');
    stopRow.textContent = '■';
    stopRow.title = 'Stop sporets clip (på næste takt)';
    stopRow.onclick = () => stopTrack(ti);
    mc.appendChild(stopRow);
    const sends = document.createElement('div');
    sends.className = 'mxSends';
    sends.innerHTML = '<i>Sends</i>';
    const ka = knobEl(() => tr.patch.sendD ?? 0, v => { tr.patch.sendD = Math.round(v * 100) / 100; }, 'Send A: delay');
    const kb = knobEl(() => tr.patch.sendV ?? 0, v => { tr.patch.sendV = Math.round(v * 100) / 100; }, 'Send B: reverb');
    const kwrap = document.createElement('div');
    kwrap.className = 'mxKnobs';
    const la = document.createElement('span'); la.className = 'kl'; la.textContent = 'A';
    const lb = document.createElement('span'); lb.className = 'kl'; lb.textContent = 'B';
    kwrap.append(ka, la, kb, lb);
    sends.appendChild(kwrap);
    mc.appendChild(sends);
    const volRow = document.createElement('div');
    volRow.className = 'mxVol';
    const db = document.createElement('span');
    db.className = 'mxDb';
    db.textContent = dbLabel(tr.level);
    const fader = document.createElement('input');
    fader.type = 'range'; fader.min = 0; fader.max = 1; fader.step = 0.01; fader.value = tr.level;
    fader.className = 'mxFader';
    fader.title = 'Volumen: ' + tr.name;
    fader.oninput = () => {
      tr.level = +fader.value;
      db.textContent = dbLabel(tr.level);
      persist(); player.refreshTrackGains();
    };
    const kpan = knobEl(() => ((tr.patch.pan ?? 0) + 1) / 2, v => { tr.patch.pan = Math.round((v * 2 - 1) * 100) / 100; }, 'Pan', 18);
    const frow = document.createElement('div');
    frow.className = 'mxFRow';
    const meter = document.createElement('div');
    meter.className = 'mxMeter';
    meter.innerHTML = '<div class="mxLv"></div>';
    frow.append(fader, meter);
    volRow.append(db, frow, kpan);
    mc.appendChild(volRow);
    const btns = document.createElement('div');
    btns.className = 'mxBtns';
    btns.innerHTML = `<button class="mxAct${tr.mute ? '' : ' on'}" title="Spor til/fra (mute — shift+${ti + 1})">${ti + 1}</button>
      <button class="mxS${tr.solo ? ' on' : ''}" title="Solo">S</button>
      <button class="mxSel${ti === curTrack ? ' on' : ''}" title="Vælg sporet (MIDI + lyd-panel)">●</button>`;
    btns.querySelector('.mxAct').onclick = () => { tr.mute = !tr.mute; persist(); renderSession(); player.refreshTrackGains(); };
    btns.querySelector('.mxS').onclick = () => { tr.solo = !tr.solo; persist(); renderSession(); player.refreshTrackGains(); };
    btns.querySelector('.mxSel').onclick = () => selectTrack(ti);
    mc.appendChild(btns);
    mixer.appendChild(mc);
  });
  // ---- MAIN/scene-kolonnen ----
  const main = document.createElement('div');
  main.className = 'sesCol main';
  const mh = document.createElement('div');
  mh.className = 'sesHead';
  mh.textContent = 'Main';
  main.appendChild(mh);
  scenes.forEach((sc, si) => {
    const b = document.createElement('button');
    const anyQueued = sc.slots.some((id, tr2) => id && L[tr2].next === id);
    const anyPlaying = sc.slots.some((id, tr2) => id && L[tr2].play === id) && player.playing && st.mode === 'jam';
    b.className = 'sceneBtn' + (si === selScene ? ' sel' : '') + (anyQueued ? ' queued' : '') + (anyPlaying ? ' playing' : '');
    b.innerHTML = `<span class="tri">▶</span><span class="nm">${sc.name}</span>${sc.bpm ? `<span class="scBpm">${sc.bpm}</span>` : ''}<span class="scNum">${si + 1}</span>`;
    b.title = `Start scenen "${sc.name}" (tast ${si + 1}) · dobbeltklik: omdøb · højreklik: menu`;
    b.onclick = () => launchScene(si);
    b.ondblclick = () => {
      const nm = prompt('Scene-navn:', sc.name);
      if (nm != null) { sc.name = nm.trim().toUpperCase().slice(0, 10); persist(); renderSession(); }
    };
    b.oncontextmenu = ev => { ev.preventDefault(); sceneMenu(ev, si); };
    main.appendChild(b);
  });
  // Main-sporets Status field: Stop All Clips + Back to Arrangement (orange)
  const mstat = document.createElement('div');
  mstat.className = 'statusField main';
  mstat.innerHTML = '<button class="stStop" title="Stop All Clips — stopper alle spor (kvantiseret)">■</button><button class="b2a" title="Back to Arrangement: skift til Arrangementet og spil sangen videre">▶≡</button>';
  mstat.querySelector('.stStop').onclick = stopAll;
  const b2a = mstat.querySelector('.b2a');
  b2a.classList.toggle('on', st.mode === 'jam' && st.arr.clips.length > 0);
  b2a.onclick = () => {
    if (!st.arr.clips.length) { toast('Arrangementet er tomt — optag med ● SESSION→ARR REC eller + SCENE→ARR'); return; }
    toggleView('arr');
  };
  main.appendChild(mstat);
  grid.appendChild(main);
  const mainMix = document.createElement('div');
  mainMix.className = 'mixCol main';
  const mainLbl = document.createElement('div');
  mainLbl.className = 'mainLbl';
  mainLbl.textContent = 'Main';
  const addB = document.createElement('button');
  addB.className = 'sceneAdd';
  addB.textContent = '+ SCENE';
  addB.onclick = () => { addScene(); renderSession(); };
  mainMix.append(mainLbl, addB);
  mixer.appendChild(mainMix);
  el.appendChild(grid);
  el.appendChild(mixer);
  renderBrowser();
}

// ---------- CLIP VIEW (Live 12: Clip Title Bar + paneler + MIDI Note Editor) ----------
function curClip() { return selClipId ? st.clips[selClipId] : null; }
const PROB_CYCLE = { 1: 0.75, 0.75: 0.5, 0.5: 0.25, 0.25: 1 };
const COND_TAG = { fill: 'F', '!fill': '!F' };
let velDrag = null, suppressClick = false;
let rollFold = false, hlScale = false, laneMode = 'vel';
const rollTops = {};
const ROLL_ROWS = 8;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const notesOf = stp => (stp?.on ? stepNotes(stp) : []);
const FA_OPTS = [['none', 'No Action'], ['stop', 'Stop'], ['again', 'Play Again'], ['prev', 'Previous'], ['next', 'Next'], ['first', 'First'], ['last', 'Last'], ['any', 'Any'], ['other', 'Other']];
function setStepNotesOn(c, s, set, soft) {
  if (!set.length) {
    c.steps[s] = null;
    if (lockSel && lockSel.step === s) lockSel = null;
    return;
  }
  set = [...new Set(set)].sort((a, b) => a - b);
  const base = c.steps[s]?.on ? c.steps[s] : stepOn(soft ? 0.55 : 1);
  base.on = true;
  base.n = set[0];
  if (set.length > 1) base.ns = set.slice(1); else delete base.ns;
  c.steps[s] = base;
}
function rollRows(c) {
  const L = clipLen(c);
  const used = new Set();
  for (let s = 0; s < L; s++) for (const n of notesOf(c.steps[s])) used.add(n);
  if (rollFold && used.size) return [...used].sort((a, b) => b - a);
  const hi = used.size ? Math.max(...used) : 0;
  let top = rollTops[selClipId] ?? Math.min(24, hi + 1);
  top = Math.max(-24 + ROLL_ROWS - 1, Math.min(24, top));
  rollTops[selClipId] = top;
  const rows = [];
  for (let i = 0; i < ROLL_ROWS; i++) rows.push(top - i);
  return rows;
}
function isBlackKey(m) { return NOTE_NAMES[((m % 12) + 12) % 12].includes('#'); }
function inMajor(off) { return MAJOR.includes(((off % 12) + 12) % 12); }
// follow action i normaliseret ny form (gamle {act,after,chance} migreres via faOf)
function faObj(c) {
  const f = faOf(c);
  if (!f) return { on: false, a: 'next', b: 'none', ca: 1, mult: 1 };
  return { on: f.on !== false, a: f.a || 'next', b: f.b || 'none', ca: f.ca ?? 1, mult: f.mult || 1 };
}
function renderClipEditor() {
  const bar = $('clipBar');
  const c = curClip();
  bar.hidden = !c;
  if (!c) return;
  const col = c.color || st.tracks[c.tr].color;
  // Clip Title Bar (i clip-farven, som i Live)
  $('clipTitleBar').style.background = col;
  $('clipActBox').checked = !c.dis;
  if (document.activeElement !== $('cbName')) $('cbName').value = c.name;
  $('clipTitleInfo').textContent = String(c.tr + 1).padStart(2, '0') + ' · ' + st.tracks[c.tr].name;
  // Clip-panel
  $('cbLen').textContent = c.len;
  $('tlenVal').textContent = clipLen(c);
  $('tlenBox').classList.toggle('custom', !!(c.tlen && c.tlen !== c.len));
  $('loopTog').classList.toggle('on', !c.loopOff);
  // Launch-panel
  const fa = faObj(c);
  if (!$('faA').options.length) {
    for (const [v, l] of FA_OPTS) { $('faA').add(new Option(l, v)); $('faB').add(new Option(l, v)); }
  }
  $('faTog').classList.toggle('on', fa.on);
  $('pnlLaunch').classList.toggle('faOff', !fa.on);
  $('faA').value = fa.a; $('faB').value = fa.b;
  $('caSlider').value = Math.round(fa.ca * 100);
  $('caAVal').textContent = Math.round(fa.ca * 100) + '%';
  $('caBVal').textContent = Math.round((1 - fa.ca) * 100) + '%';
  $('faMultVal').textContent = fa.mult;
  $('lmSel').value = c.lm || 'trigger';
  $('clipQSel').value = (c.q === undefined || c.q === null) ? '' : String(c.q);
  $('rollFoldB').classList.toggle('on', rollFold);
  $('hlScaleB').classList.toggle('on', hlScale);
  // MIDI Note Editor
  const holder = $('clipSteps'), piano = $('pianoCol'), stems = $('velStems'), ruler = $('edRuler');
  holder.innerHTML = ''; piano.innerHTML = ''; stems.innerHTML = ''; ruler.innerHTML = '';
  const L = clipLen(c);
  const baseNote = st.tracks[c.tr].patch.note ?? 48;
  const rows = rollRows(c);
  holder.style.gridTemplateColumns = `repeat(${L}, 1fr)`;
  holder.style.gridTemplateRows = `repeat(${rows.length}, 1fr)`;
  piano.style.gridTemplateRows = `repeat(${rows.length}, 1fr)`;
  stems.style.gridTemplateColumns = `repeat(${L}, 1fr)`;
  ruler.style.gridTemplateColumns = `repeat(${L}, 1fr)`;
  // beat-time ruler + loop brace i clip-farven
  const brace = document.createElement('div');
  brace.id = 'loopBrace';
  brace.style.background = c.loopOff ? '#a2a4aa' : col;
  brace.title = c.loopOff ? "Loop er slaaet fra — clip'en spiller een gang (one-shot)" : "Loop Brace — clip'en looper hele laengden";
  brace.innerHTML = '<i class="lb0">▶</i><i class="lb1">◀</i>';
  ruler.appendChild(brace);
  for (let s = 0; s < L; s += 4) {
    const lb = document.createElement('span');
    lb.className = 'rulTick';
    lb.style.gridColumn = String(s + 1);
    const bar2 = Math.floor(s / BAR) + 1, beat = Math.floor((s % BAR) / 4) + 1;
    lb.textContent = beat === 1 ? String(bar2) : bar2 + '.' + beat;
    ruler.appendChild(lb);
  }
  // piano ruler (tegnet klaviatur)
  for (const off of rows) {
    const m = baseNote + off;
    const black = isBlackKey(m);
    const k = document.createElement('div');
    k.className = 'pKey' + (black ? ' bk' : '') + (off === 0 ? ' root' : '') + (hlScale && inMajor(off) ? ' sc' : '');
    k.innerHTML = `<span class="pkLbl">${noteName(m)}</span>`;
    k.title = (off === 0 ? 'Grundtone · ' : '') + noteName(m) + ' — klik: hør tonen';
    k.onclick = () => player.audition(c.tr, { on: true, v: 0.9, n: off, l: null });
    piano.appendChild(k);
  }
  // note-grid: key track-striber efter klaviaturet
  for (const off of rows) {
    const black = isBlackKey(baseNote + off);
    for (let s = 0; s < L; s++) {
      const step = c.steps[s];
      const on = notesOf(step).includes(off);
      const b = document.createElement('button');
      b.className = 'stp rollCell' + (black ? ' bk' : ' wk') + (s % 4 === 0 ? ' q' : '') + (off === 0 ? ' rootRow' : '')
        + (hlScale && inMajor(off) ? ' sc' : '')
        + (on ? ' on' : '') + (on && (step.r ?? 1) > 1 ? ' r' + Math.min(4, step.r) : '')
        + (lockSel && lockSel.step === s ? ' locksel' : '');
      b.dataset.s = s;
      b.style.setProperty('--trkcol', col);
      if (on) {
        b.style.opacity = 0.5 + 0.5 * (step.v ?? 1);
        if (step.l) b.innerHTML += '<span class="lockdot"></span>';
        if ((step.p ?? 1) < 1) b.innerHTML += '<span class="chTri"></span>';
        if (step.c) b.innerHTML += `<span class="condTag">${COND_TAG[step.c] || step.c}</span>`;
      }
      b.onclick = e => {
        if (suppressClick) { suppressClick = false; return; }
        const stp = c.steps[s];
        if (e.altKey && stp?.on) {
          stp.p = PROB_CYCLE[stp.p ?? 1] ?? 1;
          if (stp.p === 1) delete stp.p;
          persist(); renderClipEditor(); return;
        }
        let set = notesOf(stp);
        set = set.includes(off) ? set.filter(x => x !== off) : [...set, off];
        setStepNotesOn(c, s, set, e.shiftKey);
        persist(); renderClipEditor(); renderPanel(); renderSession();
      };
      b.oncontextmenu = e => {
        e.preventDefault();
        if (!c.steps[s]?.on) setStepNotesOn(c, s, [off]);
        lockSel = { step: s };
        persist(); renderClipEditor(); renderPanel();
      };
      holder.appendChild(b);
    }
  }
  // Velocity/Chance-lane som lollipops (Live-model)
  $('laneSel').value = laneMode;
  $('laneScale').innerHTML = laneMode === 'vel' ? '127<br>64<br>1' : '100<br>50<br>0';
  $('laneCtlInfo').textContent = laneMode === 'vel'
    ? 'Velocity: anslagsstyrke pr. step — traek lodret paa en lollipop'
    : 'Chance: sandsynlighed for at steppet spiller (< 100% = trekant paa noden)';
  for (let s = 0; s < L; s++) {
    const step = c.steps[s];
    const on = !!step?.on;
    const v = laneMode === 'vel' ? (step?.v ?? 1) : (step?.p ?? 1);
    const stem = document.createElement('div');
    stem.className = 'velStem' + (s % 4 === 0 ? ' q' : '') + (on ? '' : ' off') + (laneMode === 'chance' ? ' ch' : '');
    stem.dataset.s = s;
    stem.style.setProperty('--trkcol', col);
    stem.innerHTML = `<div class="vstalk" style="height:${Math.round(v * 82)}%"></div><div class="vhead" style="bottom:${Math.round(v * 82)}%"></div>`;
    stem.title = laneMode === 'vel' ? 'Velocity — traek lodret' : 'Chance — traek lodret';
    stem.onpointerdown = e => {
      if (!c.steps[s]?.on) return;
      velDrag = { s, el: stem };
      try { stem.setPointerCapture(e.pointerId); } catch (err) {}
      dragLane(e, stem, c, s);
    };
    stem.onpointermove = e => { if (velDrag?.el === stem) dragLane(e, stem, c, s); };
    const end = () => {
      if (velDrag?.el === stem) { velDrag = null; persist(); renderClipEditor(); if (lockSel) renderPanel(); }
    };
    stem.onpointerup = end;
    stem.onpointercancel = end;
    stems.appendChild(stem);
  }
}
function dragLane(e, stem, c, s) {
  const r = stem.getBoundingClientRect();
  const v = Math.max(0.05, Math.min(1, 1 - (e.clientY - r.top) / r.height));
  const stp = c.steps[s];
  if (!stp) return;
  const val = Math.round(v * 100) / 100;
  if (laneMode === 'vel') {
    stp.v = val;
    document.querySelectorAll(`#clipSteps .rollCell.on[data-s="${s}"]`).forEach(x => { x.style.opacity = 0.5 + 0.5 * val; });
  } else {
    if (val >= 0.98) delete stp.p; else stp.p = val;
  }
  stem.querySelector('.vstalk').style.height = Math.round(val * 82) + '%';
  stem.querySelector('.vhead').style.bottom = Math.round(val * 82) + '%';
}
// ---- Clip View-kontroller ----
function writeFa(mut) {
  const c = curClip();
  if (!c) return;
  const f = faObj(c);
  mut(f);
  if (!f.on && f.a === 'next' && f.b === 'none' && f.ca === 1 && f.mult === 1) delete c.fa;
  else c.fa = f;
  persist(); renderClipEditor(); renderSession();
}
$('clipActBox').onchange = () => {
  const c = curClip();
  if (!c) return;
  if ($('clipActBox').checked) delete c.dis; else c.dis = true;
  persist(); renderSession(); renderClipEditor();
};
$('loopTog').onclick = () => {
  const c = curClip();
  if (!c) return;
  if (c.loopOff) delete c.loopOff; else c.loopOff = true;
  persist(); renderClipEditor();
};
$('faTog').onclick = () => writeFa(f => { f.on = !f.on; });
$('faA').onchange = () => writeFa(f => { f.a = $('faA').value; f.on = true; });
$('faB').onchange = () => writeFa(f => { f.b = $('faB').value; f.on = true; });
$('caSlider').oninput = () => writeFa(f => { f.ca = (+$('caSlider').value) / 100; });
$('faMultDec').onclick = () => writeFa(f => { f.mult = Math.max(1, (f.mult || 1) - 1); });
$('faMultInc').onclick = () => writeFa(f => { f.mult = Math.min(16, (f.mult || 1) + 1); });
$('lmSel').onchange = () => {
  const c = curClip();
  if (!c) return;
  if ($('lmSel').value === 'trigger') delete c.lm; else c.lm = $('lmSel').value;
  persist();
};
$('clipQSel').onchange = () => {
  const c = curClip();
  if (!c) return;
  const v = $('clipQSel').value;
  if (v === '') delete c.q; else c.q = +v;
  persist();
};
$('rollFoldB').onclick = () => { rollFold = !rollFold; renderClipEditor(); };
$('hlScaleB').onclick = () => { hlScale = !hlScale; renderClipEditor(); };
$('rollUp').onclick = () => rollNudge(1);
$('rollDown').onclick = () => rollNudge(-1);
function rollNudge(d) {
  if (!curClip()) return;
  rollFold = false;
  rollTops[selClipId] = (rollTops[selClipId] ?? 1) + d;
  renderClipEditor();
}
$('cbX2').onclick = () => {
  const c = curClip();
  if (!c) return;
  if (c.len >= 32) { toast("Clip'en er allerede 2 takter (max)", true); return; }
  const half = c.len;
  for (let i = 0; i < half && half + i < MAX_STEPS; i++) c.steps[half + i] = c.steps[i] ? JSON.parse(JSON.stringify(c.steps[i])) : null;
  c.len = Math.min(32, half * 2);
  if (c.tlen && c.tlen <= half) c.tlen = null;
  persist(); renderClipEditor(); renderSession();
  toast('×2: indholdet kopieret — lav nu en variation i den nye halvdel');
};
$('cbHalf').onclick = () => {
  const c = curClip();
  if (!c) return;
  if (c.len <= 4) { toast('Minimum 4 steps', true); return; }
  c.len = Math.max(4, Math.floor(c.len / 2));
  if (c.tlen && c.tlen > c.len) c.tlen = null;
  persist(); renderClipEditor(); renderSession();
};
$('cbRev').onclick = () => {
  const c = curClip();
  if (!c) return;
  const L2 = clipLen(c);
  const seg = c.steps.slice(0, L2).reverse();
  for (let i = 0; i < L2; i++) c.steps[i] = seg[i];
  persist(); renderClipEditor(); renderSession();
};
$('cbDup').onclick = () => {
  const c = curClip();
  if (!c) return;
  const si = st.session.scenes.findIndex(sc => sc.slots[c.tr] === selClipId);
  if (si >= 0) dupClipBelow(si, c.tr);
};
$('laneSel').onchange = () => { laneMode = $('laneSel').value; renderClipEditor(); };
$('laneRnd').onclick = () => {
  const c = curClip();
  if (!c) return;
  const amt = (+$('laneRndAmt').value || 25) / 100;
  const L2 = clipLen(c);
  for (let i = 0; i < L2; i++) {
    const stp = c.steps[i];
    if (!stp?.on) continue;
    if (laneMode === 'vel') stp.v = Math.max(0.05, Math.min(1, (stp.v ?? 1) + (Math.random() * 2 - 1) * amt));
    else {
      const p = Math.max(0.05, Math.min(1, (stp.p ?? 1) + (Math.random() * 2 - 1) * amt));
      if (p >= 0.98) delete stp.p; else stp.p = Math.round(p * 100) / 100;
    }
  }
  persist(); renderClipEditor();
};
$('cbName').addEventListener('input', () => {
  const c = curClip();
  if (!c) return;
  c.name = $('cbName').value.slice(0, 14);
  persist(); renderSession();
});
$('tlenDec').onclick = () => bumpTlen(-1);
$('tlenInc').onclick = () => bumpTlen(1);
function bumpTlen(d) {
  const c = curClip();
  if (!c) return;
  const next = Math.max(1, Math.min(MAX_STEPS, clipLen(c) + d));
  c.tlen = next === c.len ? null : next;
  persist(); renderClipEditor();
}
$('cbTools').onclick = ev => {
  const c = curClip();
  if (!c) return;
  const L = clipLen(c);
  const apply = fn => { fn(); persist(); renderClipEditor(); renderSession(); };
  menuAt(ev, [
    ['EUCLID…', () => openEuclid(ev, c)],
    ['ROTÉR ◀', () => apply(() => {
      const seg = c.steps.slice(0, L);
      const ns = [...seg.slice(1), seg[0]];
      for (let i = 0; i < L; i++) c.steps[i] = ns[i];
    })],
    ['ROTÉR ▶', () => apply(() => {
      const seg = c.steps.slice(0, L);
      const ns = [seg[L - 1], ...seg.slice(0, L - 1)];
      for (let i = 0; i < L; i++) c.steps[i] = ns[i];
    })],
    ['SPEJLVEND', () => apply(() => {
      const seg = c.steps.slice(0, L).reverse();
      for (let i = 0; i < L; i++) c.steps[i] = seg[i];
    })],
    ['TILFÆLDIGT', () => apply(() => {
      for (let i = 0; i < L; i++) c.steps[i] = Math.random() < 0.4 ? stepOn(0.4 + Math.random() * 0.6) : null;
    })],
    ['RYD LOCKS (automation)', () => apply(() => { for (const s2 of c.steps) if (s2) s2.l = null; })],
    ['RYD', () => apply(() => { for (let i = 0; i < MAX_STEPS; i++) c.steps[i] = null; })],
  ]);
};
function openEuclid(e, c) {
  closeMenus();
  const L = clipLen(c);
  const before = snapshot(c.steps);
  const pop = document.createElement('div');
  pop.id = 'eucPop';
  pop.innerHTML = `<div class="eucTitle">EUCLID · ${c.name}</div>
    <label>SLAG <input id="eucK" type="range" min="1" max="${L}" step="1" value="4"> <b id="eucKV">4</b></label>
    <label>DREJ <input id="eucR" type="range" min="0" max="${L - 1}" step="1" value="0"> <b id="eucRV">0</b></label>
    <div class="eucBtns"><button id="eucOk">OK</button><button id="eucCancel">ANNULLER</button></div>`;
  pop.style.left = Math.min(e.clientX, innerWidth - 240) + 'px';
  pop.style.top = Math.max(60, Math.min(e.clientY - 160, innerHeight - 170)) + 'px';
  document.body.appendChild(pop);
  pop.onpointerdown = ev => ev.stopPropagation();
  const apply = () => {
    const k = +pop.querySelector('#eucK').value, r = +pop.querySelector('#eucR').value;
    pop.querySelector('#eucKV').textContent = k;
    pop.querySelector('#eucRV').textContent = r;
    for (let i = 0; i < L; i++) {
      const j = ((i - r) % L + L) % L;
      c.steps[i] = (j * k) % L < k ? stepOn(0.9) : null;
    }
    renderClipEditor(); renderSession();
  };
  pop.querySelector('#eucK').oninput = apply;
  pop.querySelector('#eucR').oninput = apply;
  pop.querySelector('#eucOk').onclick = () => { persist(); pop.remove(); };
  pop.querySelector('#eucCancel').onclick = () => {
    c.steps = before;
    pop.remove(); renderClipEditor(); renderSession();
  };
  apply();
}

// ---------- lyd-panel ----------
function curPatch() { return st.tracks[curTrack].patch; }
function lockStepObj() {
  const c = curClip();
  if (!lockSel || !c) return null;
  return c.steps[lockSel.step];
}
function pGet(k) {
  const s = lockStepObj();
  if (s && s.l && k in s.l) return s.l[k];
  return curPatch()[k];
}
function pSet(k, v) {
  const s = lockStepObj();
  if (s) {
    s.l = s.l || {};
    s.l[k] = v;
  } else {
    curPatch()[k] = v;
    recordParamLock(k, v); // ✳ AUTO: skriv ogsaa som lock paa den spillende clips aktuelle step
  }
  persist();
}
function pIsLocked(k) {
  const s = lockStepObj();
  return !!(s && s.l && k in s.l);
}
function optsRow(cls, opts, labels, getV, setV) {
  const row = document.createElement('div');
  row.className = cls;
  opts.forEach((w, i) => {
    const b = document.createElement('button');
    b.textContent = labels ? labels[i] : String(w).toUpperCase();
    b.className = getV() === w ? 'on' : '';
    b.onclick = () => { setV(w); renderPanel(); };
    row.appendChild(b);
  });
  return row;
}
function sliderRow(label, min, max, step, val, fmt, locked, onInput, onChange) {
  const row = document.createElement('div');
  row.className = 'prow' + (locked ? ' locked' : '');
  row.innerHTML = `<span class="plabel">${label}</span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${val}">
    <span class="pval">${fmt(val)}</span>`;
  const inp = row.querySelector('input');
  inp.oninput = () => {
    const v = +inp.value;
    onInput(v);
    row.querySelector('.pval').textContent = fmt(v);
  };
  if (onChange) inp.onchange = onChange;
  return row;
}
function renderPanel() {
  const tr = st.tracks[curTrack];
  $('spTrack').textContent = `${String(curTrack + 1).padStart(2, '0')} · ${tr.name}`;
  $('spTrack').style.color = tr.color;
  $('lockBadge').hidden = !lockSel;
  if (lockSel) $('lockStep').textContent = lockSel.step + 1;
  const el = $('params');
  el.innerHTML = '';
  const groups = {};
  const grp = name => {
    if (!groups[name]) {
      const gEl = document.createElement('div');
      gEl.className = 'pgroup' + (name === 'STEP' ? ' step' : '');
      gEl.innerHTML = `<div class="pgTitle">${name}</div>`;
      groups[name] = gEl;
      el.appendChild(gEl);
    }
    return groups[name];
  };
  const ls = lockStepObj();
  if (ls) {
    const g = grp('STEP');
    g.appendChild(sliderRow('VEL', 0.05, 1, 0.01, ls.v ?? 1, pct, false,
      v => { ls.v = v; persist(); }, () => renderClipEditor()));
    g.appendChild(sliderRow('CHANCE', 0.05, 1, 0.05, ls.p ?? 1, pct, false,
      v => { if (v >= 1) delete ls.p; else ls.p = v; persist(); }, () => renderClipEditor()));
    g.appendChild(optsRow('ldstRow', [1, 2, 3, 4], ['RAT —', '2', '3', '4'],
      () => ls.r ?? 1, v => { if (v <= 1) delete ls.r; else ls.r = v; persist(); renderClipEditor(); }));
    g.appendChild(optsRow('ldstRow', [null, '1:2', '2:2', '1:4', '4:4', 'fill', '!fill'],
      ['—', '1:2', '2:2', '1:4', '4:4', 'FILL', '!FILL'],
      () => ls.c ?? null, v => { if (!v) delete ls.c; else ls.c = v; persist(); renderClipEditor(); }));
  }
  if (curPatch().smp) {
    const g = grp('OSC');
    const row = document.createElement('div');
    row.className = 'prow smpRow';
    const nm = decodeURIComponent(curPatch().smp.split('/').pop()).replace(/\.(flac|wav)$/, '');
    row.innerHTML = `<span class="plabel">SAMPLE</span><b class="smpName">♪ ${nm}</b><button class="smpX" title="Fjern samplen — tilbage til synth-oscillatorerne">✕</button>`;
    row.querySelector('.smpX').onclick = () => { delete curPatch().smp; persist(); renderPanel(); };
    g.appendChild(row);
  }
  for (const d of PDEF) {
    const g = grp(d.g);
    if (d.type === 'opts') {
      g.appendChild(optsRow(d.opts.length > 4 ? 'ldstRow' : 'waveRow', d.opts, d.labels,
        () => pGet(d.k), v => { pSet(d.k, v); auditionSoft(); }));
      continue;
    }
    const row = sliderRow(d.l, d.min, d.max, d.step, pGet(d.k), d.fmt, pIsLocked(d.k),
      v => pSet(d.k, v),
      () => { auditionSoft(); renderClipEditor(); });
    const inp = row.querySelector('input');
    const baseOnInput = inp.oninput;
    inp.oninput = () => { baseOnInput(); row.classList.toggle('locked', pIsLocked(d.k)); };
    g.appendChild(row);
  }
}
let audT = 0;
function auditionSoft() {
  const now = Date.now();
  if (now - audT < 150) return;
  audT = now;
  player.audition(curTrack, lockSel ? lockStepObj() : null);
}
$('audition').onclick = () => player.audition(curTrack, lockSel ? lockStepObj() : null);
$('lockClear').onclick = () => {
  const s = lockStepObj();
  if (s) { s.l = null; delete s.p; delete s.r; delete s.c; }
  persist(); renderClipEditor(); renderPanel();
};
$('lockExit').onclick = () => { lockSel = null; renderClipEditor(); renderPanel(); };

// ---------- ARRANGEMENT (SANG) ----------
let curView = 'jam';
let arrZoom = 1;
let selArrClip = null;
let lastViewSteps = 16 * 16;
function viewSteps() { return arrLenSteps(st) + 4 * BAR; }
function fmtDur(sec) { return Math.floor(sec / 60) + ':' + String(Math.round(sec % 60)).padStart(2, '0'); }
function toggleView(v) {
  curView = v || (curView === 'jam' ? 'arr' : 'jam');
  $('jam').hidden = curView !== 'jam';
  $('arr').hidden = curView !== 'arr';
  $('vSession').classList.toggle('on', curView === 'jam');
  $('vArr').classList.toggle('on', curView !== 'jam');
  $('viewLabel').textContent = curView === 'jam' ? 'SESSION' : 'ARRANGEMENT';
  $('barHint').textContent = curView === 'jam'
    ? 'Klik en clip = start (på næste takt) · klik tom slot = ny clip · ▶ til højre = start hel scene · taster 1-8 = scener'
    : 'Træk clips = flyt (alt = kopiér) · kanter = længde · dobbeltklik tom bane = læg clip ind · linjal: klik = spil herfra, træk = loop';
  const wantMode = (curView === 'arr' && st.arr.clips.length) ? 'song' : 'jam';
  if (st.mode !== wantMode && !player.playing) { st.mode = wantMode; persist(); }
  if (curView === 'arr') renderArr(); else renderSession();
  renderSongUI();
}
$('vSession').onclick = () => toggleView('jam');
$('vArr').onclick = () => toggleView('arr');
function waveformURI(buf, color) {
  const d = buf.getChannelData(0);
  const cols = 160;
  const stride = Math.max(1, Math.floor(d.length / cols));
  let rects = '';
  for (let c2 = 0; c2 < cols; c2++) {
    let m = 0;
    const base = c2 * stride;
    for (let i = base; i < Math.min(base + stride, d.length); i += 8) m = Math.max(m, Math.abs(d[i]));
    const h = Math.max(0.6, m * 11);
    rects += `<rect x="${c2 + 0.08}" y="${(12 - h) / 2}" width="0.84" height="${h}" rx="0.2"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols} 12" preserveAspectRatio="none"><g fill="${color}">${rects}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
function clipMarksURI(c, color) {
  const L = clipLen(c);
  let rects = '';
  for (let s = 0; s < L; s++) {
    const stp = c.steps[s];
    if (!stp?.on) continue;
    const h = 3.5 + 5.5 * (stp.v ?? 1);
    rects += `<rect x="${s + 0.14}" y="${(12 - h) / 2}" width="0.72" height="${h}" rx="0.2"/>`;
  }
  if (!rects) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} 12" preserveAspectRatio="none"><g fill="${color}">${rects}</g></svg>`;
  return { uri: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, L };
}
function seekBar(bar) {
  st._startBar = bar;
  if (st.mode !== 'song') { st.mode = 'song'; persist(); }
  if (player.playing) {
    player.jumpTo(bar * BAR);
    toast('Hopper til takt ' + (bar + 1) + ' ved næste takt-grænse');
  }
  renderSongUI();
}
function resolveOverlap(clips, c) {
  const res = [];
  for (const o of clips) {
    if (o.id === c.id || o.tr !== c.tr || o.at + o.len <= c.at || o.at >= c.at + c.len) { res.push(o); continue; }
    const leftLen = c.at - o.at;
    const rightLen = (o.at + o.len) - (c.at + c.len);
    if (leftLen > 0) res.push({ ...o, len: leftLen });
    if (rightLen > 0) res.push({ ...o, id: newClipId(), at: c.at + c.len, len: rightLen });
  }
  return res;
}
function placeClip(c) {
  st.arr.clips = resolveOverlap(st.arr.clips.filter(x => x.id !== c.id), c);
  st.arr.clips.push(c);
}
function addArrClip(tr, atBar, lenBars, clipId, extra = {}) {
  const c = { id: newClipId(), tr, at: atBar * BAR, len: lenBars * BAR, clip: clipId, ...extra };
  placeClip(c);
  return c;
}
let clipClipboard = null;
function selArrObj() { return st.arr.clips.find(c => c.id === selArrClip) || null; }
function copyArrClip(cut = false) {
  const c = selArrObj();
  if (!c) { toast('Ingen clip valgt på tidslinjen', true); return; }
  clipClipboard = snapshot(c);
  if (cut) {
    st.arr.clips = st.arr.clips.filter(x => x.id !== c.id);
    selArrClip = null;
    persist(); renderSongUI();
  }
  toast((cut ? 'Klippet' : 'Kopieret') + ' — cmd+V sætter ind ved ▸');
}
function pasteArrClip(barOverride = null) {
  if (!clipClipboard) { toast('Udklipsholderen er tom', true); return; }
  const pos = player.position();
  const bar = barOverride != null ? barOverride
    : (pos && pos.songStep != null ? Math.floor(pos.songStep / BAR) : (st._startBar ?? 0));
  const c = { ...snapshot(clipClipboard), id: newClipId(), at: bar * BAR };
  placeClip(c);
  selArrClip = c.id;
  persist(); renderSongUI();
}
$('songAdd').onclick = () => {
  const sc = st.session.scenes[selScene];
  const startBar = st.arr.clips.length ? Math.ceil(arrLenSteps(st) / BAR) : 0;
  let added = 0;
  sc.slots.forEach((id, tr) => {
    if (!id) return;
    addArrClip(tr, startBar, 4, id);
    added++;
  });
  if (!added) { toast('Scenen "' + sc.name + '" er tom', true); return; }
  st.arr.markers.push({ at: startBar * BAR, name: sc.name });
  persist(); renderSongUI();
  toast('Scene "' + sc.name + '" lagt i sangen (' + added + ' clips, 4 takter)');
  if (curView !== 'arr') toggleView('arr');
};
$('songLoopBtn').onclick = () => { st.songLoop = !st.songLoop; persist(); renderSongUI(); };
function renderSongUI() {
  $('songChain').innerHTML = st.arr.clips.length
    ? `<span class="arrSum">SANG: ${Math.ceil(arrLenSteps(st) / BAR)} takter · ${st.arr.clips.length} clips · ${fmtDur(songDurationSec(st))}</span>`
    : '';
  $('songLoopBtn').className = st.songLoop ? 'on' : '';
  if (curView === 'arr') renderArr();
}
function openClipPop(ev, clip) {
  closeMenus();
  const tr = st.tracks[clip.tr];
  const pop = document.createElement('div');
  pop.id = 'clipPop';
  const isAudio = !!clip.audio;
  const mine = trackClips(clip.tr);
  const srcBtns = mine.map(([cid, c]) =>
    `<button class="srcBtn" data-c="${cid}">${c.name}</button>`).join('');
  pop.innerHTML = `<div class="eucTitle" style="color:${tr.color}">${tr.name} · TAKT ${clip.at / BAR + 1}${isAudio ? ' · 🎙 OPTAGELSE' : ''}</div>
    ${isAudio ? '' : `<div class="entRow"><span class="plabel">KILDE</span><div class="srcRow">${srcBtns}</div></div>`}
    <label>LÆNGDE <button id="clD">−</button> <b id="clV"></b> <button id="clI">+</button> <span style="color:var(--dim)">takter</span></label>
    <label>TONE <input id="cpN" type="range" min="-24" max="24" step="1"> <b id="cpNV"></b></label>
    <label>NIVEAU <input id="cpL" type="range" min="0.05" max="1" step="0.01"> <b id="cpLV"></b></label>
    <label>CUTOFF <input id="cpC" type="range" min="0" max="1" step="0.01"> <b id="cpCV"></b> <button id="cpCX">✕</button></label>
    ${isAudio ? '<label>OFFSET <input id="cpO" type="range" min="-250" max="250" step="5"> <b id="cpOV"></b></label>' : ''}
    <div class="eucBtns"><button id="cpSplit">✂ SPLIT</button><button id="cpDup">⧉</button><button id="cpDel">✕ SLET</button><button id="cpClose">LUK</button></div>`;
  pop.style.left = Math.min(ev.clientX - 30, innerWidth - 290) + 'px';
  pop.style.top = Math.min(ev.clientY + 12, innerHeight - 260) + 'px';
  document.body.appendChild(pop);
  pop.onpointerdown = evt => evt.stopPropagation();
  const q = s => pop.querySelector(s);
  const sync = () => {
    pop.querySelectorAll('.srcBtn').forEach(b2 => b2.classList.toggle('on', b2.dataset.c === clip.clip));
    q('#clV').textContent = clip.len / BAR;
    q('#cpN').value = clip.n ?? 0;
    q('#cpNV').textContent = (clip.n ?? 0) > 0 ? '+' + clip.n : (clip.n ?? 0);
    q('#cpL').value = clip.lvl ?? 1;
    q('#cpLV').textContent = Math.round((clip.lvl ?? 1) * 100) + '%';
    const hasCut = clip.cut != null;
    q('#cpC').value = hasCut ? clip.cut : 0.8;
    q('#cpC').classList.toggle('unset', !hasCut);
    q('#cpCV').textContent = hasCut ? Math.round(clip.cut * 100) + '%' : '—';
    if (isAudio) {
      q('#cpO').value = clip.off ?? 0;
      q('#cpOV').textContent = (clip.off ?? 0) + 'ms';
    }
    persist(); renderSongUI();
  };
  pop.querySelectorAll('.srcBtn').forEach(b2 => { b2.onclick = () => { clip.clip = b2.dataset.c; sync(); }; });
  if (isAudio) {
    q('#cpO').oninput = () => {
      const v = +q('#cpO').value;
      if (v) clip.off = v; else delete clip.off;
      sync();
    };
  }
  q('#clD').onclick = () => { clip.len = Math.max(BAR, clip.len - BAR); placeClip(clip); sync(); };
  q('#clI').onclick = () => { clip.len += BAR; placeClip(clip); sync(); };
  q('#cpN').oninput = () => { const v = +q('#cpN').value; if (v) clip.n = v; else delete clip.n; sync(); };
  q('#cpL').oninput = () => { const v = +q('#cpL').value; if (v < 0.995) clip.lvl = v; else delete clip.lvl; sync(); };
  q('#cpC').oninput = () => { clip.cut = +q('#cpC').value; sync(); };
  q('#cpCX').onclick = () => { delete clip.cut; sync(); };
  q('#cpSplit').onclick = () => {
    if (clip.len < 2 * BAR) { toast('Clip er kun 1 takt', true); return; }
    const half = Math.floor(clip.len / BAR / 2) * BAR;
    const right = { ...snapshot(clip), id: newClipId(), at: clip.at + half, len: clip.len - half };
    if (isAudio) right.skip = (clip.skip || 0) + half;
    clip.len = half;
    st.arr.clips.push(right);
    persist(); renderSongUI(); pop.remove();
  };
  q('#cpDup').onclick = () => {
    const dup = { ...snapshot(clip), id: newClipId(), at: clip.at + clip.len };
    placeClip(dup);
    persist(); renderSongUI(); pop.remove();
  };
  q('#cpDel').onclick = () => {
    st.arr.clips = st.arr.clips.filter(x => x.id !== clip.id);
    selArrClip = null;
    persist(); renderSongUI(); pop.remove();
  };
  q('#cpClose').onclick = () => pop.remove();
  sync();
}
function markerMenu(ev, bar) {
  const at = bar * BAR;
  const items = [
    ['⚑ NY MARKØR…', () => {
      const name = prompt('Markør-navn (fx INTRO, DROP):', '');
      if (name && name.trim()) { st.arr.markers.push({ at, name: name.trim().toUpperCase().slice(0, 14) }); persist(); renderSongUI(); }
    }],
    ['♩ TEMPO-SKIFT…', () => {
      const b = +prompt('BPM fra takt ' + (bar + 1) + ':', st.bpm);
      if (b >= 60 && b <= 200) { st.arr.tempo.push({ at, bpm: b }); st.arr.tempo.sort((a, c) => a.at - c.at); persist(); renderSongUI(); }
    }],
    ['↗ RISER (4 TAKTER)', () => { st.arr.fx.push({ at, type: 'riser', len: 4 * BAR }); persist(); renderSongUI(); }],
    ['✸ BOOM', () => { st.arr.fx.push({ at, type: 'boom' }); persist(); renderSongUI(); }],
  ];
  const clean = arrArr => arrArr.filter(x => x.at !== at);
  if (st.arr.markers.some(x => x.at === at) || st.arr.tempo.some(x => x.at === at) || st.arr.fx.some(x => x.at === at)) {
    items.push(['✕ SLET MARKØRER HER', () => {
      st.arr.markers = clean(st.arr.markers);
      st.arr.tempo = clean(st.arr.tempo);
      st.arr.fx = clean(st.arr.fx);
      persist(); renderSongUI();
    }]);
  }
  menuAt(ev, items);
}
function renderArr() {
  const el = $('arr');
  el.innerHTML = '';
  const total = viewSteps();
  lastViewSteps = total;
  const totalBars = total / BAR;
  const xPct = s => (s / total * 100);
  const tb = document.createElement('div');
  tb.id = 'arrTb';
  const hasLoop = st.arr.loopA != null && st.arr.loopB != null;
  const playNote = (player.playing && st.mode === 'jam') ? '⚠ JAM spiller lige nu — space i dette view spiller sangen · ' : '';
  tb.innerHTML = `<span id="arrInfo">${playNote}${st.arr.clips.length ? Math.ceil(arrLenSteps(st) / BAR) + ' takter · ' + st.arr.clips.length + ' clips · ' + fmtDur(songDurationSec(st)) : 'Tom tidslinje — dobbeltklik på en bane, eller brug + SCENE→SANG / ● OPTAG JAM→SANG'}</span>`
    + (hasLoop ? `<span id="arrLoopInfo">⟳ LOOP TAKT ${st.arr.loopA + 1}–${st.arr.loopB}</span><button id="arrLoopClr">RYD</button>` : '')
    + `<span class="sp"></span><button id="arrZoomOut" title="Zoom ud">−</button><b id="arrZoomV">${Math.round(arrZoom * 100)}%</b><button id="arrZoomIn" title="Zoom ind">+</button>`;
  el.appendChild(tb);
  tb.querySelector('#arrZoomIn').onclick = () => { arrZoom = Math.min(8, arrZoom * 1.4); renderArr(); };
  tb.querySelector('#arrZoomOut').onclick = () => { arrZoom = Math.max(1, arrZoom / 1.4); renderArr(); };
  const lc = tb.querySelector('#arrLoopClr');
  if (lc) lc.onclick = () => { st.arr.loopA = null; st.arr.loopB = null; persist(); renderSongUI(); };
  const mini = document.createElement('div');
  mini.id = 'arrMini';
  for (const c of st.arr.clips) {
    const seg = document.createElement('div');
    seg.className = 'miniClip';
    seg.style.left = xPct(c.at) + '%';
    seg.style.width = xPct(c.len) + '%';
    seg.style.top = (c.tr / 8 * 100) + '%';
    seg.style.background = (c.clip && st.clips[c.clip]?.color) || st.tracks[c.tr].color;
    mini.appendChild(seg);
  }
  const miniPh = document.createElement('div');
  miniPh.id = 'arrMiniPh';
  miniPh.hidden = true;
  mini.appendChild(miniPh);
  mini.onclick = ev => {
    const r = mini.getBoundingClientRect();
    if (!r.width) return;
    seekBar(Math.floor((ev.clientX - r.left) / r.width * totalBars));
  };
  el.appendChild(mini);
  const scroller = document.createElement('div');
  scroller.id = 'arrScroll';
  const wrap = document.createElement('div');
  wrap.id = 'arrWrap';
  wrap.style.width = (arrZoom * 100) + '%';
  const mkRow = document.createElement('div');
  mkRow.className = 'arrRow arrMks';
  mkRow.innerHTML = '<div class="arrLabel">MARKØR</div>';
  const mkLane = document.createElement('div');
  mkLane.className = 'arrLanes mkLane';
  for (const m of st.arr.markers) {
    const f = document.createElement('button');
    f.className = 'mkFlag';
    f.style.left = xPct(m.at) + '%';
    f.textContent = '⚑ ' + m.name;
    f.onclick = () => seekBar(m.at / BAR);
    f.oncontextmenu = ev => { ev.preventDefault(); markerMenu(ev, m.at / BAR); };
    mkLane.appendChild(f);
  }
  for (const t2 of st.arr.tempo) {
    const f = document.createElement('button');
    f.className = 'mkFlag tempo';
    f.style.left = xPct(t2.at) + '%';
    f.textContent = '♩' + t2.bpm;
    f.oncontextmenu = ev => { ev.preventDefault(); markerMenu(ev, t2.at / BAR); };
    mkLane.appendChild(f);
  }
  for (const f2 of st.arr.fx) {
    const f = document.createElement('button');
    f.className = 'mkFlag fx' + (f2.type === 'riser' ? ' riser' : '');
    f.style.left = xPct(f2.at) + '%';
    if (f2.type === 'riser') f.style.width = xPct(f2.len || 4 * BAR) + '%';
    f.textContent = f2.type === 'riser' ? '↗ RISER' : '✸';
    f.oncontextmenu = ev => { ev.preventDefault(); markerMenu(ev, f2.at / BAR); };
    mkLane.appendChild(f);
  }
  mkLane.ondblclick = ev => {
    const r = mkLane.getBoundingClientRect();
    if (!r.width) return;
    markerMenu(ev, Math.floor((ev.clientX - r.left) / r.width * totalBars));
  };
  mkRow.appendChild(mkLane);
  wrap.appendChild(mkRow);
  const ruler = document.createElement('div');
  ruler.className = 'arrRow arrRuler';
  ruler.innerHTML = '<div class="arrLabel">TAKT</div>';
  const rulerIn = document.createElement('div');
  rulerIn.className = 'arrLanes';
  const lblEvery = totalBars > 48 ? 4 : (totalBars > 24 ? 2 : 1);
  for (let bar = 0; bar < totalBars; bar++) {
    const seg = document.createElement('div');
    const inLoop = hasLoop && bar >= st.arr.loopA && bar < st.arr.loopB;
    seg.className = 'rulSeg' + (inLoop ? ' inLoop' : '');
    seg.style.width = (100 / totalBars) + '%';
    seg.dataset.bar = bar;
    seg.innerHTML = (bar % lblEvery === 0 ? `<span>${bar + 1}</span>` : '')
      + (st._startBar === bar ? '<b class="startFlag">▸</b>' : '');
    rulerIn.appendChild(seg);
  }
  let rulDrag = null;
  rulerIn.onpointerdown = ev => {
    const seg = ev.target.closest('.rulSeg');
    if (!seg) return;
    rulDrag = { a: +seg.dataset.bar, b: +seg.dataset.bar, moved: false };
    try { rulerIn.setPointerCapture(ev.pointerId); } catch (e2) {}
  };
  rulerIn.onpointermove = ev => {
    if (!rulDrag) return;
    const seg = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.rulSeg');
    if (seg && +seg.dataset.bar !== rulDrag.b) {
      rulDrag.b = +seg.dataset.bar;
      rulDrag.moved = true;
      const lo = Math.min(rulDrag.a, rulDrag.b), hi = Math.max(rulDrag.a, rulDrag.b);
      rulerIn.querySelectorAll('.rulSeg').forEach((s2, j) => s2.classList.toggle('selRange', j >= lo && j <= hi));
    }
  };
  rulerIn.onpointerup = () => {
    if (!rulDrag) return;
    const { a, b, moved } = rulDrag;
    rulDrag = null;
    if (moved && a !== b) {
      st.arr.loopA = Math.min(a, b);
      st.arr.loopB = Math.max(a, b) + 1;
      persist(); renderSongUI();
      toast('Loop: takt ' + (st.arr.loopA + 1) + '–' + st.arr.loopB);
    } else {
      seekBar(a);
    }
  };
  rulerIn.ondblclick = () => { st.arr.loopA = null; st.arr.loopB = null; persist(); renderSongUI(); };
  ruler.appendChild(rulerIn);
  wrap.appendChild(ruler);
  st.tracks.forEach((tr, ti) => {
    const row = document.createElement('div');
    row.className = 'arrRow';
    const lab = document.createElement('div');
    lab.className = 'arrLabel';
    lab.innerHTML = `<span class="trkDot" style="background:${tr.color}"></span><span class="ln">${tr.name}</span>
      <input class="arrLvl" type="range" min="0" max="1" step="0.01" value="${tr.level}" title="Niveau: ${tr.name}">`;
    lab.querySelector('.arrLvl').oninput = ev => { tr.level = +ev.target.value; persist(); player.refreshTrackGains(); };
    row.appendChild(lab);
    const lane = document.createElement('div');
    lane.className = 'arrLane';
    lane.style.backgroundSize = (100 / totalBars) + '% 100%';
    const laneMenu = ev => {
      const r = lane.getBoundingClientRect();
      if (!r.width) return;
      const bar = Math.floor((ev.clientX - r.left) / r.width * totalBars);
      const items = [];
      for (const [cid, c] of trackClips(ti).slice(0, 8)) {
        items.push([`▣ LÆG "${c.name}" (4 takter)`, () => {
          const nc = addArrClip(ti, bar, 4, cid);
          selArrClip = nc.id;
          persist(); renderSongUI();
        }]);
      }
      if (!items.length) { toast(tr.name + ' har ingen clips endnu — lav en i JAM-viewet (Tab)', true); return; }
      if (clipClipboard && clipClipboard.tr === ti) items.push(['📋 SÆT IND HER', () => pasteArrClip(bar)]);
      menuAt(ev, items);
    };
    lane.ondblclick = ev => { if (ev.target === lane) laneMenu(ev); };
    lane.oncontextmenu = ev => { if (ev.target === lane) { ev.preventDefault(); laneMenu(ev); } };
    for (const c of st.arr.clips.filter(x => x.tr === ti)) {
      const elC = document.createElement('button');
      elC.className = 'arrClip' + (selArrClip === c.id ? ' sel' : '') + (c.audio ? ' audio' : '');
      elC.style.left = xPct(c.at) + '%';
      elC.style.width = xPct(c.len) + '%';
      const badges = [];
      if (c.audio) {
        const buf = recBuffers.get(c.audio);
        elC.style.background = '#1b1b20';
        elC.style.borderColor = tr.color;
        if (buf) {
          const clipSec = c.len * (60 / tempoAt(st, c.at) / 4);
          const audiblePct = Math.min(100, (buf.duration / Math.pow(2, (c.n || 0) / 12)) / clipSec * 100);
          elC.style.backgroundImage = waveformURI(buf, tr.color);
          elC.style.backgroundRepeat = 'no-repeat';
          elC.style.backgroundSize = audiblePct + '% 100%';
        }
        badges.push('🎙');
        elC.title = `${tr.name} · optagelse · ${c.len / BAR} takter`;
      } else {
        const src = st.clips[c.clip];
        elC.style.background = (src && src.color) || tr.color;
        const mk = src ? clipMarksURI(src, '#0b0b0d') : null;
        if (mk) {
          elC.style.backgroundImage = mk.uri;
          elC.style.backgroundRepeat = 'repeat-x';
          elC.style.backgroundSize = (mk.L / c.len * 100) + '% 100%';
        }
        badges.push(src ? src.name : '?');
        elC.title = `${tr.name} · "${src ? src.name : '?'}" · ${c.len / BAR} takter — træk: flyt (alt: kopiér) · kanter: længde · dobbeltklik: redigér · Delete: slet`;
      }
      if ((c.lvl ?? 1) < 0.95) elC.style.opacity = 0.35 + 0.65 * c.lvl;
      if (c.n) badges.push((c.n > 0 ? '+' : '') + c.n);
      if (c.cut != null) badges.push('FLT');
      elC.innerHTML = `<span class="cellBadge">${badges.join(' ')}</span>`;
      let cd = null;
      elC.onpointerdown = ev => {
        if (ev.button !== 0) return;
        ev.stopPropagation();
        const r = elC.getBoundingClientRect();
        const laneR = lane.getBoundingClientRect();
        const pxPerStep = laneR.width / total;
        let mode = 'move';
        const edge = Math.min(14, r.width / 3);
        if (ev.clientX < r.left + edge) mode = 'l';
        else if (ev.clientX > r.right - edge) mode = 'r';
        cd = { mode, x0: ev.clientX, at0: c.at, len0: c.len, pxPerStep, moved: false };
        selArrClip = c.id;
        try { elC.setPointerCapture(ev.pointerId); } catch (e2) {}
      };
      elC.onpointermove = ev => {
        if (!cd) return;
        const dSteps = Math.round((ev.clientX - cd.x0) / cd.pxPerStep / BAR) * BAR;
        if (!cd.moved && dSteps === 0) return;
        cd.moved = true;
        if (cd.mode === 'move') {
          cd.newAt = Math.max(0, cd.at0 + dSteps);
          elC.style.left = xPct(cd.newAt) + '%';
          elC.classList.add('dragging');
        } else if (cd.mode === 'r') {
          cd.newLen = Math.max(BAR, cd.len0 + dSteps);
          elC.style.width = xPct(cd.newLen) + '%';
        } else {
          const d2 = Math.min(dSteps, cd.len0 - BAR);
          cd.newAt = Math.max(0, cd.at0 + d2);
          cd.newLen = cd.len0 - (cd.newAt - cd.at0);
          elC.style.left = xPct(cd.newAt) + '%';
          elC.style.width = xPct(cd.newLen) + '%';
        }
      };
      const endC = ev => {
        if (!cd) return;
        const d = cd;
        cd = null;
        elC.classList.remove('dragging');
        if (!d.moved) { persist(); renderSongUI(); return; }
        if (d.mode === 'move') {
          if (ev && ev.altKey) {
            placeClip({ ...snapshot(c), id: newClipId(), at: d.newAt ?? c.at });
            toast('Clip kopieret');
          } else {
            c.at = d.newAt ?? c.at;
            placeClip(c);
          }
        } else {
          if (d.mode === 'l' && c.audio && d.newAt != null) {
            c.skip = (c.skip || 0) + (d.newAt - d.at0);
          }
          if (d.newAt != null) c.at = d.newAt;
          if (d.newLen != null) c.len = d.newLen;
          placeClip(c);
        }
        persist(); renderSongUI();
      };
      elC.onpointerup = endC;
      elC.onpointercancel = () => endC(null);
      elC.ondblclick = ev => { ev.stopPropagation(); openClipPop(ev, c); };
      elC.oncontextmenu = ev => { ev.preventDefault(); selArrClip = c.id; openClipPop(ev, c); };
      lane.appendChild(elC);
    }
    row.appendChild(lane);
    wrap.appendChild(row);
  });
  const makeAutoLane = (key, label, cls) => {
    const autoRow = document.createElement('div');
    autoRow.className = 'arrRow arrAuto';
    autoRow.innerHTML = `<div class="arrLabel">${label}</div>`;
    const laneEl = document.createElement('div');
    laneEl.className = 'arrLanes';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'autoSvg ' + cls);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('viewBox', '0 0 1000 100');
    laneEl.appendChild(svg);
    autoRow.appendChild(laneEl);
    wrap.appendChild(autoRow);
    const pts = () => st.arr.auto[key];
    const draw = () => {
      const P = pts().slice().sort((a, b) => a.at - b.at);
      let path;
      if (!P.length) {
        path = '';
      } else {
        const segs = [`M0,${((1 - P[0].v) * 100).toFixed(1)}`];
        for (const p of P) segs.push(`L${(p.at / total * 1000).toFixed(1)},${((1 - p.v) * 100).toFixed(1)}`);
        segs.push(`L1000,${((1 - P[P.length - 1].v) * 100).toFixed(1)}`);
        path = segs.join(' ');
      }
      svg.innerHTML = `<line x1="0" y1="50" x2="1000" y2="50" class="mid"/>`
        + (path ? `<path d="${path}" class="curve"/>` : '')
        + P.map(p => `<circle cx="${(p.at / total * 1000).toFixed(1)}" cy="${((1 - p.v) * 100).toFixed(1)}" r="6" class="pt"/>`).join('');
    };
    const evPos = ev => {
      const r = svg.getBoundingClientRect();
      return {
        s: Math.max(0, Math.min(total, (ev.clientX - r.left) / r.width * total)),
        v: Math.max(0, Math.min(1, 1 - (ev.clientY - r.top) / r.height)),
        tolS: total * 0.015,
      };
    };
    let dragPt = null;
    svg.onpointerdown = ev => {
      const { s, v, tolS } = evPos(ev);
      let nearest = null;
      for (const p of pts()) if (Math.abs(p.at - s) < tolS && (!nearest || Math.abs(p.at - s) < Math.abs(nearest.at - s))) nearest = p;
      if (!nearest) {
        nearest = { at: Math.round(s / (BAR / 2)) * (BAR / 2), v: Math.round(v * 100) / 100 };
        pts().push(nearest);
      }
      dragPt = nearest;
      try { svg.setPointerCapture(ev.pointerId); } catch (e2) {}
      dragPt.v = Math.round(v * 100) / 100;
      draw();
    };
    svg.onpointermove = ev => {
      if (!dragPt) return;
      const { s, v } = evPos(ev);
      dragPt.at = Math.max(0, Math.round(s / (BAR / 2)) * (BAR / 2));
      dragPt.v = Math.round(v * 100) / 100;
      draw();
    };
    svg.onpointerup = () => {
      if (!dragPt) return;
      dragPt = null;
      pts().sort((a, b) => a.at - b.at);
      persist(); renderSongUI();
    };
    svg.ondblclick = ev => {
      const { s, tolS } = evPos(ev);
      const P = pts();
      let bi = -1;
      for (let i = 0; i < P.length; i++) if (Math.abs(P[i].at - s) < tolS * 1.5 && (bi < 0 || Math.abs(P[i].at - s) < Math.abs(P[bi].at - s))) bi = i;
      if (bi >= 0) { P.splice(bi, 1); persist(); renderSongUI(); }
    };
    draw();
  };
  makeAutoLane('mf', 'MASTER FLT', 'mf');
  makeAutoLane('vol', 'VOLUMEN', 'vol');
  makeAutoLane('pump', 'PUMP', 'pump');
  const ph = document.createElement('div');
  ph.id = 'arrPlayhead';
  ph.hidden = true;
  wrap.appendChild(ph);
  const sm = document.createElement('div');
  sm.id = 'arrStartMark';
  sm.title = 'Startmarkør — ▶ spiller herfra (klik på linjalen for at flytte den)';
  sm.style.left = `calc(122px + (100% - 122px) * ${((st._startBar ?? 0) * BAR) / total})`;
  wrap.appendChild(sm);
  scroller.appendChild(wrap);
  el.appendChild(scroller);
}

// ---------- ✳ AUTO: live automation-optagelse ----------
let autoRec = false;
let autoRenderT = 0;
function autoRenderThrottled(fn) {
  const now = Date.now();
  if (now - autoRenderT < 120) return;
  autoRenderT = now;
  fn();
}
// synth-knapper → step-locks i den spillende clip paa det valgte spor (JAM)
function recordParamLock(k, v) {
  if (!autoRec || !player.playing || st.mode !== 'jam') return false;
  const L = live()[curTrack];
  const id = L.play;
  if (!id) return false;
  const clip = st.clips[id];
  if (!clip) return false;
  const pos = player.position();
  if (!pos) return false;
  const idx = (((pos.abs - L.at) % clipLen(clip)) + clipLen(clip)) % clipLen(clip);
  const stp = clip.steps[idx];
  if (!stp?.on) return true; // playhead paa tomt step: intet at laase, men optag-tilstand aktiv
  stp.l = { ...(stp.l || {}), [k]: v };
  persist();
  if (selClipId === id) autoRenderThrottled(renderClipEditor);
  return true;
}
// master-knapper → breakpoints i automations-banerne (SANG)
function recordAutoPoint(key, v) {
  if (!autoRec || !player.playing || st.mode !== 'song') return false;
  const pos = player.position();
  if (!pos || pos.songStep == null) return false;
  const at = Math.round(pos.songStep / (BAR / 2)) * (BAR / 2);
  const pts = st.arr.auto[key];
  const ex = pts.find(p => p.at === at);
  if (ex) ex.v = Math.round(v * 100) / 100;
  else {
    pts.push({ at, v: Math.round(v * 100) / 100 });
    pts.sort((a, b) => a.at - b.at);
  }
  persist();
  if (curView === 'arr') autoRenderThrottled(renderArr);
  return true;
}
$('autoBtn').onclick = () => {
  autoRec = !autoRec;
  $('autoBtn').classList.toggle('on', autoRec);
  toast(autoRec
    ? '✳ AUTO: skru på knapperne mens musikken spiller — synth-knapper skrives i den spillende clip, MASTER FLT/VOL/PUMP i sangens baner'
    : 'Automation-optagelse fra');
};

// ---------- transport ----------
const playBtn = $('playBtn');
function togglePlay() {
  if (player.playing) {
    player.stop();
    playBtn.textContent = '►';
    playBtn.classList.remove('playing');
    document.querySelectorAll('.stp.playcol').forEach(x => x.classList.remove('playcol'));
    renderSession();
  } else {
    if (curView === 'jam') st.mode = 'jam';
    if (st.mode === 'jam' && !live().some(L => L.play || L.next !== undefined)) {
      const sc = st.session.scenes[selScene];
      sc.slots.forEach((id, tr) => { const L = live()[tr]; L.play = id || null; L.at = 0; L.next = undefined; });
    }
    player.play(st.mode === 'song' ? (st._startBar ?? 0) * BAR : 0);
    playBtn.textContent = '■';
    playBtn.classList.add('playing');
    renderSession();
  }
}
playBtn.onclick = togglePlay;
function setFill(on) {
  st._fill = on;
  $('fillBtn').classList.toggle('on', on);
}
$('fillBtn').onpointerdown = () => setFill(true);
$('fillBtn').onpointerup = () => setFill(false);
$('fillBtn').onpointerleave = () => setFill(false);
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
  if (e.key === 'Tab') { e.preventDefault(); toggleView(); return; }
  if (e.key === 'Escape') { if (lockSel) { lockSel = null; renderClipEditor(); renderPanel(); } closeMenus(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) doRedo(); else doUndo();
    return;
  }
  if ((e.key === 'f' || e.key === 'F') && !e.repeat) { setFill(true); return; }
  if ((e.key === 'o' || e.key === 'O') && !e.repeat) { $('metroBtn').onclick(); return; }
  if ((e.key === 'k' || e.key === 'K') && !e.repeat && curClip()) { $('hlScaleB').onclick(); return; }
  if (e.shiftKey && /^Digit[1-8]$/.test(e.code)) {
    const i = +e.code.slice(5) - 1;
    st.tracks[i].mute = !st.tracks[i].mute;
    persist(); renderSession(); player.refreshTrackGains();
    return;
  }
  if (curView === 'jam') {
    if (/^Digit[1-8]$/.test(e.code) && !e.metaKey && !e.ctrlKey) {
      const i = +e.code.slice(5) - 1;
      if (i < st.session.scenes.length) launchScene(i);
      return;
    }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      if (e.key === 'ArrowUp') gridSel.scene = Math.max(0, gridSel.scene - 1);
      if (e.key === 'ArrowDown') gridSel.scene = Math.min(st.session.scenes.length - 1, gridSel.scene + 1);
      if (e.key === 'ArrowLeft') gridSel.tr = Math.max(0, gridSel.tr - 1);
      if (e.key === 'ArrowRight') gridSel.tr = Math.min(7, gridSel.tr + 1);
      renderSession();
      return;
    }
    if (e.key === 'Enter') {
      const id = st.session.scenes[gridSel.scene].slots[gridSel.tr];
      if (id) launchClip(gridSel.scene, gridSel.tr); else createClipInSlot(gridSel.scene, gridSel.tr);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      dupClipBelow(gridSel.scene, gridSel.tr);
      return;
    }
    if (e.key === '0') {
      const id = st.session.scenes[gridSel.scene].slots[gridSel.tr];
      if (id) { const c = st.clips[id]; c.dis = !c.dis; if (!c.dis) delete c.dis; persist(); renderSession(); }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (st.session.scenes[gridSel.scene].slots[gridSel.tr]) clearSlot(gridSel.scene, gridSel.tr);
      return;
    }
  } else {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selArrClip) {
      st.arr.clips = st.arr.clips.filter(x => x.id !== selArrClip);
      selArrClip = null;
      persist(); renderSongUI();
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      const k = e.key.toLowerCase();
      if (k === 'c') { e.preventDefault(); copyArrClip(false); return; }
      if (k === 'x') { e.preventDefault(); copyArrClip(true); return; }
      if (k === 'v') { e.preventDefault(); pasteArrClip(); return; }
      if (k === 'd') {
        e.preventDefault();
        const c = selArrObj();
        if (c) {
          const dup = { ...snapshot(c), id: newClipId(), at: c.at + c.len };
          placeClip(dup); selArrClip = dup.id;
          persist(); renderSongUI();
        }
        return;
      }
    }
  }
});
window.addEventListener('keyup', e => {
  if (e.key === 'f' || e.key === 'F') setFill(false);
});
$('bpm').oninput = e => { st.bpm = Math.max(60, Math.min(200, +e.target.value || 132)); persist(); };
$('swing').oninput = e => { st.swing = +e.target.value; $('swingVal').textContent = Math.round(st.swing * 100) + '%'; persist(); };
$('pump').oninput = e => { st.pumpFx = +e.target.value; $('pumpVal').textContent = Math.round(st.pumpFx * 100) + '%'; recordAutoPoint('pump', st.pumpFx); persist(); };
$('mFilter').oninput = e => { st.masterFilter = +e.target.value; $('mFilterVal').textContent = mfLabel(); recordAutoPoint('mf', st.masterFilter); persist(); };
$('mFilter').ondblclick = () => { st.masterFilter = 0.5; $('mFilter').value = 0.5; $('mFilterVal').textContent = mfLabel(); persist(); };
$('mVol').oninput = e => { st.masterVol = +e.target.value; recordAutoPoint('vol', st.masterVol); persist(); };
function mfLabel() {
  const v = st.masterFilter;
  if (Math.abs(v - 0.5) < 0.01) return 'OPEN';
  return v < 0.5 ? 'LP' : 'HP';
}
$('projName').addEventListener('input', () => { st.name = $('projName').value; persist(); });

// ---------- stemme-optagelse (audio-clips i sangen) ----------
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('simon-db', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('recs');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(k, v) {
  const d = await idbOpen();
  return new Promise((res, rej) => {
    const tx = d.transaction('recs', 'readwrite');
    tx.objectStore('recs').put(v, k);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}
async function idbAll() {
  const d = await idbOpen();
  return new Promise((res, rej) => {
    const tx = d.transaction('recs');
    const store = tx.objectStore('recs');
    const keys = store.getAllKeys();
    const vals = store.getAll();
    tx.oncomplete = () => res(keys.result.map((k, i) => [k, vals.result[i]]));
    tx.onerror = () => rej(tx.error);
  });
}
(async () => {
  try {
    const dctx = new (window.AudioContext || window.webkitAudioContext)();
    for (const [id, wav] of await idbAll()) {
      try { registerRecBuffer(id, await dctx.decodeAudioData(wav.slice(0))); } catch (e) {}
    }
    renderBrowser();
    if (curView === 'arr') renderArr();
  } catch (e) { console.warn('optagelser kunne ikke indlæses', e); }
})();
function trimNormalize(ctx, buf) {
  const d = buf.getChannelData(0);
  let a = 0, b = d.length - 1, peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const thr = Math.max(0.015, peak * 0.04);
  while (a < b && Math.abs(d[a]) < thr) a++;
  while (b > a && Math.abs(d[b]) < thr) b--;
  a = Math.max(0, a - 800); b = Math.min(d.length - 1, b + 4000);
  const out = ctx.createBuffer(1, b - a + 1, buf.sampleRate);
  const o = out.getChannelData(0);
  const g = peak > 0.01 ? 0.9 / peak : 1;
  for (let i = a; i <= b; i++) o[i - a] = d[i] * g;
  return out;
}
let rec = null;
$('recBtn').onclick = async () => {
  if (rec) { rec.stopping = true; rec.mr.stop(); return; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    toast('Kunne ikke få adgang til mikrofonen — tillad den i browseren', true);
    return;
  }
  const tr = curTrack;
  const mr = new MediaRecorder(stream);
  rec = { mr, chunks: [], tr, startStep: null, synced: false };
  mr.ondataavailable = ev => { if (ev.data.size) rec.chunks.push(ev.data); };
  mr.onstop = () => finishRec(stream);
  $('recBtn').classList.add('on');
  const playingSong = player.playing && st.mode === 'song';
  if (playingSong) {
    $('recBtn').textContent = '● VENTER…';
    toast('Optager fra næste takt på ' + st.tracks[tr].name + ' — 🎧 brug hovedtelefoner!');
    const startPos = player.position();
    const startBarNow = startPos ? Math.floor(startPos.songStep / BAR) : 0;
    rec.waiter = setInterval(() => {
      if (!rec) return;
      const p = player.position();
      if (p && p.songStep != null && Math.floor(p.songStep / BAR) > startBarNow) {
        clearInterval(rec.waiter);
        rec.startStep = Math.floor(p.songStep / BAR) * BAR;
        rec.synced = true;
        mr.start();
        $('recBtn').textContent = '● REC…';
      }
    }, 20);
  } else {
    rec.startStep = (st._startBar ?? 0) * BAR;
    mr.start();
    $('recBtn').textContent = '● REC…';
    toast('Optager til ' + st.tracks[tr].name + ' — tryk 🎙 igen for at stoppe');
  }
};
async function finishRec(stream) {
  const r = rec;
  rec = null;
  if (r.waiter) clearInterval(r.waiter);
  stream.getTracks().forEach(t2 => t2.stop());
  $('recBtn').classList.remove('on');
  $('recBtn').textContent = '●';
  if (!r.chunks.length || r.startStep == null) { toast('Ingen optagelse', true); return; }
  try {
    const ab = await new Blob(r.chunks).arrayBuffer();
    const ctx = player.ensureCtx();
    let buf = await ctx.decodeAudioData(ab);
    if (!r.synced) buf = trimNormalize(ctx, buf);
    if (buf.duration < 0.15) { toast('Optagelsen var for kort', true); return; }
    const id = 'r' + Date.now().toString(36);
    registerRecBuffer(id, buf);
    idbPut(id, encodeWav(buf)).catch(() => toast('Kunne ikke gemme optagelsen permanent', true));
    const stepDur = 60 / st.bpm / 4;
    const lenBars = Math.max(1, Math.ceil(buf.duration / (stepDur * BAR)));
    const c = { id: newClipId(), tr: r.tr, at: r.startStep, len: lenBars * BAR, audio: id };
    placeClip(c);
    selArrClip = c.id;
    persist();
    if (curView !== 'arr') toggleView('arr'); else renderSongUI();
    toast('🎙 Optagelse lagt på ' + st.tracks[r.tr].name + ' ved takt ' + (r.startStep / BAR + 1));
  } catch (e) {
    console.error(e);
    toast('Optagelsen kunne ikke afkodes', true);
  }
}

// ---------- MIDI-keyboard: spil den valgte synth, REC ind i clips, FANG bagudrettet ----------
let midiAccess = null;
let midiRecOn = false;
const midiHeld = new Map();   // note -> {stop()}
const capBuf = [];            // {t, midi, vel, abs|null, tr} — rullende Capture-buffer
async function initMidi(fromClick) {
  if (midiAccess) return true;
  if (!navigator.requestMIDIAccess) {
    if (fromClick) toast('Din browser understøtter ikke Web MIDI — brug Chrome/Edge/Firefox', true);
    return false;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess();
  } catch (e) {
    if (fromClick) toast('MIDI-adgang blev afvist i browseren', true);
    return false;
  }
  const bind = () => {
    for (const inp of midiAccess.inputs.values()) inp.onmidimessage = onMidiMsg;
    updateMidiDot();
  };
  midiAccess.onstatechange = bind;
  bind();
  return true;
}
function updateMidiDot() {
  const n = midiAccess ? [...midiAccess.inputs.values()].filter(i => i.state === 'connected').length : 0;
  const dot = $('midiDot');
  dot.className = n ? 'ok' : '';
  dot.title = n ? n + ' MIDI-enhed(er) klar — spil på det valgte spor' : 'Intet MIDI-keyboard fundet';
}
function posFrac() {
  const pos = player.position();
  if (!pos || !player.ctx) return null;
  const stepDur = 60 / (player.curBpm || st.bpm) / 4;
  const frac = (player.ctx.currentTime - pos.t) / stepDur;
  return pos.abs + Math.min(0.99, Math.max(0, frac));
}
function onMidiMsg(ev) {
  const [stt, d1, d2] = ev.data;
  const cmd = stt & 0xf0;
  if (cmd === 0x90 && d2 > 0) midiNoteOn(d1, d2 / 127);
  else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) midiNoteOff(d1);
}
async function midiNoteOn(midi, vel) {
  const tr = curTrack;
  const old = midiHeld.get(midi);
  if (old) old.stop();
  midiHeld.set(midi, await player.liveNoteOn(tr, midi, vel));
  const abs = (player.playing && st.mode === 'jam') ? posFrac() : null;
  capBuf.push({ t: performance.now(), midi, vel, abs, tr });
  if (capBuf.length > 400) capBuf.shift();
  if (midiRecOn) recordMidiNote(midi, vel, abs);
}
function midiNoteOff(midi) {
  const h = midiHeld.get(midi);
  if (h) { h.stop(); midiHeld.delete(midi); }
}
// sikr en clip at optage i paa det valgte spor (aldrig en doed ende)
function ensureRecClip() {
  let c = curClip();
  if (c && c.tr === curTrack) return c;
  let si = st.session.scenes.findIndex(sc => !sc.slots[curTrack]);
  if (si < 0) { addScene(); si = st.session.scenes.length - 1; }
  createClipInSlot(si, curTrack);
  return curClip();
}
function recordMidiNote(midi, vel, abs) {
  const c = ensureRecClip();
  if (!c) return;
  const base = st.tracks[c.tr].patch.note ?? 48;
  const L = clipLen(c);
  let idx;
  if (abs != null) {
    const lv = live()[c.tr];
    const rel = lv.play === selClipId ? abs - lv.at : abs;
    idx = ((Math.round(rel) % L) + L) % L;
  } else {
    idx = 0;
  }
  const off = midi - base;
  const ex = c.steps[idx];
  if (ex?.on && !notesOf(ex).includes(off)) {
    setStepNotesOn(c, idx, [...notesOf(ex), off]); // akkord: flere toner paa samme step
    c.steps[idx].v = Math.max(ex.v ?? 1, Math.max(0.1, vel));
  } else {
    c.steps[idx] = { on: true, v: Math.max(0.1, vel), n: off };
  }
  persist();
  renderClipEditor();
}
// FANG (Capture): skriv det du LIGE har spillet ind i den valgte clip — bagudrettet
function captureMidi() {
  const c = ensureRecClip();
  if (!c) return;
  const base = st.tracks[c.tr].patch.note ?? 48;
  const notes = capBuf.filter(x => x.tr === c.tr).slice(-64);
  if (!notes.length) { toast('Intet spillet på ' + st.tracks[c.tr].name + ' endnu — spil løs og tryk FANG bagefter', true); return; }
  const L = clipLen(c);
  const lv = live()[c.tr];
  let wrote = 0;
  if (notes.some(x => x.abs != null)) {
    for (const x of notes) {
      if (x.abs == null) continue;
      const rel = lv.play === selClipId ? x.abs - lv.at : x.abs;
      const idx = ((Math.round(rel) % L) + L) % L;
      c.steps[idx] = { on: true, v: Math.max(0.1, x.vel), n: x.midi - base };
      wrote++;
    }
  } else {
    const stepMs = 60000 / st.bpm / 4;
    const t0 = notes[0].t;
    for (const x of notes) {
      const idx = ((Math.round((x.t - t0) / stepMs) % L) + L) % L;
      c.steps[idx] = { on: true, v: Math.max(0.1, x.vel), n: x.midi - base };
      wrote++;
    }
  }
  capBuf.length = 0;
  persist(); renderClipEditor(); renderSession();
  toast('⭯ Fangede ' + wrote + ' toner ind i "' + c.name + '"');
}
$('midiRec').onclick = async () => {
  if (!await initMidi(true)) return;
  midiRecOn = !midiRecOn;
  $('midiRec').classList.toggle('on', midiRecOn);
  toast(midiRecOn
    ? '⏺ MIDI-REC: tangenterne skrives kvantiseret ind i den valgte clip, mens den looper'
    : 'MIDI-REC slået fra — dit keyboard spiller stadig synthen');
};
$('midiCap').onclick = async () => {
  if (!await initMidi(true)) return;
  captureMidi();
};
(async () => {
  try {
    const p = await navigator.permissions.query({ name: 'midi' });
    if (p.state === 'granted') initMidi(false);
  } catch (e) {}
  updateMidiDot();
})();

// ---------- ● OPTAG JAM→SANG ----------
let jam = null;
$('jamBtn').onclick = () => {
  if (jam) { finishJam(); return; }
  if (curView !== 'jam') toggleView('jam');
  st.mode = 'jam';
  jam = { open: new Array(8).fill(null), clips: [], atSteps: 0, lastBar: -1 };
  jam.timer = setInterval(() => {
    if (!jam) return;
    const pos = player.position();
    if (pos && st.mode === 'jam' && pos.jam) jamCapture(pos);
  }, 80);
  $('jamBtn').classList.add('on');
  $('jamBtn').textContent = '● OPTAGER…';
  if (!player.playing) togglePlay();
  toast('Optager din jam: start clips og scener — tryk ● igen, og det hele ligger som sang');
};
function finishJam() {
  clearInterval(jam.timer);
  const { clips, open } = jam;
  for (const o of open) if (o) clips.push(o);
  const bars = Math.ceil(jam.atSteps / BAR);
  jam = null;
  $('jamBtn').classList.remove('on');
  $('jamBtn').textContent = '● SESSION→ARR REC';
  if (!clips.length) { toast('Intet optaget endnu', true); return; }
  st.arr = { ...emptyArr(), clips };
  persist(); renderSongUI();
  toast(`Jam gemt som sang: ${clips.length} clips over ${bars} takter — Tab for at se den`);
}
function jamCapture(pos) {
  const bar = Math.floor(pos.abs / BAR);
  if (bar === jam.lastBar) return;
  jam.lastBar = bar;
  const L = live();
  for (let tr = 0; tr < 8; tr++) {
    const id = L[tr].play;
    const active = id && !st.clips[id]?.dis && !st.tracks[tr].mute;
    const o = jam.open[tr];
    if (active) {
      if (o && o.clip === id) o.len += BAR;
      else {
        if (o) jam.clips.push(o);
        jam.open[tr] = { id: newClipId(), tr, at: jam.atSteps, len: BAR, clip: id };
      }
    } else if (o) {
      jam.clips.push(o);
      jam.open[tr] = null;
    }
  }
  jam.atSteps += BAR;
  $('jamBtn').textContent = `● OPTAGER (${Math.ceil(jam.atSteps / BAR)} takter)`;
}

// ---------- rAF: blink/progress/playhead + meters ----------
let lastLED = null;
const meterBuf = new Uint8Array(256);
const meterLv = new Array(8).fill(0);
let metersHot = false;
function tickMeters() {
  const ans = player.rig?.analysers;
  if (ans && player.playing) {
    document.querySelectorAll('#sesMixer .mxLv').forEach((lv2, i) => {
      const an = ans[i];
      if (!an) return;
      an.getByteTimeDomainData(meterBuf);
      let pk = 0;
      for (let j = 0; j < meterBuf.length; j++) {
        const a = Math.abs(meterBuf[j] - 128) / 128;
        if (a > pk) pk = a;
      }
      meterLv[i] = Math.max(pk, (meterLv[i] || 0) * 0.91);
      lv2.style.height = Math.min(100, meterLv[i] * 125) + '%';
    });
    metersHot = true;
  } else if (metersHot) {
    metersHot = false;
    meterLv.fill(0);
    document.querySelectorAll('#sesMixer .mxLv').forEach(lv2 => { lv2.style.height = '0%'; });
  }
}
function tick() {
  tickMeters();
  const pos = player.position();
  if (pos) {
    if (pos.jam && curView === 'jam') {
      const L = live();
      document.querySelectorAll('.slot.playing').forEach(slotEl => {
        const ti = +slotEl.dataset.ti;
        const id = L[ti].play;
        const c = id && st.clips[id];
        if (!c) return;
        const rel = pos.abs - L[ti].at;
        const p = ((rel % c.len) + c.len) % c.len / c.len;
        const prog = slotEl.querySelector('.prog');
        if (prog) prog.style.width = (p * 100) + '%';
      });
      document.querySelectorAll('#sesGrid .statusField:not(.main)').forEach(sf => {
        const ti = +sf.dataset.ti;
        const Ls = L[ti];
        const c2 = Ls.play && st.clips[Ls.play];
        if (!c2 || !player.playing) {
          sf.classList.remove('live');
        } else {
          sf.classList.add('live');
          const rel2 = pos.abs - Ls.at;
          const cl2 = clipLen(c2);
          sf.querySelector('.stLoops').textContent = Math.floor(rel2 / c2.len) + 1;
          sf.querySelector('.stLen').textContent = cl2 / 4;
          const frac2 = ((rel2 % cl2) + cl2) % cl2 / cl2;
          sf.querySelector('.stPie').style.background = `conic-gradient(${c2.color || st.tracks[ti].color} ${Math.round(frac2 * 360)}deg, #00000022 0)`;
        }
      });
      const key = 'j' + pos.abs;
      if (key !== lastLED) {
        lastLED = key;
        const c = curClip();
        document.querySelectorAll('#clipBar .playcol').forEach(x => x.classList.remove('playcol'));
        if (c && L[c.tr] && L[c.tr].play === selClipId) {
          const idx = (pos.abs - L[c.tr].at) % clipLen(c);
          document.querySelectorAll(`#clipSteps [data-s="${idx}"], #velStems [data-s="${idx}"]`).forEach(x => x.classList.add('playcol'));
        }
        if (pos.abs % BAR === 0) renderSession(); // koeer blev anvendt paa takt-graensen
      }
    }
    const s0 = pos.songStep != null ? pos.songStep : pos.abs;
    $('posBox').textContent = `${Math.floor(s0 / BAR) + 1}. ${Math.floor((s0 % BAR) / 4) + 1}. ${(s0 % 4) + 1}`;
    const ph = document.getElementById('arrPlayhead');
    if (ph) {
      const miniPh = document.getElementById('arrMiniPh');
      if (pos.songStep != null) {
        const frac = pos.songStep / Math.max(1, lastViewSteps);
        ph.hidden = false;
        ph.style.left = `calc(122px + (100% - 122px) * ${Math.min(1, frac)})`;
        if (miniPh) { miniPh.hidden = false; miniPh.style.left = (frac * 100) + '%'; }
        const sc = document.getElementById('arrScroll');
        const wrap = document.getElementById('arrWrap');
        if (sc && wrap && wrap.clientWidth > sc.clientWidth + 4) {
          const phX = 122 + (wrap.clientWidth - 122) * frac;
          if (phX < sc.scrollLeft + 130 || phX > sc.scrollLeft + sc.clientWidth - 60) {
            sc.scrollLeft = Math.max(0, phX - sc.clientWidth * 0.35);
          }
        }
      } else {
        ph.hidden = true;
        if (miniPh) miniPh.hidden = true;
      }
    }
    if (st.mode === 'song' && !autoRec) {
      if (player.autoMF != null) {
        $('mFilter').value = player.autoMF;
        const v = player.autoMF;
        $('mFilterVal').textContent = Math.abs(v - 0.5) < 0.01 ? 'OPEN' : (v < 0.5 ? 'LP' : 'HP');
      }
      if (player.autoVol != null) $('mVol').value = player.autoVol;
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- projekter ----------
let projects = [];
try { projects = JSON.parse(localStorage.getItem('simon-projects') || '[]'); } catch (e) {}
$('saveProj').onclick = () => {
  const name = ($('projName').value || '').trim() || 'Uden titel ' + (projects.length + 1);
  st.name = name;
  const snap = snapshot(st);
  const ex = projects.find(p => p.name === name);
  if (ex) ex.data = snap; else projects.push({ name, data: snap });
  localStorage.setItem('simon-projects', JSON.stringify(projects));
  persist();
  toast('Projekt gemt: ' + name);
};
$('projMenu').onclick = () => { renderProjList(); $('projList').hidden = false; };
$('projClose').onclick = () => { $('projList').hidden = true; };
$('projList').addEventListener('click', e => { if (e.target === $('projList')) $('projList').hidden = true; });
function renderProjList() {
  const el = $('projItems');
  el.innerHTML = '';
  const nyBtn = document.createElement('button');
  nyBtn.className = 'open';
  nyBtn.textContent = '+ NYT TOMT PROJEKT';
  nyBtn.onclick = () => {
    st = defaultProject();
    st.clips = {};
    st.session = { scenes: Array.from({ length: 6 }, (_, i) => ({ name: '' + (i + 1), slots: new Array(8).fill(null) })) };
    selClipId = null; selScene = 0; gridSel = { scene: 0, tr: 0 };
    $('projName').value = '';
    persist(); syncTop(); renderAll();
    $('projList').hidden = true;
  };
  const demoBtn = document.createElement('button');
  demoBtn.className = 'open';
  demoBtn.textContent = '+ NYT PROJEKT (TECHNO-STARTER)';
  demoBtn.onclick = () => {
    st = defaultProject();
    selClipId = 'k1'; selScene = 0; curTrack = 0; gridSel = { scene: 0, tr: 0 };
    $('projName').value = '';
    persist(); syncTop(); renderAll();
    $('projList').hidden = true;
  };
  el.appendChild(nyBtn);
  el.appendChild(demoBtn);
  if (!projects.length) {
    const d = document.createElement('div');
    d.style.cssText = 'color:var(--dim);font-size:11px;padding:6px 2px;';
    d.textContent = 'Ingen gemte projekter endnu.';
    el.appendChild(d);
  }
  for (const p of projects) {
    const row = document.createElement('div');
    row.className = 'projItem';
    const open = document.createElement('button');
    open.className = 'open';
    open.textContent = p.name;
    open.onclick = () => {
      if (player.playing) togglePlay();
      st = migrate(snapshot(p.data)) || defaultProject();
      selClipId = null; selScene = 0; lockSel = null; gridSel = { scene: 0, tr: 0 };
      persist(); syncTop(); renderAll();
      $('projList').hidden = true;
      toast('Åbnet: ' + p.name);
    };
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.onclick = () => {
      if (!confirm('Slet projektet "' + p.name + '"?')) return;
      projects = projects.filter(x => x !== p);
      localStorage.setItem('simon-projects', JSON.stringify(projects));
      renderProjList();
    };
    row.appendChild(open); row.appendChild(del);
    el.appendChild(row);
  }
}

// ---------- eksport ----------
let hasServer = false;
fetch('/ping', { cache: 'no-store' }).then(r => { hasServer = r.ok; }).catch(() => {});
$('exportBtn').onclick = async () => {
  const btn = $('exportBtn');
  btn.disabled = true;
  btn.textContent = 'RENDERER…';
  try {
    const what = (curView === 'arr' && st.arr.clips.length) ? 'song' : 'scene';
    await preloadSamples(st);
    const wav = await renderWav(st, what, selScene);
    const name = ($('projName').value || '').trim() || 'Simons Track';
    let saved = false;
    if (hasServer) {
      try {
        const r = await fetch('/save', {
          method: 'POST',
          headers: { 'X-Song-Name': encodeURIComponent(name), 'Content-Type': 'application/octet-stream' },
          body: wav,
        });
        if (r.ok) { toast('Gemt i "Faerdige Sange": ' + (await r.json()).saved); saved = true; }
      } catch (e) {}
    }
    if (!saved) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      a.download = name + '.wav';
      a.click();
      toast('WAV downloadet: ' + name + (what === 'scene' ? ' (scenen ×2 — åbn SANG-viewet for at eksportere hele sangen)' : ''));
    }
  } catch (e) {
    console.error(e);
    toast('Eksport fejlede', true);
  }
  btn.disabled = false;
  btn.textContent = 'EKSPORT';
};

// ---------- init ----------
function syncTop() {
  $('bpm').value = st.bpm;
  $('swing').value = st.swing;
  $('swingVal').textContent = Math.round(st.swing * 100) + '%';
  $('pump').value = st.pumpFx ?? 0.4;
  $('pumpVal').textContent = Math.round((st.pumpFx ?? 0.4) * 100) + '%';
  $('mFilter').value = st.masterFilter;
  $('mFilterVal').textContent = mfLabel();
  $('mVol').value = st.masterVol;
  $('projName').value = st.name || '';
}
function renderAll() {
  renderSession();
  renderSongUI();
  renderPanel();
  renderClipEditor();
}
preloadSamples(st).then(() => {});
// ---------- v16: Control Bar (Live 12) ----------
st.quant = st.quant ?? 16;
$('quantSel').value = String(st.quant);
$('quantSel').onchange = () => { st.quant = +$('quantSel').value; persist(); };
$('metroBtn').classList.toggle('on', !!st.metro);
$('metroBtn').onclick = () => { st.metro = !st.metro; $('metroBtn').classList.toggle('on', !!st.metro); persist(); };
let _taps = [];
$('tapBtn').onclick = () => {
  const now = performance.now();
  _taps = _taps.filter(t2 => now - t2 < 3000);
  _taps.push(now);
  if (_taps.length >= 2) {
    const iv = (_taps[_taps.length - 1] - _taps[0]) / (_taps.length - 1);
    const b2 = Math.max(60, Math.min(200, Math.round(60000 / iv)));
    st.bpm = b2; $('bpm').value = b2; persist();
  }
};
$('stopBtn').onclick = () => { if (player.playing) togglePlay(); };
// Info View (Live 12): hover-hjaelp i nederste venstre hjoerne
document.addEventListener('mouseover', e => {
  const el2 = e.target && e.target.closest ? e.target.closest('[title]') : null;
  if (!el2 || !el2.getAttribute('title')) return;
  const t2 = (el2.textContent || '').trim().replace(/\s+/g, ' ');
  $('ivTitle').textContent = t2 ? t2.slice(0, 26) : 'Info';
  $('ivText').textContent = el2.getAttribute('title');
});

window.__simon = { st: () => st, player, live, midiTest: { midiNoteOn, midiNoteOff, captureMidi, setRec: v => { midiRecOn = v; } } };
$('verTag').textContent = APP_VER;
// aabn med foerste scenes foerste clip valgt, saa editoren aldrig er tom
(() => {
  const sc = st.session.scenes[0];
  const tr = sc ? sc.slots.findIndex(x => x) : -1;
  if (tr >= 0) { curTrack = tr; selClipId = sc.slots[tr]; gridSel = { scene: 0, tr }; }
})();
syncTop();
renderAll();
