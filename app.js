// SIMONS MUSIKMASKINE — UI og tilstand (v6: Ableton-model i arrangementet —
// frie clips pr. spor med position/laengde/kilde/overrides, markoerer, tempo-skift,
// fri automation, loop-brace i takter, seek, JAM-til-clips)
import { Player, renderWav, noteName, cutHz, songEntry, entrySteps, emptyArr, arrLenSteps, tempoAt, songDurationSec, BAR } from './engine.js';

const $ = id => document.getElementById(id);
const PATTERN_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const TRACK_COLORS = ['#ff3d5a', '#ff9f2e', '#ffd83d', '#c8ff2e', '#3dffc0', '#3db9ff', '#a06bff', '#ff5ad0'];
const PAT_COLORS = ['#c8ff2e', '#3db9ff', '#ff9f2e', '#ff5ad0', '#3dffc0', '#ffd83d', '#a06bff', '#ff3d5a'];
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
  { n: 'KICK', p: patch({ wave: 'sin', note: 36, penv: 30, pdec: 0.055, dec: 0.34, drive: 0.55, cut: 0.85 }) },
  { n: 'KICK RUMBLE', p: patch({ wave: 'sin', note: 34, penv: 26, pdec: 0.07, dec: 0.6, drive: 0.75, cut: 0.5, sendV: 0.25 }) },
  { n: 'CLAP', p: patch({ wave: 'noise', dec: 0.22, ftype: 'bp', cut: 0.68, res: 0.35, att: 0.008, sendV: 0.18 }) },
  { n: 'SNARE', p: patch({ wave: 'noise', note: 55, noise: 1, dec: 0.16, cut: 0.75, penv: 10, pdec: 0.05 }) },
  { n: 'HAT C', p: patch({ wave: 'noise', dec: 0.05, ftype: 'hp', cut: 0.8, res: 0.2, choke: 1 }) },
  { n: 'HAT O', p: patch({ wave: 'noise', dec: 0.32, ftype: 'hp', cut: 0.78, res: 0.2, choke: 1 }) },
  { n: 'RIDE', p: patch({ wave: 'noise', dec: 0.5, ftype: 'hp', cut: 0.85, res: 0.55, sendV: 0.12 }) },
  { n: '303 BASS', p: patch({ wave: 'saw', note: 36, glide: 0.35, dec: 0.24, cut: 0.3, res: 0.62, fenv: 0.5, fdec: 0.18, drive: 0.3, duck: 0.45 }) },
  { n: 'SUB BASS', p: patch({ wave: 'sin', note: 33, sub: 0.6, dec: 0.4, cut: 0.5, duck: 0.5 }) },
  { n: 'RAVE STAB', p: patch({ wave: 'saw', note: 60, wave2: 'saw', semi2: 12, det2: 14, mix2: 0.6, dec: 0.22, cut: 0.6, res: 0.3, fenv: 0.45, fdec: 0.12, sendD: 0.35, sendV: 0.2, duck: 0.35 }) },
  { n: 'HOOVER', p: patch({ wave: 'saw', note: 48, wave2: 'saw', semi2: 0, det2: 22, mix2: 1, sub: 0.35, drift: 0.4, sus: 0.6, rel: 0.3, gate: 2, dec: 0.15, cut: 0.5, res: 0.2, drive: 0.25, duck: 0.4 }) },
  { n: 'DUB STAB', p: patch({ wave: 'sqr', note: 57, wave2: 'sqr', semi2: 7, mix2: 0.5, dec: 0.28, cut: 0.42, res: 0.3, sendD: 0.55, sendV: 0.25, duck: 0.35 }) },
  { n: 'ACID LEAD', p: patch({ wave: 'sqr', note: 60, glide: 0.25, dec: 0.18, cut: 0.35, res: 0.7, fenv: 0.6, fdec: 0.1, sendD: 0.4 }) },
  { n: 'BLEEP', p: patch({ wave: 'sin', note: 84, dec: 0.09, sendD: 0.5 }) },
  { n: 'PERC', p: patch({ wave: 'tri', note: 74, penv: 14, pdec: 0.03, dec: 0.09, sendD: 0.3 }) },
  { n: 'ZAP', p: patch({ wave: 'saw', note: 70, penv: 36, pdec: 0.09, dec: 0.12, drive: 0.4 }) },
  { n: 'LOFI PERC', p: patch({ wave: 'tri', note: 65, penv: 10, pdec: 0.04, dec: 0.12, crush: 0.55, down: 0.4, sendD: 0.3 }) },
  { n: 'NOISE SWEEP', p: patch({ wave: 'noise', att: 0.25, dec: 1.3, ftype: 'bp', cut: 0.55, res: 0.5, fenv: 0.8, fdec: 1.1, sendV: 0.45, duck: 0.3 }) },
  { n: 'DRONE', p: patch({ wave: 'saw', note: 36, sub: 0.4, drift: 0.3, att: 0.1, dec: 1.5, sus: 0.7, rel: 0.8, gate: 4, cut: 0.35, res: 0.4, lamt: 0.5, lrate: 0.8, ldst: 'cut', sendV: 0.3, duck: 0.5 }) },
];

// ---------- default-projekt: et taendt techno-groove ----------
function emptyPattern() {
  return { len: 16, tlen: new Array(8).fill(null), steps: Array.from({ length: 8 }, () => new Array(MAX_STEPS).fill(null)) };
}
function stepOn(v = 1, n = 0, l = null) { return { on: true, v, n, l }; }
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
  const patterns = Array.from({ length: 8 }, emptyPattern);
  const A = patterns[0];
  for (let s = 0; s < 16; s += 4) A.steps[0][s] = stepOn();                     // kick 4/4
  A.steps[1][4] = stepOn(); A.steps[1][12] = stepOn();                          // clap 2&4
  for (const s of [0, 1, 4, 5, 8, 9, 12, 13]) A.steps[2][s] = stepOn(0.55);     // lukket hat (choker den åbne)
  for (let s = 2; s < 16; s += 4) A.steps[3][s] = stepOn(0.8);                  // åben hat offbeat
  // 303-linje med note- og filter-locks (p-locks fra start!)
  const bl = [[0, 0], [3, 0], [6, 12], [7, 0], [10, 3], [12, 0], [14, 15]];
  for (const [s, n] of bl) A.steps[4][s] = stepOn(0.9, n, n === 15 ? { cut: 0.55, res: 0.75 } : null);
  A.steps[5][8] = stepOn(0.9, 0, { sendD: 0.5 });                               // stab
  A.steps[6][7] = stepOn(0.7); A.steps[6][15] = stepOn(0.7, 3);                 // perc
  A.steps[6][11] = { ...stepOn(0.6, 0), p: 0.5 };                               // perc med 50% chance
  A.steps[3][15] = { ...stepOn(0.7, 0), c: 'fill', r: 3 };                      // hat-roll kun ved FILL
  return {
    v: 3, name: '', bpm: 132, swing: 0.12, masterFilter: 0.5, masterVol: 0.9,
    delayFb: 0.42, delayDiv: 3, pumpFx: 0.4, duckTrack: 0,
    mode: 'pattern', curPattern: 0, songLoop: true,
    arr: emptyArr(),
    tracks, patterns,
  };
}
// migration: udfyld manglende felter + konvertér gamle entry-baserede sange til clips
function migrate(s) {
  if (!s || !s.tracks || !s.patterns) return null;
  const def = patch();
  s.tracks.forEach(tr => { tr.patch = { ...def, ...tr.patch }; });
  s.patterns.forEach(P => { if (!P.tlen) P.tlen = new Array(8).fill(null); });
  if (s.pumpFx === undefined) s.pumpFx = 0.4;
  if (s.duckTrack === undefined) s.duckTrack = 0;
  if (!s.arr) s.arr = emptyArr();
  if (!s.arr.auto) s.arr.auto = { mf: [], vol: [], pump: [] };
  // legacy: entry-baseret song-kaede -> frie clips
  if (Array.isArray(s.song) && s.song.length && !s.arr.clips.length) {
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
  s._fill = false;
  return s;
}

// ---------- tilstand ----------
let st = null;
try { st = migrate(JSON.parse(localStorage.getItem('simon-project-v1') || 'null')); } catch (e) {}
if (!st) st = defaultProject();
let curTrack = 0;
let lockSel = null;        // {tr, step} naar et step p-lock-redigeres
let clipboardPat = null;
const player = new Player(() => st);

let saveTimer = null;
const NO_UNDERSCORE = (k, v) => (typeof k === 'string' && k.startsWith('_')) ? undefined : v;
function snapshot(x) { return JSON.parse(JSON.stringify(x, NO_UNDERSCORE)); }
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => localStorage.setItem('simon-project-v1', JSON.stringify(st, NO_UNDERSCORE)), 300);
}
function toast(msg, err = false) {
  const t = $('toast');
  t.textContent = msg; t.className = err ? 'err' : ''; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2400);
}

// ---------- sequencer-grid ----------
function pat() { return st.patterns[st.curPattern]; }
function tlenOf(ti, P = pat()) { return (P.tlen && P.tlen[ti]) || P.len; }
const seqEl = $('seq');
let velDrag = null, suppressClick = false;
const PROB_CYCLE = { 1: 0.75, 0.75: 0.5, 0.5: 0.25, 0.25: 1 };
const PROB_CHAR = p => (p >= 0.75 ? '¾' : p >= 0.5 ? '½' : '¼');
const COND_TAG = { fill: 'F', '!fill': '!F' };

function renderSeq() {
  seqEl.innerHTML = '';
  st.tracks.forEach((tr, ti) => {
    const row = document.createElement('div');
    row.className = 'trk' + (ti === curTrack ? ' sel' : '');
    const head = document.createElement('div');
    head.className = 'trkHead';
    const L = tlenOf(ti);
    const lenHint = (pat().tlen && pat().tlen[ti] && pat().tlen[ti] !== pat().len) ? `<span class="tlenHint">${L}</span>` : '';
    head.innerHTML = `<span class="trkDot" style="background:${tr.color}"></span>
      <span class="trkName">${tr.name}</span>${lenHint}
      <button class="trkBtn m${tr.mute ? ' on' : ''}">M</button>
      <button class="trkBtn s${tr.solo ? ' on' : ''}">S</button>
      <input class="trkLvl" type="range" min="0" max="1" step="0.01" value="${tr.level}">`;
    head.onclick = e => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      selectTrack(ti);
    };
    head.ondblclick = e => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      const name = prompt('Spornavn:', tr.name);
      if (name && name.trim()) { tr.name = name.trim().toUpperCase().slice(0, 12); persist(); renderSeq(); renderPanel(); }
    };
    head.oncontextmenu = e => { e.preventDefault(); selectTrack(ti); openTrackMenu(e, ti); };
    head.querySelector('.m').onclick = () => { tr.mute = !tr.mute; persist(); renderSeq(); player.refreshTrackGains(); };
    head.querySelector('.s').onclick = () => { tr.solo = !tr.solo; persist(); renderSeq(); player.refreshTrackGains(); };
    head.querySelector('.trkLvl').oninput = e => { tr.level = +e.target.value; persist(); player.refreshTrackGains(); };
    row.appendChild(head);
    const steps = document.createElement('div');
    steps.className = 'steps';
    const P = pat();
    for (let s = 0; s < L; s++) {
      const b = document.createElement('button');
      const step = P.steps[ti][s];
      b.className = 'stp' + (s % 4 === 0 ? ' q' : '') + (step?.on ? ' on' : '')
        + (step?.on && (step.r ?? 1) > 1 ? ' r' + Math.min(4, step.r) : '')
        + (lockSel && lockSel.tr === ti && lockSel.step === s ? ' locksel' : '');
      b.style.setProperty('--trkcol', tr.color);
      if (step?.on) {
        b.style.opacity = 0.4 + 0.6 * (step.v ?? 1);
        if (step.l) b.innerHTML += '<span class="lockdot"></span>';
        if (step.n) b.innerHTML += `<span class="noteTag">${step.n > 0 ? '+' + step.n : step.n}</span>`;
        if ((step.p ?? 1) < 1) b.innerHTML += `<span class="pTag">${PROB_CHAR(step.p)}</span>`;
        if (step.c) b.innerHTML += `<span class="condTag">${COND_TAG[step.c] || step.c}</span>`;
      }
      // lodret traek paa et taendt step = velocity
      b.onpointerdown = e => {
        const stp = P.steps[ti][s];
        if (!stp?.on) return;
        velDrag = { ti, s, startY: e.clientY, startV: stp.v ?? 1, moved: false, btn: b };
        try { b.setPointerCapture(e.pointerId); } catch (err) {}
      };
      b.onpointermove = e => {
        if (!velDrag || velDrag.btn !== b) return;
        const dy = velDrag.startY - e.clientY;
        if (!velDrag.moved && Math.abs(dy) < 5) return;
        velDrag.moved = true;
        const stp = pat().steps[velDrag.ti][velDrag.s];
        if (!stp) return;
        stp.v = Math.max(0.05, Math.min(1, velDrag.startV + dy / 90));
        b.style.opacity = 0.4 + 0.6 * stp.v;
      };
      const endDrag = () => {
        if (velDrag?.btn === b) {
          if (velDrag.moved) { suppressClick = true; persist(); if (lockSel) renderPanel(); }
          velDrag = null;
        }
      };
      b.onpointerup = endDrag;
      b.onpointercancel = endDrag;
      b.onclick = e => {
        if (suppressClick) { suppressClick = false; return; }
        const stp = P.steps[ti][s];
        if (e.altKey && stp?.on) {                // alt-klik: chance-cyklus 100→75→50→25
          stp.p = PROB_CYCLE[stp.p ?? 1] ?? 1;
          if (stp.p === 1) delete stp.p;
          persist(); renderSeq(); return;
        }
        if (e.shiftKey) {                         // shift-klik: blødt slag
          P.steps[ti][s] = stp?.on ? null : stepOn(0.55);
        } else if (stp?.on) {
          P.steps[ti][s] = null;
          if (lockSel && lockSel.tr === ti && lockSel.step === s) { lockSel = null; }
        } else {
          P.steps[ti][s] = stepOn();
        }
        persist(); renderSeq(); renderPanel(); renderPatternChips();
      };
      b.oncontextmenu = e => {                    // højreklik: p-lock/step-redigering
        e.preventDefault();
        if (!P.steps[ti][s]?.on) P.steps[ti][s] = stepOn();
        curTrack = ti;
        lockSel = { tr: ti, step: s };
        persist(); renderSeq(); renderPanel();
      };
      steps.appendChild(b);
    }
    row.appendChild(steps);
    seqEl.appendChild(row);
  });
}
function selectTrack(ti) {
  if (curTrack !== ti) lockSel = null;
  curTrack = ti;
  renderSeq(); renderPanel();
}
function exitLock() {
  lockSel = null;
  renderSeq(); renderPanel();
}

// ---------- spor-vaerktoejer (euclid, rotate, spejl, tilfaeldig) ----------
function trackRow(ti) { const P = pat(); return { P, row: P.steps[ti], L: tlenOf(ti, P) }; }
function rotateTrack(ti, dir) {
  const { row, L } = trackRow(ti);
  const seg = row.slice(0, L);
  const ns = dir > 0 ? [seg[L - 1], ...seg.slice(0, L - 1)] : [...seg.slice(1), seg[0]];
  for (let i = 0; i < L; i++) row[i] = ns[i];
  persist(); renderSeq(); renderPatternChips();
}
function mirrorTrack(ti) {
  const { row, L } = trackRow(ti);
  const seg = row.slice(0, L).reverse();
  for (let i = 0; i < L; i++) row[i] = seg[i];
  persist(); renderSeq(); renderPatternChips();
}
function randomTrack(ti) {
  const { row, L } = trackRow(ti);
  for (let i = 0; i < L; i++) row[i] = Math.random() < 0.4 ? stepOn(0.4 + Math.random() * 0.6) : null;
  persist(); renderSeq(); renderPatternChips();
}
function clearTrack(ti) {
  const { row } = trackRow(ti);
  for (let i = 0; i < MAX_STEPS; i++) row[i] = null;
  persist(); renderSeq(); renderPatternChips();
}
function euclidTrack(ti, k, rot) {
  const { row, L } = trackRow(ti);
  for (let i = 0; i < L; i++) {
    const j = ((i - rot) % L + L) % L;
    row[i] = (j * k) % L < k ? stepOn(0.9) : null;
  }
  renderSeq(); renderPatternChips();
}

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
  m.style.left = Math.min(ev.clientX, innerWidth - 200) + 'px';
  m.style.top = Math.min(ev.clientY, innerHeight - 60 - items.length * 28) + 'px';
  document.body.appendChild(m);
  ctxMenuEl = m;
}
function openTrackMenu(e, ti) {
  menuAt(e, [
    ['EUCLID…', () => openEuclid(e, ti)],
    ['ROTÉR ◀', () => rotateTrack(ti, -1)],
    ['ROTÉR ▶', () => rotateTrack(ti, 1)],
    ['SPEJLVEND', () => mirrorTrack(ti)],
    ['TILFÆLDIGT MØNSTER', () => randomTrack(ti)],
    ['RYD SPOR', () => clearTrack(ti)],
  ]);
}
function openEuclid(e, ti) {
  closeMenus();
  const { L } = trackRow(ti);
  const before = snapshot(pat().steps[ti]);
  const pop = document.createElement('div');
  pop.id = 'eucPop';
  pop.innerHTML = `<div class="eucTitle">EUCLID · ${st.tracks[ti].name}</div>
    <label>SLAG <input id="eucK" type="range" min="1" max="${L}" step="1" value="4"> <b id="eucKV">4</b></label>
    <label>DREJ <input id="eucR" type="range" min="0" max="${L - 1}" step="1" value="0"> <b id="eucRV">0</b></label>
    <div class="eucBtns"><button id="eucOk">OK</button><button id="eucCancel">ANNULLER</button></div>`;
  pop.style.left = Math.min(e.clientX, innerWidth - 240) + 'px';
  pop.style.top = Math.min(e.clientY, innerHeight - 170) + 'px';
  document.body.appendChild(pop);
  pop.onpointerdown = ev => ev.stopPropagation();
  const apply = () => {
    const k = +pop.querySelector('#eucK').value, r = +pop.querySelector('#eucR').value;
    pop.querySelector('#eucKV').textContent = k;
    pop.querySelector('#eucRV').textContent = r;
    euclidTrack(ti, k, r);
  };
  pop.querySelector('#eucK').oninput = apply;
  pop.querySelector('#eucR').oninput = apply;
  pop.querySelector('#eucOk').onclick = () => { persist(); pop.remove(); toast('Euclid lagt på ' + st.tracks[ti].name); };
  pop.querySelector('#eucCancel').onclick = () => {
    pat().steps[ti] = before;
    pop.remove(); renderSeq(); renderPatternChips();
  };
  apply();
}

// ---------- lyd-panel ----------
function curPatch() { return st.tracks[curTrack].patch; }
function lockStepObj() {
  if (!lockSel) return null;
  return st.patterns[st.curPattern].steps[lockSel.tr][lockSel.step];
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
  const P = pat();
  $('tlenVal').textContent = tlenOf(curTrack);
  $('tlenBox').classList.toggle('custom', !!(P.tlen[curTrack] && P.tlen[curTrack] !== P.len));
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
      v => { ls.v = v; persist(); }, () => renderSeq()));
    g.appendChild(sliderRow('CHANCE', 0.05, 1, 0.05, ls.p ?? 1, pct, false,
      v => { if (v >= 1) delete ls.p; else ls.p = v; persist(); }, () => renderSeq()));
    const rr = optsRow('ldstRow', [1, 2, 3, 4], ['RAT —', '2', '3', '4'],
      () => ls.r ?? 1, v => { if (v <= 1) delete ls.r; else ls.r = v; persist(); renderSeq(); });
    g.appendChild(rr);
    const cr = optsRow('ldstRow', [null, '1:2', '2:2', '1:4', '4:4', 'fill', '!fill'],
      ['—', '1:2', '2:2', '1:4', '4:4', 'FILL', '!FILL'],
      () => ls.c ?? null, v => { if (!v) delete ls.c; else ls.c = v; persist(); renderSeq(); });
    g.appendChild(cr);
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
      () => { auditionSoft(); renderSeq(); });
    const inp = row.querySelector('input');
    const baseOnInput = inp.oninput;
    inp.oninput = () => { baseOnInput(); row.classList.toggle('locked', pIsLocked(d.k)); };
    g.appendChild(row);
  }
  renderPresets();
}
let audT = 0;
function auditionSoft() {
  const now = Date.now();
  if (now - audT < 150) return;
  audT = now;
  player.audition(curTrack, lockSel ? lockStepObj() : null);
}
function renderPresets() {
  const el = $('presetRow');
  el.innerHTML = '';
  for (const pr of PRESETS) {
    const b = document.createElement('button');
    b.className = 'presetBtn';
    b.textContent = pr.n;
    b.onclick = () => {
      st.tracks[curTrack].patch = { ...pr.p };
      if (!lockSel) st.tracks[curTrack].name = pr.n.slice(0, 12);
      lockSel = null;
      persist(); renderSeq(); renderPanel();
      player.audition(curTrack);
    };
    el.appendChild(b);
  }
}
$('audition').onclick = () => player.audition(curTrack, lockSel ? lockStepObj() : null);
$('lockClear').onclick = () => {
  const s = lockStepObj();
  if (s) { s.l = null; delete s.p; delete s.r; delete s.c; }
  persist(); renderSeq(); renderPanel();
};
$('lockExit').onclick = () => exitLock();
$('tlenDec').onclick = () => bumpTlen(-1);
$('tlenInc').onclick = () => bumpTlen(1);
function bumpTlen(d) {
  const P = pat();
  const cur = tlenOf(curTrack);
  const next = Math.max(1, Math.min(MAX_STEPS, cur + d));
  P.tlen[curTrack] = next === P.len ? null : next;
  persist(); renderSeq(); renderPanel();
}

// ---------- patterns ----------
function patternHasData(p) { return p.steps.some(row => row.some(s => s?.on)); }
function trackHasData(pIdx, ti) { return st.patterns[pIdx].steps[ti].some(s => s?.on); }
function renderPatternChips() {
  const el = $('patternChips');
  el.innerHTML = '';
  st.patterns.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'patChip' + (i === st.curPattern ? ' cur' : '') + (patternHasData(p) ? ' hasData' : '')
      + (st._queuedPattern === i ? ' queued' : '');
    b.textContent = PATTERN_NAMES[i];
    b.onclick = () => {
      if (player.playing && st.mode === 'pattern' && i !== st.curPattern) {
        st._queuedPattern = (st._queuedPattern === i) ? null : i;
        renderPatternChips();
        return;
      }
      st._queuedPattern = null;
      st.curPattern = i; lockSel = null; persist(); renderAll();
    };
    el.appendChild(b);
  });
  $('patLen').textContent = pat().len;
}
$('patLen').onclick = () => {
  const P = pat();
  P.len = P.len === 16 ? 32 : 16;
  persist(); renderSeq(); renderPatternChips(); renderPanel();
};
$('patCopy').onclick = () => { clipboardPat = snapshot(pat()); toast('Pattern kopieret'); };
$('patPaste').onclick = () => {
  if (!clipboardPat) { toast('Intet kopieret endnu', true); return; }
  st.patterns[st.curPattern] = snapshot(clipboardPat);
  persist(); renderAll();
  toast('Pattern sat ind');
};
$('patClear').onclick = () => {
  if (!confirm(`Ryd pattern ${PATTERN_NAMES[st.curPattern]}?`)) return;
  st.patterns[st.curPattern] = emptyPattern();
  persist(); renderAll();
};

// ---------- ARRANGEMENT (frie clips pr. spor, Ableton-model) ----------
let curView = 'seq';
let arrZoom = 1;
let selClip = null;         // id paa valgt clip
let clipSeq = 1;
let lastViewSteps = 16 * 16;
function newClipId() { return 'c' + Date.now().toString(36) + (clipSeq++); }
function viewSteps() { return arrLenSteps(st) + 4 * BAR; } // altid lidt luft til hoejre
function fmtDur(sec) { return Math.floor(sec / 60) + ':' + String(Math.round(sec % 60)).padStart(2, '0'); }
function toggleView(v) {
  curView = v || (curView === 'seq' ? 'arr' : 'seq');
  $('seq').hidden = curView !== 'seq';
  $('arr').hidden = curView !== 'arr';
  $('viewToggle').textContent = curView === 'seq' ? '⇄ ARRANGEMENT' : '⇄ STEP-GRID';
  $('viewToggle').classList.toggle('on', curView === 'arr');
  if (curView === 'arr') renderArr();
}
$('viewToggle').onclick = () => toggleView();

// mini-preview af et spors loop som SVG-baggrund (gentages pr. loop via background-size)
function trackMarksURI(ti, pIdx, color) {
  const P = st.patterns[pIdx];
  const L = (P.tlen && P.tlen[ti]) || P.len;
  let rects = '';
  for (let s = 0; s < L; s++) {
    const stp = P.steps[ti][s];
    if (!stp?.on) continue;
    const h = 3.5 + 5.5 * (stp.v ?? 1);
    rects += `<rect x="${s + 0.14}" y="${(12 - h) / 2}" width="0.72" height="${h}" rx="0.2"/>`;
  }
  if (!rects) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} 12" preserveAspectRatio="none"><g fill="${color}">${rects}</g></svg>`;
  return { uri: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, L };
}
// spil herfra (takt): startmarkoer + kvantiseret hop hvis der spilles
function seekBar(bar) {
  st._startBar = bar;
  if (st.mode !== 'song') { st.mode = 'song'; persist(); }
  if (player.playing) {
    player.jumpTo(bar * BAR);
    toast('Hopper til takt ' + (bar + 1) + ' ved næste takt-grænse');
  }
  renderSongUI();
}
// Ableton-overskrivning: en placeret clip trimmer/spalter det, den lander oven i
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
function addClip(tr, atBar, lenBars, p, extra = {}) {
  const c = { id: newClipId(), tr, at: atBar * BAR, len: lenBars * BAR, p, ...extra };
  placeClip(c);
  return c;
}
// + TILFØJ: laeg det aktuelle pattern ind som clips paa alle spor med indhold (4 takter, bagest)
$('songAdd').onclick = () => {
  const atBar = arrLenSteps(st) / BAR === 1 && !st.arr.clips.length ? 0 : Math.ceil(arrLenSteps(st) / BAR);
  const startBar = st.arr.clips.length ? atBar : 0;
  let added = 0;
  for (let tr = 0; tr < 8; tr++) {
    if (!trackHasData(st.curPattern, tr)) continue;
    addClip(tr, startBar, 4, st.curPattern);
    added++;
  }
  if (!added) { toast('Pattern ' + PATTERN_NAMES[st.curPattern] + ' er tomt — læg steps i det først', true); return; }
  persist(); renderSongUI();
  toast('Pattern ' + PATTERN_NAMES[st.curPattern] + ' lagt ind som ' + added + ' clips (4 takter)');
  if (curView !== 'arr') toggleView('arr');
};
$('songLoopBtn').onclick = () => { st.songLoop = !st.songLoop; persist(); renderSongUI(); };
$('modePattern').onclick = () => { st.mode = 'pattern'; persist(); renderSongUI(); };
$('modeSong').onclick = () => {
  if (!st.arr.clips.length) { toast('Arrangementet er tomt — tryk + TILFØJ eller ● JAM, eller byg med Tab', true); return; }
  st.mode = 'song';
  persist(); renderSongUI();
};
function renderSongUI() {
  $('modePattern').className = st.mode === 'pattern' ? 'on' : '';
  $('modeSong').className = st.mode === 'song' ? 'on' : '';
  $('songLoopBtn').className = st.songLoop ? 'on' : '';
  $('songChain').innerHTML = st.arr.clips.length
    ? `<span class="arrSum">${Math.ceil(arrLenSteps(st) / BAR)} takter · ${st.arr.clips.length} clips · ${fmtDur(songDurationSec(st))}</span>`
    : '';
  if (curView === 'arr') renderArr();
}
// clip-editor
function openClipEditor(ev, clip) {
  closeMenus();
  const tr = st.tracks[clip.tr];
  const pop = document.createElement('div');
  pop.id = 'clipPop';
  const srcBtns = PATTERN_NAMES.map((nm, pi) =>
    `<button class="srcBtn" data-p="${pi}" ${trackHasData(pi, clip.tr) ? '' : 'disabled'}>${nm}</button>`).join('');
  pop.innerHTML = `<div class="eucTitle" style="color:${tr.color}">${tr.name} · TAKT ${clip.at / BAR + 1}</div>
    <div class="entRow"><span class="plabel">KILDE</span><div class="srcRow">${srcBtns}</div></div>
    <label>LÆNGDE <button id="clD">−</button> <b id="clV"></b> <button id="clI">+</button> <span style="color:var(--dim)">takter</span></label>
    <label>TONE <input id="cpN" type="range" min="-24" max="24" step="1"> <b id="cpNV"></b></label>
    <label>NIVEAU <input id="cpL" type="range" min="0.05" max="1" step="0.01"> <b id="cpLV"></b></label>
    <label>CUTOFF <input id="cpC" type="range" min="0" max="1" step="0.01"> <b id="cpCV"></b> <button id="cpCX">✕</button></label>
    <div class="eucBtns"><button id="cpSplit">✂ SPLIT</button><button id="cpDup">⧉</button><button id="cpDel">✕ SLET</button><button id="cpClose">LUK</button></div>`;
  pop.style.left = Math.min(ev.clientX - 30, innerWidth - 290) + 'px';
  pop.style.top = Math.min(ev.clientY + 12, innerHeight - 260) + 'px';
  document.body.appendChild(pop);
  pop.onpointerdown = evt => evt.stopPropagation();
  const q = s => pop.querySelector(s);
  const sync = () => {
    pop.querySelectorAll('.srcBtn').forEach(b2 => b2.classList.toggle('on', +b2.dataset.p === clip.p));
    q('#clV').textContent = clip.len / BAR;
    q('#cpN').value = clip.n ?? 0;
    q('#cpNV').textContent = (clip.n ?? 0) > 0 ? '+' + clip.n : (clip.n ?? 0);
    q('#cpL').value = clip.lvl ?? 1;
    q('#cpLV').textContent = Math.round((clip.lvl ?? 1) * 100) + '%';
    const hasCut = clip.cut != null;
    q('#cpC').value = hasCut ? clip.cut : 0.8;
    q('#cpC').classList.toggle('unset', !hasCut);
    q('#cpCV').textContent = hasCut ? Math.round(clip.cut * 100) + '%' : '—';
    persist(); renderSongUI();
  };
  pop.querySelectorAll('.srcBtn').forEach(b2 => { b2.onclick = () => { clip.p = +b2.dataset.p; sync(); }; });
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
    selClip = null;
    persist(); renderSongUI(); pop.remove();
  };
  q('#cpClose').onclick = () => pop.remove();
  sync();
}
// markoer/tempo/fx-menu paa en takt
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
  // vaerktoejslinje
  const tb = document.createElement('div');
  tb.id = 'arrTb';
  const hasLoop = st.arr.loopA != null && st.arr.loopB != null;
  tb.innerHTML = `<span id="arrInfo">${st.arr.clips.length ? Math.ceil(arrLenSteps(st) / BAR) + ' takter · ' + st.arr.clips.length + ' clips · ' + fmtDur(songDurationSec(st)) : 'Tomt arrangement — dobbeltklik på en bane for at lægge en clip'}</span>`
    + (hasLoop ? `<span id="arrLoopInfo">⟳ LOOP TAKT ${st.arr.loopA + 1}–${st.arr.loopB}</span><button id="arrLoopClr">RYD</button>` : '')
    + `<span class="sp"></span><button id="arrZoomOut" title="Zoom ud">−</button><b id="arrZoomV">${Math.round(arrZoom * 100)}%</b><button id="arrZoomIn" title="Zoom ind">+</button>`;
  el.appendChild(tb);
  tb.querySelector('#arrZoomIn').onclick = () => { arrZoom = Math.min(8, arrZoom * 1.4); renderArr(); };
  tb.querySelector('#arrZoomOut').onclick = () => { arrZoom = Math.max(1, arrZoom / 1.4); renderArr(); };
  const lc = tb.querySelector('#arrLoopClr');
  if (lc) lc.onclick = () => { st.arr.loopA = null; st.arr.loopB = null; persist(); renderSongUI(); };
  // overview-strip
  const mini = document.createElement('div');
  mini.id = 'arrMini';
  for (const c of st.arr.clips) {
    const seg = document.createElement('div');
    seg.className = 'miniClip';
    seg.style.left = xPct(c.at) + '%';
    seg.style.width = xPct(c.len) + '%';
    seg.style.top = (c.tr / 8 * 100) + '%';
    seg.style.background = st.tracks[c.tr].color;
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
  // scroller + zoombar wrap
  const scroller = document.createElement('div');
  scroller.id = 'arrScroll';
  const wrap = document.createElement('div');
  wrap.id = 'arrWrap';
  wrap.style.width = (arrZoom * 100) + '%';
  // MARKØR-raekke: navne, tempo, riser/boom — dobbeltklik = tilfoej, hoejreklik flag = slet
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
  mkLane.oncontextmenu = ev => {
    if (ev.target !== mkLane) return;
    ev.preventDefault();
    const r = mkLane.getBoundingClientRect();
    markerMenu(ev, Math.floor((ev.clientX - r.left) / r.width * totalBars));
  };
  mkRow.appendChild(mkLane);
  wrap.appendChild(mkRow);
  // LINJAL: takt-felter — klik = spil herfra · traek = loop · dbl = ryd loop
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
  // SPOR-BANER med frie clips
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
    lane.style.backgroundSize = (100 / totalBars) + '% 100%'; // takt-grid
    // dobbeltklik paa tom bane = ny clip med det aktuelle pattern
    lane.ondblclick = ev => {
      if (ev.target !== lane) return;
      if (!trackHasData(st.curPattern, ti)) { toast('Pattern ' + PATTERN_NAMES[st.curPattern] + ' har intet på ' + tr.name, true); return; }
      const r = lane.getBoundingClientRect();
      if (!r.width) return;
      const bar = Math.floor((ev.clientX - r.left) / r.width * totalBars);
      const c = addClip(ti, bar, 4, st.curPattern);
      selClip = c.id;
      persist(); renderSongUI();
    };
    for (const c of st.arr.clips.filter(x => x.tr === ti)) {
      const elC = document.createElement('button');
      elC.className = 'arrClip' + (selClip === c.id ? ' sel' : '');
      elC.style.left = xPct(c.at) + '%';
      elC.style.width = xPct(c.len) + '%';
      elC.style.background = tr.color;
      const mk = trackMarksURI(ti, c.p, '#0b0b0d');
      if (mk) {
        elC.style.backgroundImage = mk.uri;
        elC.style.backgroundRepeat = 'repeat-x';
        elC.style.backgroundSize = (mk.L / c.len * 100) + '% 100%';
      }
      if ((c.lvl ?? 1) < 0.95) elC.style.opacity = 0.35 + 0.65 * c.lvl;
      const badges = [PATTERN_NAMES[c.p]];
      if (c.n) badges.push((c.n > 0 ? '+' : '') + c.n);
      if (c.cut != null) badges.push('FLT');
      elC.innerHTML = `<span class="cellBadge">${badges.join(' ')}</span>`;
      elC.title = `${tr.name} · pattern ${PATTERN_NAMES[c.p]} · ${c.len / BAR} takter — træk: flyt (alt: kopiér) · kanter: længde · dobbeltklik/højreklik: redigér · Delete: slet`;
      // pointer: flyt / resize venstre/hoejre kant / alt-kopiér
      let cd = null;
      elC.onpointerdown = ev => {
        if (ev.button !== 0) return;
        ev.stopPropagation();
        const r = elC.getBoundingClientRect();
        const laneR = lane.getBoundingClientRect();
        const pxPerStep = laneR.width / total;
        let mode = 'move';
        if (ev.clientX < r.left + 9) mode = 'l';
        else if (ev.clientX > r.right - 9) mode = 'r';
        cd = { mode, x0: ev.clientX, at0: c.at, len0: c.len, pxPerStep, moved: false };
        selClip = c.id;
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
        if (!d.moved) { persist(); renderSongUI(); return; } // klik = valgt
        if (d.mode === 'move') {
          if (ev && ev.altKey) {
            placeClip({ ...snapshot(c), id: newClipId(), at: d.newAt ?? c.at });
            toast('Clip kopieret');
          } else {
            c.at = d.newAt ?? c.at;
            placeClip(c);
          }
        } else {
          if (d.newAt != null) c.at = d.newAt;
          if (d.newLen != null) c.len = d.newLen;
          placeClip(c);
        }
        persist(); renderSongUI();
      };
      elC.onpointerup = endC;
      elC.onpointercancel = () => endC(null);
      elC.ondblclick = ev => { ev.stopPropagation(); openClipEditor(ev, c); };
      elC.oncontextmenu = ev => { ev.preventDefault(); selClip = c.id; openClipEditor(ev, c); };
      lane.appendChild(elC);
    }
    row.appendChild(lane);
    wrap.appendChild(row);
  });
  // AUTOMATIONS-BANER: frie punkter — klik/traek = saet/flyt, dobbeltklik paa punkt = fjern
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
  // playhead
  const ph = document.createElement('div');
  ph.id = 'arrPlayhead';
  ph.hidden = true;
  wrap.appendChild(ph);
  scroller.appendChild(wrap);
  el.appendChild(scroller);
  const hint = document.createElement('div');
  hint.id = 'arrHint';
  hint.textContent = 'Clips: træk = flyt (alt = kopiér) · kanter = længde · dobbeltklik/højreklik = redigér (kilde, tone, niveau, filter, split) · Delete = slet valgt · Dobbeltklik på tom bane = ny clip med valgt pattern · Linjal: klik = spil herfra, træk = loop · Markør-række: dobbeltklik = markør/tempo/riser/boom · Baner: klik/træk = automation-punkter · Tab = steps';
  el.appendChild(hint);
}

// ---------- transport ----------
const playBtn = $('playBtn');
function togglePlay() {
  if (player.playing) {
    player.stop();
    playBtn.textContent = '►';
    playBtn.classList.remove('playing');
    clearPlayLEDs();
  } else {
    player.play(st.mode === 'song' ? (st._startBar ?? 0) * BAR : 0);
    playBtn.textContent = '■';
    playBtn.classList.add('playing');
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
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && curView === 'arr' && selClip) {
    st.arr.clips = st.arr.clips.filter(x => x.id !== selClip);
    selClip = null;
    persist(); renderSongUI();
    return;
  }
  if (e.shiftKey && /^Digit[1-8]$/.test(e.code)) {          // shift+1-8 = mute-toggle (performance)
    const i = +e.code.slice(5) - 1;
    st.tracks[i].mute = !st.tracks[i].mute;
    persist(); renderSeq(); player.refreshTrackGains();
    return;
  }
  if (e.key >= '1' && e.key <= '8') selectTrack(+e.key - 1);
  if ((e.key === 'f' || e.key === 'F') && !e.repeat) setFill(true);
  if (e.key === 'Tab') { e.preventDefault(); toggleView(); }   // som i Ableton
  if (e.key === 'Escape') { if (lockSel) exitLock(); closeMenus(); }
});
window.addEventListener('keyup', e => {
  if (e.key === 'f' || e.key === 'F') setFill(false);
});
$('bpm').oninput = e => { st.bpm = Math.max(60, Math.min(200, +e.target.value || 132)); persist(); };
$('swing').oninput = e => { st.swing = +e.target.value; $('swingVal').textContent = Math.round(st.swing * 100) + '%'; persist(); };
$('pump').oninput = e => { st.pumpFx = +e.target.value; $('pumpVal').textContent = Math.round(st.pumpFx * 100) + '%'; persist(); };
$('mFilter').oninput = e => { st.masterFilter = +e.target.value; $('mFilterVal').textContent = mfLabel(); persist(); };
$('mFilter').ondblclick = () => { st.masterFilter = 0.5; $('mFilter').value = 0.5; $('mFilterVal').textContent = mfLabel(); persist(); };
$('mVol').oninput = e => { st.masterVol = +e.target.value; persist(); };
function mfLabel() {
  const v = st.masterFilter;
  if (Math.abs(v - 0.5) < 0.01) return 'OPEN';
  return v < 0.5 ? 'LP' : 'HP';
}
$('projName').addEventListener('input', () => { st.name = $('projName').value; persist(); });

// ---------- JAM-optagelse: performances fanges som clips i arrangementet ----------
let jam = null;
$('jamBtn').onclick = () => {
  if (jam) { finishJam(); return; }
  if (st.mode !== 'pattern') { st.mode = 'pattern'; persist(); renderSongUI(); }
  jam = { clips: [], open: new Array(8).fill(null), atSteps: 0, lastKey: null };
  jam.timer = setInterval(() => {
    if (!jam) return;
    const pos = player.position();
    if (pos && st.mode === 'pattern' && pos.pattern != null) jamCapture(pos);
  }, 100);
  $('jamBtn').classList.add('on');
  $('jamBtn').textContent = '● JAM…';
  if (!player.playing) togglePlay();
  toast('JAM optager: skift patterns og mutes — tryk ● igen for at gemme som arrangement');
};
function finishJam() {
  clearInterval(jam.timer);
  const { clips, open } = jam;
  for (const c of open) if (c) clips.push(c);
  const atSteps = jam.atSteps;
  jam = null;
  $('jamBtn').classList.remove('on');
  $('jamBtn').textContent = '● JAM';
  if (!clips.length) { toast('Intet optaget endnu', true); return; }
  st.arr = { ...emptyArr(), clips };
  persist(); renderSongUI();
  toast(`Jam gemt som arrangement: ${clips.length} clips over ${Math.ceil(atSteps / BAR)} takter — Tab for at se det`);
}
function jamCapture(pos) {
  const len = st.patterns[pos.pattern].len;
  const key = pos.pattern + ':' + Math.floor(pos.abs / len);
  if (jam.lastKey === key) return;
  jam.lastKey = key;
  for (let tr = 0; tr < 8; tr++) {
    const active = !st.tracks[tr].mute && trackHasData(pos.pattern, tr);
    const o = jam.open[tr];
    if (active) {
      if (o && o.p === pos.pattern) {
        o.len += len;
      } else {
        if (o) jam.clips.push(o);
        jam.open[tr] = { id: newClipId(), tr, at: jam.atSteps, len, p: pos.pattern };
      }
    } else if (o) {
      jam.clips.push(o);
      jam.open[tr] = null;
    }
  }
  jam.atSteps += len;
  $('jamBtn').textContent = `● JAM (${Math.ceil(jam.atSteps / BAR)} takter)`;
}

// spillende kolonne-LED + pattern-chip + arrangement-playhead
let lastLED = null, lastShownPattern = null;
function clearPlayLEDs() {
  document.querySelectorAll('.stp.playcol').forEach(x => x.classList.remove('playcol'));
  document.querySelectorAll('.patChip.playing').forEach(x => x.classList.remove('playing'));
  lastLED = null;
}
function tick() {
  if (lastShownPattern !== st.curPattern) {
    lastShownPattern = st.curPattern;
    renderAll();
  }
  const pos = player.position();
  if (pos) {
    const key = pos.pattern + ':' + pos.abs;
    if (key !== lastLED) {
      lastLED = key;
      document.querySelectorAll('.stp.playcol').forEach(x => x.classList.remove('playcol'));
      if (pos.pattern != null && pos.pattern === st.curPattern) {
        document.querySelectorAll('#seq .trk').forEach((row, ti) => {
          const idx = pos.abs % tlenOf(ti);
          row.querySelector('.steps')?.children[idx]?.classList.add('playcol');
        });
      }
      document.querySelectorAll('.patChip').forEach((c, i) => c.classList.toggle('playing', i === pos.pattern && player.playing));
    }
    // playhead + overview + follow
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
    if (st.mode === 'song') {
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
    st.patterns = Array.from({ length: 8 }, emptyPattern);
    $('projName').value = '';
    persist(); syncTop(); renderAll();
    $('projList').hidden = true;
  };
  const demoBtn = document.createElement('button');
  demoBtn.className = 'open';
  demoBtn.textContent = '+ NYT PROJEKT (TECHNO-STARTER)';
  demoBtn.onclick = () => {
    st = defaultProject();
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
    const what = (st.mode === 'song' && st.arr.clips.length) ? 'song' : 'pattern';
    const wav = await renderWav(st, what);
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
      toast('WAV downloadet: ' + name);
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
  renderPatternChips();
  renderSongUI();   // opdaterer ogsaa arrangement-viewet naar det er synligt
  renderSeq();
  renderPanel();
}
window.__simon = { st: () => st, player };
syncTop();
renderAll();
