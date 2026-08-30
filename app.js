// SIMONS MUSIKMASKINE — UI og tilstand
import { Player, renderWav, noteName, cutHz, delayTimeSec } from './engine.js';

const $ = id => document.getElementById(id);
const PATTERN_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const TRACK_COLORS = ['#ff3d5a', '#ff9f2e', '#ffd83d', '#c8ff2e', '#3dffc0', '#3db9ff', '#a06bff', '#ff5ad0'];
const MAX_STEPS = 32;

// ---------- patch-parametre (definitionen driver hele panelet) ----------
const PDEF = [
  { g: 'OSC', k: 'wave', type: 'wave' },
  { g: 'OSC', k: 'note', l: 'NOTE', min: 24, max: 96, step: 1, fmt: v => noteName(v) },
  { g: 'OSC', k: 'sub', l: 'SUB', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'OSC', k: 'noise', l: 'NOISE', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'PITCH', k: 'glide', l: 'GLIDE', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'PITCH', k: 'penv', l: 'P.ENV', min: 0, max: 48, step: 1, fmt: v => v + 'st' },
  { g: 'PITCH', k: 'pdec', l: 'P.DEC', min: 0.01, max: 0.5, step: 0.005, fmt: ms },
  { g: 'FILTER', k: 'cut', l: 'CUTOFF', min: 0, max: 1, step: 0.005, fmt: v => hz(cutHz(v)) },
  { g: 'FILTER', k: 'res', l: 'RESO', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'FILTER', k: 'fenv', l: 'F.ENV', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'FILTER', k: 'fdec', l: 'F.DEC', min: 0.02, max: 1, step: 0.005, fmt: ms },
  { g: 'AMP', k: 'att', l: 'ATTACK', min: 0.001, max: 0.3, step: 0.001, fmt: ms },
  { g: 'AMP', k: 'dec', l: 'DECAY', min: 0.03, max: 1.5, step: 0.005, fmt: ms },
  { g: 'AMP', k: 'drive', l: 'DRIVE', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'LFO', k: 'ldst', type: 'ldst' },
  { g: 'LFO', k: 'lrate', l: 'RATE', min: 0.1, max: 24, step: 0.1, fmt: v => v.toFixed(1) + 'Hz' },
  { g: 'LFO', k: 'lamt', l: 'AMT', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'MIX', k: 'pan', l: 'PAN', min: -1, max: 1, step: 0.01, fmt: panFmt },
  { g: 'MIX', k: 'sendD', l: 'DELAY', min: 0, max: 1, step: 0.01, fmt: pct },
  { g: 'MIX', k: 'sendV', l: 'REVERB', min: 0, max: 1, step: 0.01, fmt: pct },
];
function pct(v) { return Math.round(v * 100) + '%'; }
function ms(v) { return v >= 1 ? v.toFixed(2) + 's' : Math.round(v * 1000) + 'ms'; }
function hz(v) { return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v) + ''; }
function panFmt(v) { return Math.abs(v) < 0.02 ? 'C' : (v < 0 ? 'V' : 'H') + Math.round(Math.abs(v) * 100); }

// ---------- presets ----------
function patch(over) {
  return { wave: 'saw', note: 48, sub: 0, noise: 0, glide: 0, penv: 0, pdec: 0.06,
    cut: 0.8, res: 0, fenv: 0, fdec: 0.15, att: 0.002, dec: 0.3, drive: 0,
    lrate: 5, lamt: 0, ldst: 'off', pan: 0, sendD: 0, sendV: 0, ...over };
}
const PRESETS = [
  { n: 'KICK', p: patch({ wave: 'sin', note: 36, penv: 30, pdec: 0.055, dec: 0.34, drive: 0.55, cut: 0.85 }) },
  { n: 'KICK RUMBLE', p: patch({ wave: 'sin', note: 34, penv: 26, pdec: 0.07, dec: 0.6, drive: 0.75, cut: 0.5, sendV: 0.25 }) },
  { n: 'CLAP', p: patch({ wave: 'noise', dec: 0.22, cut: 0.68, res: 0.35, att: 0.008, sendV: 0.18 }) },
  { n: 'SNARE', p: patch({ wave: 'noise', note: 55, noise: 1, dec: 0.16, cut: 0.75, penv: 10, pdec: 0.05 }) },
  { n: 'HAT C', p: patch({ wave: 'noise', dec: 0.05, cut: 0.97, res: 0.2 }) },
  { n: 'HAT O', p: patch({ wave: 'noise', dec: 0.32, cut: 0.95, res: 0.2 }) },
  { n: 'RIDE', p: patch({ wave: 'noise', dec: 0.5, cut: 1, res: 0.55, sendV: 0.12 }) },
  { n: '303 BASS', p: patch({ wave: 'saw', note: 36, glide: 0.35, dec: 0.24, cut: 0.3, res: 0.62, fenv: 0.5, fdec: 0.18, drive: 0.3 }) },
  { n: 'SUB BASS', p: patch({ wave: 'sin', note: 33, sub: 0.6, dec: 0.4, cut: 0.5 }) },
  { n: 'RAVE STAB', p: patch({ wave: 'saw', note: 60, dec: 0.22, cut: 0.6, res: 0.3, fenv: 0.45, fdec: 0.12, sendD: 0.35, sendV: 0.2 }) },
  { n: 'ACID LEAD', p: patch({ wave: 'sqr', note: 60, glide: 0.25, dec: 0.18, cut: 0.35, res: 0.7, fenv: 0.6, fdec: 0.1, sendD: 0.4 }) },
  { n: 'BLEEP', p: patch({ wave: 'sin', note: 84, dec: 0.09, sendD: 0.5 }) },
  { n: 'PERC', p: patch({ wave: 'tri', note: 74, penv: 14, pdec: 0.03, dec: 0.09, sendD: 0.3 }) },
  { n: 'ZAP', p: patch({ wave: 'saw', note: 70, penv: 36, pdec: 0.09, dec: 0.12, drive: 0.4 }) },
  { n: 'NOISE SWEEP', p: patch({ wave: 'noise', att: 0.25, dec: 1.3, cut: 0.55, res: 0.5, fenv: 0.8, fdec: 1.1, sendV: 0.45 }) },
  { n: 'DRONE', p: patch({ wave: 'saw', note: 36, sub: 0.4, att: 0.1, dec: 1.5, cut: 0.35, res: 0.4, lamt: 0.5, lrate: 0.8, ldst: 'cut', sendV: 0.3 }) },
];

// ---------- default-projekt: et taendt techno-groove ----------
function emptyPattern() {
  return { len: 16, steps: Array.from({ length: 8 }, () => new Array(MAX_STEPS).fill(null)) };
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
    { name: 'PERC', patch: { ...PRESETS[12].p } },
    { name: 'SWEEP', patch: { ...PRESETS[14].p } },
  ].map((t, i) => ({ ...t, level: 0.8, mute: false, solo: false, color: TRACK_COLORS[i] }));
  const patterns = Array.from({ length: 8 }, emptyPattern);
  const A = patterns[0];
  for (let s = 0; s < 16; s += 4) A.steps[0][s] = stepOn();                     // kick 4/4
  A.steps[1][4] = stepOn(); A.steps[1][12] = stepOn();                          // clap 2&4
  for (let s = 2; s < 16; s += 4) A.steps[3][s] = stepOn(0.8);                  // åben hat offbeat
  for (let s = 1; s < 16; s += 2) A.steps[2][s] = stepOn(0.6);                  // lukket hat på 16.-dele (rammer swing)
  // 303-linje med note- og filter-locks (p-locks fra start!)
  const bl = [[0, 0], [3, 0], [6, 12], [7, 0], [10, 3], [12, 0], [14, 15]];
  for (const [s, n] of bl) A.steps[4][s] = stepOn(0.9, n, n === 15 ? { cut: 0.55, res: 0.75 } : null);
  A.steps[5][8] = stepOn(0.9, 0, { sendD: 0.5 });                               // stab
  A.steps[6][7] = stepOn(0.7); A.steps[6][15] = stepOn(0.7, 3);                 // perc
  return {
    v: 1, name: '', bpm: 132, swing: 0.12, masterFilter: 0.5, masterVol: 0.9,
    delayFb: 0.42, delayDiv: 3,
    mode: 'pattern', curPattern: 0, song: [], songLoop: true,
    tracks, patterns,
  };
}

// ---------- tilstand ----------
let st = null;
try { st = JSON.parse(localStorage.getItem('simon-project-v1') || 'null'); } catch (e) {}
if (!st || !st.tracks || !st.patterns) st = defaultProject();
let curTrack = 0;
let lockSel = null;        // {tr, step} naar et step p-lock-redigeres
let clipboardPat = null;
const player = new Player(() => st);

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => localStorage.setItem('simon-project-v1', JSON.stringify(st)), 300);
}
function toast(msg, err = false) {
  const t = $('toast');
  t.textContent = msg; t.className = err ? 'err' : ''; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2400);
}

// ---------- sequencer-grid ----------
function pat() { return st.patterns[st.curPattern]; }
const seqEl = $('seq');
function renderSeq() {
  seqEl.innerHTML = '';
  st.tracks.forEach((tr, ti) => {
    const row = document.createElement('div');
    row.className = 'trk' + (ti === curTrack ? ' sel' : '');
    const head = document.createElement('div');
    head.className = 'trkHead';
    head.innerHTML = `<span class="trkDot" style="background:${tr.color}"></span>
      <span class="trkName">${tr.name}</span>
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
    head.querySelector('.m').onclick = () => { tr.mute = !tr.mute; persist(); renderSeq(); player.refreshTrackGains(); };
    head.querySelector('.s').onclick = () => { tr.solo = !tr.solo; persist(); renderSeq(); player.refreshTrackGains(); };
    head.querySelector('.trkLvl').oninput = e => { tr.level = +e.target.value; persist(); player.refreshTrackGains(); };
    row.appendChild(head);
    const steps = document.createElement('div');
    steps.className = 'steps';
    const P = pat();
    for (let s = 0; s < P.len; s++) {
      const b = document.createElement('button');
      const step = P.steps[ti][s];
      b.className = 'stp' + (s % 4 === 0 ? ' q' : '') + (step?.on ? ' on' : '')
        + (step?.on && step.v < 0.75 ? ' soft' : '')
        + (lockSel && lockSel.tr === ti && lockSel.step === s ? ' locksel' : '');
      b.style.setProperty('--trkcol', tr.color);
      if (step?.on && step.l) b.innerHTML += '<span class="lockdot"></span>';
      if (step?.on && step.n) b.innerHTML += `<span class="noteTag">${step.n > 0 ? '+' + step.n : step.n}</span>`;
      b.onclick = e => {
        if (e.shiftKey) {                       // shift-klik: blødt slag
          P.steps[ti][s] = step?.on ? null : stepOn(0.55);
        } else if (step?.on) {
          P.steps[ti][s] = null;
          if (lockSel && lockSel.tr === ti && lockSel.step === s) exitLock();
        } else {
          P.steps[ti][s] = stepOn();
        }
        persist(); renderSeq(); renderPatternChips();
      };
      b.oncontextmenu = e => {                  // højreklik: p-lock-redigering
        e.preventDefault();
        if (!P.steps[ti][s]?.on) P.steps[ti][s] = stepOn();
        selectTrack(ti);
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
  if (curTrack !== ti) exitLock(false);
  curTrack = ti;
  renderSeq(); renderPanel();
}
function exitLock(rerender = true) {
  lockSel = null;
  if (rerender) { renderSeq(); renderPanel(); }
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
function renderPanel() {
  const tr = st.tracks[curTrack];
  $('spTrack').textContent = `${String(curTrack + 1).padStart(2, '0')} · ${tr.name}`;
  $('spTrack').style.color = tr.color;
  $('lockBadge').hidden = !lockSel;
  if (lockSel) $('lockStep').textContent = lockSel.step + 1;
  const el = $('params');
  el.innerHTML = '';
  const groups = {};
  for (const d of PDEF) {
    if (!groups[d.g]) {
      const gEl = document.createElement('div');
      gEl.className = 'pgroup';
      gEl.innerHTML = `<div class="pgTitle">${d.g}</div>`;
      groups[d.g] = gEl;
      el.appendChild(gEl);
    }
    const g = groups[d.g];
    if (d.type === 'wave') {
      const row = document.createElement('div');
      row.className = 'waveRow';
      for (const w of ['saw', 'sqr', 'tri', 'sin', 'noise']) {
        const b = document.createElement('button');
        b.textContent = w.toUpperCase();
        b.className = pGet('wave') === w ? 'on' : '';
        b.onclick = () => { pSet('wave', w); renderPanel(); auditionSoft(); };
        row.appendChild(b);
      }
      g.appendChild(row);
      continue;
    }
    if (d.type === 'ldst') {
      const row = document.createElement('div');
      row.className = 'ldstRow';
      for (const w of ['off', 'pitch', 'cut', 'amp']) {
        const b = document.createElement('button');
        b.textContent = w.toUpperCase();
        b.className = pGet('ldst') === w ? 'on' : '';
        b.onclick = () => { pSet('ldst', w); renderPanel(); };
        row.appendChild(b);
      }
      g.appendChild(row);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'prow' + (pIsLocked(d.k) ? ' locked' : '');
    const val = pGet(d.k);
    row.innerHTML = `<span class="plabel">${d.l}</span>
      <input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${val}">
      <span class="pval">${d.fmt(val)}</span>`;
    const inp = row.querySelector('input');
    inp.oninput = () => {
      const v = +inp.value;
      pSet(d.k, v);
      row.querySelector('.pval').textContent = d.fmt(v);
      row.classList.toggle('locked', pIsLocked(d.k));
    };
    inp.onchange = () => { auditionSoft(); renderSeq(); };
    g.appendChild(row);
  }
  // MIX-gruppen faar ogsaa level
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
      exitLock(false);
      persist(); renderSeq(); renderPanel();
      player.audition(curTrack);
    };
    el.appendChild(b);
  }
}
$('audition').onclick = () => player.audition(curTrack, lockSel ? lockStepObj() : null);
$('lockClear').onclick = () => {
  const s = lockStepObj();
  if (s) s.l = null;
  persist(); renderSeq(); renderPanel();
};
$('lockExit').onclick = () => exitLock();

// ---------- patterns ----------
function patternHasData(p) { return p.steps.some(row => row.some(s => s?.on)); }
function renderPatternChips() {
  const el = $('patternChips');
  el.innerHTML = '';
  st.patterns.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'patChip' + (i === st.curPattern ? ' cur' : '') + (patternHasData(p) ? ' hasData' : '');
    b.textContent = PATTERN_NAMES[i];
    b.onclick = () => { st.curPattern = i; exitLock(false); persist(); renderAll(); };
    el.appendChild(b);
  });
  $('patLen').textContent = pat().len;
}
$('patLen').onclick = () => {
  const P = pat();
  P.len = P.len === 16 ? 32 : 16;
  persist(); renderSeq(); renderPatternChips();
};
$('patCopy').onclick = () => { clipboardPat = JSON.parse(JSON.stringify(pat())); toast('Pattern kopieret'); };
$('patPaste').onclick = () => {
  if (!clipboardPat) { toast('Intet kopieret endnu', true); return; }
  st.patterns[st.curPattern] = JSON.parse(JSON.stringify(clipboardPat));
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
        exitLock(false);
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
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.key >= '1' && e.key <= '8') selectTrack(+e.key - 1);
  if (e.key === 'Escape' && lockSel) exitLock();
});
$('bpm').oninput = e => { st.bpm = Math.max(60, Math.min(200, +e.target.value || 132)); persist(); };
$('swing').oninput = e => { st.swing = +e.target.value; $('swingVal').textContent = Math.round(st.swing * 100) + '%'; persist(); };
$('mFilter').oninput = e => { st.masterFilter = +e.target.value; $('mFilterVal').textContent = mfLabel(); persist(); };
$('mFilter').ondblclick = () => { st.masterFilter = 0.5; $('mFilter').value = 0.5; $('mFilterVal').textContent = mfLabel(); persist(); };
$('mVol').oninput = e => { st.masterVol = +e.target.value; persist(); };
function mfLabel() {
  const v = st.masterFilter;
  if (Math.abs(v - 0.5) < 0.01) return 'OPEN';
  return v < 0.5 ? 'LP' : 'HP';
}
$('projName').addEventListener('input', () => { st.name = $('projName').value; persist(); });

// spillende kolonne-LED + pattern-chip
let lastLED = null;
function clearPlayLEDs() {
  document.querySelectorAll('.stp.playcol').forEach(x => x.classList.remove('playcol'));
  document.querySelectorAll('.patChip.playing, .songChip.playing').forEach(x => x.classList.remove('playing'));
  lastLED = null;
}
function tick() {
  const pos = player.position();
  if (pos) {
    const key = pos.pattern + ':' + pos.step;
    if (key !== lastLED) {
      lastLED = key;
      document.querySelectorAll('.stp.playcol').forEach(x => x.classList.remove('playcol'));
      if (pos.pattern === st.curPattern) {
        document.querySelectorAll('.trk .steps').forEach(row => {
          row.children[pos.step]?.classList.add('playcol');
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
  const snap = JSON.parse(JSON.stringify(st));
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
      st = JSON.parse(JSON.stringify(p.data));
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
