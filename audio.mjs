import {PitchDetector} from './pitch.mjs';
export class ViolinAudio {
  constructor(onReading,onEnded){this.onReading=onReading;this.onEnded=onEnded;this.token=0;this.noise=.00015;this.tones=[];this.sensitivity='normal';}
  async context(){
    if(!this.ctx||this.ctx.state==='closed'){
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)throw new Error('このブラウザでは音声を使えません。Safari または Chrome で開いてください。');
      this.ctx=new AudioContext({latencyHint:'interactive'});
      this.ctx.addEventListener('statechange',()=>{if(this.stream&&this.ctx.state!=='running'){this.stop();this.onEnded('音声が中断されました。マイクを始め直してください。');}});
    }
    await this.ctx.resume();return this.ctx;
  }
  get threshold(){return Math.max(this.sensitivity==='quiet'?.00018:.0004,Math.min(this.sensitivity==='quiet'?.002:.004,this.noise*(this.sensitivity==='quiet'?1.8:2.5)));}
  async start(){
    const token=++this.token,ctx=await this.context();
    if(token!==this.token)return false;
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('マイクを使うには、Safari または Chrome で公開ページを開いてください。');
    let stream;
    try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false});}
    catch(error){
      if(token!==this.token)return false;
      const message={NotAllowedError:'マイクの使用が許可されていません。ブラウザのサイト設定で許可してから、もう一度始めてください。',NotFoundError:'使えるマイクが見つかりません。端末のマイクを確認してください。',NotReadableError:'マイクを開けませんでした。マイクを使っている別のアプリを閉じて、もう一度お試しください。'}[error.name];
      throw new Error(message||'マイクを開けませんでした。ページを開き直して、もう一度お試しください。');
    }
    if(token!==this.token){stream.getTracks().forEach(t=>t.stop());return false;}
    this.stream=stream;this.settings=stream.getAudioTracks()[0].getSettings();
    stream.getAudioTracks()[0].addEventListener('ended',()=>{if(this.stream===stream){this.stop();this.onEnded('マイクの接続が切れました。始め直してください。');}});
    this.detector=new PitchDetector(ctx.sampleRate);this.analyser=ctx.createAnalyser();
    this.analyser.fftSize=2**Math.ceil(Math.log2(2048*this.detector.step));this.analyser.smoothingTimeConstant=0;
    this.source=ctx.createMediaStreamSource(stream);
    this.highpass=ctx.createBiquadFilter();this.highpass.type='highpass';this.highpass.frequency.value=90;this.highpass.Q.value=.707;
    this.lowpass=ctx.createBiquadFilter();this.lowpass.type='lowpass';this.lowpass.frequency.value=7000;this.lowpass.Q.value=.707;
    this.source.connect(this.highpass).connect(this.lowpass).connect(this.analyser);
    // 音をスピーカーへ返さず、Safariでも解析グラフを稼働させる。
    this.silent=ctx.createGain();this.silent.gain.value=0;this.analyser.connect(this.silent).connect(ctx.destination);
    this.buffer=new Float32Array(this.analyser.fftSize);this.calibratingUntil=performance.now()+700;this.quietSamples=[];this.lastFrame=0;
    const tick=now=>{
      if(token!==this.token||!this.stream)return;
      this.raf=requestAnimationFrame(tick);if(now-this.lastFrame<28)return;this.lastFrame=now;
      this.analyser.getFloatTimeDomainData(this.buffer);
      const reading=this.detector.detect(this.buffer,{minRms:this.threshold});
      const calibrating=now<this.calibratingUntil;
      if(calibrating)this.quietSamples.push(reading.rms);
      else if(this.quietSamples.length){this.quietSamples.sort((a,b)=>a-b);this.noise=Math.min(.0015,Math.max(.00006,this.quietSamples[Math.floor(this.quietSamples.length*.15)]*.8));this.quietSamples=[];}
      else if(!reading.frequency&&reading.rms<this.threshold)this.noise=.995*this.noise+.005*reading.rms;
      this.onReading(reading,now,{calibrating,minRms:this.threshold});
    };
    this.raf=requestAnimationFrame(tick);return true;
  }
  stop(){
    this.token++;if(this.raf)cancelAnimationFrame(this.raf);this.raf=null;
    const stream=this.stream;this.stream=null;if(stream)stream.getTracks().forEach(t=>t.stop());
    for(const node of [this.source,this.highpass,this.lowpass,this.analyser,this.silent])try{node?.disconnect();}catch{}
  }
  stopTone(){
    this.toneToken=(this.toneToken||0)+1;
    for(const node of this.tones){try{node.stop();}catch{}try{node.disconnect();}catch{}}
    this.tones=[];
  }
  async play(frequency,volume=.75){
    this.stopTone();const token=this.toneToken,ctx=await this.context();if(token!==this.toneToken)return 0;
    const now=ctx.currentTime,duration=.95;
    const gain=ctx.createGain(),compressor=ctx.createDynamicsCompressor();
    compressor.threshold.value=-4;compressor.knee.value=3;compressor.ratio.value=12;compressor.attack.value=.003;compressor.release.value=.16;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume*.60,now+.025);gain.gain.setValueAtTime(volume*.60,now+.72);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    gain.connect(compressor).connect(ctx.destination);
    const real=new Float32Array([0,0,0,0]),imag=new Float32Array([0,1,.18,.06]);
    const oscillator=ctx.createOscillator();oscillator.setPeriodicWave(ctx.createPeriodicWave(real,imag));oscillator.frequency.value=frequency;
    oscillator.connect(gain);oscillator.start(now);oscillator.stop(now+duration+.02);this.tones.push(oscillator,gain,compressor);
    oscillator.onended=()=>{try{oscillator.disconnect();gain.disconnect();compressor.disconnect();}catch{}};
    return (duration+.02)*1000;
  }
  dispose(){this.stop();this.stopTone();}
}
