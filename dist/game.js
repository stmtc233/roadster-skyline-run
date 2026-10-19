const STEP=1/120;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const WARNINGS=Object.freeze({front:'前车急刹',rear:'后方车辆刹车断裂',battery:'小心！电池弹出'});
export class Game {
 constructor({random=Math.random,autoSpawn=true,trafficEnabled=true}={}){this.random=random;this.autoSpawn=autoSpawn;this.trafficEnabled=trafficEnabled;this.nextId=1;this.start();this.phase='ready';}
 start(){Object.assign(this,{phase:'running',time:0,distance:0,score:0,speed:120,gas:100,altitude:0,x:0,lane:0,held:false,thrusting:false,exhausted:false,events:[],traffic:[],dodged:0,cause:'',nextEvent:1.4,nextTraffic:1.8,eventCount:0,accumulator:0,clearFlash:0});if(this.trafficEnabled){this.addTraffic(-1,43,27);this.addTraffic(1,70,28);this.addTraffic(0,150,29);}}
 setHeld(v){this.held=!!v&&this.phase==='running';if(!this.held)this.exhausted=false;}
 moveLane(direction){if(this.phase==='running')this.lane=clamp(this.lane+Math.sign(direction),-1,1);}
 pause(){if(this.phase!=='running')return;this.setHeld(false);this.thrusting=false;this.phase='paused';this.accumulator=0;}
 resume(){if(this.phase==='paused'){this.phase='running';this.held=false;this.accumulator=0;}}
 get warning(){const e=this.events.find(e=>!e.resolved);return e?{id:e.id,kind:e.kind,stage:e.stage,text:e.kind==='battery'&&!e.batteryVisible?'邻车停车 · 双闪预警':WARNINGS[e.kind],remaining:Math.max(0,e.contactAt-e.age)}:null;}
 addTraffic(lane,z,speed){const o={id:this.nextId++,x:lane*4,lane,z,speed,width:1.85,length:4.6,height:1.45,color:['#497f9b','#c7c9c1','#a95442','#b7a16f'][Math.floor(this.random()*4)]};this.traffic.push(o);return o;}
 spawn(kind){
  if(!['front','rear','battery'].includes(kind))throw new Error('Unknown road event');
  const rear=kind==='rear',battery=kind==='battery',v=this.speed/3.6;
  const closing=rear?30+this.speed/25:v*.72+8;
  const targetX=this.lane*4;
  const sourceX=this.lane===0?(this.random()<.5?-4:4):0;
  const z=battery?v*2.7:(rear?-1:1)*closing*2.1;
  // Keep traffic the player has already seen; retry this event once its entry
  // area is clear instead of deleting vehicles to make room for the model.
  const entryLanes=battery?[targetX,sourceX]:[targetX];
  if(this.obstacles().some(o=>Math.abs(o.z-z)<16&&entryLanes.some(x=>Math.abs(o.x-x)<2)))return null;
  const e={id:this.nextId++,kind,x:battery?sourceX:targetX,targetX,z,sourceX,sourceZ:z,sourceSpeed:v*.9,sourceInitialSpeed:v*.9,stage:battery?'braking':'active',batteryVisible:false,ejectAt:1.65,hazardOn:false,width:battery?1.8:rear?2:1.85,length:battery?1.8:rear?5.5:4.6,height:battery?.35:rear?1.92:1.45,closing,age:0,resolved:false,contactAt:battery?3.2:2.1};
  this.events.push(e);this.eventCount++;return e;
 }
 obstacles(){const out=[...this.traffic];for(const e of this.events){if(e.kind==='battery'){if(e.batteryVisible)out.push(e);out.push({x:e.sourceX,z:e.sourceZ,width:2,length:4.8,height:1.9,kind:'parked'});}else out.push(e);}return out;}
 update(dt){if(this.phase!=='running'||!Number.isFinite(dt)||dt<=0)return;this.accumulator+=Math.min(dt,.1);while(this.accumulator+1e-10>=STEP&&this.phase==='running'){this.accumulator-=STEP;this.step(STEP);}}
 hit(o){return Math.abs(o.x-this.x)<(1.9+o.width)/2-.14&&Math.abs(o.z)<(4.6+o.length)/2-.12&&this.altitude+.1<o.height;}
 crash(kind){this.phase='over';this.held=false;this.thrusting=false;const label=kind==='rear'?'被后方车辆追尾':kind==='battery'?'撞上弹出的电池':kind==='front'?'撞上急刹车辆':kind==='parked'?'撞上停车车辆':'撞上路人车辆';this.cause=(this.exhausted?'气量耗尽 · ':this.altitude>0?'注意起降高度 · ':'')+label;}
 step(dt){
  this.time+=dt;this.speed=120+180*(1-Math.exp(-this.time/60));const v=this.speed/3.6;
  this.distance+=v*dt;this.score=Math.floor(this.distance/10);this.clearFlash=Math.max(0,this.clearFlash-dt);
  const dx=this.lane*4-this.x;this.x+=Math.sign(dx)*Math.min(Math.abs(dx),13*dt);
  this.thrusting=this.held&&!this.exhausted&&this.gas>0;
  if(this.thrusting){this.gas=Math.max(0,this.gas-25*dt);this.altitude=Math.min(8,this.altitude+8.5*dt);if(this.gas<1e-8){this.gas=0;this.exhausted=true;this.thrusting=false;}}
  else{this.altitude=Math.max(0,this.altitude-6*dt);if(this.altitude===0)this.gas=Math.min(100,this.gas+24*dt);}
  for(const o of this.traffic){o.z+=(o.speed-v)*dt;if(this.hit(o)){this.crash('traffic');return;}}
  this.traffic=this.traffic.filter(o=>o.z>-35&&o.z<260);
  for(const e of this.events){
   e.age+=dt;
   if(e.kind==='battery'){
    e.sourceSpeed=e.sourceInitialSpeed*Math.max(0,1-e.age/.55);
    e.sourceZ+=(e.sourceSpeed-v)*dt;e.wheelTravel=(e.wheelTravel||0)+e.sourceSpeed*dt;
    e.hazardOn=e.age>=.55&&Math.floor((e.age-.55)*6)%2===0;
    if(e.age<e.ejectAt){e.stage=e.age<.55?'braking':'hazards';e.z=e.sourceZ;e.x=e.sourceX;}
    else{e.stage='ejected';e.batteryVisible=true;e.z-=v*.95*dt;e.x=e.sourceX+(e.targetX-e.sourceX)*clamp((e.age-e.ejectAt)/.55,0,1);}
    if(this.hit({x:e.sourceX,z:e.sourceZ,width:2,length:4.8,height:1.9})){this.crash('parked');return;}
   }else e.z+=(e.kind==='rear'?1:-1)*e.closing*dt;
   const visible=e.kind!=='battery'||e.batteryVisible;
   if(visible&&this.hit(e)){this.crash(e.kind);return;}
   if(e.resolved)continue;
   const passed=e.kind==='rear'?e.z>(4.6+e.length)/2:e.z<-(4.6+e.length)/2;
   if(passed){e.resolved=true;this.dodged++;this.clearFlash=.8;this.nextEvent=this.time+Math.max(.6,1.35-this.time/160)+this.random()*.45;}
  }
  this.events=this.events.filter(e=>e.age<8);
  if(this.autoSpawn&&this.time>=this.nextEvent&&!this.events.some(e=>!e.resolved)){const kinds=['front','rear','battery'];const event=this.spawn(this.eventCount<3?kinds[this.eventCount]:kinds[Math.floor(this.random()*3)]);this.nextEvent=event?Infinity:this.time+.2;}
  if(this.trafficEnabled&&this.time>=this.nextTraffic&&this.traffic.length<9){
   const lane=Math.floor(this.random()*3)-1,z=105+this.random()*75,speed=v*(.63+this.random()*.18);
   const t=z/Math.max(1,v-speed),occupied=new Set([lane]);
   for(const o of this.obstacles()){const closing=o.kind==='rear'?-(o.closing||32):o.closing||Math.max(1,v-(o.speed||0));const arrival=o.z/closing;if(arrival>0&&Math.abs(arrival-t)<1.4)occupied.add(Math.round(o.x/4));}
   const crowd=this.obstacles().some(o=>Math.abs(o.x-lane*4)<2&&Math.abs(o.z-z)<30);
   if(!crowd&&occupied.size<3)this.addTraffic(lane,z,speed);
   this.nextTraffic=this.time+Math.max(.9,1.9-this.time/180)+this.random()*.7;
  }
 }
}
