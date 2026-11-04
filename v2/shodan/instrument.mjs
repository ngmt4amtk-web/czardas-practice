// 楽器の判定はここ1か所だけで行い、値を配る。2026-11-02 ビオラ版で追加。
// ビオラ: <html data-instrument="viola"> か ?viola=1。node から読んだ時（document が無い）は必ずバイオリン。
export const IS_VIOLA=!!globalThis.document&&(globalThis.document.documentElement?.dataset?.instrument==='viola'||new URLSearchParams(globalThis.location?.search||'').get('viola')==='1');
export const INSTRUMENT_NAME=IS_VIOLA?'ビオラ':'バイオリン';
export const CLEF=IS_VIOLA?'alto':'treble';
// 五線の第1線（いちばん下の線）の全音階番号。ト音記号=E4=4*7+2=30、ハ音記号=F3=3*7+3=24。
export const STAFF_BASE=IS_VIOLA?24:30;
// 低い方から1〜4番目の弦の開放弦MIDI。内部名は G・D・A・E のまま使う。
export const OPEN_MIDI=IS_VIOLA?[48,55,62,69]:[55,62,69,76];
export const OPEN_LETTERS=IS_VIOLA?[0,4,1,5]:[4,1,5,2];
export const OPEN_FIFTHS_FROM_A=IS_VIOLA?[-3,-2,-1,0]:[-2,-1,0,1];
export const OPEN_FIFTHS_FROM_C=IS_VIOLA?[0,1,2,3]:[1,2,3,4];
export const STORAGE_KEY=IS_VIOLA?'violin-shodan-v1-viola':'violin-shodan-v1';
export const STRING_LABEL=IS_VIOLA?{G:'C',D:'G',A:'D',E:'A'}:{G:'G',D:'D',A:'A',E:'E'};
