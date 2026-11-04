// 表示する範囲の決まり。URL（印刷楽譜のQRからの入口）と、区切りの分け方。
import {MEASURES, PHRASES} from './score.mjs';

export const MIN_MEASURE = 1;
export const MAX_MEASURE = MEASURES.length;

function parseValue(raw) {
  const m = /^(\d+)(?:-(\d+))?$/.exec(raw || '');
  if (!m) return null;
  const start = Number(m[1]);
  const end = m[2] === undefined ? start : Number(m[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < MIN_MEASURE || start > MAX_MEASURE) return null;
  if (end < MIN_MEASURE || end > MAX_MEASURE) return null;
  if (start > end) return null;
  return {start, end};
}

// ?m=12 / ?m=12-15 / #m=12 / #m=12-15 を同じに読む。おかしければ null（第1フレーズに戻す）。
export function parseRange(search = '', hash = '') {
  for (const part of [search, hash]) {
    const m = /(?:^|[?&#])m=([^&#]*)/.exec(part || '');
    if (m) return parseValue(m[1]);
  }
  return null;
}

// 区切りの単位（4小節＝フレーズそのまま／2小節＝前半と後半。5小節のフレーズは 2+3）。
export function splitPhrase(phrase, unit = 4) {
  if (unit !== 2) return [{start: phrase.start, end: phrase.end}];
  const length = phrase.end - phrase.start + 1;
  const first = Math.floor(length / 2);
  return [
    {start: phrase.start, end: phrase.start + first - 1},
    {start: phrase.start + first, end: phrase.end},
  ];
}

export function segments(unit = 4) {
  return PHRASES.flatMap(p => splitPhrase(p, unit));
}

// 範囲を含むフレーズ。
export function phraseFor(range) {
  return (
    PHRASES.find(p => range.start >= p.start && range.end <= p.end) ||
    PHRASES.find(p => range.start >= p.start && range.start <= p.end) ||
    PHRASES[0]
  );
}

// 前へ／次へ。区切りの一覧に載っていればその隣、載っていない範囲（自分で選んだ範囲）は同じ長さだけ動く。
export function stepRange(range, list, dir) {
  const i = list.findIndex(s => s.start === range.start && s.end === range.end);
  if (i >= 0) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return null;
    return {start: list[j].start, end: list[j].end, index: j};
  }
  const length = range.end - range.start + 1;
  let start = range.start + dir * length;
  if (start < MIN_MEASURE) {
    if (range.start === MIN_MEASURE) return null;
    start = MIN_MEASURE;
  }
  let end = start + length - 1;
  if (end > MAX_MEASURE) {
    if (range.end === MAX_MEASURE) return null;
    end = MAX_MEASURE;
    start = Math.max(MIN_MEASURE, end - length + 1);
  }
  return {start, end};
}
