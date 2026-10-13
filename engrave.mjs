import{STRINGS,ROMAN,diatonic,pitchLabel,placement}from'./score.mjs';
import{CLEF_PATH,SHARP_PATH,NATURAL_PATH}from'./glyphs.mjs';
const line=(a,b,c,d,attrs='')=>`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" ${attrs}/>`;
const txt=(x,y,t,a='')=>`<text x="${x}" y="${y}" ${a}>${t}</text>`;
const flat=(x,y,s=1)=>`<path d="M${x} ${y-20*s}v27 Q${x+15*s} ${y-5*s} ${x} ${y+2*s}" fill="none" stroke="currentColor" stroke-width="1.9"/>`;
function accidental(p,key,state){const letter=p[0]+p.at(-1),alt=p.includes('#')?'#':p.includes('b')?'b':'natural',def=key==='D'&&['F','C'].includes(p[0])?'#':key==='Dm'&&p[0]==='B'?'b':'natural';const prev=state[letter]??def;state[letter]=alt;return prev!==alt?alt:null;}
function rest(x,y,beats){if(beats>=2)return `<rect x="${x-10}" y="${y-13}" width="20" height="6" fill="currentColor"/>`;if(beats===1)return `<path d="M${x-4} ${y-34}l10 14 -11 13 10 12q-15 -6 -10 8q-13 -13 1 -20l-6 -9 8 -9z" fill="currentColor"/>`;return `<circle cx="${x-5}" cy="${y-16}" r="5" fill="currentColor"/><path d="M${x-4} ${y-13}q8 5 12 -10l-9 37" fill="none" stroke="currentColor" stroke-width="2"/>`;}
export function engrave(m,currentIndex=0,passed=new Set()){
 const groups=[];let chunk=[],beatsInRow=0;
 // 装飾も含めて音が多い小節は、拍の境目で改段する。
 for(const e of m.events){if(beatsInRow>=1&&m.events.length>6){groups.push(chunk);chunk=[];beatsInRow=0;}chunk.push(e);beatsInRow+=e.beats;}if(chunk.length)groups.push(chunk);
 const accidentalState={};let totalBeat=0;
 return groups.map((events,row)=>{
 const highest=Math.max(4,...events.filter(e=>!e.rest).map(e=>diatonic(e.pitch)-diatonic('E4'))),bottom=Math.max(159,123+highest*6),top=bottom-48;
 const weights=events.map(e=>e.grace?.7:1),weight=weights.reduce((a,b)=>a+b,0),gap=425/weight;let cursor=110;
 const points=events.map((e,i)=>{const x=cursor+gap*weights[i]/2;cursor+=gap*weights[i];const point={e,x,y:e.rest?top+24:bottom-(diatonic(e.pitch)-diatonic('E4'))*6,beat:totalBeat};totalBeat+=e.beats;return point;});
 const beams=[];let group=[];
 for(const p of points){const e=p.e;if(e.grace||(!e.rest&&e.beats<1)){const prev=group.at(-1);if(prev&&(e.grace!==prev.e.grace||Math.floor(p.beat+.00001)!==Math.floor(prev.beat+.00001))){beams.push(group);group=[];}group.push(p);}else{if(group.length)beams.push(group);group=[];}}if(group.length)beams.push(group);
 const beamInfo=new Map();
 for(const group of beams){const grace=group[0].e.grace,down=!grace&&group.reduce((sum,p)=>sum+p.y,0)/group.length<top+24,beamY=down?Math.max(...group.map(p=>p.y))+37:Math.min(...group.map(p=>p.y))-(grace?29:37);for(const p of group)beamInfo.set(p,{down,beamY,group});}
 // 符尾・連桁・下加線を含む音符の下端より弦名を下へ置く。
 const noteBottom=Math.max(bottom,...points.filter(p=>!p.e.rest).map(p=>{const info=beamInfo.get(p),down=info?info.down:p.y<top+24;return Math.max(p.y+9,info?.beamY??p.y+(down?36:-36));}));
 const labelY=Math.max(bottom+27,noteBottom+20),height=labelY+13;
 let out=`<svg class="staff" viewBox="0 0 560 ${height}" role="group" aria-label="練習${m.number}小節${groups.length>1?`、${row+1}段目`:''}">`;
 const active=points.filter(p=>!p.e.rest&&p.e.targetIndex===currentIndex);
 for(const p of active)out+=`<rect x="${p.x-gap*p.e.grace*.1-gap*.43}" y="7" width="${Math.max(28,gap*.86)}" height="${height-13}" rx="12" fill="${STRINGS[p.e.string].pale}"/>`;
 out+='<g stroke="#aab5a9" stroke-width="1">';for(let i=0;i<5;i++)out+=line(10,top+12*i,551,top+12*i);out+='</g>';
 out+=`<path d="${CLEF_PATH}" transform="translate(16 ${bottom-12}) scale(12)" fill="#283b31"/>`;
 if(m.key==='Dm')out+=flat(57,top+24);
 else out+=`<path d="${SHARP_PATH}" transform="translate(54 ${top}) scale(10)"/><path d="${SHARP_PATH}" transform="translate(66 ${top+18}) scale(10)"/>`;
 if(row===0)out+=txt(89,top+19,'2','font-size="22" font-family="Georgia" text-anchor="middle"')+txt(89,top+42,'4','font-size="22" font-family="Georgia" text-anchor="middle"');
 if(row===groups.length-1)out+=line(551,top,551,bottom,'stroke="#526556" stroke-width="1.6"');
 if(groups.length>1)out+=txt(14,37,`${row+1}拍目`,'font-size="12" fill="#6c776b"');
 for(const p of points){const {e,x,y}=p;if(e.rest){out+=`<g color="#344d3d">${rest(x,top+25,e.beats)}</g>`;continue;}
 const s=STRINGS[e.string],active=e.targetIndex===currentIndex,done=passed.has(e.targetId),size=e.grace?6:8.7,info=beamInfo.get(p),down=info?info.down:y<top+24,stemX=x+(down?-size+1:size-1),stemY=info?.beamY??y+(down?36:-36);
 const color=active?s.color:done?'#78937c':'#283b31',hint=placement(e);
 out+=`<g class="score-note${active?' active':''}" data-note-index="${e.targetIndex}" role="button" tabindex="0" aria-label="${e.grace?'装飾音、':''}${pitchLabel(e.pitch)}、${e.string}線${e.finger}指、${e.finger===0?'開放弦':`第${e.position}ポジション`}から"><rect x="${x-gap*weights[points.indexOf(p)]*.49}" y="7" width="${gap*weights[points.indexOf(p)]*.98}" height="${height-13}" fill="transparent"/>`;
 if(!e.tie||e.continuesFromPrevious){
 out+=txt(x,42,e.finger,`text-anchor="middle" font-size="${e.grace?23:35}" font-weight="750" fill="${s.color}"`);
 out+=txt(x,66,e.finger===0?'開放':ROMAN[e.position],`text-anchor="middle" font-size="${e.grace?13:18}" font-weight="650" fill="${s.color}"`);
 if(hint.short&&hint.short!=='開放')out+=txt(x,87,hint.short,`text-anchor="middle" font-size="${e.grace?12:16}" fill="${s.color}"`);
 
 }
 for(let ly=top-12;ly>=y-1;ly-=12)out+=line(x-14,ly,x+14,ly,'stroke="#53634f" stroke-width="1.4"');
 for(let ly=bottom+12;ly<=y+1;ly+=12)out+=line(x-14,ly,x+14,ly,'stroke="#53634f" stroke-width="1.4"');
 const acc=accidental(e.pitch,m.key,accidentalState);
 if(acc==='b')out+=`<g color="${color}">${flat(x-19,y,.8)}</g>`;
 if(acc&&acc!=='b')out+=`<path d="${acc==='#'?SHARP_PATH:NATURAL_PATH}" transform="translate(${x-25} ${y}) scale(${e.grace?8:10})" fill="${color}"/>`;
 out+=`<ellipse cx="${x}" cy="${y}" rx="${size}" ry="${size*.68}" transform="rotate(-20 ${x} ${y})" fill="${e.beats>=2?'#fffef9':color}" stroke="${color}" stroke-width="1.8"/>`+line(stemX,y,stemX,stemY,`stroke="${color}" stroke-width="2"`);
 if(e.beats===.75||e.beats===1.5)out+=`<circle cx="${x+14}" cy="${y-3}" r="2.2" fill="${color}"/>`;
 if(e.harmonic)out+=txt(x,y-18,'○',`text-anchor="middle" font-size="13" fill="${color}"`);
 if(e.staccato)out+=`<circle cx="${x}" cy="${y-18}" r="2" fill="${color}"/>`;
 if(e.grace)out+=line(stemX-4,stemY+12,stemX+8,stemY+3,`stroke="${color}" stroke-width="1.2"`);
 out+=txt(x,labelY,`${e.string}線`, `class="string-label" text-anchor="middle" font-size="${e.grace?11:14}" fill="${s.color}"`);
 out+='</g>';
 }
 for(const group of beams){const info=beamInfo.get(group[0]),sx=p=>p.x+(info.down?-7.7:group[0].e.grace?5:7.7);out+='<g class="beam-or-flag">';if(group.length>1){out+=line(sx(group[0]),info.beamY,sx(group.at(-1)),info.beamY,'stroke="#283b31" stroke-width="4"');for(let i=0;i<group.length;i++){const p=group[i];if(p.e.beats===.25||p.e.grace){const next=group[i+1],prev=group[i-1],xx=next&&(next.e.beats===.25||next.e.grace)?sx(next):prev&&(prev.e.beats===.25||prev.e.grace)?sx(p):sx(p)+(i===0?10:-10);out+=line(sx(p),info.beamY+(info.down?-6:6),xx,info.beamY+(info.down?-6:6),'stroke="#283b31" stroke-width="3"');}}}else{const p=group[0],x=sx(p),y=info.beamY;out+=`<path d="M${x} ${y}q${info.down?-17:17} ${info.down?-13:13} 2 ${info.down?-25:25}" fill="none" stroke="#283b31" stroke-width="2.5"/>`;if(p.e.beats===.25)out+=`<path d="M${x} ${y+(info.down?-6:6)}q${info.down?-17:17} ${info.down?-13:13} 2 ${info.down?-25:25}" fill="none" stroke="#283b31" stroke-width="2"/>`;}out+='</g>';}
 points.forEach((p,i)=>{if(p.e.tie){const prev=points[i-1];const x=prev&&!prev.e.rest?prev.x:p.x-35;out+=`<path d="M${x+5} ${p.y-14} Q${(x+p.x)/2} ${p.y-34} ${p.x-5} ${p.y-14}" fill="none" stroke="#526556" stroke-width="1.4"/>`;}});
 // 歌う部分のフレーズ内スラーと装飾音のまとまり。
 for(const [a,b] of m.slurs||[]){const p=points.find(p=>p.e.eventIndex===a),q=points.find(p=>p.e.eventIndex===b);if(p&&q){const startX=p.x+(p.e.harmonic?14:0),endX=q.x-(q.e.harmonic?14:0),startY=p.y-(p.e.staccato?29:17),endY=q.y-(q.e.staccato?29:17),archY=Math.min(startY,endY)-22;out+=`<path class="slur" d="M${startX} ${startY}Q${(startX+endX)/2} ${archY} ${endX} ${endY}" fill="none" stroke="#526556" stroke-width="1.3"/>`;}}
 const grace=points.filter(p=>p.e.grace);if(grace.length){const end=points[points.indexOf(grace.at(-1))+1];if(end)out+=`<path d="M${grace[0].x} ${Math.max(...grace.map(p=>p.y))+12}Q${(grace[0].x+end.x)/2} ${Math.max(...grace.map(p=>p.y))+29} ${end.x} ${end.y+12}" fill="none" stroke="#526556" stroke-width="1.2"/>`;}
 if(m.repeatStart&&row===0)out+=txt(100,top+32,':','font-size="24"');if(m.repeatEnd&&row===groups.length-1)out+=txt(538,top+32,':','font-size="24"');
 if(m.fermataEvent!==null){const p=points.find(x=>x.e.eventIndex===m.fermataEvent);if(p){const fy=Math.min(p.y-24,top-22);out+=`<g data-fermata-event="${m.fermataEvent}"><path d="M${p.x-13} ${fy}Q${p.x} ${fy-22} ${p.x+13} ${fy}" fill="none" stroke="#283b31" stroke-width="2"/><circle cx="${p.x}" cy="${fy-3}" r="2"/></g>`;}}
 return out+'</svg>';
 }).join('');
}
