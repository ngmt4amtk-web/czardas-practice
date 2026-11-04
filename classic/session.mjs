import{MEASURES,NOTES}from'./score.mjs';
export class PracticeSession{
 constructor(){this.start=1;this.end=4;this.measure=1;this.noteIndex=0;this.loop=false;this.done=false;this.passed=new Set();}
 get bar(){return MEASURES[this.measure-1];}get current(){return this.bar.notes[this.noteIndex]||null;}
 seek(measure,index=0){if(!Number.isInteger(measure)||measure<1||measure>MEASURES.length)throw RangeError('小節');if(!Number.isInteger(index)||index<0||index>=Math.max(1,MEASURES[measure-1].notes.length))throw RangeError('音');this.measure=measure;this.noteIndex=index;this.done=false;this.passed.clear();}
 setRange(start,end){if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end>MEASURES.length||start>end)throw RangeError('範囲');this.start=start;this.end=end;this.seek(start);}
 advance({manual=false}={}){if(this.done)return{done:true};const prev=this.current;if(prev&&!manual)this.passed.add(prev.id);if(this.noteIndex+1<this.bar.notes.length)this.noteIndex++;else{let m=this.measure+1;while(m<=this.end&&!MEASURES[m-1].notes.length)m++;if(m<=this.end){this.measure=m;this.noteIndex=0;}else if(this.loop){this.seek(this.start);if(!this.current)return this.advance({manual:true});return{looped:true,current:this.current,previous:prev};}else{this.done=true;return{done:true,previous:prev};}}if(this.current?.continuesFromPrevious&&this.current.midi===prev?.midi&&this.noteIndex===0&&this.bar.notes.length>1)this.noteIndex++;return{previous:prev,current:this.current,repeated:prev?.midi===this.current?.midi};}
}
