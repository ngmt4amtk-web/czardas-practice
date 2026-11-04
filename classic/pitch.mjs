// 入力の周期を推定する。期待音へ寄せたり、オクターブを同じ正解と扱ったりしない。
export const centsBetween=(f,target)=>f>0&&target>0?1200*Math.log2(f/target):Infinity;
export class PitchDetector {
  constructor(sampleRate,{minFrequency=175,maxFrequency=4200}={}) {
    this.step=Math.max(1,Math.floor(sampleRate/22050));this.rate=sampleRate/this.step;
    this.minFrequency=minFrequency;this.maxFrequency=maxFrequency;this.size=4096;
    this.x=new Float32Array(2048);this.re=new Float64Array(this.size);this.im=new Float64Array(this.size);
    this.mag=new Float64Array(this.size/2);this.window=Float32Array.from({length:2048},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/2047));
  }
  fft(){
    const r=this.re,im=this.im,n=this.size;
    for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[r[i],r[j]]=[r[j],r[i]];[im[i],im[j]]=[im[j],im[i]];}}
    for(let len=2;len<=n;len<<=1){const angle=-2*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle);
      for(let i=0;i<n;i+=len){let ur=1,ui=0;for(let j=0;j<len/2;j++){
        const a=i+j,b=a+len/2,vr=r[b]*ur-im[b]*ui,vi=r[b]*ui+im[b]*ur;
        r[b]=r[a]-vr;im[b]=im[a]-vi;r[a]+=vr;im[a]+=vi;
        const next=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=next;
      }}
    }
  }
  periodicity(f,n){
    const lag=this.rate/f,k=Math.floor(lag),fraction=lag-k,x=this.x;
    let cross=0,power=0;
    for(let i=0;i<n-k-1;i++){const a=x[i],b=x[i+k]*(1-fraction)+x[i+k+1]*fraction;cross+=a*b;power+=a*a+b*b;}
    return power?Math.max(0,2*cross/power):0;
  }
  detect(input,{minRms=.00045,minConfidence=.80}={}) {
    const x=this.x,n=Math.min(x.length,Math.floor(input.length/this.step));
    if(n<1024)return {frequency:null,confidence:0,rms:0};
    let mean=0;
    for(let i=0;i<n;i++){let v=0;for(let j=0;j<this.step;j++)v+=input[i*this.step+j];x[i]=v/this.step;mean+=x[i];}
    mean/=n;let energy=0,clipped=0;
    for(let i=0;i<n;i++){x[i]-=mean;energy+=x[i]*x[i];if(Math.abs(x[i])>.98)clipped++;}
    const rms=Math.sqrt(energy/n),base={frequency:null,confidence:0,rms,clipped:clipped/n>.01};
    if(rms<minRms)return base;
    this.re.fill(0);this.im.fill(0);for(let i=0;i<n;i++)this.re[i]=x[i]*this.window[i];this.fft();
    const resolution=this.rate/this.size,m=this.mag;
    for(let i=0;i<m.length;i++)m[i]=Math.hypot(this.re[i],this.im[i]);
    const peaks=[];const last=Math.min(m.length-2,Math.floor(8500/resolution));
    for(let i=Math.max(2,Math.floor(165/resolution));i<last;i++)if(m[i]>m[i-1]&&m[i]>=m[i+1]){
      const a=Math.log(Math.max(1e-12,m[i-1])),b=Math.log(Math.max(1e-12,m[i])),c=Math.log(Math.max(1e-12,m[i+1]));
      const delta=Math.max(-.5,Math.min(.5,.5*(a-c)/(a-2*b+c)||0));
      peaks.push({frequency:(i+delta)*resolution,amplitude:m[i]});
    }
    peaks.sort((a,b)=>b.amplitude-a.amplitude);if(!peaks.length)return base;
    const strong=peaks.filter(p=>p.amplitude>peaks[0].amplitude*.045).slice(0,16);
    const total=strong.reduce((sum,p)=>sum+p.amplitude*p.amplitude,0);
    const gcd=(a,b)=>b?gcd(b,a%b):a;
    let best=null;
    for(const peak of strong)for(let divisor=1;divisor<=6;divisor++){
      const candidate=peak.frequency/divisor;if(candidate<this.minFrequency||candidate>this.maxFrequency)continue;
      const matches=[];
      for(const p of strong){const h=Math.round(p.frequency/candidate);
        if(h>=1&&h<=12&&Math.abs(p.frequency-h*candidate)<Math.max(4,p.frequency*.008))matches.push({...p,h});
      }
      // 下の音を仮定しただけの候補を排除。実際にある倍音番号の最大公約数が1でなければ基本周期ではない。
      if(matches.reduce((g,p)=>gcd(g,p.h),0)!==1)continue;
      const explained=matches.reduce((sum,p)=>sum+p.amplitude*p.amplitude,0)/total;
      if(explained<.84)continue;
      const frequency=matches.reduce((sum,p)=>sum+p.frequency*p.h*p.amplitude**2,0)/matches.reduce((sum,p)=>sum+p.h*p.h*p.amplitude**2,0);
      const confidence=this.periodicity(frequency,n);if(confidence<minConfidence)continue;
      const score=explained+.025*confidence;
      if(!best||score>best.score+.00001)best={frequency,confidence,score};
    }
    return best?{...base,frequency:best.frequency,confidence:best.confidence}:base;
  }
}
export class PitchSmoother {
  constructor(){this.reset();}
  reset(){this.values=[];this.last=0;}
  push(reading,now){
    if(!reading.frequency){if(now-this.last>130)this.reset();return reading;}
    if(this.values.length&&Math.abs(centsBetween(reading.frequency,this.values.at(-1)))>100)this.values=[];
    if(now-this.last>160)this.values=[];
    this.last=now;this.values.push(reading.frequency);if(this.values.length>3)this.values.shift();
    const sorted=[...this.values].sort((a,b)=>a-b);
    return {...reading,frequency:sorted[Math.floor(sorted.length/2)]};
  }
}
export class NoteJudge {
  constructor(){this.reset();}
  reset({requireRelease=false,ignoreUntil=0}={}) {
    this.good=0;this.wrong=0;this.last=null;this.lastVoiced=null;this.accepted=false;
    this.needsRelease=requireRelease;this.quiet=0;this.ignoreUntil=ignoreUntil;this.lastPrompt=-Infinity;
  }
  observe(reading,target,now,{tolerance=40,holdMs=170,minRms=.00045}={}) {
    const dt=this.last===null?0:Math.min(75,Math.max(0,now-this.last));
    if(this.last!==null&&now-this.last>160){this.good=0;this.wrong=0;this.quiet=0;}
    this.last=now;
    if(this.accepted||now<this.ignoreUntil)return null;
    if(this.needsRelease){
      this.quiet=reading.rms<minRms*1.7?this.quiet+dt:0;
      if(this.quiet>=80){this.needsRelease=false;this.good=0;this.wrong=0;return 'ready';}
      return null;
    }
    if(!reading.frequency||reading.confidence<.8||reading.rms<minRms){
      if(this.lastVoiced===null||now-this.lastVoiced>110){this.good=0;this.wrong=0;}
      return null;
    }
    this.lastVoiced=now;
    const distance=Math.abs(centsBetween(reading.frequency,target));
    if(distance<=tolerance){this.good+=dt;this.wrong=0;if(this.good>=holdMs){this.accepted=true;return 'accepted';}}
    else {this.good=0;if(distance>tolerance+5)this.wrong+=dt;else this.wrong=0;
      if(this.wrong>=650&&now-this.lastPrompt>3500){this.lastPrompt=now;this.wrong=0;return 'reference';}}
    return null;
  }
}
