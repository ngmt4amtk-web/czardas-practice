import {PHRASES, SECTIONS, MEASURES, pitchLabel} from './score.mjs';
import {engraveSystems} from './system.mjs';
import {shiftsIn, firstStoppedIn, POSITION_NAMES, phraseTitle} from './marks.mjs';
import {PhrasePlayer, phraseTimeline} from './playback.mjs';
import {ViolinAudio} from './audio.mjs';
import {parseRange, segments, phraseFor, stepRange, splitPhrase, MIN_MEASURE, MAX_MEASURE} from './route.mjs';

const $ = id => document.getElementById(id);

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('czardas.v2.' + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('czardas.v2.' + key, JSON.stringify(value));
    } catch {
      /* 保存できない環境では黙って諦める */
    }
  },
};

const state = {
  unit: store.get('unit', 4) === 2 ? 2 : 4,
  range: {start: 1, end: 4},
  index: 0,
  tempo: store.get('tempo', SECTIONS[0].tempo),
  tempoTouched: store.get('tempoTouched', false),
  repeat: store.get('repeat', 'inf'),
  countIn: store.get('countIn', true),
  countPattern: ['1234', '1212', '121hai'].includes(store.get('countPattern', '1234')) ? store.get('countPattern', '1234') : '1234',
  // 音量は 100＝最大（前の版の既定のおよそ3.7倍）。前の版の保存値（既定60）は引き継がない（本人 2026-11-05「音量大きく」）。
  volume: Math.min(100, Math.max(10, Number(store.get('volume2', 100)) || 100)),
  tuning: store.get('tuning', 442),
  activeId: null,
  playing: false,
};

// ---- 範囲の決まり ----
const listFor = () => segments(state.unit);

function titleFor(seg) {
  if (!seg) return '';
  const phrase = phraseFor(seg);
  if (!phrase) return '';
  const parts = state.unit === 2 ? splitPhrase(phrase, 2) : [phrase];
  const which = parts.length > 1 ? (parts[0].start === seg.start ? ' 前半' : ' 後半') : '';
  return phraseTitle(phrase) + which;
}

function sectionTempo(start) {
  const s = SECTIONS.find(x => start >= x.start && start <= x.end);
  return s ? s.tempo : SECTIONS[0].tempo;
}

function setRange(range, {index = null, fromUrl = false} = {}) {
  const start = Math.min(Math.max(range.start, MIN_MEASURE), MAX_MEASURE);
  const end = Math.min(Math.max(range.end, start), MAX_MEASURE);
  state.range = {start, end};
  const list = listFor();
  const found = list.findIndex(s => s.start === start && s.end === end);
  state.index = index !== null ? index : found >= 0 ? found : null;
  state.activeId = null;
  if (!state.tempoTouched) {
    state.tempo = sectionTempo(start);
    $('tempo-value').textContent = String(state.tempo);
  }
  syncUrl();
  paintRange();
  renderShifts();
  render();
  if (!fromUrl) $('picker').hidden = true;
}

function syncUrl() {
  const {start, end} = state.range;
  const want = `?m=${start === end ? start : `${start}-${end}`}`;
  try {
    if (location.search !== want) history.replaceState(null, '', location.pathname + want + location.hash);
  } catch {
    /* ファイルとして開いた時などは変えない */
  }
}

function paintRange() {
  const list = listFor();
  const {start, end} = state.range;
  const inList = state.index !== null && list[state.index];
  const total = list.length;

  if (inList) {
    $('range-title').textContent = state.unit === 2 ? `2小節 ${state.index + 1} / ${total}` : `フレーズ ${state.index + 1} / ${total}`;
    $('range-sub').textContent = `${start}〜${end}小節・${titleFor(inList) || '（題なし）'}`;
  } else {
    $('range-title').textContent = start === end ? `${start}小節（自分で選んだ範囲）` : `${start}〜${end}小節（自分で選んだ範囲）`;
    $('range-sub').textContent = '小節番号をタップすると、その小節だけになります。';
  }

  const prev = stepRange(state.range, list, -1);
  const next = stepRange(state.range, list, 1);
  $('prev').disabled = !prev;
  $('next').disabled = !next;
  $('back-to-phrase').hidden = !!inList;

  $('picker-start').value = String(start);
  $('picker-end').value = String(end);
}

// ---- 楽譜 ----
const hl = new Map();
let systemsEl = null;
let lastSystem = null;

function render() {
  if (!systemsEl) {
    systemsEl = document.createElement('div');
    systemsEl.id = 'systems';
    $('score').appendChild(systemsEl);
  }
  const width = Math.max(280, Math.round((systemsEl.clientWidth || $('score').clientWidth || 360) - 2));
  const svgs = engraveSystems(state.range.start, state.range.end, {
    width,
    activeId: state.activeId,
    showLabels: true,
  });
  systemsEl.innerHTML = svgs.join('');
  hl.clear();
  for (const rect of systemsEl.querySelectorAll('[data-hl]')) {
    const id = rect.getAttribute('data-hl');
    if (!hl.has(id)) hl.set(id, []);
    hl.get(id).push(rect);
  }
  lastSystem = null;
  if (state.activeId) highlight(state.activeId, true);
  paintShiftBadges();
}

function highlight(id, force) {
  if (!force && state.activeId === id) return;
  for (const group of hl.values()) for (const rect of group) rect.setAttribute('opacity', '0');
  state.activeId = id;
  const group = hl.get(id);
  if (!group) return;
  for (const rect of group) rect.setAttribute('opacity', '1');
  const svg = group[0].closest('svg');
  if (svg && svg !== lastSystem) {
    lastSystem = svg;
    const footer = document.querySelector('.controls');
    const bottom = window.innerHeight - (footer ? footer.offsetHeight : 0) - 8;
    const box = svg.getBoundingClientRect();
    if (box.top < 8 || box.bottom > bottom) {
      const target = window.scrollY + box.top - Math.max(8, (bottom - box.height) / 2);
      window.scrollTo({top: Math.max(0, target), behavior: 'smooth'});
    }
  }
}

// ---- この範囲の移動 ----
const shiftArrow = shift => shift.to > shift.from ? '↗' : '↘';
const noteDetail = n => `${n.string}線${n.finger}指 ${pitchLabel(n.pitch)}`;

function renderShifts() {
  const {start, end} = state.range;
  const shifts = shiftsIn(start, end);
  const list = $('shift-list');
  list.replaceChildren();
  // 移動が少ない時は開いておき、多い時は1行に畳んで楽譜を画面に残す（楽譜の札と帯でも分かる）。
  const box = $('shift-box');
  box.open = shifts.length > 0 && shifts.length <= 2;
  box.classList.toggle('empty', !shifts.length);
  if (!shifts.length) {
    const first = firstStoppedIn(start, end);
    const p = document.createElement('p');
    p.className = 'no-shifts';
    const hasSound = MEASURES.slice(start - 1, end).some(m => m.notes.length);
    p.textContent = `移動なし（${first ? `ずっと ${POSITION_NAMES[first.position]}` : hasSound ? '開放弦のみ' : '休符のみ'}）`;
    list.append(p);
    $('shift-title').textContent = `この範囲の移動：${p.textContent}`;
    return;
  }
  $('shift-title').textContent = `この範囲の移動 ${shifts.length}か所`;
  for (const shift of shifts) {
    const n = shift.note;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'shift-row';
    row.dataset.shiftNote = n.id;
    row.textContent = `${n.measure}小節・${n.index + 1}音目 ${pitchLabel(n.pitch)}（${n.string}線${n.finger}指） ${POSITION_NAMES[shift.from]} → ${POSITION_NAMES[shift.to]} ${shiftArrow(shift)}`;
    row.addEventListener('click', () => {
      const badge = systemsEl.querySelector(`.shift[data-note-id="${n.id}"]`);
      badge?.closest('svg').scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    });
    list.append(row);
  }
}

let cueWindows = [];
let cueIds = new Set();
let cueTimer = 0;

function prepareShiftCues() {
  const plan = phraseTimeline(state.range.start, state.range.end, state.tempo);
  const notes = plan.events.filter(ev => ev.kind === 'note');
  const shifts = new Map(shiftsIn(state.range.start, state.range.end).map(s => [s.note.id, s]));
  cueWindows = notes.flatMap((ev, i) => {
    const shift = shifts.get(ev.note.id);
    return shift ? [{shift, start: notes[i - 1]?.time ?? ev.time, end: ev.time + ev.duration}] : [];
  });
}

function paintShiftBadges() {
  for (const badge of systemsEl?.querySelectorAll('.shift') || [])
    badge.classList.toggle('shift-cue-active', cueIds.has(badge.dataset.noteId));
}

function updateShiftCue(time = null) {
  clearTimeout(cueTimer);
  const active = time === null ? [] : cueWindows.filter(w => time >= w.start && time < w.end - .00001);
  cueIds = new Set(active.map(w => w.shift.note.id));
  const banner = $('shift-cue');
  banner.replaceChildren();
  for (const {shift} of active) {
    const row = document.createElement('div');
    row.textContent = `次は移動 ${shiftArrow(shift)}${POSITION_NAMES[shift.to]}（${noteDetail(shift.note)}）`;
    banner.append(row);
  }
  banner.hidden = !active.length;
  paintShiftBadges();
  syncControlsSpace();
  if (active.length) {
    const end = Math.min(...active.map(w => w.end));
    cueTimer = setTimeout(() => updateShiftCue(end), (end - time) * 1000);
  }
}

// 固定操作盤の折り返しや、移動予告の高さも本文の余白へ反映する。
function syncControlsSpace() {
  const height = document.querySelector('.controls').getBoundingClientRect().height;
  document.documentElement.style.setProperty('--controls-height', `${Math.ceil(height)}px`);
}
new ResizeObserver(syncControlsSpace).observe(document.querySelector('.controls'));

// ---- 再生 ----
const audio = new ViolinAudio(
  () => {},
  () => {},
);
const wake = {lock: null};

async function keepAwake() {
  try {
    if ('wakeLock' in navigator) wake.lock = await navigator.wakeLock.request('screen');
  } catch {
    /* 使えない時はそのまま */
  }
}

function releaseAwake() {
  try {
    wake.lock?.release();
  } catch {
    /* 同上 */
  }
  wake.lock = null;
}

const countPatterns = { '1234': ['1','2','3','4'], '1212': ['1','2','1','2'], '121hai': ['1','2','1','ハイ'] };
let countTotal = 4;
function hideCount() { $('count-overlay').hidden = true; }
function showCount(remaining) {
  const pattern = countTotal === 4 ? countPatterns[state.countPattern]
    : state.countPattern === '121hai' ? ['1','ハイ'] : ['1','2'];
  const label = pattern[countTotal - remaining];
  const overlay = $('count-overlay');
  overlay.textContent = label;
  overlay.dataset.beat = String(countTotal - remaining + 1);
  overlay.dataset.total = String(countTotal);
  overlay.classList.toggle('last-beat', remaining === 1);
  overlay.hidden = false;
  setStatus(`カウント ${label}`);
}
const player = new PhrasePlayer(
  audio,
  ev => {
    updateShiftCue(ev.time);
    const note = ev && ev.note;
    if (!note || ev.kind === 'rest') {
      highlight(null);
      return;
    }
    highlight(note.id ?? note.targetId);
  },
  (kind, value) => {
    if (kind === 'loading') { countTotal = 4; hideCount(); setStatus('音を準備しています'); }
    else if (kind === 'count') { updateShiftCue(); showCount(value); }
    else if (kind === 'play') { hideCount(); countTotal = 2; setStatus(value === 1 ? '再生中' : `${value}回目`); }
    else if (kind === 'done') {
      setStatus('終わり');
      stop();
    }
    else if (kind === 'interrupted') {
      stop();
      setStatus('音が止まりました。もう一度「再生」を押してください');
    }
  },
);

function setStatus(text) {
  $('status').textContent = text;
}

async function play() {
  if (state.playing) return;
  state.playing = true;
  $('play').textContent = '■ 止める';
  $('play').classList.add('playing');
  keepAwake();
  prepareShiftCues();
  try {
    await player.start({
      start: state.range.start,
      end: state.range.end,
      bpm: state.tempo,
      tuning: Number(state.tuning),
      volume: Number(state.volume) / 100,
      repeat: state.repeat === 'inf' ? Infinity : Number(state.repeat),
      countIn: state.countIn,
      firstCount: 4,
    });
  } catch (error) {
    stop();
    setStatus(error && error.message ? error.message : '音を出せませんでした');
  }
}

function stop() {
  player.stop();
  hideCount();
  updateShiftCue();
  state.playing = false;
  releaseAwake();
  $('play').textContent = '▶ 再生';
  $('play').classList.remove('playing');
  if ($('status').textContent !== '終わり') setStatus('タップで再生');
  highlight(null);
}

$('play').addEventListener('click', () => (state.playing ? stop() : play()));

// ---- 帯と小節の選択 ----
$('prev').addEventListener('click', () => {
  const r = stepRange(state.range, listFor(), -1);
  if (!r) return;
  stop();
  setRange(r);
});

$('next').addEventListener('click', () => {
  const r = stepRange(state.range, listFor(), 1);
  if (!r) return;
  stop();
  setRange(r);
});

$('back-to-phrase').addEventListener('click', () => {
  const list = listFor();
  const {start, end} = state.range;
  const seg =
    list.find(s => start >= s.start && end <= s.end) ||
    list.find(s => start >= s.start && start <= s.end);
  if (!seg) return;
  stop();
  setRange({start: seg.start, end: seg.end});
});

for (const btn of document.querySelectorAll('.seg-btn')) {
  btn.addEventListener('click', () => {
    const unit = Number(btn.dataset.unit) === 2 ? 2 : 4;
    const wasFirst = state.range.start;
    state.unit = unit;
    store.set('unit', unit);
    for (const b of document.querySelectorAll('.seg-btn')) b.setAttribute('aria-pressed', String(Number(b.dataset.unit) === unit));
    stop();
    const list = listFor();
    const hit = list.findIndex(s => wasFirst >= s.start && wasFirst <= s.end);
    setRange(hit >= 0 ? list[hit] : list[0]);
  });
}

for (const btn of document.querySelectorAll('.seg-btn')) {
  if (Number(btn.dataset.unit) === state.unit) btn.setAttribute('aria-pressed', 'true');
  else btn.setAttribute('aria-pressed', 'false');
}

// 小節を選ぶ
const pickerOpen = $('picker-open');
pickerOpen.addEventListener('click', () => {
  const open = $('picker').hidden;
  $('picker').hidden = !open;
  pickerOpen.setAttribute('aria-expanded', String(open));
});

for (const sel of [$('picker-start'), $('picker-end')]) {
  for (let i = MIN_MEASURE; i <= MAX_MEASURE; i++) {
    sel.appendChild(new Option(String(i), String(i)));
  }
}

$('picker-start').addEventListener('change', () => {
  if (Number($('picker-end').value) < Number($('picker-start').value)) $('picker-end').value = $('picker-start').value;
});
$('picker-end').addEventListener('change', () => {
  if (Number($('picker-end').value) < Number($('picker-start').value)) $('picker-start').value = $('picker-end').value;
});

$('picker-apply').addEventListener('click', () => {
  const start = Number($('picker-start').value);
  const end = Number($('picker-end').value);
  stop();
  setRange({start: Math.min(start, end), end: Math.max(start, end)});
});

// 楽譜の小節番号をタップ → その1小節
$('score').addEventListener('click', event => {
  const bar = event.target.closest('.bar-number');
  if (!bar) return;
  const n = Number(bar.dataset.measure);
  if (!Number.isInteger(n)) return;
  stop();
  setRange({start: n, end: n});
});

// ---- 操作盤 ----
$('repeat').addEventListener('change', e => {
  state.repeat = e.target.value;
  store.set('repeat', state.repeat);
  if (state.playing) {
    stop();
    play();
  }
});

function setTempo(value) {
  state.tempo = Math.min(180, Math.max(30, value));
  state.tempoTouched = true;
  $('tempo-value').textContent = String(state.tempo);
  store.set('tempo', state.tempo);
  store.set('tempoTouched', true);
  if (state.playing) {
    stop();
    play();
  }
}

$('tempo-down').addEventListener('click', () => setTempo(state.tempo - 4));
$('tempo-up').addEventListener('click', () => setTempo(state.tempo + 4));

$('countin').addEventListener('change', e => {
  state.countIn = e.target.checked;
  store.set('countIn', state.countIn);
  if (state.playing) {
    stop();
    play();
  }
});

$('count-pattern').addEventListener('change', e => {
  state.countPattern = e.target.value;
  store.set('countPattern', state.countPattern);
  if (state.playing) { stop(); play(); }
});

$('volume').addEventListener('input', e => {
  state.volume = Number(e.target.value);
  store.set('volume2', state.volume);
  $('volume-value').textContent = String(state.volume);
  player.setVolume(state.volume / 100);
});

$('tuning').addEventListener('change', e => {
  state.tuning = Number(e.target.value);
  store.set('tuning', state.tuning);
});

// ---- 前の版へのリンク ----
$('classic-link').href = location.pathname.includes('/v2/') ? '../classic/' : './classic/';

// ---- 画面 ----
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    lastSystem = null;
    render();
  }, 180);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.playing) stop();
});

// ---- 開始 ----
function boot() {
  $('tempo-value').textContent = String(state.tempo);
  $('repeat').value = state.repeat;
  $('countin').checked = state.countIn;
  $('count-pattern').value = state.countPattern;
  $('volume').value = String(state.volume);
  $('volume-value').textContent = String(state.volume);
  $('tuning').value = String(state.tuning);

  const fromUrl = parseRange(location.search, location.hash);
  const initial = fromUrl || {start: PHRASES[0].start, end: PHRASES[0].end};
  setRange(initial, {fromUrl: true});
  setStatus('タップで再生');
}

boot();
