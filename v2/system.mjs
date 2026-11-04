// 段に組んだ五線。score.mjs の元データを、渡された幅に合わせて複数段の SVG 文字列にする。
// 音・指・弦・ポジションは score.mjs と marks.mjs の値だけを使い、新しい運指は作らない。
import {STRINGS, MEASURES, diatonic, pitchLabel} from './score.mjs';
import {CLEF_PATH, SHARP_PATH, NATURAL_PATH, FLAGS} from './glyphs.mjs';
import {markFor, POSITION_NAMES} from './marks.mjs';

const FONT = "system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans CJK JP', sans-serif";

const SPACE = 12;          // 五線の線の間隔
const HALF = 6;            // 線と線の半分（音の高さの刻み）
const REF = diatonic('E4'); // 一番下の線＝E4
const INK = '#283b31';
const SOFT = '#8b948b';
const STAFF = '#b8c1b6';
const LEDGER = '#53634f';

const PER_NOTE = 34;       // 1段に入れる量の目安（音1つ）
const HEAD = 62;           // ト音記号＋調号の幅
const TIME_W = 16;         // 拍子記号の幅
const LEAD = 12;           // 段の左端から最初の音まで
const RIGHT_PAD = 10;
const STAFF_LEFT = 6;

// 数字と札は音ごとに配置し、外端を測って段の余白を決める。
const BADGE_HEIGHT = 23;
const MUSIC_GAP = 10; // 文字の実際の下端から8px以上
const isShift = e => {
  const mk = markFor(e);
  return typeof mk?.shiftTo === 'number' && typeof mk?.shiftFrom === 'number';
};
const accidentals = new WeakMap();
for (const m of MEASURES) {
  const state = {};
  for (const e of m.events) if (!e.rest) accidentals.set(e, accidental(e.pitch,m.key,state));
}
const accidentalSpace = e => accidentals.get(e) ? .7 : 0;
const eventWeight = e => (e.grace ? 1.05 : 1 + .6 * e.beats) + (isShift(e) ? .55 : 0) + accidentalSpace(e);

const r2 = v => {
  if (!Number.isFinite(v)) throw new Error('座標が数になりません: ' + v);
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
};
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const line = (a, b, c, d, attrs = '') => `<line x1="${r2(a)}" y1="${r2(b)}" x2="${r2(c)}" y2="${r2(d)}" ${attrs}/>`;
const text = (x, y, t, attrs = '') => `<text x="${r2(x)}" y="${r2(y)}" ${attrs}>${esc(t)}</text>`;
const flatGlyph = (x, y, s = 1) =>
  `<path d="M${r2(x)} ${r2(y - 20 * s)}v${r2(27 * s)} Q${r2(x + 15 * s)} ${r2(y - 5 * s)} ${r2(x)} ${r2(y + 2 * s)}" fill="none" stroke="currentColor" stroke-width="1.9"/>`;

function restGlyph(x, y, beats) {
  if (beats >= 2) return `<rect x="${r2(x - 10)}" y="${r2(y - 13)}" width="20" height="6" fill="currentColor"/>`;
  if (beats === 1) return `<path d="M${r2(x - 4)} ${r2(y - 34)}l10 14 -11 13 10 12q-15 -6 -10 8q-13 -13 1 -20l-6 -9 8 -9z" fill="currentColor"/>`;
  return `<circle cx="${r2(x - 5)}" cy="${r2(y - 16)}" r="5" fill="currentColor"/><path d="M${r2(x - 4)} ${r2(y - 13)}q8 5 12 -10l-9 37" fill="none" stroke="currentColor" stroke-width="2"/>`;
}

// 調号の既定の音（D／Dm）と、小節ごとに戻す臨時記号の状態。
function accidental(pitch, key, state) {
  const letter = pitch[0] + pitch.at(-1);
  const alt = pitch.includes('#') ? '#' : pitch.includes('b') ? 'b' : 'natural';
  const def = key === 'D' && ['F', 'C'].includes(pitch[0]) ? '#' : key === 'Dm' && pitch[0] === 'B' ? 'b' : 'natural';
  const prev = state[letter] ?? def;
  state[letter] = alt;
  return prev !== alt ? alt : null;
}

const measureWeight = m => {
  let w = 0;
  for (const e of m.events) w += eventWeight(e);
  return w;
};

// 幅から段の分け方を決める。小節の途中では切らない。調が変わる所は段を改める。
function packSystems(start, end, width, maxMeasures, noteSpacing) {
  const fits = arr => {
    if (arr.length > maxMeasures) return false;
    const head = HEAD + (arr[0].number === 1 ? TIME_W : 0);
    const avail = width - head - LEAD - RIGHT_PAD;
    let w = 0;
    for (const m of arr) w += measureWeight(m);
    return w * noteSpacing <= avail;
  };
  const systems = [];
  let cur = [];
  for (let i = start; i <= end; i++) {
    const m = MEASURES[i - 1];
    if (cur.length && m.key !== cur.at(-1).key) {
      systems.push(cur);
      cur = [];
    }
    if (!cur.length) {
      cur = [m];
      continue;
    }
    if (fits([...cur, m])) cur.push(m);
    else {
      systems.push(cur);
      cur = [m];
    }
  }
  if (cur.length) systems.push(cur);
  return systems;
}

function beamGroupsFor(cells) {
  const groups = [];
  let group = [];
  for (const c of cells) {
    const e = c.e;
    if (e.grace || (!e.rest && e.beats < 1)) {
      const prev = group.at(-1);
      if (prev && (e.grace !== prev.e.grace || Math.floor(c.beat + 0.00001) !== Math.floor(prev.beat + 0.00001))) {
        groups.push(group);
        group = [];
      }
      group.push(c);
    } else {
      if (group.length) groups.push(group);
      group = [];
    }
  }
  if (group.length) groups.push(group);
  return groups;
}

function beamInfoFor(groups, staffTop) {
  const info = new Map();
  for (const group of groups) {
    const grace = group[0].e.grace;
    const down = !grace && group.reduce((s, c) => s + c.y, 0) / group.length < staffTop + 24;
    const stemLength = grace ? 29 : group.length === 1 ? 42 : 37;
    const beamY = down
      ? Math.max(...group.map(c => c.y)) + stemLength
      : Math.min(...group.map(c => c.y)) - stemLength;
    for (const c of group) info.set(c, {down, beamY, group});
  }
  return info;
}

function renderSystem(measures, cfg) {
  const {width, activeId, showLabels, rangeStart, rangeEnd, barNumbers, fingerScale, labelSize} = cfg;
  const first = measures[0];
  const last = measures.at(-1);
  const hasTime = first.number === 1;
  const headW = HEAD + (hasTime ? TIME_W : 0);
  const x0 = headW + LEAD;
  const rightX = width - RIGHT_PAD;

  // ---- 横の割り付け（音価と臨時記号の手前の幅を含む） ----
  const weights = measures.map(measureWeight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const musicW = Math.max(60, rightX - x0);
  const unit = musicW / totalWeight;

  const bounds = [];
  let cursor = 0;
  for (const m of measures) {
    const mx0 = x0 + cursor * unit;
    const cells = [];
    let localBeat = 0;
    for (const e of m.events) {
      const w = eventWeight(e);
      cells.push({e, x: x0 + (cursor + (w + accidentalSpace(e)) / 2) * unit, w: w * unit, beat: localBeat, measure: m.number});
      cursor += w;
      localBeat += e.beats;
    }
    bounds.push({m, x0: mx0, x1: x0 + cursor * unit, cells});
  }

  // ---- 縦の位置 ----
  // まず五線の上を0として、描く物すべての外端を求める。
  // 曲線は制御点まで含む安全側の範囲、符尾はSMuFLの外端まで含める。
  let top = 0, bottom = 4 * SPACE;
  const include = (a, b = a) => { top = Math.min(top, a); bottom = Math.max(bottom, b); };
  const allInfo = new Map();
  for (const b of bounds) {
    for (const c of b.cells) if (!c.e.rest) c.y = 4 * SPACE - (diatonic(c.e.pitch) - REF) * HALF;
    b.groups = beamGroupsFor(b.cells);
    b.info = beamInfoFor(b.groups, 0);
    for (const [c, info] of b.info) allInfo.set(c, info);
  }
  const flatCells = bounds.flatMap(b => b.cells);
  for (const b of bounds) {
    for (const c of b.cells) {
      const e = c.e;
      if (e.rest) { include(-10, 55); continue; }
      const info = allInfo.get(c);
      const down = info ? info.down : c.y < 24;
      const stemY = info ? info.beamY : c.y + (down ? 36 : -36);
      include(c.y - 9, c.y + 9); // 符頭と加線（線幅込み）
      include(Math.min(c.y, stemY) - 2, Math.max(c.y, stemY) + 2);
      if (info?.group.length === 1) {
        const scale = e.grace ? 8.4 : 12;
        include(stemY - (down ? 3.13 * scale : .1 * scale), stemY + (down ? .2 * scale : 3.21 * scale));
      }
      if (e.staccato) include(c.y - 19);
      if (e.harmonic) include(c.y - 31); // ○の文字の上端
      if (e.tie) {
        const previous = flatCells.slice(0, flatCells.indexOf(c)).reverse().find(p => !p.e.rest);
        include(Math.min(previous?.y ?? c.y, c.y) - 31);
      }
    }
    for (const [a, z] of b.m.slurs || []) {
      const p = b.cells.find(c => c.e.eventIndex === a);
      const q = b.cells.find(c => c.e.eventIndex === z);
      if (p && q && !p.e.rest && !q.e.rest)
        include(Math.min(p.y - (p.e.staccato ? 29 : 17), q.y - (q.e.staccato ? 29 : 17)) - 23);
    }
    const graces = b.cells.filter(c => c.e.grace && !c.e.rest);
    if (graces.length) include(Math.max(...graces.map(c => c.y)) + 30);
    const f = b.cells.find(c => c.e.eventIndex === b.m.fermataEvent);
    if (f) {
      // 休符に付くフェルマータも元データどおり描く。
      f.fermataY = Math.min((f.e.rest ? 12 : f.y) - 24, -22);
      include(f.fermataY - 23);
    }
  }
  if (last.number < rangeEnd && MEASURES[last.number]?.events[0]?.tie) {
    const n = [...flatCells].reverse().find(c => !c.e.rest);
    if (n) include(n.y - 31);
  }
  // 音符と同じ座標から、数字の横幅を通る物の実際の上端を求める。
  // 曲線は数字の幅に入る区間だけ評価し、制御点の空白へ数字を押し上げない。
  const obstacles = [];
  const box = (x0, x1, y) => obstacles.push({x0, x1, y});
  const curve = (x0, y0, cx, cy, x1, y1) => {
    const xAt = t => (1-t)**2*x0+2*(1-t)*t*cx+t*t*x1;
    const vertex = (y0-cy)/(y0-2*cy+y1);
    obstacles.push({x0, x1, at: x => {
      let lo=0,hi=1;
      for(let i=0;i<24;i++) {
        const t=(lo+hi)/2;
        if(xAt(t)<x) lo=t; else hi=t;
      }
      const t=(lo+hi)/2;
      return (1-t)**2*y0 + 2*(1-t)*t*cy + t*t*y1 - .8;
    }, vertex: vertex>=0&&vertex<=1?xAt(vertex):NaN});
  };
  for (const b of bounds) {
    for (const c of b.cells) {
      const e = c.e;
      if (e.rest) { box(c.x-12,c.x+12,-10); continue; }
      const size = e.grace ? 6 : 8.7;
      const headTop = Math.hypot(size*Math.sin(Math.PI/9),size*.68*Math.cos(Math.PI/9))+.9;
      box(c.x-size-1,c.x+size+1,c.y-headTop);
      if (c.y < -6 || c.y > 54) box(c.x-14,c.x+14,c.y-.7);
      const info = allInfo.get(c), down = info ? info.down : c.y < 24;
      const sx = c.x + (down ? -size+1 : size-1);
      const sy = info ? info.beamY : c.y+(down?36:-36);
      box(sx-1,sx+1,Math.min(c.y,sy)-1);
      if (info && info.group.length === 1) {
        const s = e.grace ? 8.4 : 12;
        box(sx-1,sx+13,sy-(down?3.13*s:.1*s));
      }
      if (e.staccato) box(c.x-2,c.x+2,c.y-19);
      if (e.harmonic) box(c.x-8,c.x+8,c.y-31);
      if (c.fermataY !== undefined) box(c.x-14,c.x+14,c.fermataY-12);
    }
    for (const g of b.groups) if (g.length > 1) {
      const info = b.info.get(g[0]);
      const dx = info.down ? -7.7 : g[0].e.grace ? 5 : 7.7;
      box(g[0].x+dx-2,g.at(-1).x+dx+2,info.beamY-(info.down?7.5:2));
    }
    for (const [a,z] of b.m.slurs || []) {
      const p=b.cells.find(c=>c.e.eventIndex===a), q=b.cells.find(c=>c.e.eventIndex===z);
      if (!p || !q || p.e.rest || q.e.rest) continue;
      const x0=p.x+(p.e.harmonic?14:0), x1=q.x-(q.e.harmonic?14:0);
      const y0=p.y-(p.e.staccato?29:17), y1=q.y-(q.e.staccato?29:17);
      curve(x0,y0,(x0+x1)/2,Math.min(y0,y1)-22,x1,y1);
    }
  }
  for (const [i,c] of flatCells.entries()) if (c.e.tie) {
    const p=flatCells.slice(0,i).reverse().find(n=>!n.e.rest);
    const x0=p?p.x+5:headW-2, y0=(p?p.y:c.y)-13;
    curve(x0,y0,((p?p.x:headW)+c.x)/2, p?Math.min(p.y,c.y)-30:c.y-26,c.x-5,c.y-13);
  }
  if (last.number < rangeEnd && MEASURES[last.number]?.events[0]?.tie) {
    const c=[...flatCells].reverse().find(n=>!n.e.rest);
    if(c) curve(c.x+5,c.y-13,(c.x+rightX)/2,c.y-30,rightX-2,c.y-13);
  }
  const firstStopped = flatCells.find(c => !c.e.rest && c.e.finger !== 0);
  for (const c of flatCells) if (!c.e.rest) {
    const mk=markFor(c.e)||{};
    c.fingerSize=(c.e.grace?14:20)*fingerScale;
    // Arial の数字の下端はベースライン。空のディセンダ領域を間隔に含めない。
    const left=c.x-c.fingerSize*.3, right=c.x+c.fingerSize*.3+(mk.tilt?12:0);
    let musicTop=Infinity;
    for(const o of obstacles) {
      const a=Math.max(left,o.x0), z=Math.min(right,o.x1);
      if(a>z) continue;
      let y=o.y;
      if(o.at) {
        y=Math.min(o.at(a),o.at(z));
        const vx=o.vertex;
        if(vx>=a&&vx<=z) y=Math.min(y,o.at(vx));
      }
      musicTop=Math.min(musicTop,y);
    }
    c.fingerBottom=musicTop-4;
    c.fingerY=c.fingerBottom;
    c.annotationTop=c.fingerY-c.fingerSize*.9;
    c.techniqueY=c.annotationTop-5;
    if(c.e.harmonic||c.e.finger===0) c.annotationTop=c.techniqueY-12;
    c.badgeTop=c.annotationTop-5-(isShift(c.e)?BADGE_HEIGHT:19);
    if(isShift(c.e)||c===firstStopped) c.annotationTop=c.badgeTop;
    include(c.annotationTop);
  }
  const barY = 15;
  const staffTop = (barNumbers ? 26 : 5) - top;
  const staffBottom = staffTop + 4 * SPACE;
  for (const c of flatCells) if (!c.e.rest) c.y += staffTop;
  for (const c of flatCells) if (!c.e.rest)
    for (const key of ['fingerBottom','fingerY','annotationTop','techniqueY','badgeTop']) c[key]+=staffTop;
  const translated = new Set();
  for (const info of allInfo.values()) if (!translated.has(info)) {
    info.beamY += staffTop;
    translated.add(info);
  }
  for (const b of bounds) for (const c of b.cells) if (c.fermataY !== undefined) c.fermataY += staffTop;
  const pitchY = staffTop + bottom + MUSIC_GAP + labelSize * 1.2;
  const labelOn = showLabels !== false;
  const stringY = labelOn ? pitchY + labelSize * 1.5 + 2 : pitchY;
  const height = stringY + labelSize*.3 + 8;

  // ---- 書き出し ----
  let out = `<svg class="system" viewBox="0 0 ${width} ${r2(height)}" role="group" aria-label="第${first.number}〜${last.number}小節" font-family="${FONT}" preserveAspectRatio="xMidYMin meet">`;

  // 移動する音の黄色い帯は、現在音の強調より下に置く。
  out += '<g class="shift-bands">';
  for (const c of flatCells) if (isShift(c.e))
    out += `<rect class="shift-band" data-shift-band="${esc(c.e.id)}" x="${r2(c.x - 20)}" y="${r2(c.badgeTop)}" width="40" height="${r2(staffBottom + 8 - c.badgeTop)}" rx="8" fill="#fff1b8"/>`;
  out += '</g>';

  // 再生中の音の背景（薄い弦の色）
  out += '<g class="highlight-layer">';
  for (const b of bounds)
    for (const c of b.cells) {
      if (c.e.rest) continue;
      const id = c.e.id ?? c.e.targetId;
      const on = activeId !== null && activeId !== undefined && activeId === id;
      // 移動音は左右に黄色を残し、現在音の弦の色と同時に読める幅にする。
      const highlightW = isShift(c.e) ? Math.min(26, c.w * .7) : c.w * .9;
      out += `<rect data-hl="${esc(id)}" x="${r2(c.x - highlightW / 2)}" y="6" width="${r2(highlightW)}" height="${r2(pitchY + 2 - 6)}" rx="10" fill="${STRINGS[c.e.string].pale}" fill-opacity=".72" opacity="${on ? 1 : 0}"/>`;
    }
  out += '</g>';

  // 五線
  out += `<g class="staff-lines" stroke="${STAFF}" stroke-width="1">`;
  for (let i = 0; i < 5; i++) out += line(STAFF_LEFT, staffTop + i * SPACE, rightX, staffTop + i * SPACE);
  out += '</g>';

  // 段の頭: ト音記号・調号・（第1小節なら）拍子
  out += `<path class="clef" d="${CLEF_PATH}" transform="translate(4 ${r2(staffBottom - 12)}) scale(12)" fill="${INK}"/>`;
  if (first.key === 'Dm') {
    out += `<g color="${INK}" class="key-signature">${flatGlyph(38, staffTop + 24)}</g>`;
  } else {
    out += `<g class="key-signature"><path d="${SHARP_PATH}" transform="translate(36 ${r2(staffTop)}) scale(10)" fill="${INK}"/><path d="${SHARP_PATH}" transform="translate(48 ${r2(staffTop + 18)}) scale(10)" fill="${INK}"/></g>`;
  }
  if (hasTime) {
    out += text(headW - 9, staffTop + 19, '2', `text-anchor="middle" font-size="18" font-family="Georgia,serif" fill="${INK}"`);
    out += text(headW - 9, staffTop + 41, '4', `text-anchor="middle" font-size="18" font-family="Georgia,serif" fill="${INK}"`);
  }

  // 小節線（段の頭の区切りと、各小節の境目、最後）
  out += line(headW - 6, staffTop, headW - 6, staffBottom, `stroke="${INK}" stroke-width="1.2"`);
  for (const b of bounds.slice(1)) out += line(b.x0, staffTop, b.x0, staffBottom, `stroke="${INK}" stroke-width="1.2"`);
  out += line(rightX, staffTop, rightX, staffBottom, `stroke="${INK}" stroke-width="1.8"`);

  // 各小節の中身
  const ties = [];
  for (const b of bounds) {
    const m = b.m;
    const accState = {};
    let body = '';

    for (const c of b.cells) {
      const e = c.e;
      const x = c.x;
      if (e.rest) {
        body += `<g class="rest" color="${INK}">${restGlyph(x, staffTop + 25, e.beats)}</g>`;
        continue;
      }
      const s = STRINGS[e.string];
      const color = s.color;
      const size = e.grace ? 6 : 8.7;
      const info = allInfo.get(c);
      const down = info ? info.down : c.y < staffTop + 24;
      const stemX = x + (down ? -size + 1 : size - 1);
      const stemY = info ? info.beamY : c.y + (down ? 36 : -36);
      const id = e.id ?? e.targetId;
      const mk = markFor(e) || {};

      body += `<g class="score-note${activeId === id ? ' is-active' : ''}" data-note-id="${esc(id)}">`;
      body += `<rect x="${r2(x - c.w * 0.46)}" y="4" width="${r2(c.w * 0.92)}" height="${r2(height - 8)}" fill="transparent"/>`;

      // 黒札・太線は実際の移動だけ。段の開始位置は枠線だけの小札。
      if (isShift(e)) {
        const name = `${mk.shiftTo > mk.shiftFrom ? '↗' : '↘'}${POSITION_NAMES[mk.shiftTo]}`;
        body += `<g class="shift" data-note-id="${esc(id)}">`;
        body += line(x - 15, c.badgeTop + BADGE_HEIGHT, x - 15, staffBottom+8, 'class="shift-line" stroke="#1f2a24" stroke-width="3"');
        body += `<rect class="shift-badge" x="${r2(x - 19)}" y="${r2(c.badgeTop)}" width="38" height="${BADGE_HEIGHT}" rx="5" fill="#1f2a24"/>`;
        body += text(x, c.badgeTop + 16, name, 'class="position-label" text-anchor="middle" font-size="11.5" font-weight="800" fill="white"');
        body += '</g>';
      } else if (c === firstStopped) {
        body += `<g class="system-position" data-position="${e.position}"><rect x="${r2(x - 15)}" y="${r2(c.badgeTop)}" width="30" height="19" rx="4" fill="none" stroke="#1f2a24"/>`;
        body += text(x, c.badgeTop + 14, mk.position || POSITION_NAMES[e.position], 'class="position-label" text-anchor="middle" font-size="10.5" font-weight="600" fill="#1f2a24"');
        body += '</g>';
      }

      // 指の数字と、その右上の高め／低めの矢印
      // タイでつながった後ろの音は弾き直さないので、指の数字を繰り返さない。
      // ただし範囲の最初の音がタイの続きの時は、前の音が描かれず、ここから鳴らすので数字を出す。
      const tieHidden = e.tie && !(m.number === rangeStart && e.eventIndex === 0);
      if (!tieHidden) body += text(x, c.fingerY, String(e.finger), `class="finger-label" text-anchor="middle" font-family="Arial,sans-serif" font-size="${c.fingerSize}" font-weight="750" fill="${color}"`);
      if (mk.tilt && !tieHidden) body += text(x + c.fingerSize*.3 + 5, c.fingerY - c.fingerSize*.55, mk.tilt, `class="tilt-label" text-anchor="middle" font-size="9" font-weight="700" fill="${color}"`);
      // 開放弦と◇は音ごとに残す。通常音のポジション名は繰り返さない。
      const posText = e.harmonic ? '◇' : e.finger === 0 ? '開放' : '';
      if (posText) body += text(x, c.techniqueY, posText, `class="technique-label" text-anchor="middle" font-size="10" font-weight="600" fill="${color}"`);

      // 加線
      for (let ly = staffTop - SPACE; ly >= c.y - 1; ly -= SPACE) body += line(x - 14, ly, x + 14, ly, `class="ledger" stroke="${LEDGER}" stroke-width="1.4"`);
      for (let ly = staffBottom + SPACE; ly <= c.y + 1; ly += SPACE) body += line(x - 14, ly, x + 14, ly, `class="ledger" stroke="${LEDGER}" stroke-width="1.4"`);

      // 臨時記号（小節ごとに状態を戻す）
      const acc = accidental(e.pitch, m.key, accState);
      if (acc === 'b') body += `<g class="accidental" color="${color}">${flatGlyph(x - 19, c.y, 0.8)}</g>`;
      else if (acc) body += `<path class="accidental" d="${acc === '#' ? SHARP_PATH : NATURAL_PATH}" transform="translate(${r2(x - 24)} ${r2(c.y)}) scale(${e.grace ? 8 : 10})" fill="${color}"/>`;

      // 音符・符尾
      body += `<ellipse cx="${r2(x)}" cy="${r2(c.y)}" rx="${size}" ry="${r2(size * 0.68)}" transform="rotate(-20 ${r2(x)} ${r2(c.y)})" fill="${e.beats >= 2 ? '#fffef9' : color}" stroke="${color}" stroke-width="1.8"/>`;
      body += line(stemX, c.y, stemX, stemY, `stroke="${color}" stroke-width="2"`);
      if (e.beats === 0.75 || e.beats === 1.5) body += `<circle cx="${r2(x + 13)}" cy="${r2(c.y - 3)}" r="2.1" fill="${color}"/>`;
      if (e.harmonic) body += text(x, c.y - 16, '○', `class="harmonic-symbol" text-anchor="middle" font-size="13" fill="${color}"`);
      if (e.staccato) body += `<circle class="staccato" cx="${r2(x)}" cy="${r2(c.y - 17)}" r="2" fill="${color}"/>`;
      if (e.grace) body += line(stemX - 4, stemY + 12, stemX + 8, stemY + 3, `stroke="${color}" stroke-width="1.2"`);

      // 五線の下: 音名と弦の名
      if (labelOn) body += text(x, pitchY, pitchLabel(e.pitch), `class="pitch-label" text-anchor="middle" font-size="${labelSize}" fill="#3d4a40"`);
      body += text(x, stringY, s.name, `class="string-label" text-anchor="middle" font-size="${labelSize}" fill="${color}"`);

      if (e.tie) ties.push(c);
      body += '</g>';
    }

    // 連桁と符尾
    for (const group of b.groups) {
      const info = b.info.get(group[0]);
      const sx = c => c.x + (info.down ? -7.7 : group[0].e.grace ? 5 : 7.7);
      body += '<g class="beam">';
      if (group.length > 1) {
        body += line(sx(group[0]), info.beamY, sx(group.at(-1)), info.beamY, `stroke="${INK}" stroke-width="4"`);
        for (let i = 0; i < group.length; i++) {
          const c = group[i];
          if (c.e.beats === 0.25 || c.e.grace) {
            const next = group[i + 1];
            const prev = group[i - 1];
            const xx = next && (next.e.beats === 0.25 || next.e.grace)
              ? sx(next)
              : prev && (prev.e.beats === 0.25 || prev.e.grace)
                ? null
                : sx(c) + (i === 0 ? 10 : -10);
            if (xx !== null) body += line(sx(c), info.beamY + (info.down ? -6 : 6), xx, info.beamY + (info.down ? -6 : 6), `stroke="${INK}" stroke-width="3"`);
          }
        }
      } else {
        const c = group[0];
        const kind = `flag${c.e.beats === 0.25 ? '16th' : '8th'}${info.down ? 'Down' : 'Up'}`;
        body += `<path class="note-flag" data-flag="${kind}" d="${FLAGS[kind]}" transform="translate(${r2(sx(c) - 1)} ${r2(info.beamY)}) scale(${c.e.grace ? 8.4 : 12})" fill="${INK}"/>`;
      }
      body += '</g>';
    }

    // スラーと装飾音のかけ方
    for (const [a, bb] of m.slurs || []) {
      const p = b.cells.find(c => c.e.eventIndex === a);
      const q = b.cells.find(c => c.e.eventIndex === bb);
      if (!p || !q || p.e.rest || q.e.rest) continue;
      const startX = p.x + (p.e.harmonic ? 14 : 0);
      const endX = q.x - (q.e.harmonic ? 14 : 0);
      const startY = p.y - (p.e.staccato ? 29 : 17);
      const endY = q.y - (q.e.staccato ? 29 : 17);
      const archY = Math.min(startY, endY) - 22;
      body += `<path class="slur" d="M${r2(startX)} ${r2(startY)}Q${r2((startX + endX) / 2)} ${r2(archY)} ${r2(endX)} ${r2(endY)}" fill="none" stroke="#526556" stroke-width="1.3"/>`;
    }
    const graces = b.cells.filter(c => c.e.grace && !c.e.rest);
    if (graces.length) {
      const end = b.cells[b.cells.indexOf(graces.at(-1)) + 1];
      if (end && !end.e.rest) {
        const gmax = Math.max(...graces.map(c => c.y));
        body += `<path class="grace-slur" d="M${r2(graces[0].x)} ${r2(gmax + 12)}Q${r2((graces[0].x + end.x) / 2)} ${r2(gmax + 29)} ${r2(end.x)} ${r2(end.y + 12)}" fill="none" stroke="#526556" stroke-width="1.2"/>`;
      }
    }

    // 反復記号の点
    if (m.repeatStart) {
      body += `<g class="repeat-dots"><circle cx="${r2(b.x0 + 8)}" cy="${r2(staffTop + 18)}" r="2.4" fill="${INK}"/><circle cx="${r2(b.x0 + 8)}" cy="${r2(staffTop + 30)}" r="2.4" fill="${INK}"/></g>`;
    }
    if (m.repeatEnd) {
      body += `<g class="repeat-dots"><circle cx="${r2(b.x1 - 8)}" cy="${r2(staffTop + 18)}" r="2.4" fill="${INK}"/><circle cx="${r2(b.x1 - 8)}" cy="${r2(staffTop + 30)}" r="2.4" fill="${INK}"/></g>`;
    }

    // フェルマータ
    if (m.fermataEvent !== null && m.fermataEvent !== undefined) {
      const c = b.cells.find(x => x.e.eventIndex === m.fermataEvent);
      if (c) {
        const fy = c.fermataY;
        body += `<g class="fermata" data-fermata-event="${m.fermataEvent}"><path d="M${r2(c.x - 13)} ${r2(fy)}Q${r2(c.x)} ${r2(fy - 22)} ${r2(c.x + 13)} ${r2(fy)}" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="${r2(c.x)}" cy="${r2(fy - 3)}" r="2"/></g>`;
      }
    }

    out += body;
  }

  // タイ（小節をまたぐ物は段の境目で半分ずつ）
  for (const c of ties) {
    const i = flatCells.indexOf(c);
    let prev = null;
    for (let k = i - 1; k >= 0; k--) {
      if (!flatCells[k].e.rest) {
        prev = flatCells[k];
        break;
      }
    }
    const y = c.y;
    if (prev) {
      const a = prev;
      out += `<path class="tie" d="M${r2(a.x + 5)} ${r2(a.y - 13)}Q${r2((a.x + c.x) / 2)} ${r2(Math.min(a.y, y) - 30)} ${r2(c.x - 5)} ${r2(y - 13)}" fill="none" stroke="#526556" stroke-width="1.4"/>`;
    } else {
      out += `<path class="tie start" d="M${r2(headW - 2)} ${r2(y - 13)}Q${r2((headW + c.x) / 2)} ${r2(y - 26)} ${r2(c.x - 5)} ${r2(y - 13)}" fill="none" stroke="#526556" stroke-width="1.4"/>`;
    }
  }
  // 次の段の頭へ渡す半分のタイ
  if (last.number < rangeEnd) {
    const nextMeasure = MEASURES[last.number];
    if (nextMeasure && nextMeasure.events[0]?.tie) {
      const lastNote = [...flatCells].reverse().find(c => !c.e.rest);
      if (lastNote) out += `<path class="tie end" d="M${r2(lastNote.x + 5)} ${r2(lastNote.y - 13)}Q${r2((lastNote.x + rightX) / 2)} ${r2(lastNote.y - 30)} ${r2(rightX - 2)} ${r2(lastNote.y - 13)}" fill="none" stroke="#526556" stroke-width="1.4"/>`;
    }
  }

  // 小節番号（タップでその小節を選ぶ）
  for (const b of bounds) {
    out += `<g class="bar-number" data-measure="${b.m.number}" data-x="${r2(b.x0)}"${barNumbers ? '' : ' visibility="hidden"'}><rect x="${r2(b.x0 - 36)}" y="${r2(barY - 13)}" width="20" height="17" fill="transparent"/><text x="${r2(b.x0 - 16)}" y="${r2(barY)}" text-anchor="end" font-size="9" font-weight="600" fill="${SOFT}">${b.m.number}</text></g>`;
  }

  return out + '</svg>';
}

// start〜end 小節を、幅に合わせた段の SVG 文字列の配列にする。
export function engraveSystems(start, end, options = {}) {
  const {width = 360, activeId = null, showLabels = true, barNumbers = true,
    fingerScale = 1, labelSize = 10, maxMeasures = Infinity, noteSpacing = PER_NOTE} = options || {};
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > MEASURES.length || start > end)
    throw new RangeError('表示する小節の範囲が正しくありません。');
  const w = Math.max(240, Math.round(width) || 360);
  const systems = packSystems(start, end, w, maxMeasures, noteSpacing);
  const cfg = {width: w, activeId, showLabels, rangeStart: start, rangeEnd: end, barNumbers, fingerScale, labelSize};
  return systems.map(ms => renderSystem(ms, cfg));
}
