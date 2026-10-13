import{MEASURES,frequencyFor}from'./score.mjs';
// 拍を秒へ変換する純粋関数。装飾は直後の音の前半を借り、タイは同じ発音へ結合する。
export function phraseTimeline(start,end,bpm=72){
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end>MEASURES.length||start>end||bpm<20||bpm>240)throw RangeError('再生範囲');
 const unit=60/bpm,out=[];let beat=0,pendingGrace=[];
 for(const m of MEASURES.slice(start-1,end))for(const e of m.events){
  if(e.grace){pendingGrace.push(e);continue;}
  if(e.rest){out.push({kind:'rest',time:beat*unit,duration:e.beats*unit,measure:m.number});beat+=e.beats;continue;}
  const borrow=pendingGrace.length?Math.min(e.beats*.35,.16):0;
  pendingGrace.forEach((g,i)=>out.push({kind:'note',time:(beat+borrow*i/pendingGrace.length)*unit,duration:borrow/pendingGrace.length*unit,note:g,measure:m.number,grace:true}));pendingGrace=[];
  const previous=out.at(-1);
  if(e.tie&&previous?.kind==='note'&&previous.note.midi===e.midi&&Math.abs(previous.time+previous.duration-beat*unit)<.001){previous.duration+=e.beats*unit;out.push({kind:'cursor',time:beat*unit,duration:0,note:e,measure:m.number});}
  else out.push({kind:'note',time:(beat+borrow)*unit,duration:(e.beats-borrow)*unit,note:e,measure:m.number});
  beat+=e.beats;
 }
 return{events:out,duration:beat*unit,beats:beat};
}
export class PhrasePlayer{
 constructor(audio,onEvent,onState){this.audio=audio;this.onEvent=onEvent;this.onState=onState;this.token=0;this.nodes=[];this.timers=[];this.active=false;}
 stop(){this.token++;this.active=false;for(const id of this.timers)clearTimeout(id);this.timers=[];for(const node of this.nodes){try{node.stop();}catch{}try{node.disconnect();}catch{}}this.nodes=[];}
 scheduleTone(ctx,time,duration,f,volume,click=false){const osc=ctx.createOscillator(),gain=ctx.createGain();if(click)osc.type='sine';else osc.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0,0,0,0]),new Float32Array([0,1,.2,.065])));osc.frequency.value=f;gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume*(click?.12:.34),time+Math.min(.012,duration*.16));gain.gain.setValueAtTime(volume*(click?.12:.34),time+Math.max(.015,duration*.76));gain.gain.exponentialRampToValueAtTime(.0001,time+duration);osc.connect(gain).connect(ctx.destination);osc.start(time);osc.stop(time+duration+.012);this.nodes.push(osc,gain);osc.onended=()=>{osc.disconnect();gain.disconnect();this.nodes=this.nodes.filter(n=>n!==osc&&n!==gain);};}
 async start({start,end,bpm,tuning,volume,loop=false}){
  this.stop();const token=this.token;this.active=true;this.onState('loading');let ctx;
  try{ctx=await this.audio.context();}catch(e){if(token===this.token)this.stop();throw e;}
  if(token!==this.token)return;const plan=phraseTimeline(start,end,bpm),beat=60/bpm;
  const later=(sec,fn)=>{const id=setTimeout(()=>{this.timers=this.timers.filter(t=>t!==id);if(this.active&&token===this.token)fn();},Math.max(0,sec*1000));this.timers.push(id);};
  const play=(time,phase)=>{later(time-ctx.currentTime,()=>this.onState(phase));for(const ev of plan.events){if(ev.kind==='note')this.scheduleTone(ctx,time+ev.time,ev.duration*(ev.grace?.82:.93),frequencyFor(ev.note.midi,tuning),volume);later(time+ev.time-ctx.currentTime,()=>this.onEvent(ev));}};
  const cycle=()=>{if(token!==this.token||!this.active)return;const now=ctx.currentTime+.08,after=now+plan.duration+.45,imitate=after+4*beat;play(now,'listen');for(let i=0;i<4;i++){this.scheduleTone(ctx,after+i*beat,.06,i===0?1100:820,volume,true);later(after+i*beat-ctx.currentTime,()=>this.onState('count',4-i));}play(imitate,'together');later(imitate+plan.duration+.3-ctx.currentTime,()=>{if(loop){this.onState('again');later(1,cycle);}else{this.active=false;this.onState('done');}});};cycle();
 }
}
