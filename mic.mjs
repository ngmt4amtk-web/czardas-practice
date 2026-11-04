// 小節ごとのマイク測定。画面と判定はバイオリン初段に合わせる（本人 2026-11-05「弦楽器初段みたいな表示形式で」「マイクの測定も初段に合わせて」）。
// 判定の中身は shodan/ の写しをそのまま使い、ここは「どの音を、どの目標で測るか」と画面だけを持つ。
import {STRINGS, pitchLabel} from './score.mjs';
import {parseRange, MAX_MEASURE} from './route.mjs';
import {engraveSystems} from './system.mjs';
import {markFor, positionName} from './marks.mjs';
import {AudioEngine, Microphone, MicJudge, MIC_LEVELS} from './shodan/engine.mjs';
import {pitchFeedback, DIFFICULTIES} from './shodan/intonation.mjs';
import {notesIn, targetOf} from './mic-target.mjs';
import {MicStatusModel, micPanelHTML, paintMicStatus} from './shodan/mic-status.mjs';

const $ = s => document.querySelector(s);
// 既定は緩めの±15¢、感度は最高（本人 2026-11-05「最初からデフォルト緩めでよいしマイク感度みたいなの高めでよい」）。初段の既定は ±8¢・high。
const SENSITIVITY = 'ultra';
const store = {
  get(key, fallback) { try { const v = localStorage.getItem('czardas.v2.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('czardas.v2.' + key, JSON.stringify(value)); } catch {} },
};
const prefs = {
  a4: [440, 441, 442, 443].includes(Number(store.get('tuning', 442))) ? Number(store.get('tuning', 442)) : 442,
  difficulty: Object.hasOwn(DIFFICULTIES, store.get('micDifficulty', 'easy')) ? store.get('micDifficulty', 'easy') : 'easy',
};

const targetFor = n => targetOf(n, prefs);

function fingerText(n) {
  if (n.harmonic) return `ハーモニクス（${n.finger}の指）`;
  return n.finger === 0 ? '開放弦' : `${n.finger}の指 · ${positionName(n)}`;
}
function coachFor(n, previous) {
  const mk = markFor(n) || {}, parts = [];
  if (Number.isFinite(mk.shiftTo) && Number.isFinite(mk.shiftFrom)) parts.push(`手を${mk.position}へ移動。`);
  else if (!previous && n.finger !== 0) parts.push(`${positionName(n)}で始める。`);
  if (n.harmonic) parts.push('指を軽く触れて響かせよう。');
  else if (n.finger === 0) parts.push('指を離して、開放弦を弾こう。');
  if (mk.tiltText) parts.push(`${mk.tiltText}で置く。`);
  if (!parts.length) parts.push('そのままの手の位置で。');
  return parts.join('');
}

const audio = new AudioEngine(), mic = new Microphone(audio), judge = new MicJudge(), micStatus = new MicStatusModel();
let range = parseRange(location.search, location.hash) || {start: 1, end: 1};
let notes = [], practice = null, raf = 0, token = 0, wakeLock = null, toastTimer = 0;

const practiceHref = () => `./?m=${range.start === range.end ? range.start : range.start + '-' + range.end}`;
const rangeLabel = () => range.start === range.end ? `${range.start}小節` : `${range.start}〜${range.end}小節`;
const canGoNext = () => range.start === range.end && range.start < MAX_MEASURE;

function toast(message) { const t = $('#toast'); t.textContent = message; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3000); }
function setUrl() { history.replaceState(null, '', `?m=${range.start === range.end ? range.start : range.start + '-' + range.end}`); }
const scoreWidth = () => Math.max(300, Math.min(760, ($('#noteScore')?.clientWidth || document.documentElement.clientWidth - 32)));

function renderStart(error = '') {
  cleanup();
  notes = notesIn(range.start, range.end);
  document.body.dataset.view = 'start';
  const rest = !notes.length;
  $('#root').innerHTML = `<section class="start-page">
    <a class="back-link" href="${practiceHref()}">‹ 聴いて一緒に弾く</a>
    <h1>${rangeLabel()}の音程を測る</h1>
    <p class="lead">${rest ? 'この小節は休みです。' : `全${notes.length}音。1音ずつ、音が合うまで自分のペースで。`}</p>
    <div class="start-score" id="startScore"></div>
    ${rest ? '' : `<label class="select-field"><span>合格の幅</span><select id="difficulty" aria-label="合格の幅">
      <option value="easy">やさしい ±15¢</option><option value="normal">ふつう ±8¢</option><option value="strict">きびしい ±5¢</option></select></label>
    <button class="primary big" data-action="start">マイクで始める</button>`}
    ${canGoNext() ? '<button class="secondary big" data-action="nextMeasure">次の小節へ →</button>' : ''}
    <p class="error" id="startError">${error}</p>
  </section>`;
  $('#startScore').innerHTML = engraveSystems(range.start, range.end, {width: Math.max(300, Math.min(760, $('#startScore').clientWidth))}).join('');
  const d = $('#difficulty'); if (d) d.value = prefs.difficulty;
}

function renderPractice() {
  document.body.dataset.view = 'practice';
  $('#root').innerHTML = `<section class="performance-viewport with-mic" id="performanceViewport" data-phase="starting">
    <header class="practice-top">
      <button class="icon-button" data-action="exit" aria-label="戻る">‹</button>
      <div class="practice-title"><h1>${rangeLabel()}の音程</h1><p>1音ずつ</p></div>
      <span id="sessionProgress"></span>
    </header>
    <div class="progress"><span id="sessionBar"></span></div>
    <div class="performance-body">
      <section class="music-panel" id="currentNote">
        <div class="playing-head"><span id="phaseLabel">マイクを準備しています</span><span id="barLabel"></span></div>
        <div class="current-and-next">
          <div class="now-label"><strong id="noteHeading"></strong><span id="stringLabel"></span></div>
          <div class="next-label"><small>次は</small><strong id="nextNote"></strong><span id="nextHint"></span></div>
        </div>
        <div class="score-stage"><div id="noteScore"></div></div>
        <div class="timing-row"><div class="duration-copy">音が合うまで、自分のペースで</div></div>
        <div class="note-progress"><span id="noteProgress"></span></div>
      </section>
      <section class="guidance-panel">
        <p id="coachText" aria-live="polite"></p>
        ${micPanelHTML()}
      </section>
    </div>
    <footer class="performance-footer">
      <div class="practice-controls">
        <button class="secondary" data-action="pause" id="pauseBtn">一時停止</button>
        <button class="secondary" data-action="reference" id="referenceBtn">お手本</button>
        <button class="primary" data-action="next" id="nextBtn">手送り →</button>
      </div>
      <div class="below-hint"><span>A=${prefs.a4} · ±${DIFFICULTIES[prefs.difficulty]}¢</span><a href="${practiceHref()}">聴いて一緒に弾く</a></div>
    </footer>
  </section>`;
  updateNote();
  for (const id of ['pauseBtn', 'referenceBtn', 'nextBtn']) $('#' + id).disabled = true;
}

function updateNote() {
  const p = practice; if (!p) return;
  const n = notes[p.index], next = notes[p.index + 1], s = STRINGS[n.string];
  $('#currentNote').style.setProperty('--note-color', s.color);
  $('#noteHeading').textContent = `${s.name}・${pitchLabel(n.pitch)}`;
  $('#stringLabel').textContent = fingerText(n);
  $('#nextNote').textContent = next ? pitchLabel(next.pitch) : 'おしまい';
  $('#nextHint').textContent = next ? `${STRINGS[next.string].name} · ${next.finger === 0 ? '開放' : next.finger + 'の指'}` : '最後の音を、ていねいに。';
  $('#sessionProgress').textContent = `${p.index + 1} / ${notes.length}`;
  $('#sessionBar').style.width = `${p.index / notes.length * 100}%`;
  $('#phaseLabel').textContent = 'この音を、弾いてみよう';
  $('#barLabel').textContent = `${n.measure} 小節目`;
  $('#noteProgress').style.width = '0%';
  $('#coachText').textContent = coachFor(n, notes[p.index - 1]);
  const svgs = engraveSystems(range.start, range.end, {width: scoreWidth(), activeId: n.id, barNumbers: false});
  $('#noteScore').innerHTML = svgs.find(svg => svg.includes(`data-note-id="${n.id}"`)) || svgs[0];
  for (const id of p.passed) document.querySelector(`#noteScore .score-note[data-note-id="${id}"]`)?.classList.add('passed');
  updateMeter(null, n);
  paintMic();
}

function feedback(message, ok = false) {
  const p = practice; if (!p || p.feedback === message) return;
  p.feedback = message; const el = $('#micFeedback'); if (!el) return;
  el.textContent = message; el.classList.toggle('ok', ok);
}

function updateMeter(reading, n, muted = false) {
  const {note, range: target} = targetFor(n), meter = $('#pitchMeter'); if (!meter) return;
  $('#pitchBand').style.left = (50 + target.lowCents) + '%'; $('#pitchBand').style.width = (target.highCents - target.lowCents) + '%';
  meter.dataset.low = target.lowCents; meter.dataset.high = target.highCents;
  $('.pitch-meter').dataset.muted = String(muted);
  const valid = reading?.frequency && !muted;
  $('#pitchNeedle').hidden = !valid;
  if (!valid) { $('#pitchDirection').textContent = ''; $('#pitchCents').textContent = '— ¢'; meter.dataset.direction = ''; feedback(''); return; }
  const value = pitchFeedback(reading.frequency, note, target, prefs.a4);
  $('#pitchNeedle').style.left = (50 + value.position) + '%';
  $('#pitchDirection').textContent = value.centsText ? value.direction : '';
  $('#pitchCents').textContent = value.centsText;
  meter.setAttribute('aria-valuenow', value.position.toFixed(1));
  meter.dataset.direction = value.direction;
  feedback(value.text);
}

function paintMic(nowMs = performance.now()) {
  const p = practice; if (!p || !$('#pitchMeter')) return;
  const r = p.reading || {rms: 0, frequency: null, confidence: 0}, cfg = MIC_LEVELS[SENSITIVITY];
  p.micView = micStatus.update({judgeState: judge.state, cueKind: judge.cueKind, cueDirection: judge.cueDirection, rms: r.rms, soundPresent: r.rms >= cfg.minRms,
    validPitch: !!r.frequency && r.rms >= cfg.minRms && r.confidence >= cfg.confidence, ctxState: audio.ctx ? audio.state : 'running', micHealth: p.recoveryFailed ? 'ended' : mic.health,
    phase: p.phase, pausedReason: p.pausedReason, nowMs, cueStartMs: judge.cueStart, cueEndMs: judge.soundEnd});
  paintMicStatus(document, p.micView);
  $('#pitchMeter').setAttribute('aria-valuetext', p.micView.title);
  $('#nextBtn').disabled = p.phase !== 'playing';
  $('#referenceBtn').disabled = p.phase !== 'playing' || nowMs < judge.soundEnd;
  const muted = p.micView.tone !== 'live';
  $('.pitch-meter').dataset.muted = String(muted);
  if (muted) { feedback(''); $('#pitchNeedle').hidden = true; $('#pitchDirection').textContent = ''; $('#pitchCents').textContent = '— ¢'; }
}

function observeMic(nowMs = performance.now()) {
  const p = practice; if (!p || p.phase !== 'playing') return;
  const n = notes[p.index], r = mic.read(SENSITIVITY), level = Math.min(100, r.rms * 3000); p.reading = r;
  $('#micLevel').style.width = `${level}%`; $('.mic-bar').setAttribute('aria-valuenow', Math.round(level));
  if (audio.state !== 'running' || mic.health !== 'live') { paintMic(nowMs); return; }
  const {range: target} = targetFor(n), result = judge.observe(r, target, nowMs, SENSITIVITY, {correct: true, correction: true});
  $('#performanceViewport').dataset.micState = judge.state;
  if (result === 'correct') {
    updateMeter(r, n); p.passed.add(n.id); p.acceptedAt = audio.time; audio.success();
    feedback('ちょうど。次の音へ進みます', true); $('#noteProgress').style.width = '100%';
  } else if (result === 'wrong') { updateMeter(r, n); audio.correction(target.targetHz); }
  else {
    const cfg = MIC_LEVELS[SENSITIVITY], valid = r.rms >= cfg.minRms && r.confidence >= cfg.confidence;
    if (p.acceptedAt === null || !r.frequency || !valid) updateMeter(valid ? r : null, n, judge.state !== 'listening');
  }
  paintMic(nowMs);
}

function tick() {
  const p = practice; if (!p) return;
  const nowMs = performance.now();
  paintMic(nowMs);
  if (audio.ctx && audio.state !== 'running' && nowMs - p.lastEnsureAt >= 1000) { p.lastEnsureAt = nowMs; void audio.ensureRunning(); }
  if (p.phase !== 'playing' || audio.state !== 'running') { raf = requestAnimationFrame(tick); return; }
  if (p.acceptedAt !== null && audio.time - p.acceptedAt > .5) { advanceNote(); return; }
  if (nowMs - p.lastMicAt >= 60) { p.lastMicAt = nowMs; observeMic(nowMs); }
  if (practice === p) raf = requestAnimationFrame(tick);
}

function advanceNote() {
  const p = practice; if (!p || p.phase !== 'playing') return;
  audio.stop(); judge.cutCue(performance.now());
  if (p.index >= notes.length - 1) { finish(); return; }
  p.index++; p.acceptedAt = null; judge.nextNote(); updateNote();
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}

function finish() {
  const p = practice, all = !!p && notes.every(n => p.passed.has(n.id));
  if (all) audio.complete();
  stopWake(); mic.stop(); cancelAnimationFrame(raf); practice = null;
  document.body.dataset.view = 'start';
  $('#root').innerHTML = `<section class="start-page finish">
    <h1>${all ? `${rangeLabel()}、全部の音が合いました` : `${rangeLabel()}、おしまい`}</h1>
    <p class="lead">${all ? `全${notes.length}音。` : `合った音 ${p ? p.passed.size : 0} / ${notes.length}。手送りした音があります。`}</p>
    <button class="primary big" data-action="start">もう一度</button>
    ${canGoNext() ? '<button class="primary big" data-action="nextMeasureGo">次の小節へ →</button>' : ''}
    <a class="secondary big" href="${practiceHref()}">聴いて一緒に弾く</a>
  </section>`;
}

async function requestWake(me) {
  try {
    const lock = await navigator.wakeLock?.request('screen');
    if (me === token) wakeLock = lock; else lock?.release().catch(() => {}); // 待つ間に止めたら、残さず放す
  } catch {}
}
function stopWake() { wakeLock?.release().catch(() => {}); wakeLock = null; }
function cleanup() { token++; cancelAnimationFrame(raf); audio.stop(); mic.stop(); stopWake(); practice = null; }

async function start() {
  const me = ++token;
  audio.stop(); mic.stop(); notes = notesIn(range.start, range.end);
  judge.reset(); micStatus.reset();
  if (audio.silentUntil > audio.time) judge.block('success', performance.now(), 0);
  practice = {passed: new Set(), phase: 'starting', index: 0, acceptedAt: null, lastMicAt: -Infinity, lastEnsureAt: -Infinity, recovering: false, recoveryFailed: false, reading: null, pausedReason: null, feedback: ''};
  renderPractice();
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  window.scrollTo(0, 0);
  try {
    await audio.init(); if (me !== token) return;
    const active = await mic.start(); if (me !== token) return;
    if (!active) throw new Error('マイクを開始できませんでした。');
    await requestWake(me); if (me !== token) return;
    practice.phase = 'playing'; $('#performanceViewport').dataset.phase = 'playing'; judge.nextNote(); updateNote();
    for (const id of ['pauseBtn', 'referenceBtn', 'nextBtn']) $('#' + id).disabled = false;
  } catch (e) {
    if (me !== token) return;
    renderStart(e.name === 'NotAllowedError' ? 'マイクの許可が得られませんでした。ブラウザの設定で許可してください。' : e.message);
  }
}

function pause(reason = 'paused') {
  const p = practice; if (!p || p.phase !== 'playing') return;
  p.phase = 'paused'; p.pausedReason = reason; audio.stop(); mic.stop(); cancelAnimationFrame(raf); judge.nextNote(); stopWake();
  $('#performanceViewport').dataset.phase = 'paused';
  $('#phaseLabel').textContent = '一時停止'; $('#coachText').textContent = '再開すると、すぐ今の音から始めます。';
  $('#pauseBtn').textContent = '再開する'; $('#nextBtn').disabled = true; $('#referenceBtn').disabled = true;
  paintMic(); raf = requestAnimationFrame(tick);
}
async function resume() {
  const p = practice; if (!p || p.phase !== 'paused') return;
  const me = ++token; $('#pauseBtn').disabled = true;
  try {
    await audio.init(); if (me !== token) return;
    if (!await mic.start()) throw new Error('マイクを開始できませんでした。');
    await requestWake(me); if (me !== token) return;
    p.phase = 'playing'; p.pausedReason = null; p.acceptedAt = null; judge.nextNote();
    $('#performanceViewport').dataset.phase = 'playing'; $('#pauseBtn').textContent = '一時停止'; $('#pauseBtn').disabled = false; updateNote();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  } catch { if (me === token) { $('#pauseBtn').disabled = false; toast('再開できませんでした。マイクの許可を確かめてください。'); } }
}
async function recoverMic() {
  const p = practice; if (!p) return;
  await audio.ensureRunning();
  if (practice !== p || p.recovering || p.phase !== 'playing') return;
  if (p.recoveryFailed || ['ended', 'off'].includes(mic.health) || p.micView?.key === 'noInput') {
    p.recovering = true;
    try {
      const active = await mic.restart();
      if (practice === p) { if (!active) throw new Error('マイクを開始できませんでした。'); p.recoveryFailed = false; p.reading = null; micStatus.reset(); judge.nextNote(); }
    } catch (e) { if (practice === p) { p.recoveryFailed = true; toast(e.message); } }
    finally { p.recovering = false; }
  }
  if (practice === p) paintMic();
}
function reference() {
  const p = practice; if (!p || p.phase !== 'playing' || performance.now() < judge.soundEnd) return;
  judge.block('reference', performance.now());
  audio.toneHz(targetFor(notes[p.index]).range.targetHz, .8, audio.time, .65);
  $('#referenceBtn').disabled = true; paintMic();
}

document.addEventListener('click', async event => {
  const el = event.target.closest('[data-action]'); if (!el) return;
  switch (el.dataset.action) {
    case 'start': await start(); break;
    case 'nextMeasure': range = {start: range.start + 1, end: range.start + 1}; setUrl(); renderStart(); break;
    case 'nextMeasureGo': // 終わった画面から: 続けて次の小節を測る。休みだけの小節は始める前の画面で知らせる。
      range = {start: range.start + 1, end: range.start + 1}; setUrl();
      if (notesIn(range.start, range.end).length) await start(); else renderStart();
      break;
    case 'exit': renderStart(); break;
    case 'pause': if (practice?.phase === 'paused') await resume(); else pause(); break;
    case 'reference': reference(); break;
    case 'next': advanceNote(); break;
    case 'micRecover': await recoverMic(); break;
  }
});
document.addEventListener('change', event => {
  if (event.target.id === 'difficulty') { prefs.difficulty = event.target.value; store.set('micDifficulty', prefs.difficulty); }
});
for (const name of ['pointerdown', 'keydown']) document.addEventListener(name, () => { if (practice) void recoverMic(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  const p = practice; if (!p) return;
  if (p.phase === 'starting') { renderStart(); return; } // 準備の途中で離れたら、始める前へ戻す
  if (p.phase === 'paused') { token++; mic.stop(); stopWake(); const b = $('#pauseBtn'); if (b) b.disabled = false; return; } // 再開の途中なら取りやめ
  pause('hidden');
});
window.addEventListener('pagehide', cleanup);
// 戻る操作でページがそのまま復元された時は、止まった練習画面を残さない。
window.addEventListener('pageshow', event => { if (event.persisted) renderStart(); });

renderStart();
