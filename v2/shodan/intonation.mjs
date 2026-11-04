import {OPEN_MIDI,OPEN_LETTERS,OPEN_FIFTHS_FROM_A,OPEN_FIFTHS_FROM_C} from './instrument.mjs';
// Answer Tuner Core/IntonationMath.swift・TonalContext.swift・DrillTarget.swift の数値モデル。
// アプリでは独奏の旋律を使用。和声・他の調弦モードは移植元の数値との照合用。
export const DIFFICULTIES={easy:15,normal:8,strict:5};
export const mod12=n=>((n%12)+12)%12;
export const ratioCents=ratio=>1200*Math.log2(ratio);
export const centsBetween=(frequency,target)=>frequency>0&&target>0?ratioCents(frequency/target):Infinity;
export const etFreq=(midi,a4=442)=>a4*2**((midi-69)/12);
export const FIFTH_DEVIATION=ratioCents(3/2)-700;
export const PYTH_RATIOS=[1,256/243,9/8,32/27,81/64,4/3,729/512,3/2,128/81,27/16,16/9,243/128];
export const JI_RATIOS=[1,16/15,9/8,6/5,5/4,4/3,45/32,3/2,8/5,5/3,9/5,15/8];
export const STANDARD_FIFTHS=[0,-5,2,-3,4,-1,6,1,-4,3,-2,5];
export const SCALE_FORMS={major:[0,2,4,5,7,9,11],naturalMinor:[0,2,3,5,7,8,10],harmonicMinor:[0,2,3,5,7,8,11],melodicMinor:[0,2,3,5,7,9,11]};
const LETTER_PC=[0,2,4,5,7,9,11],LETTER_FIFTHS=[0,2,4,-1,1,3,5];
const TONICS=['ド','レ♭','レ','ミ♭','ミ','ファ','ファ♯','ソ','ラ♭','ラ','シ♭','シ'],KANA=['ド','レ','ミ','ファ','ソ','ラ','シ'];
const INTERVAL_NAMES=['完全1度','短2度','長2度','短3度','長3度','完全4度','増4度','完全5度','短6度','長6度','短7度','長7度'];
export function spelledFifthsFromC(letter,midi){if(!Number.isInteger(letter)||letter<0||letter>6)return null;let acc=mod12(midi-LETTER_PC[letter]);if(acc>6)acc-=12;return Math.abs(acc)<=2?LETTER_FIFTHS[letter]+7*acc:null;}
export function tonalKey(pc,form='major',fifths){pc=mod12(pc);return {tonicPitchClass:pc,form,tonicFifthsFromA:fifths??(form==='major'?[-3,-8,-1,-6,1,-4,3,-2,-7,0,-5,2]:[-3,4,-1,-6,1,-4,3,-2,5,0,-5,2])[pc]};}
export function keyForShape(string,pattern='23'){const i=['G','D','A','E'].indexOf(string),pc=mod12(OPEN_MIDI[Math.max(0,i)]);return tonalKey(pattern==='34low'?mod12(OPEN_MIDI[2]+1):pc+(pattern==='12'?3:pattern==='34'?7:0));}
export function keyName(key){return TONICS[key.tonicPitchClass]+'長調';}
export function targetDegreeInfo(midi,key){if(!key)return null;const semitones=mod12(midi-key.tonicPitchClass),degree=SCALE_FORMS[key.form].indexOf(semitones);if(degree>=0)return {degree,semitones};return key.form==='melodicMinor'&&[8,10].includes(semitones)?{degree:semitones===8?5:6,semitones}:null;}
export function openStringOffset(index,mode='soloistic'){return OPEN_FIFTHS_FROM_A[index]*(mode==='pianoAccompany'?0:mode==='stringEnsemble'?-2:FIFTH_DEVIATION);}
export function openStringTargetHz(index,a4=442,mode='soloistic'){return etFreq(OPEN_MIDI[index],a4)*2**(openStringOffset(index,mode)/1200);}
export function intervalCentsFromET(semitones,dim5=false){return {pyth:ratioCents(semitones===6&&dim5?1024/729:PYTH_RATIOS[semitones])-semitones*100,ji:ratioCents(semitones===6&&dim5?64/45:JI_RATIOS[semitones])-semitones*100};}
export function intonationTargets(midi,{key=null,spelledLetterIdx=null,useSpelledPyth=false,mode='soloistic'}={}){
 const degree=targetDegreeInfo(midi,key),deviation=mode==='pianoAccompany'?0:mode==='stringEnsemble'?-2:FIFTH_DEVIATION;
 if(degree){const c=intervalCentsFromET(degree.semitones),offset=key.tonicFifthsFromA*deviation;return {ji:offset+c.ji,pyth:offset+c.pyth,ivName:INTERVAL_NAMES[degree.semitones]};}
 let index=3;while(index>0&&midi<OPEN_MIDI[index])index--;
 const iv=mod12(midi-OPEN_MIDI[index]),offset=openStringOffset(index,mode),dim5=iv===6&&spelledLetterIdx!==null&&(spelledLetterIdx-OPEN_LETTERS[index]+7)%7===4,c=intervalCentsFromET(iv,dim5);
 if(iv===6&&spelledLetterIdx!==null)return {ji:offset+c.ji,pyth:offset+c.pyth,ivName:dim5?'減5度':'増4度'};
 const fifths=useSpelledPyth?spelledFifthsFromC(spelledLetterIdx,midi):null,steps=fifths===null?null:fifths-OPEN_FIFTHS_FROM_C[index];
 return {ji:offset+c.ji,pyth:offset+(steps===null?c.pyth:steps*FIFTH_DEVIATION),ivName:INTERVAL_NAMES[iv]};
}
export function drillGetRange(midi,{difficulty='normal',context='melodic',a4=442,...options}={}){
 const buffer=DIFFICULTIES[difficulty]??8,etHz=etFreq(midi,a4),targets=intonationTargets(midi,options),{ji,pyth}=targets,split=Math.abs(ji-pyth)>10;
 const lo=context&&split?(context==='harmonic'?ji:pyth)-buffer:Math.min(ji,pyth)-buffer,hi=context&&split?(context==='harmonic'?ji:pyth)+buffer:Math.max(ji,pyth)+buffer;
 const targetCents=context==='harmonic'?ji:pyth,targetHz=etHz*2**(targetCents/1200);
 return {...targets,lo,hi,loHz:etHz*2**(lo/1200),hiHz:etHz*2**(hi/1200),etHz,targetHz,targetCents,buffer,lowCents:lo-targetCents,highCents:hi-targetCents};
}
export function targetForNote(note,{a4=442,difficulty='normal'}={}){
 if(note.rest)return null;
 const range=drillGetRange(note.midi,{a4,difficulty,key:note.key,spelledLetterIdx:note.letter,useSpelledPyth:true});
 if(note.finger!==0)return range;
 const index=['G','D','A','E'].indexOf(note.string),targetHz=openStringTargetHz(index,a4),targetCents=centsBetween(targetHz,range.etHz),buffer=DIFFICULTIES[difficulty]??8;
 return {...range,targetHz,targetCents,lo:targetCents-buffer,hi:targetCents+buffer,loHz:targetHz*2**(-buffer/1200),hiHz:targetHz*2**(buffer/1200),lowCents:-buffer,highCents:buffer};
}
export function detectedName(frequency,a4=442,key=null){
 const midi=Math.round(69+12*Math.log2(frequency/a4)),pc=mod12(midi),preferFlat=key&&key.tonicFifthsFromA+3<0;
 return (preferFlat?['ド','レ♭','レ','ミ♭','ミ','ファ','ソ♭','ソ','ラ♭','ラ','シ♭','シ']:['ド','ド♯','レ','レ♯','ミ','ファ','ファ♯','ソ','ソ♯','ラ','ラ♯','シ'])[pc];
}
export function pitchFeedback(frequency,note,range,a4=442){
 const cents=centsBetween(frequency,range.targetHz),inRange=cents>=range.lowCents-1e-8&&cents<=range.highCents+1e-8,direction=inRange?'ちょうど':cents>range.highCents?'高い':'低い';
 const heardMidi=Math.round(69+12*Math.log2(frequency/a4)),different=Math.abs(cents)>=50&&heardMidi!==note.midi,rounded=Math.round(Math.abs(cents));
 return {cents,centsText:different?'':(rounded?(cents>0?'+':'−'):'')+rounded+'¢',position:Math.max(-50,Math.min(50,cents)),direction,text:different?detectedName(frequency,a4,note.key)+'に聞こえる・'+(cents>0?'低くして':'高くして'):direction};
}
