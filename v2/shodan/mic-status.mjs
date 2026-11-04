import {AUDIO_CUES,RESUME_MAX_MS,NO_INPUT_RMS,NO_INPUT_MS} from './engine.mjs';
export const MIC_VIEW={
 starting:{tone:'busy',title:'マイクを準備しています',reason:''},
 listening:{tone:'live',title:'聞いています',reason:'弾いてください'},
 hearing:{tone:'live',title:'聞いています',reason:''},
 success:{tone:'busy',title:'合っています',reason:'次の音へ進みます'},
 correction:{tone:'busy',title:'正しい音を鳴らしています',reason:'音程がずれました。鳴り終わると自動で再開'},
 reference:{tone:'busy',title:'お手本を鳴らしています',reason:'鳴り終わると自動で再開します'},
 resuming:{tone:'busy',title:'まもなく聞き直します',reason:'スピーカーの音を拾わないよう待っています'},
 paused:{tone:'paused',title:'一時停止中',reason:'「再開する」で続きから'},
 hidden:{tone:'paused',title:'一時停止中',reason:'画面を離れたので停止。「再開する」で続きから'},
 audioStopped:{tone:'stopped',title:'音の処理が止まっています',reason:'通話や画面ロックで止まりました。タップで再開',action:'再開する'},
 micEnded:{tone:'stopped',title:'マイクが切れました',reason:'タップでつなぎ直せます',action:'マイクをつなぎ直す'},
 micMuted:{tone:'busy',title:'マイクが一時的に使えません',reason:'他アプリの使用中かも。戻ると自動で再開'},
 noInput:{tone:'stopped',title:'マイクに音が届いていません',reason:'許可と接続を確かめてください',action:'マイクをつなぎ直す'}
};
const micSeverity={live:0,busy:1,paused:2,stopped:3};
export class MicStatusModel{
 constructor(){this.reset();}
 reset(){this.key=null;this.since=0;this.pending=null;this.pendingSince=0;this.silentSince=null;this.progressStart=null;this.remaining=1;}
 update(input){
  const {judgeState='listening',cueKind,cueDirection,rms=0,soundPresent=false,validPitch=false,ctxState='running',micHealth='live',phase='playing',pausedReason,nowMs=0,cueStartMs=0,cueEndMs=0}=input;
  const active=phase==='playing'&&ctxState==='running'&&!['ended','muted'].includes(micHealth)&&judgeState==='listening';
  if(active&&rms<NO_INPUT_RMS){if(this.silentSince===null)this.silentSince=nowMs;}else this.silentSince=null;
  let key=ctxState!=='running'?'audioStopped':micHealth==='ended'?'micEnded':micHealth==='muted'?'micMuted':phase==='paused'?(pausedReason==='hidden'?'hidden':'paused'):phase==='starting'?'starting':['correction','reference','success'].includes(judgeState)?judgeState:judgeState!=='listening'?'resuming':this.silentSince!==null&&nowMs-this.silentSince>=NO_INPUT_MS?'noInput':soundPresent?'hearing':'listening';
  if(key!==this.pending){this.pending=key;this.pendingSince=nowMs;}
  if(key!==this.key){const old=MIC_VIEW[this.key],next=MIC_VIEW[key],livePair=old?.tone==='live'&&next.tone==='live',urgent=['audioStopped','micEnded','micMuted'].includes(key)||old&&micSeverity[next.tone]>micSeverity[old.tone],resume=old?.tone==='busy'&&next.tone==='live';if(!old||urgent||resume||(livePair?nowMs-this.pendingSince>=400:nowMs-this.since>=300)){this.key=key;this.since=nowMs;}}
  const view={key:this.key,...MIC_VIEW[this.key],action:MIC_VIEW[this.key].action||'',progress:null};
  if(view.key==='hearing')view.reason=!soundPresent?'弾いてください':validPitch?'':'音程を聞き取っています';
  if(view.key==='correction'&&['low','high'].includes(cueDirection))view.reason=`音程が${cueDirection==='low'?'低め':'高め'}でした。鳴り終わると自動で再開`;
  if(['success','correction','reference','resuming'].includes(view.key)){
   if(this.progressStart!==cueStartMs){this.progressStart=cueStartMs;this.remaining=1;}
   // cueEndMsは再生終了。残響と最長待ちも同じ1本の残量に含める。
   const end=cueEndMs+AUDIO_CUES.tail*1000+(cueKind==='success'?0:RESUME_MAX_MS),span=Math.max(1,end-cueStartMs);
   this.remaining=Math.min(this.remaining,Math.max(0,Math.min(1,(end-nowMs)/span)));view.progress=this.remaining;
  }else if(view.tone!=='busy'){this.progressStart=null;this.remaining=1;}
  return view;
 }
}
export function micPanelHTML(){return '<div id="micStatus" class="mic-chip" data-tone="busy" data-key="starting" aria-live="polite" aria-atomic="false"><span class="mic-chip-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg><span class="mic-chip-symbol">◷</span></span><div class="mic-chip-copy"><strong class="mic-chip-title">マイクを準備しています</strong><span class="mic-chip-reason" aria-live="off"></span></div><button class="mic-chip-action" data-action="micRecover" aria-live="off" hidden></button><span class="mic-chip-progress" aria-hidden="true" hidden><span></span></span></div><section class="pitch-meter" aria-label="音程"><div class="meter-labels"><span>低い</span><span>正解</span><span>高い</span></div><div class="meter-track" id="pitchMeter" role="meter" aria-label="目標からの音程差" aria-valuemin="-50" aria-valuemax="50" aria-valuenow="0" aria-valuetext="マイクを準備しています"><span id="pitchBand" class="pitch-band"></span><span class="meter-center"></span><span id="pitchNeedle" class="pitch-needle" hidden></span></div><div class="meter-reading"><strong id="pitchDirection"></strong><output id="pitchCents">— ¢</output></div><div class="mic-status"><div class="mic-bar" role="meter" aria-label="マイクの音量" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="micLevel"></span></div><p id="micFeedback" role="status"></p></div></section>';}
export function paintMicStatus(root,view){
 const chip=root.querySelector('#micStatus');if(!chip)return;
 for(const name of ['key','tone'])if(chip.dataset[name]!==view[name])chip.dataset[name]=view[name];
 const put=(selector,value)=>{const el=root.querySelector(selector);if(el&&el.textContent!==value)el.textContent=value;return el;};
 put('.mic-chip-title',view.title);put('.mic-chip-reason',view.reason);put('.mic-chip-symbol',view.tone==='live'?'●':view.tone==='busy'?'◷':view.tone==='stopped'?'!':'Ⅱ');
 const button=put('.mic-chip-action',view.action||'');if(button&&button.hidden!==!view.action)button.hidden=!view.action;
 const bar=root.querySelector('.mic-chip-progress'),fill=root.querySelector('.mic-chip-progress>span');if(bar&&bar.hidden!==(view.progress===null))bar.hidden=view.progress===null;
 const width=`${(view.progress??0)*100}%`;if(fill&&fill.style.width!==width)fill.style.width=width;
}
