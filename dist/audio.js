export class AudioEngine {
  constructor(muted=false){this.muted=muted;this.ctx=null;}
  async unlock(){
    try {
      if(!this.ctx){
        const Ctx=window.AudioContext||window.webkitAudioContext;
        if(!Ctx) return;
        this.ctx=new Ctx();
        this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:.26;this.master.connect(this.ctx.destination);
        this.motor=this.ctx.createOscillator();this.motor.type='sine';this.motor.frequency.value=65;
        this.motorGain=this.ctx.createGain();this.motorGain.gain.value=0;this.motor.connect(this.motorGain).connect(this.master);this.motor.start();
        const buffer=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate);
        const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.45;
        this.noise=this.ctx.createBufferSource();this.noise.buffer=buffer;this.noise.loop=true;
        this.filter=this.ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=850;
        this.air=this.ctx.createGain();this.air.gain.value=0;this.noise.connect(this.filter).connect(this.air).connect(this.master);this.noise.start();
      }
      await this.ctx.resume();
    } catch { /* Silent play stays available if browser audio is restricted. */ }
  }
  setMuted(value){this.muted=value;if(this.ctx&&this.master)this.master.gain.setTargetAtTime(value?0:.26,this.ctx.currentTime,.03);}
  update(state){
    if(!this.ctx||!this.motor) return;
    const t=this.ctx.currentTime, running=state.phase==='running';
    this.motor.frequency.setTargetAtTime(50+state.speed*.45,t,.15);
    this.motorGain.gain.setTargetAtTime(running?.045:0,t,.08);
    this.air.gain.setTargetAtTime(running?(state.thrusting?.24:.035):0,t,.05);
    this.filter.frequency.setTargetAtTime(state.thrusting?1700:550,t,.1);
  }
  tone(frequency,duration,offset=0){
    if(!this.ctx||!this.master||this.muted)return;
    const t=this.ctx.currentTime+offset,o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type='sine';o.frequency.value=frequency;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.3,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+duration);
    o.connect(g).connect(this.master);o.start(t);o.stop(t+duration+.02);o.onended=()=>{o.disconnect();g.disconnect();};
  }
  warn(){this.tone(760,.14);this.tone(940,.18,.18);}
  clear(){this.tone(620,.12);this.tone(930,.16,.1);}
  crash(){this.tone(110,.5);this.tone(60,.6,.04);}
}
