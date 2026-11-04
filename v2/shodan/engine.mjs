import {etFreq,centsBetween} from './intonation.mjs';
export const frequencyFor=(midi,a4=442)=>etFreq(midi,a4);
export const centsFrom=(frequency,midi,a4=442)=>centsBetween(frequency,frequencyFor(midi,a4));
// 音量の感度と音程の許容幅は分離。半音違いを合格にしない。
export const MIC_LEVELS={normal:{minRms:.003,confidence:.8},high:{minRms:.001,confidence:.72},ultra:{minRms:.0005,confidence:.65}};
export class PitchDetector{
 constructor(rate){this.rate=rate/2;this.x=new Float32Array(2048);this.maxTau=Math.ceil(this.rate/85);this.diff=new Float32Array(this.maxTau+2);}
 detect(input,level='high'){
  const cfg=MIC_LEVELS[level]||MIC_LEVELS.high,x=this.x,size=Math.min(x.length,Math.floor(input.length/2));let mean=0;
  for(let i=0;i<size;i++){x[i]=(input[2*i]+input[2*i+1])/2;mean+=x[i];}mean/=size;
  let power=0;for(let i=0;i<size;i++){x[i]-=mean;power+=x[i]*x[i];}
  const rms=Math.sqrt(power/size);if(rms<cfg.minRms)return {rms,frequency:null,confidence:0};
  const d=this.diff,n=size-this.maxTau-1;let sum=0;d[0]=1;
  for(let t=1;t<=this.maxTau+1;t++){let v=0;for(let i=0;i<n;i++){const delta=x[i]-x[i+t];v+=delta*delta;}sum+=v;d[t]=sum?v*t/sum:1;}
  let best=-1;const min=Math.floor(this.rate/2400);
  for(let t=min;t<=this.maxTau;t++)if(d[t]<=d[t-1]&&d[t]<d[t+1]){if(best<0||d[t]<d[best])best=t;if(d[t]<.15){best=t;break;}}
  if(best<0||1-d[best]<cfg.confidence)return {rms,frequency:null,confidence:0};
  const interpolate=t=>{const den=2*(2*d[t]-d[t-1]-d[t+1]),shift=den?(d[t+1]-d[t-1])/den:0;return t+Math.max(-1,Math.min(1,shift));};
  let period=interpolate(best);const multiple=Math.min(4,Math.floor((this.maxTau-2)/period));
  // 高音の短い周期では1標本の丸め誤差が大きい。最初の周期を保ち、2〜4周期先で補間する。
  if(multiple>=2){const center=Math.round(period*multiple);let refined=center;for(let t=Math.max(2,center-2);t<=Math.min(this.maxTau,center+2);t++)if(d[t]<d[refined])refined=t;if(d[refined]<d[best]+.05)period=interpolate(refined)/multiple;}
  return {rms,frequency:this.rate/period,confidence:1-d[best]};
 }
}
export class StablePitchGate{
 constructor(){this.reset();}
 reset(){this.since=null;this.last=null;}
 observe(reading,range,ms){
  const ok=reading.frequency&&reading.frequency>=range.loHz-1e-9&&reading.frequency<=range.hiHz+1e-9;
  if(!ok){this.reset();return false;}
  if(this.last===null||ms-this.last>GAP_MS)this.since=ms;
  this.last=ms;return ms-this.since>=320;
 }
}
// 再生・残響と復帰待ちを分け、利用者の入力だけで再装填する。
export const RESUME_MAX_MS=400,GAP_MS=180,QUIET_MS=120,NO_INPUT_RMS=1e-5,NO_INPUT_MS=2000;
export const AUDIO_CUES={reference:{duration:.8,volume:.65},correction:{duration:.6,volume:.85},success:{duration:.3,volume:.6},complete:{duration:.54,volume:.25},tail:.2,silenceMs:QUIET_MS};
export class MicJudge{
 constructor(){this.gate=new StablePitchGate();this.reset();}
 reset(){this.state='listening';this.cueKind=null;this.cueDirection=null;this.cueStart=0;this.soundEnd=0;this.blockedUntil=0;this.quietSince=null;this.userReading=null;this.targetHz=null;this.repeatGuard=null;this.correctionGuard=null;this.nextNote();}
 nextNote(){this.gate.reset();this.samples=[];this.last=null;}
 block(kind,ms,duration=AUDIO_CUES[kind]?.duration??0){this.cueKind=kind;this.cueStart=ms;this.blockRms=this.userReading?.rms||0;this.blockHz=this.userReading?.frequency||null;this.cueDirection=kind==='correction'&&this.blockHz&&this.targetHz?(this.blockHz<this.targetHz?'low':this.blockHz>this.targetHz?'high':null):null;if(kind==='success'&&this.targetHz)this.repeatGuard={hz:this.targetHz,rms:this.blockRms};this.state=kind;this.soundEnd=ms+duration*1000;this.blockedUntil=this.soundEnd+AUDIO_CUES.tail*1000;this.quietSince=null;this.nextNote();}
 cutCue(ms){if(ms>=this.soundEnd)return;this.state='tail';this.soundEnd=ms;this.blockedUntil=ms+AUDIO_CUES.tail*1000;this.quietSince=null;}
 observe(reading,range,ms,level='high',sounds={}){
  const cfg=MIC_LEVELS[level]||MIC_LEVELS.high,valid=reading.rms>=cfg.minRms&&!!reading.frequency&&reading.confidence>=cfg.confidence,gap=rms=>!valid||reading.rms<rms*.5;
  if(this.repeatGuard&&gap(this.repeatGuard.rms))this.repeatGuard=null;
  if(this.state!=='listening'){
   if(ms<this.soundEnd)return null;
   if(ms<this.blockedUntil){this.state='tail';return null;}
   if(this.cueKind==='success')this.state='listening';
   else{this.state='awaitSilence';const quiet=reading.rms<Math.max(cfg.minRms,.35*this.blockRms);if(quiet){if(this.quietSince===null)this.quietSince=ms;}else this.quietSince=null;
    const early=this.quietSince!==null&&ms-this.quietSince>=QUIET_MS;
    if(!early&&ms-this.blockedUntil<RESUME_MAX_MS)return null;
    if(!early&&this.cueKind==='correction')this.correctionGuard={hz:this.blockHz,rms:this.blockRms};this.state='listening';
   }
   this.nextNote();
   // 復帰を決めたフレームは判定に数えない。次の入力から320msを測る。
   if(this.correctionGuard&&(gap(this.correctionGuard.rms)||(valid&&this.correctionGuard.hz&&Math.abs(centsBetween(reading.frequency,this.correctionGuard.hz))>=30-1e-9)))this.correctionGuard=null;
   return null;
  }
  if(this.repeatGuard&&(Math.abs(centsBetween(range.targetHz,this.repeatGuard.hz))>1+1e-9||gap(this.repeatGuard.rms)))this.repeatGuard=null;
  if(this.correctionGuard&&(gap(this.correctionGuard.rms)||(valid&&this.correctionGuard.hz&&Math.abs(centsBetween(reading.frequency,this.correctionGuard.hz))>=30-1e-9)))this.correctionGuard=null;
  this.userReading={...reading};this.targetHz=range.targetHz;
  if(!valid){if(this.last!==null&&ms-this.last>GAP_MS)this.nextNote();return null;}
  if(this.last!==null&&ms-this.last>GAP_MS)this.nextNote();this.last=ms;
  if(!this.repeatGuard&&this.gate.observe(reading,range,ms)){this.block('success',ms,sounds.correct===false?0:AUDIO_CUES.success.duration);return 'correct';}
  const cents=centsBetween(reading.frequency,range.targetHz);
  if(cents>=range.lowCents&&cents<=range.highCents){this.samples=[];return null;}
  if(this.correctionGuard)return null;
  this.samples.push({ms,cents});while(this.samples.length>1&&this.samples[1].ms<=ms-650)this.samples.shift();
  const values=this.samples.map(x=>x.cents),stable=Math.max(...values)-Math.min(...values)<=12,sameSide=values.every(c=>c<range.lowCents)||values.every(c=>c>range.highCents);
  if(stable&&sameSide&&ms-this.samples[0].ms>=650){if(sounds.correction===false){this.samples=[];return null;}this.block('correction',ms);return 'wrong';}
  return null;
 }
}
export function transportStart(mode,mic){const counts=!mic&&mode==='continuous'?4:0;return {phase:counts?'countdown':'playing',counts};}
export class AudioEngine{
 constructor(){this.ctx=null;this.nodes=new Set();this.silentUntil=0;this.onstate=null;}
 async init(){if(!this.ctx){const A=window.AudioContext||window.webkitAudioContext;if(!A)throw new Error('このブラウザは音の再生に対応していません。SafariまたはChromeで開いてください。');try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}this.ctx=new A();this.ctx.onstatechange=()=>this.onstate?.(this.state);this.out=this.ctx.createDynamicsCompressor?this.ctx.createDynamicsCompressor():null;if(this.out){this.out.threshold.value=-3;this.out.knee.value=0;this.out.ratio.value=20;this.out.attack.value=.003;this.out.release.value=.15;this.out.connect(this.ctx.destination);}const dest=this.out||this.ctx.destination;this.master=this.ctx.createGain();this.master.gain.value=.5;this.master.connect(dest);this.cue=this.ctx.createGain();this.cue.gain.value=1.7;this.cue.connect(dest);this.bright=this.ctx.createPeriodicWave(new Float32Array(8),new Float32Array([0,1,.7,.45,.3,.2,.12,.08]));}await this.ctx.resume();return this.ctx;}
 get state(){return this.ctx?.state||'off';}
 async ensureRunning(){if(!this.ctx)return false;if(this.state!=='running')try{await this.ctx.resume();}catch{}return this.state==='running';}
 get time(){return this.ctx?.currentTime||0;}
 tone(midi,duration=.5,at=this.time,volume=.6){return this.toneHz(frequencyFor(midi),duration,at,volume);}
 toneHz(frequency,duration=.5,at=this.time,volume=.6,wave='triangle'){
  if(!this.ctx)return;
  const o=this.ctx.createOscillator(),g=this.ctx.createGain(),bright=wave==='bright'&&this.bright,cue=wave==='bright'||wave==='chime';if(bright)o.setPeriodicWave(this.bright);else o.type=wave==='bright'?'sawtooth':wave==='chime'?'sine':wave;o.frequency.value=frequency;
  g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(volume,at+.025);g.gain.setValueAtTime(volume,at+Math.max(.03,duration-.05));g.gain.linearRampToValueAtTime(0,at+duration);
  o.connect(g);g.connect(cue?this.cue:this.master);o.start(at);o.stop(at+duration+.02);this.nodes.add(o);o.onended=()=>{this.nodes.delete(o);o.disconnect();g.disconnect();};
  this.silentUntil=Math.max(this.silentUntil,at+duration+AUDIO_CUES.tail);
 }
 click(at=this.time,accent=false){if(!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.frequency.value=accent?1200:880;o.type='sine';g.gain.setValueAtTime(.35,at);g.gain.exponentialRampToValueAtTime(.001,at+.055);o.connect(g);g.connect(this.master);o.start(at);o.stop(at+.065);this.nodes.add(o);o.onended=()=>{this.nodes.delete(o);o.disconnect();g.disconnect();};}
 success(){const c=AUDIO_CUES.success,t=this.time;this.toneHz(988,.14,t,c.volume,'chime');this.toneHz(1319,c.duration-.12,t+.12,c.volume,'chime');}
 complete(){const c=AUDIO_CUES.complete;this.toneHz(660,.18,this.time,c.volume,'sine');this.toneHz(990,.4,this.time+.14,c.volume,'sine');}
 correction(frequency){this.toneHz(frequency,AUDIO_CUES.correction.duration,this.time,AUDIO_CUES.correction.volume,'bright');}
 stop(){const active=this.nodes.size>0;for(const o of this.nodes){try{o.stop();}catch{}}this.nodes.clear();this.silentUntil=active?this.time+AUDIO_CUES.tail:Math.min(this.silentUntil,this.time+AUDIO_CUES.tail);}
 async close(){this.stop();if(this.ctx){await this.ctx.close();this.ctx=null;}}
}
export class Microphone{
 constructor(audio){this.audio=audio;this.stream=null;this.generation=0;this.onhealth=null;}
 get health(){if(!this.stream)return 'off';const tracks=this.stream.getAudioTracks();if(!tracks.length||tracks.some(t=>t.readyState==='ended'))return 'ended';return tracks.some(t=>t.muted)?'muted':'live';}
 async restart(){this.stop();return this.start();}
 async start(){const gen=++this.generation;if(!navigator.mediaDevices?.getUserMedia)throw new Error('マイクはHTTPSのページ、またはこのMacのlocalhostで使えます。');
  try{if(navigator.audioSession)navigator.audioSession.type='play-and-record';}catch{}
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:true}});}catch(e){try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}throw e;}
  if(gen!==this.generation){stream.getTracks().forEach(t=>t.stop());return false;}
  this.stream=stream;for(const track of stream.getAudioTracks())for(const name of ['ended','mute','unmute'])track.addEventListener(name,()=>{if(this.stream===stream)this.onhealth?.(this.health);});this.onhealth?.(this.health);this.source=this.audio.ctx.createMediaStreamSource(stream);this.analyser=this.audio.ctx.createAnalyser();this.analyser.fftSize=4096;this.source.connect(this.analyser);this.buffer=new Float32Array(4096);this.detector=new PitchDetector(this.audio.ctx.sampleRate);return true;
 }
 read(level){if(!this.analyser)return {rms:0,frequency:null,confidence:0};this.analyser.getFloatTimeDomainData(this.buffer);return this.detector.detect(this.buffer,level);}
 stop(){this.generation++;try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}this.stream?.getTracks().forEach(t=>t.stop());this.source?.disconnect();this.analyser?.disconnect();this.stream=null;this.source=null;this.analyser=null;this.onhealth?.(this.health);}
}
