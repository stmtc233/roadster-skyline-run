// Music uses its own media element, so the effects master never mutes it.
export class BackgroundMusic {
  constructor(element,enabled=true){
    this.element=element;this.enabled=enabled;this.unlocked=false;this.suspended=false;
    this.volume=.2;this.ctx=null;this.gain=null;this.restart=false;
    element.loop=true;element.volume=this.volume;
  }
  unlock(){
    this.unlocked=true;
    if(this.enabled&&!this.suspended)this.prepare();
    // A separate gain keeps music volume independent of effects on mobile too.
    if(this.enabled&&!this.ctx){
      let ctx;
      try{
        const Ctx=window.AudioContext||window.webkitAudioContext;
        if(Ctx){
          ctx=new Ctx();const gain=ctx.createGain();gain.gain.value=this.volume;
          ctx.createMediaElementSource(this.element).connect(gain).connect(ctx.destination);
          this.ctx=ctx;this.gain=gain;this.element.volume=1;
        }
      }catch{ctx?.close().catch(()=>{});}
    }
    this.sync();
  }
  setEnabled(value){this.enabled=value;this.sync();}
  setStage(stage,{suspended=false,restart=false}={}){
    this.suspended=suspended||stage==='paused'||stage==='countdown'||stage==='over';
    this.volume=stage==='ready'?.2:stage==='result'?.1:.45;
    this.restart=this.restart||restart;
    if(this.gain)this.gain.gain.value=this.volume;else this.element.volume=this.volume;
    this.sync();
  }
  prepare(){
    // Defer seeking so disabled music never downloads.
    if(this.restart){
      this.element.pause();
      try{this.element.currentTime=0;}catch{/* An unloaded track already starts at zero. */}
    }
    this.restart=false;
  }
  sync(){
    if(!this.enabled||!this.unlocked||this.suspended){this.element.pause();return;}
    this.prepare();
    if(this.ctx&&this.ctx.state!=='running')this.ctx.resume().catch(()=>{});
    if(!this.element.paused)return;
    try{const play=this.element.play();play?.catch(()=>{});}catch{/* Music must never block gameplay. */}
  }
}

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
        // Two detuned reeds through a soft filter make the runaway car's horn.
        this.horn=this.ctx.createGain();this.horn.gain.value=0;
        const reed=this.ctx.createBiquadFilter();reed.type='lowpass';reed.frequency.value=1900;reed.connect(this.horn).connect(this.master);
        for(const frequency of [415,523]){const o=this.ctx.createOscillator();o.type='sawtooth';o.frequency.value=frequency;o.connect(reed);o.start();}
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
    // Road wind swells and brightens with pace; thrust stays the loudest air sound.
    const pace=state.pace||0,rolling=state.rollRemaining>0,tail=state.boosting;
    this.air.gain.setTargetAtTime(running?(rolling?.3:state.thrusting?.24:(tail?.09:.03)+pace*.07):0,t,.035);
    this.filter.frequency.setTargetAtTime(rolling?2600:state.thrusting?1700:tail?900+pace*850:520+pace*700,t,.06);
    // Urgent bursts from the brake-failure car that merge into one blast once it is right behind.
    const runaway=running&&(state.traffic||[]).find(c=>c.horn);
    const near=runaway?Math.max(.15,1-Math.abs(runaway.z)/140):0,on=runaway&&(runaway.z>-30||((state.clock||0)*2.4)%1<.62);
    this.horn.gain.setTargetAtTime(on?.12*near:0,t,.012);
  }
  // One-shot road sounds from the simulation, quieter the farther away they happen.
  cue({type,x=0,z=0}){
    if(!this.ctx||!this.master||this.muted)return;
    const near=Math.max(.12,1-Math.hypot(x,z)/200);
    if(type==='screech')this.burst('bandpass',2600,.6,.22*near);
    else if(type==='scrape'){this.tone(85,.3,0,.4*near);this.burst('bandpass',1500,1.8,.32*near);this.burst('bandpass',3400,1.2,.12*near);}
    else if(type==='eject'){this.burst('lowpass',900,.25,.3*near);this.tone(150,.2,0,.25*near);}
    else if(type==='crash'){this.burst('lowpass',1100,.55,.45*near);this.tone(70,.45,0,.35*near);}
    else if(type==='impact'){this.burst('lowpass',1500,.9,.6);this.tone(60,.7,0,.45);this.tone(110,.5,.03,.3);}
  }
  burst(type,frequency,duration,level){
    const t=this.ctx.currentTime,source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),g=this.ctx.createGain();
    source.buffer=this.noise.buffer;filter.type=type;filter.frequency.value=frequency;filter.Q.value=type==='bandpass'?6:.7;
    g.gain.setValueAtTime(level,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);
    source.connect(filter).connect(g).connect(this.master);source.start(t,Math.random()*1.5);source.stop(t+duration+.05);
    source.onended=()=>{source.disconnect();filter.disconnect();g.disconnect();};
  }
  tone(frequency,duration,offset=0,level=.3){
    if(!this.ctx||!this.master||this.muted)return;
    const t=this.ctx.currentTime+offset,o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type='sine';o.frequency.value=frequency;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(level,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+duration);
    o.connect(g).connect(this.master);o.start(t);o.stop(t+duration+.02);o.onended=()=>{o.disconnect();g.disconnect();};
  }
}
