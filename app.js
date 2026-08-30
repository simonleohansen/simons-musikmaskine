// SIMONS MUSIKMASKINE — UI og tilstand (v2: duck/pump, osc2, ADSR, choke, crush,
// probability, ratchets, conditions, polymeter, FILL, euclid/rotate-vaerktoejer)
import { Player, renderWav, noteName, cutHz } from './engine.js';

const $ = id => document.getElementById(id);
const PATTERN_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const TRACK_COLORS = ['#ff3d5a', '#ff9f2e', '#ffd83d', '#c8ff2e', '#3dffc0', '#3db9ff', '#a06bff', '#ff5ad0'];
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
    v: 2, name: '', bpm: 132, swing: 0.12, masterFilter: 0.5, masterVol: 0.9,
    delayFb: 0.42, delayDiv: 3, pumpFx: 0.4, duckTrack: 0,
    mode: 'pattern', curPattern: 0, song: [], songLoop: true,
    tracks, patterns,
  };
}
// migration: udfyld manglende felter i gamle projekter
function migrate(s) {
  if (!s || !s.tracks || !s.patterns) return null;
  const def = patch();
  s.tracks.forEach(tr => { tr.patch = { ...def, ...tr.patch }; });
  s.patterns.forEach(P => { if (!P.tlen) P.tlen = new Array(8).fill(null); });
  if (s.pumpFx === undefined) s.pumpFx = 0.4;
  if (s.duckTrack === undefined) s.duckTrack = 0;
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
}
window.addEventListener('pointerdown', e => {
  if (ctxMenuEl && !ctxMenuEl.contains(e.target)) closeMenus();
});
function openTrackMenu(e, ti) {
  closeMenus();
  const m = document.createElement('div');
  m.id = 'ctxMenu';
  const items = [
    ['EUCLID…', () => openEuclid(e, ti)],
    ['ROTÉR ◀', () => rotateTrack(ti, -1)],
    ['ROTÉR ▶', () => rotateTrack(ti, 1)],
    ['SPEJLVEND', () => mirrorTrack(ti)],
    ['TILFÆLDIGT MØNSTER', () => randomTrack(ti)],
    ['RYD SPOR', () => clearTrack(ti)],
  ];
  for (const [label, fn] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = ev => { ev.stopPropagation(); closeMenus(); fn(); };
    m.appendChild(b);
  }
  m.style.left = Math.min(e.clientX, innerWidth - 180) + 'px';
  m.style.top = Math.min(e.clientY, innerHeight - 200) + 'px';
  document.body.appendChild(m);
  ctxMenuEl = m;
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
  // spor-laengde-stepper
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
  // STEP-gruppe (kun i lock-tilstand): chance, ratchet, condition, velocity
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
function renderPatternChips() {
  const el = $('patternChips');
  el.innerHTML = '';
  st.patterns.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'patChip' + (i === st.curPattern ? ' cur' : '') + (patternHasData(p) ? ' hasData' : '');
    b.textContent = PATTERN_NAMES[i];
    b.onclick = () => { st.curPattern = i; lockSel = null; persist(); renderAll(); };
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

// ---------- song-mode ----------
function renderSong() {
  $('modePattern').className = st.mode === 'pattern' ? 'on' : '';
  $('modeSong').className = st.mode === 'song' ? 'on' : '';
  $('songLoopBtn').className = st.songLoop ? 'on' : '';
  const el = $('songChain');
  el.innerHTML = '';
  st.song.forEach((pi, i) => {
    const c = document.createElement('button');
    c.className = 'songChip';
    c.innerHTML = `${PATTERN_NAMES[pi]}<span class="x">✕</span>`;
    c.onclick = e => {
      if (e.target.closest('.x')) {
        st.song.splice(i, 1);
      } else {
        st.curPattern = pi;
        lockSel = null;
      }
      persist(); renderAll();
    };
    el.appendChild(c);
  });
}
$('songAdd').onclick = () => { st.song.push(st.curPattern); persist(); renderSong(); };
$('songLoopBtn').onclick = () => { st.songLoop = !st.songLoop; persist(); renderSong(); };
$('modePattern').onclick = () => { st.mode = 'pattern'; persist(); renderSong(); };
$('modeSong').onclick = () => {
  if (!st.song.length) { toast('Tilføj patterns til sangen først (+ TILFØJ)', true); return; }
  st.mode = 'song';
  persist(); renderSong();
};

// ---------- transport ----------
const playBtn = $('playBtn');
function togglePlay() {
  if (player.playing) {
    player.stop();
    playBtn.textContent = '►';
    playBtn.classList.remove('playing');
    clearPlayLEDs();
  } else {
    player.play();
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
  if (e.key >= '1' && e.key <= '8') selectTrack(+e.key - 1);
  if ((e.key === 'f' || e.key === 'F') && !e.repeat) setFill(true);
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

// spillende kolonne-LED + pattern-chip (polymeter: hvert spor sin egen kolonne)
let lastLED = null;
function clearPlayLEDs() {
  document.querySelectorAll('.stp.playcol').forEach(x => x.classList.remove('playcol'));
  document.querySelectorAll('.patChip.playing, .songChip.playing').forEach(x => x.classList.remove('playing'));
  lastLED = null;
}
function tick() {
  const pos = player.position();
  if (pos) {
    const key = pos.pattern + ':' + pos.abs;
    if (key !== lastLED) {
      lastLED = key;
      document.querySelectorAll('.stp.playcol').forEach(x => x.classList.remove('playcol'));
      if (pos.pattern === st.curPattern) {
        document.querySelectorAll('#seq .trk').forEach((row, ti) => {
          const idx = pos.abs % tlenOf(ti);
          row.querySelector('.steps')?.children[idx]?.classList.add('playcol');
        });
      }
      document.querySelectorAll('.patChip').forEach((c, i) => c.classList.toggle('playing', i === pos.pattern && player.playing));
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
    const what = (st.mode === 'song' && st.song.length) ? 'song' : 'pattern';
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
  renderSong();
  renderSeq();
  renderPanel();
}
window.__simon = { st: () => st, player };
syncTop();
renderAll();
