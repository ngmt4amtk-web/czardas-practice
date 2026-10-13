export const STRINGS={G:{name:'G線',color:'#285dcc',pale:'#eaf0ff',midi:55,open:'G3'},D:{name:'D線',color:'#ba6613',pale:'#fff1df',midi:62,open:'D4'},A:{name:'A線',color:'#c63840',pale:'#ffebed',midi:69,open:'A4'},E:{name:'E線',color:'#217544',pale:'#e5f4e9',midi:76,open:'E5'}};
export const ROMAN=['開放','I','II','III','IV','V','VI','VII','VIII'];
export const frequencyFor=(midi,tuning=442)=>tuning*2**((midi-69)/12);
export function pitchToMidi(p){const m=/^([A-G])([#b]?)(\d)$/.exec(p);if(!m)throw Error(p);return 12*(+m[3]+1)+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0);}
export const diatonic=p=>+p.at(-1)*7+'CDEFGAB'.indexOf(p[0]);
export const pitchLabel=p=>({C:'ド',D:'レ',E:'ミ',F:'ファ',G:'ソ',A:'ラ',B:'シ'}[p[0]]+(p.includes('#')?'♯':p.includes('b')?'♭':''));
export const SECTIONS=[
 {id:'a',name:'はじめの跳躍',page:1,key:'Dm',tempo:72,source:'1ページ・Allegro vivace',start:1,end:16},
 {id:'b',name:'短調の細かい音',page:2,key:'Dm',tempo:64,source:'2ページ・上4段',start:17,end:32},
 {id:'c',name:'ゆったり歌う',page:2,key:'D',tempo:56,source:'2ページ・Molto meno（上声のみ）',start:33,end:48},
 {id:'d',name:'細かい音の再現',page:3,key:'Dm',tempo:64,source:'3ページ・Allegro vivace',start:49,end:64},
 {id:'e',name:'明るい主題',page:3,key:'D',tempo:72,source:'3ページ・Allegrettoの主題',start:65,end:80},
 {id:'f',name:'終わりへ',page:3,key:'D',tempo:80,source:'3ページ・a Tempo più presto以降',start:81,end:97}
];
// 転記元は本人提供のRicordi 1904ソロ譜。小節番号は収録開始を1とする練習用番号。
// 各トークン = 音高/弦指/拍数/任意ポジション。g は装飾、t は直前音からのタイ、h は自然ハーモニクス。
// 原譜の指番号を優先し、ポジションは弦・音高・指から補った練習用の配置。
const DATA=[
// 1ページ・最初の16小節
 ['D5/A1/.5 D6/E4/.5 r/.5 Bb5/E2/.5','r/.5 A5/E1/.5 r/.5 F5/A3/.5','E5/A2/.5 D5/A1/1 C#5/A1/.5','D5/A2/1 D5/A2/.5/t r/.5'],
 ['D5/A1 E5/A2 F5/A3 E5/A2 D5/A1 E5/A2 F5/A3 E5/A2','D5/A1 E5/A2 F5/A3 E5/A2 D5/A1 E5/A2 F5/A3 D5/A1','F5/A3/.5 E5/A2/1 D#5/A1/.5','E5/A2/1 E5/A2/.5/t r/.5'],
 ['G5/E2 A5/E3 Bb5/E4 A5/E3 G5/E2 A5/E3 Bb5/E4 A5/E3','G5/E2 A5/E3 Bb5/E4 A5/E3 G5/E2 Bb5/E4 A5/E3 G5/E2','F5/E1 G5/E2 A5/E3 G5/E2 F5/E1 G5/E2 A5/E3 G5/E2','F5/E1 G5/E2 A5/E3 G5/E2 F5/E1 A5/E3 G5/E2 F5/E1'],
 ['A4/A0 B4/A1 C#5/A2 D5/A3 E5/E0 F5/E1 G5/E2 A5/E3','Bb5/E4 A5/E3 G5/E2 F5/E1 E5/A4 D5/A3 C#5/A2 E5/A4','E5/A4/.5 D5/A3/1 C#5/A2/.5','D5/A3/1 r/1'],
// 2ページ・速い部分。gの長さは通常音から借りて再生し、小節の拍数には足さない。
 ['C5/A2/0/g D5/A3/0/g C5/A2 B4/A1 C5/A2 E5/A4 G5/E2 Bb5/E4 G5/E2 E5/A4','C5/A2/0/g D5/A3/0/g C5/A2 B4/A1 C5/A2 E5/A4 G5/E2 Bb5/E4 G5/E2 E5/A4','Bb4/A1 A4/A0 Bb4/A1 C5/A2 D5/A3 E5/A4 F5/E1 G5/E2','A5/E3/1 A5/E3/.5/t r/.5'],
 ['Bb4/D4/0/g A4/D3 G#4/D2 A4/D3 C#5/A1 E5/A3 G5/A4 E5/A3 C#5/A1','Bb4/D4/0/g A4/D3 G#4/D2 A4/D3 C#5/A1 E5/A3 G5/A4 E5/A3 C#5/A1','Bb4/D3/0/g A4/D2 G#4/D1 A4/D2 B4/D3 C#5/D4 D5/A1 E5/A2 D5/A1','F5/A3/1 F5/A3/.5/t r/.5'],
 ['Bb5/E4 A5/E3 G5/E2 A5/E3 Bb5/E4 A5/E3 G5/E2 A5/E3','Bb5/E4 A5/E3 G5/E2 A5/E3 Bb5/E4 A5/E3 G5/E2 Bb5/E4','A5/E3 G5/E2 F5/E1 G5/E2 A5/E3 G5/E2 F5/E1 G5/E2','A5/E3 G5/E2 F5/E1 G5/E2 A5/E3 G5/E2 F5/E1 A5/E3'],
 ['A4/A0 B4/A1 C#5/A2 D5/A3 E5/E0 F5/E1 G5/E2 A5/E3','Bb5/E4 A5/E3 G5/E2 F5/E1 E5/A4 D5/A3 C#5/A2 E5/A4','E5/A4/.5 D5/A3/1 C#5/A2/.5','D5/A3/1 r/1'],
// Molto meno、上声のみ。紫の×がある人工ハーモニクス16小節は収録しない。
 ['D6/E4/1 A5/E1/.75 A5/E1/.25','B5/E2/.5 A5/E1/.5 G5/A4/.5 F#5/A3/.5','F#5/A3/.5 E5/A2/.5 E5/A2/0/g F#5/A3/0/g E5/A2 D#5/A1 E5/A2 G5/A4','B5/E2/2'],
 ['B5/E4/.75 C#5/A2/.25 C#5/A2/.5 E6/E4/.5/h','E6/E4/.75/h G5/E2/.25 G5/E2/.5 G5/E2/.5','G5/E2/.5 F#5/E1/.5 F#5/E1/0/g G5/E2/0/g F#5/E1 E5/E0 D5/A3 E5/A4','F#5/E1/1.5 A5/E1/.5'],
 ['D6/E4/1 A5/E1/.75 A5/E1/.25','B5/E2/.5 A5/E1/.5 G5/A4/.5 F#5/A3/.5','F#5/A3/.5 E5/A2/.5 E5/A2/0/g F#5/A3/0/g E5/A2 D#5/A1 E5/A2 G5/A4','B5/E2/2'],
 ['D6/E4/.75 A5/E1/.25 A5/E1/.5 A5/E1/.5','B5/E2/.5 A5/E1/.5 A5/E1/.5 C#5/A2/.5','E5/A4/.5 D5/A3/.5 D5/A3/0/g E5/A4/0/g D5/A3/.5 C#5/A2/.5','D5/A3/1 r/1'],
// 3ページ・再現。前半12小節は2ページの同音型を再使用。
 ['=17','=18','=19','=20'],['=21','=22','=23','=24'],['=25','=26','=27','=28'],
 ['=29','Bb5/E4 A5/E3 G#5/E2 A5/E3 G#5/E2 A5/E1 B5/E2 C#6/E3','D6/E4/.5 r/.5 r/1','r/2'],
// Allegretto。最初のB5は小節線をまたいで結ぶ。
 ['D5/A1/.5 D6/E4/1 B5/E2/.5','B5/E2/.5/t A5/E1/1 F#5/A3/.5','E5/A2/.5 D5/A1/1 C#5/A1/.5','D5/A2/1 D5/A2/.5/t r/.5'],
 ['D5/A1 E5/A2 F#5/A3 E5/A2 D5/A1 E5/A2 F#5/A3 E5/A2','D5/A1 E5/A2 F#5/A3 E5/A2 D5/A1 E5/A2 F#5/A3 D5/A1','F#5/A3/.5 E5/A2/1 D#5/A1/.5','E5/A2/1 E5/A2/.5/t r/.5'],
 ['G5/E2 A5/E3 B5/E4 A5/E3 G5/E2 A5/E3 B5/E4 A5/E3','G5/E2 A5/E3 B5/E4 A5/E3 G5/E2 B5/E4 A5/E3 G5/E2','F#5/E1 G5/E2 A5/E3 G5/E2 F#5/E1 G5/E2 A5/E3 G5/E2','F#5/E1 G5/E2 A5/E3 G5/E2 F#5/E1 G5/E2 A5/E3 F#5/E1'],
 ['E5/E0 F#5/E1 G#5/E2 F#5/E1 E5/E0 F#5/E1 G#5/E2 F#5/E1','E5/E0 F#5/E1 G#5/E2 F#5/E1 E5/E0 F#5/E1 G#5/E2 E5/E0','A5/E3/.5 A5/E3/1 A5/E3/.5','A5/E3/.5/t A5/E3/1 A4/A0/.5'],
// a Tempo più presto以降。
 ['=65','=66','=67','=68'],['=69','=70','=71','=72'],['=73','=74','=75','F#5/E1 G5/E2 A5/E3 G5/E2 F#5/E1 A5/E3 G5/E2 F#5/E1'],
 ['E5/A4 D#5/A3 E5/E0 F#5/E1 G5/E2 F#5/E1 G5/E2 A5/E3','B5/E4 A5/E3 G#5/E2 A5/E3 G#5/E2 A5/E1 B5/E2 C#6/E3','D6/E4/1 r/1','A5/E1/1 r/1','D4/D0/2']
];
const sourceRows={a:[7,8,9,10],b:[1,2,3,4],c:[5,6,7,8],d:[1,2,3,4],e:[4,5,6,7,8],f:[8,9,10,11]};
const flat=DATA.flat();
export const MEASURES=[];
for(let k=0;k<flat.length;k++){
 const number=k+1,section=SECTIONS.find(s=>number>=s.start&&number<=s.end);
 let spec=flat[k],copiedFrom=null;
 if(spec.startsWith('=')){copiedFrom=+spec.slice(1);spec=MEASURES[copiedFrom-1].spec;}
 const events=spec.split(' ').map((token,eventIndex)=>{
  const p=token.split('/');
  if(p[0]==='r')return {rest:true,beats:+p[1],eventIndex};
  const [pitch,sf,beat,flag]=p,string=sf[0],finger=+sf[1],midi=pitchToMidi(pitch);
  const position=finger===0?null:flag==='h'?4:diatonic(pitch)-diatonic(STRINGS[string].open)-finger+1;
  return {pitch,midi,string,finger,position,beats:beat===undefined?.25:+beat,grace:flag==='g',tie:flag==='t',harmonic:flag==='h',eventIndex,measure:number,source:copiedFrom?'反復箇所から補完':'書き込み譜から転記'};
 });
 const key=number>=63&&number<=64?'D':section.key;
 const dottedRuns=new Set([5,6,9,10,11,12,13,14,17,18,19,21,22,23,25,26,27,28,29,30,49,50,51,53,54,55,57,58,59,60,69,70,73,74,75,76,77,78,85,86]);
 const dottedEvents={1:[0,1,3],2:[1,3],33:[2],38:[2,3],39:[7],47:[5],80:[2]};
 for(const e of events)e.staccato=!e.rest&&!e.grace&&((dottedRuns.has(number)&&e.beats===.25)||(dottedEvents[number]||[]).includes(e.eventIndex));
 const slurs=({33:[[1,2]],34:[[0,1],[2,3]],35:[[0,1],[4,7]],37:[[0,1],[2,3]],38:[[0,1],[2,3]],39:[[0,1],[4,6]],42:[[0,1],[2,3]],43:[[0,1],[4,7]],45:[[0,1]],46:[[0,1]],47:[[0,1],[4,5]],80:[[1,2]]})[number]||[];
 MEASURES.push({number,section:section.id,page:section.page,sectionNumber:number-section.start+1,spec,events,key,copiedFrom,notes:[],repeatStart:[1,17].includes(number),repeatEnd:[16,32].includes(number),fermataEvent:number===96?1:number===97?0:null,slurs});
}
export const NOTES=[];
for(const m of MEASURES){
 let localPrevious=null;
 for(const e of m.events){
  if(e.rest)continue;
  if(e.tie&&localPrevious){e.targetId=localPrevious.id;e.targetIndex=localPrevious.index;localPrevious.sustain+=e.beats;continue;}
  e.id=`${m.number}-${m.notes.length}`;e.index=m.notes.length;e.ordinal=NOTES.length;e.sustain=e.beats;e.targetId=e.id;e.targetIndex=e.index;
  e.continuesFromPrevious=!!e.tie;localPrevious=e;m.notes.push(e);NOTES.push(e);
 }
}
export const PHRASES=[];
for(const s of SECTIONS){
 const cuts=s.id==='c'?[[33,36],[37,40],[41,44],[45,48]]:s.id==='d'?[[49,52],[53,56],[57,60],[61,64]]:s.id==='f'?[[81,84],[85,88],[89,92],[93,97]]:[[s.start,s.start+3],[s.start+4,s.start+7],[s.start+8,s.start+11],[s.start+12,s.end]];
 const titles={a:['跳躍と着地','同じ指の往復','E線の細かい音','上行して結ぶ'],b:['装飾音から','D線からA線へ','高い音の往復','終止'],c:['歌い出し','高いミと返し','歌い出しの再現','ゆっくり結ぶ'],d:['装飾音の再現','D線の再現','高い音の再現','長調への橋渡し'],e:['明るい歌い出し','A線の往復','E線の往復','少しずつ落ち着く'],f:['最後の歌い出し','主題の返し','最後の細かい音','クライマックスと終止']};
 cuts.forEach(([start,end],i)=>PHRASES.push({id:PHRASES.length,section:s.id,title:titles[s.id][i],start,end,tempo:s.tempo}));
}
export const phraseFor=measure=>PHRASES.find(p=>measure>=p.start&&measure<=p.end);
export const positionLabel=n=>n.finger===0?'開放弦':`第${n.position}ポジション${n.harmonic?'・軽く触れる':''}`;
export function placement(n){
 if(n.finger===0)return {short:'開放',text:'指で押さえず、開放弦。',offset:0};
 if(n.harmonic)return {short:'◇',text:'E線の中央に4指で軽く触れる自然ハーモニクス。鳴る音はミ（E6）。',offset:0};
 let offset=0;
 if(n.position===1){const semis=n.midi-STRINGS[n.string].midi;offset=semis-[0,2,4,5,7][n.finger];}
 else{const step=diatonic(STRINGS[n.string].open)+n.position+n.finger-1;const natural='CDEFGAB'[step%7]+Math.floor(step/7);offset=n.midi-pitchToMidi(natural);}
 if(n.position===1&&n.finger===2&&offset===0)return {short:'2↑',text:'高い2指。隣の指との間隔は、下の配置を目安に。',offset:0};
 const short=offset?`${n.finger}${offset<0?'↓':'↑'}`:'',text=offset?`${offset<0?'低い':'高い'}${n.finger}指。${Math.abs(offset)===1?'半音':Math.abs(offset)+'半音'}${offset<0?'低く':'高く'}取る目安。`:`${n.finger}指の位置。`;
 return {short,text,offset};
}
export function handShape(n){
 if(n.finger===0||n.harmonic)return null;
 const base=diatonic(STRINGS[n.string].open)+n.position;
 const notes=[1,2,3,4].map(f=>{const d=base+f-1;let p='CDEFGAB'[d%7]+Math.floor(d/7);let midi=pitchToMidi(p);if(n.position===1)midi=STRINGS[n.string].midi+[0,2,4,5,7][f];return {finger:f,midi};});
 // 同じ小節、次いで近接する音の実際の指配置を使う。別ポジションは混ぜない。
 for(const shape of notes){
  const candidates=NOTES.filter(x=>x.string===n.string&&x.position===n.position&&x.finger===shape.finger&&!x.harmonic&&Math.abs(x.ordinal-n.ordinal)<=12);
  candidates.sort((a,b)=>Math.abs(a.ordinal-n.ordinal)-Math.abs(b.ordinal-n.ordinal));
  if(candidates[0])shape.midi=candidates[0].midi;
 }
 notes[n.finger-1].midi=n.midi;
 const close=[];for(let i=0;i<3;i++)if(notes[i+1].midi-notes[i].midi===1)close.push(`${i+1}–${i+2}`);
 return {notes,close};
}
export function instructionFor(n){
 const prev=NOTES[n.ordinal-1],next=NOTES[n.ordinal+1],p=placement(n);
 if(n.finger===0)return next?.position?`開放弦の間に第${next.position}ポジションを準備。`:'開放弦で響かせる。';
 const shift=prev?.position&&prev.position!==n.position?`第${prev.position}から第${n.position}ポジションへ。`:'';
 const shape=handShape(n);const wide=shape?shape.notes.slice(0,-1).map((x,i)=>shape.notes[i+1].midi-x.midi===3?`${i+1}–${i+2}指は全音より半音広く取る。`:'').filter(Boolean).join(' '):'';return shift+p.text+(shape?.close.length?` ${shape.close.join('、')}指は半音なので寄せる。`:'')+(wide?' '+wide:'');
}
