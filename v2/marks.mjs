// 楽譜とアプリの両方が使う、元データ（score.mjs）から導くだけの書き込み。
// 新しい運指・ポジション・音程の指示は作らない。
import{NOTES,MEASURES,placement}from'./score.mjs';

export const POSITION_NAMES=['','1st','2nd','3rd','4th','5th','6th','7th','8th'];
export const positionName=n=>n.finger===0?'開放':POSITION_NAMES[n.position];

// 手の位置が変わる所: 押さえる音（開放弦以外）を順に見て、直前に押さえた音とポジションが違う音の前に線を引く。
// 開放弦は数えない（クライスラーの練習譜と同じ決まり）。曲の最初の押さえる音にも、始まりの位置として線を引く。
// 高め・低め: placement() の印（例 2↓＝低い2、3↑＝高い3）。その指を、ポジションの基本の並びより半音高く・低く置く。
const MARKS=new Map();
let previous=null;
// 装飾音は楽譜にも音にも出さないので、移動も数えない（本人 2026-11-05「装飾音いらない」）。
for(const n of NOTES){
 if(n.grace)continue;
 const stopped=n.finger!==0;
 const mark={
  position:positionName(n),
  shiftTo:null,
  shiftFrom:null,
  tilt:'',
  tiltText:'',
 };
 if(stopped){
  if(!previous||previous.position!==n.position){mark.shiftTo=n.position;mark.shiftFrom=previous?previous.position:null;}
  previous=n;
  const short=placement(n).short||'';
  const arrow=short.at(-1);
  if(arrow==='↑'||arrow==='↓'){mark.tilt=arrow;mark.tiltText=`${arrow==='↑'?'高い':'低い'}${n.finger}`;}
 }
 MARKS.set(n.id,mark);
}
export const markFor=n=>MARKS.get(n.id);

// 範囲の最初に押さえる音（表示の始まりで手の位置を示すため）。
export function firstStoppedIn(start,end){
 for(const m of MEASURES.slice(start-1,end))for(const n of m.notes)if(!n.grace&&n.finger!==0)return n;
 return null;
}

// 範囲の中の移動の一覧（小節の順）。
export function shiftsIn(start,end){
 const out=[];
 for(const m of MEASURES.slice(start-1,end))for(const n of m.notes){const k=MARKS.get(n.id);if(k&&k.shiftTo&&k.shiftFrom)out.push({note:n,from:k.shiftFrom,to:k.shiftTo});}
 return out;
}

// フレーズの題。装飾音を描かなくなったので、「装飾音」を名に含む2つだけ言い換える（本人 2026-11-05「装飾音いらない」）。
const TITLE_FIX={'装飾音から':'細かい音の入り','装飾音の再現':'細かい音の入りの再現'};
export const phraseTitle=p=>TITLE_FIX[p.title]||p.title;
