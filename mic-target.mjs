// マイク測定の「どの音を、どの目標で測るか」。画面を持たない部分（node の試験でも読める）。
import {MEASURES, STRINGS} from './score.mjs';
import {targetForNote, tonalKey} from './shodan/intonation.mjs';

const KEYS = {D: tonalKey(2, 'major'), Dm: tonalKey(2, 'harmonicMinor')};

// 測る音: 装飾音を除き、範囲の途中でタイの続きになる音は1音にまとめる。休符は測らない。
export function notesIn(start, end) {
  const out = [];
  for (const m of MEASURES.slice(start - 1, end)) for (const n of m.notes) {
    if (n.grace || (n.continuesFromPrevious && out.length)) continue;
    out.push(n);
  }
  return out;
}

// 音程の目標。初段と同じく開放弦から決める旋律の音程。ハーモニクスは開放弦の倍音なので、開放弦の目標を上げる。
export function targetOf(n, p = {}) {
  const m = MEASURES[n.measure - 1];
  const note = {midi: n.midi, finger: n.finger, string: n.string, key: KEYS[m.key], letter: 'CDEFGAB'.indexOf(n.pitch[0])};
  if (!n.harmonic) return {note, range: targetForNote(note, p)};
  const open = STRINGS[n.string].midi, octaves = Math.round((n.midi - open) / 12), f = 2 ** octaves;
  const r = targetForNote({...note, midi: open, finger: 0}, p);
  return {note, range: {...r, targetHz: r.targetHz * f, loHz: r.loHz * f, hiHz: r.hiHz * f, etHz: r.etHz * f}};
}
