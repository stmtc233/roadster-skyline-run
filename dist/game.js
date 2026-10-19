const STEP=1/120;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
// Launch speed and the top speed each run accelerates toward (km/h); ramp is the time constant in seconds.
export const SPEED=Object.freeze({start:140,top:400,ramp:28});
// Collision footprints in metres and masses in tonnes. Lane centres sit 4 m apart.
// Trucks have a flat box roof (deck) at their height that the player can land on and drive across.
const BODY={player:{width:1.9,length:4.6,mass:2},sedan:{width:1.85,length:4.6,height:1.45,mass:1.6},suv:{width:2,length:4.8,height:1.9,mass:2.1},mpv:{width:2,length:5.5,height:1.92,mass:2.7},truck:{width:2.5,length:12,height:3.9,mass:10,deck:true},semi:{width:2.55,length:16.5,height:3.9,mass:16,deck:true},battery:{width:1.8,length:1.8,height:.35,mass:.5}};
const COLORS={truck:['#2f5f9e','#e2e1da','#d0a334','#3f7a5a'],semi:['#a73a2f','#e2e1da','#2f5f9e','#e07a1f']};
// Blinking time before a lane change (s), sideways speed (m/s), braking, pick-up, crash sliding and broken-suspension drag (m/s²), battery drop delay (s).
const SIGNAL=1.05,LATERAL=3.6,HARD_BRAKE=9,SOFT_BRAKE=6,PICKUP=2.2,SLIDE=6.5,BATTERY_SLIDE=14,DRAG=8,EJECT=1.25;
// A broken-down car rests this far beyond its lane centre, half on the road edge, still blocking the lane.
const SHOULDER=1.3;
// Least time (s) between a car starting to signal into the player's lane ahead and the player reaching it.
const MERGE=3;
// Seconds from a hazard's first visible or audible cue to contact if the player does nothing.
const CUE={front:2.4,battery:3,rear:3,breakdown:2.6,parked:3.4};
const KINDS=['front','rear','battery','breakdown','parked'];
// How strongly the director favours each car-borne hazard when several are ready at once.
const WEIGHT={front:3,breakdown:12,battery:1.5};
// The opening road already carries traffic, so the first hazards come from cars the player can see.
const OPENING=[[-1,45,27,'sedan'],[0,100,29,'sedan'],[1,130,30,'suv'],[-1,170,31,'sedan'],[1,215,31,'truck'],[0,250,31,'mpv']];
// Whether body o is in car c's path: c's lane now or the lane it is moving into, against where o is or is heading.
const inPath=(c,o)=>{const lane=c.lane*4,heading=o.signal?o.lane*4:o.x;return Math.abs(o.x-c.x)<2.4||Math.abs(o.x-lane)<2.4||Math.abs(heading-c.x)<2.4||Math.abs(heading-lane)<2.4;};
// Reused result of Game#leader, read immediately by the caller.
const LEAD={gap:0,speed:0,stopping:false};
// Shown once per hazard type; afterwards the lights, horn and mirror carry the warning.
export const HINTS=Object.freeze({front:'前车刹车灯狂闪急刹 · 变道或起飞',rear:'后方车辆刹车断裂 · 听喇叭、看后视镜',battery:'邻车双闪急停 · 小心弹出的电池',breakdown:'前车悬挂断裂 · 拖着火花急停',parked:'路边抛锚车占着车道 · 提前变道',truck:'大货车车厢顶可以落脚 · 起飞踩上去'});
export class Game {
 constructor({random=Math.random,autoSpawn=true,trafficEnabled=true}={}){this.random=random;this.autoSpawn=autoSpawn;this.trafficEnabled=trafficEnabled;this.nextId=1;this.start();this.phase='ready';}
 start(){Object.assign(this,{phase:'running',time:0,clock:0,distance:0,travel:0,score:0,speed:SPEED.start,maxSpeed:SPEED.start,gas:100,altitude:0,floor:0,x:0,lane:0,held:false,thrusting:false,exhausted:false,events:[],traffic:[],batteries:[],cues:[],dodged:0,cause:'',nextEvent:1.4,nextTraffic:1.8,eventCount:0,lastKind:'',wanting:-1,parkAfter:0,accumulator:0,crashSpeed:0,crashTime:0,settled:false,yaw:0,spin:0});if(this.trafficEnabled)for(const [lane,z,speed,model] of OPENING)this.addTraffic(lane,z,speed,model);}
 setHeld(v){this.held=!!v&&this.phase==='running';if(!this.held)this.exhausted=false;}
 moveLane(direction){if(this.phase==='running')this.lane=clamp(this.lane+Math.sign(direction),-1,1);}
 pause(){if(this.phase!=='running')return;this.setHeld(false);this.thrusting=false;this.phase='paused';this.accumulator=0;}
 resume(){if(this.phase==='paused'){this.phase='running';this.held=false;this.accumulator=0;}}
 // 0 at launch speed, 1 at top speed; drives speed-dependent camera, scenery and sound.
 get pace(){return clamp((this.speed-SPEED.start)/(SPEED.top-SPEED.start),0,1);}
 // Least time between the moments two hazards would hit the player: generous at first, tighter as the run goes on.
 get spacing(){return Math.max(1.2,2.2-this.time/60);}
 // When the latest live hazard reaches the player, so the next one can be lined up behind it.
 get busyUntil(){return this.events.reduce((t,e)=>e.resolved||e.stage==='planned'?t:Math.max(t,e.contactAt),-Infinity);}
 // The player's current forward acceleration along the speed curve (m/s²).
 get accel(){return this.phase==='running'?(SPEED.top-this.speed)/SPEED.ramp/3.6:0;}
 // The newest live hazard, so a second one arriving mid-way still gets noticed.
 get warning(){const e=this.events.findLast(e=>!e.resolved&&e.stage!=='planned');return e?{id:e.id,kind:e.kind,stage:e.stage,text:HINTS[e.kind]}:null;}
 addTraffic(lane,z,speed,model='sedan'){const color=(COLORS[model]||['#497f9b','#c7c9c1','#a95442','#b7a16f'])[Math.floor(this.random()*4)];const o={id:this.nextId++,model,deck:false,...BODY[model],lane,x:lane*4,vx:0,z,speed,cruise:speed,color,mode:'cruise',role:'',brake:false,flash:false,brakeTo:0,holdUntil:0,signal:0,moveAt:0,hazard:false,horn:false,closing:0,broken:0,brokenAt:0,drift:0,triangle:false,yaw:0,spin:0,odo:0};this.traffic.push(o);return o;}
 // Bumper-to-bumper distance at which a body touches the player's car.
 reach(o){return (BODY.player.length+o.length)/2-.12;}
 // Metres the player closes on a hazard within `seconds` if nobody reacts, following the hazard's scripted speed.
 gain(kind,c,seconds){
  const v=this.speed/3.6,a=this.accel,s0=c.speed,dropped=Math.max(0,s0-HARD_BRAKE*EJECT);let d=0;
  for(let t=0;t<seconds;t+=1/30){
   const s=kind==='front'?Math.max(s0*.25,s0-HARD_BRAKE*t):kind==='battery'?(t<EJECT?Math.max(0,s0-HARD_BRAKE*t):Math.max(0,dropped-BATTERY_SLIDE*(t-EJECT))):kind==='breakdown'?Math.max(0,s0-DRAG*t):s0;
   d+=(v+a*t-s)/30;
  }
  return d;
 }
 // Stages a hazard immediately at its cue distance. Tests use this; live play claims traffic already on the road.
 spawn(kind){
  if(!KINDS.includes(kind))throw new Error('Unknown road event');
  if(kind==='rear')return this.launchRear();
  if(kind==='parked')return this.park(this.lane,-Infinity,true);
  const lane=kind==='battery'?(this.lane!==0?0:this.random()<.5?-1:1):this.lane,model=kind==='battery'?'suv':kind==='breakdown'?'mpv':'sedan',speed=this.speed/3.6*.7;
  const z=this.reach(kind==='battery'?BODY.battery:BODY[model])+this.gain(kind,{speed},CUE[kind]);
  if(this.traffic.some(o=>(Math.abs(o.x-lane*4)<2.6||o.lane===lane)&&Math.abs(o.z-z)<(o.length+BODY[model].length)/2+11.4))return null;
  const c=this.addTraffic(lane,z,speed,model);c.role=kind;const e=this.addEvent(kind,c);this.trigger(e,c);this.eventCount++;return e;
 }
 addEvent(kind,c){const e={id:this.nextId++,kind,carId:c.id,batteryId:0,stage:'planned',sourceX:c.x,targetX:this.lane*4,ejectAt:0,contactAt:0,age:0,resolved:false};this.events.push(e);return e;}
 // A brake-failure MPV closes from behind in the player's lane with its horn blaring; it can only hit whatever is ahead of it.
 launchRear(){
  const closing=30+this.speed/25,z=-closing*CUE.rear-this.reach(BODY.mpv);
  // It needs a clear run at the player; a car in between would simply take the hit instead.
  if(this.traffic.some(o=>(Math.abs(o.x-this.lane*4)<2.6||o.lane===this.lane)&&o.z>z-(o.length+BODY.mpv.length)/2-9&&o.z<0))return null;
  const c=this.addTraffic(this.lane,z,this.speed/3.6+closing,'mpv');Object.assign(c,{mode:'runaway',role:'rear',horn:true,closing});
  const e=this.addEvent('rear',c);e.stage='active';this.armed(e);return e;
 }
 // A broken-down MPV already stopped half on the road edge with its hazards on and a warning triangle behind it.
 // It is placed inside the haze; `exact` (tests) puts it at its cue distance instead.
 park(lane,earliest,exact=false){
  if(!lane)return null;
  const z=this.reach(BODY.mpv)+this.gain('parked',{speed:0},CUE.parked),at=exact?z:clamp(z,215,400),x=lane*4+lane*SHOULDER;
  const seconds=exact?CUE.parked:this.arrival(at-this.reach(BODY.mpv));
  if(this.clock+seconds<earliest||this.traffic.some(o=>(Math.abs(o.x-x)<2.8||o.lane===lane)&&Math.abs(o.z-at)<(o.length+BODY.mpv.length)/2+30))return null;
  const c=this.addTraffic(lane,at,0,'mpv');Object.assign(c,{x,cruise:0,mode:'broken',role:'parked',hazard:true,broken:lane>0?4:3,brokenAt:this.clock-9,drift:x,triangle:true});
  const e=this.addEvent('parked',c);e.stage='active';this.armed(e,seconds);return e;
 }
 // Seconds until the player covers `metres` along the current speed curve.
 arrival(metres){const v=this.speed/3.6,a=this.accel;return a>1e-6?(Math.sqrt(v*v+2*a*metres)-v)/a:metres/Math.max(1,v);}
 // Turns a car already on the road into the next hazard, among those ready soonest. Emergency braking is the staple;
 // a different type from last time is preferred. The runaway, the only hazard that arrives from out of view, and the
 // roadside breakdown, placed far ahead in the haze, need no particular car and fill in when nothing else is ready.
 plan(){
  const v=this.speed/3.6,options=[],earliest=this.busyUntil+this.spacing;
  for(const kind of ['front','breakdown','battery'])for(const c of this.candidates(kind)){
   const wait=(c.z-this.reach(kind==='battery'?BODY.battery:c)-this.gain(kind,c,CUE[kind])-3)/Math.max(1,v-c.speed);
   if(wait>0&&wait<3.5&&this.clock+wait+CUE[kind]>=earliest)options.push({kind,c,wait});
  }
  const soonest=Math.min(...options.map(o=>o.wait)),ready=options.filter(o=>o.wait<=soonest+1);
  const fresh=ready.filter(o=>o.kind!==this.lastKind||o.kind==='front'),pool=fresh.length?fresh:ready,roll=this.random();
  // The runaway and the roadside breakdown are occasional extras, and fill in once nothing ahead has been ready for a while.
  if(!pool.length&&this.wanting<0)this.wanting=this.time;
  const idle=!pool.length&&this.time-this.wanting>=1.8;
  if((idle||roll<.08)&&this.lastKind!=='rear'&&this.clock+CUE.rear>=earliest){const e=this.launchRear();if(e)return this.adopt(e);}
  if((idle?roll>.6:roll>.95)&&this.time>=this.parkAfter){const e=this.park(this.lane||(this.random()<.5?-1:1),earliest);if(e){this.parkAfter=this.time+25;return this.adopt(e);}}
  if(!pool.length)return null;
  const kinds=[...new Set(pool.map(o=>o.kind))],weights=kinds.map(k=>WEIGHT[k]),total=weights.reduce((a,b)=>a+b,0);
  let pick=this.random()*total,kind=kinds[0];for(let i=0;i<kinds.length;i++)if((pick-=weights[i])<0){kind=kinds[i];break;}
  const {c}=pool.filter(o=>o.kind===kind).sort((a,b)=>a.wait-b.wait)[0];
  c.role=kind;return this.adopt(this.addEvent(kind,c));
 }
 adopt(e){this.lastKind=e.kind;this.wanting=-1;this.eventCount++;return e;}
 // What a lined-up car can do to the player from where they now are: brake (or break down) in front of them from the
 // same lane, or, for an SUV in the next lane, drop its battery into theirs.
 fits(c,kind){const gap=Math.abs(c.lane-this.lane);return gap===0?(kind==='breakdown'?'breakdown':'front'):gap===1&&c.model==='suv'?'battery':'';}
 candidates(kind){
  const lanes=kind==='battery'?[this.lane-1,this.lane+1].filter(l=>Math.abs(l)<=1):[this.lane];
  const near=this.traffic.filter(c=>c.z>0&&lanes.includes(c.lane)&&Math.abs(c.x-c.lane*4)<.5).sort((a,b)=>a.z-b.z);
  // Only the first car in the player's lane can stop in front of them; only an SUV drops a battery and only the MPV breaks down.
  return (kind==='battery'?near:near.slice(0,1)).filter(c=>c.mode==='cruise'&&!c.signal&&!c.role&&c.z<230&&(kind==='battery'?c.model==='suv':kind==='breakdown'?c.model==='mpv':true));
 }
 // A live hazard lets the next one be planned shortly, timed so the two never hit at once.
 armed(e,seconds=CUE[e.kind]){e.contactAt=this.clock+seconds;this.nextEvent=this.time+this.spacing*.5;}
 trigger(e,c){
  e.targetX=this.lane*4;this.armed(e);e.stage='braking';
  if(e.kind==='front'){Object.assign(c,{mode:'brake',brakeTo:c.speed*.25,holdUntil:0});this.cue('screech',c);}
  else if(e.kind==='breakdown')this.snap(c);
  else{Object.assign(c,{mode:'brake',brakeTo:0,holdUntil:0,hazard:true});e.ejectAt=this.clock+EJECT;this.cue('screech',c);}
 }
 // A suspension arm snaps, more often at the back where it shows best from behind: that corner drops onto the road and
 // the car drags itself to a stop, pulling toward the broken side, to the road edge from an outer lane or a little off
 // centre from the middle one. It never leaves its lane.
 snap(c){
  const side=c.lane||(this.random()<.5?-1:1);
  Object.assign(c,{mode:'broken',broken:(this.random()<.3?1:3)+(side>0?1:0),brokenAt:this.clock,hazard:true,flash:false,drift:c.lane?c.lane*4+side*SHOULDER:side*.9});
  this.cue('scrape',c);
 }
 drop(e,c){e.resolved=true;if(c&&c.role===e.kind)c.role='';this.nextEvent=this.time+.2;}
 eject(e,c){
  const b={id:this.nextId++,model:'battery',...BODY.battery,mode:'loose',owner:c.id,x:c.x,sourceX:c.x,targetX:e.targetX,z:c.z,speed:c.speed,age:0,lift:0,hit:false};
  this.batteries.push(b);e.batteryId=b.id;e.stage='ejected';this.cue('eject',c);
 }
 signalLane(c,dir){c.signal=dir;c.lane+=dir;c.moveAt=this.clock+SIGNAL;}
 cue(type,o){if(this.cues.length<32)this.cues.push({type,x:o.x,z:o.z});}
 // Whether `lane` has room beside car c. A car may merge in ahead of the player only with at least MERGE seconds
 // before the player would reach it, so its turn signal always gives fair warning.
 laneClear(c,lane){
  const x=lane*4;
  for(const o of this.traffic)if(o!==c&&(Math.abs(o.x-x)<2.6||o.lane===lane)&&Math.abs(o.z-c.z)<(o.length+c.length)/2+11.4+Math.abs(o.speed-c.speed)*2.5)return false;
  for(const b of this.batteries)if(Math.abs(b.x-x)<2.6&&Math.abs(b.z-c.z)<30)return false;
  const mine=Math.abs(this.lane*4-x)<2.6||Math.abs(this.x-x)<2.6;
  return !mine||c.z<-12||c.z-this.reach(c)>(this.speed/3.6-c.speed)*MERGE;
 }
 // Nearest thing ahead in a car's path (its lane, or the lane it is moving into), including loose batteries and the player.
 leader(c,v){
  let gap=Infinity,nearest=null;
  // Wrecks, loose batteries and cars braking to a halt are treated as already stopped, as a driver would.
  for(const list of [this.traffic,this.batteries])for(const o of list)if(o!==c&&o.z>c.z&&inPath(c,o)){const g=o.z-c.z-(o.length+c.length)/2;if(g<gap){gap=g;nearest=o;}}
  if(nearest)Object.assign(LEAD,{gap,speed:nearest.speed,stopping:nearest.mode==='crashed'||nearest.mode==='broken'||nearest.mode==='loose'||(nearest.mode==='brake'&&nearest.brakeTo===0)});
  if(c.z<0&&(Math.abs(this.x-c.x)<2.4||Math.abs(this.x-c.lane*4)<2.4)){const g=-c.z-(BODY.player.length+c.length)/2;if(g<gap){gap=g;Object.assign(LEAD,{gap,speed:v,stopping:this.phase==='over'});}}
  return gap<Infinity?LEAD:null;
 }
 obstacles(){return [...this.traffic,...this.batteries];}
 update(dt){
  if(!Number.isFinite(dt)||dt<=0)return;
  if(this.phase!=='running'&&(this.phase!=='over'||this.settled))return;
  this.accumulator+=Math.min(dt,.1);
  while(this.accumulator+1e-10>=STEP&&(this.phase==='running'||(this.phase==='over'&&!this.settled))){this.accumulator-=STEP;this.step(STEP);}
 }
 // Whether body o's footprint overlaps the player's, at any height.
 over(o){return Math.abs(o.x-this.x)<(1.9+o.width)/2-.14&&Math.abs(o.z)<(4.6+o.length)/2-.12;}
 hit(o){return this.over(o)&&this.altitude+.1<o.height;}
 // Height of the truck roof the player is on or coming down onto; anything lower than its top would be a hit instead.
 deck(){let top=0;for(const o of this.traffic)if(o.deck&&o.height>top&&this.altitude+.1>=o.height&&this.over(o))top=o.height;return top;}
 // The two vehicles trade momentum and slide on before the result appears.
 crash(o,v){
  this.phase='over';this.held=false;this.thrusting=false;
  const label=o.model==='battery'?'撞上弹出的电池':o.mode==='crashed'?'撞上事故车辆':o.role==='parked'?'撞上路边抛锚的车辆':o.mode==='broken'?'撞上悬挂断裂的车辆':o.role==='rear'?'被刹车失灵的后车追尾':o.role==='front'?'撞上急刹车辆':o.signal||o.vx?'撞上并线车辆':o.role==='battery'?'撞上急停车辆':o.deck?'撞上大货车':'撞上路人车辆';
  this.cause=(this.exhausted?'气量耗尽 · ':this.altitude>0?'注意起降高度 · ':'')+label;
  const mass=o.mass??BODY.sedan.mass,m=BODY.player.mass+mass,closing=v-o.speed,u=(BODY.player.mass*v+mass*o.speed)/m,side=o.x>=this.x?1:-1;
  this.crashSpeed=Math.max(0,u-.2*closing*mass/m);o.speed=Math.max(0,u+.2*closing*BODY.player.mass/m);
  this.spin=-side*(.5+Math.min(1,Math.abs(closing)/30));this.crashTime=0;this.settled=false;
  this.wreck(o,side*.8);this.cue('impact',o);
 }
 wreck(c,spin){if(c.model==='battery'){c.hit=true;return;}if(c.mode!=='crashed')c.spin=spin;Object.assign(c,{mode:'crashed',hazard:true,flash:false,signal:0,horn:false,vx:0});}
 step(dt){
  this.clock+=dt;
  const running=this.phase==='running';let v;
  if(running){
   this.time+=dt;this.speed=SPEED.start+(SPEED.top-SPEED.start)*(1-Math.exp(-this.time/SPEED.ramp));this.maxSpeed=Math.max(this.maxSpeed,this.speed);v=this.speed/3.6;
   this.distance+=v*dt;this.score=Math.floor(this.distance/10);
   const dx=this.lane*4-this.x;this.x+=Math.sign(dx)*Math.min(Math.abs(dx),13*dt);
   this.thrusting=this.held&&!this.exhausted&&this.gas>0;this.floor=this.deck();
   if(this.thrusting){this.gas=Math.max(0,this.gas-25*dt);this.altitude=Math.min(8,this.altitude+8.5*dt);if(this.gas<1e-8){this.gas=0;this.exhausted=true;this.thrusting=false;}}
   // Standing on a truck roof counts as being on the ground.
   else{this.altitude=Math.max(this.floor,this.altitude-6*dt);if(this.altitude===this.floor)this.gas=Math.min(100,this.gas+24*dt);}
  }else{
   // After an impact the player's car slides to rest while the rest of the road plays on; distance and score stay frozen.
   this.crashTime+=dt;this.crashSpeed=Math.max(0,this.crashSpeed-SLIDE*dt);v=this.crashSpeed;this.speed=v*3.6;
   this.yaw+=this.spin*dt;this.spin*=Math.exp(-2*dt);this.floor=this.deck();this.altitude=Math.max(this.floor,this.altitude-6*dt);
   if(this.crashTime>=1.5)this.settled=true;
  }
  this.travel+=v*dt;
  this.drive(dt,v);
  if(!running)return;
  for(const list of [this.traffic,this.batteries])for(const o of list)if(this.hit(o)){this.crash(o,v);return;}
  this.direct(dt);
  if(this.trafficEnabled){this.wander(dt,v);this.spawnTraffic(v);}
  // Cars stay a while behind so the mirror can watch them fall away.
  const kept=o=>o.z>-160&&o.z<420;
  if(!this.traffic.every(kept))this.traffic=this.traffic.filter(kept);if(!this.batteries.every(kept))this.batteries=this.batteries.filter(kept);
 }
 // Every car brakes for what is ahead of it, follows its own script, moves, and may collide with others.
 drive(dt,v){
  for(const c of this.traffic){
   const was=c.speed;
   if(c.mode==='crashed'){c.speed=Math.max(0,c.speed-SLIDE*dt);c.yaw+=c.spin*dt;c.spin=c.speed>0?c.spin*Math.exp(-1.8*dt):0;}
   else if(c.mode==='runaway'){if(c.z<0&&this.phase==='running')c.speed=Math.max(c.speed,v+c.closing);}
   else if(c.mode==='broken'){
    // Dragging on the collapsed corner, it scrubs off speed and pulls toward the broken side.
    c.speed=Math.max(0,c.speed-DRAG*dt);const dx=c.drift-c.x;
    c.vx=c.speed>0?Math.sign(dx)*Math.min(Math.abs(dx)/dt,1.6):0;c.x+=c.vx*dt;
   }
   else{
    let target=c.cruise,rate=SOFT_BRAKE;
    if(c.mode==='brake'){target=c.brakeTo;rate=HARD_BRAKE;if(c.brakeTo>0&&c.speed<=c.brakeTo+1e-6){c.holdUntil||=this.clock+1.4;if(this.clock>=c.holdUntil)Object.assign(c,{mode:'cruise',holdUntil:0});}}
    const lead=this.leader(c,v);
    if(lead){
     const safe=5+c.speed*.55;if(lead.gap<safe*2.5)target=Math.min(target,Math.max(0,lead.speed+(lead.gap-safe)*.9));
     // Brake as hard as the remaining distance demands for something much slower ahead, up to an emergency stop.
     const ahead=lead.stopping?0:lead.speed,need=c.speed>ahead?(c.speed**2-ahead**2)/(2*Math.max(1,lead.gap-4)):0;
     if(need>1.5){target=Math.min(target,ahead);rate=Math.max(rate,Math.min(HARD_BRAKE,need*1.2));}
    }
    c.speed=target<c.speed?Math.max(target,c.speed-rate*dt):Math.min(target,c.speed+PICKUP*dt);
   }
   c.brake=c.mode!=='runaway'&&(was-c.speed>1.5*dt||c.mode==='brake'||(c.speed===0&&c.mode==='cruise'));
   // Emergency braking flashes the brake lights, as modern cars do; ordinary slowing shows them steady.
   c.flash=(c.mode==='cruise'||c.mode==='brake')&&was-c.speed>6.5*dt;
   if(c.signal&&c.mode!=='crashed'&&this.clock>=c.moveAt){
    const dx=c.lane*4-c.x;
    if(Math.abs(dx)<=LATERAL*dt){c.x=c.lane*4;c.signal=0;c.vx=0;}else{c.vx=Math.sign(dx)*LATERAL;c.x+=c.vx*dt;}
   }
   c.z+=(c.speed-v)*dt;c.odo+=c.speed*dt;
  }
  for(const b of this.batteries){
   b.age+=dt;const p=clamp(b.age/.55,0,1);
   if(!b.hit)b.x=b.sourceX+(b.targetX-b.sourceX)*p*p*(3-2*p);
   b.lift=Math.sin(Math.PI*p)*.55;b.speed=Math.max(0,b.speed-BATTERY_SLIDE*dt);b.z+=(b.speed-v)*dt;
  }
  this.collideTraffic();
  // While the player's wreck slides, anything running into it crashes too.
  if(this.phase==='over')for(const o of this.traffic)if(o.mode!=='crashed'&&this.hit(o)){o.speed=Math.min(o.speed,v);this.wreck(o,o.z<0?.6:-.6);this.cue('crash',o);}
 }
 // Bodies that touch trade momentum, light their hazards and slide to a stop as wrecks.
 collideTraffic(){
  const bodies=this.batteries.length?this.obstacles():this.traffic;
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
   const a=bodies[i],b=bodies[j];
   if(a.owner===b.id||b.owner===a.id||Math.abs(a.x-b.x)>=(a.width+b.width)/2-.1||Math.abs(a.z-b.z)>=(a.length+b.length)/2-.05)continue;
   const [r,f]=a.z<b.z?[a,b]:[b,a],m=r.mass+f.mass,closing=r.speed-f.speed,u=(r.mass*r.speed+f.mass*f.speed)/m;
   if(closing>0){r.speed=Math.max(0,u-.2*closing*f.mass/m);f.speed=u+.2*closing*r.mass/m;}
   r.z=f.z-(r.length+f.length)/2+.04;
   const force=Math.min(1,.3+Math.abs(closing)/25);
   this.wreck(r,(.5+r.id%5*.12)*force);this.wreck(f,-(.5+f.id%5*.12)*force);
   if(closing>1)this.cue('crash',f);
  }
 }
 direct(dt){
  for(const e of this.events){
   e.age+=dt;if(e.resolved)continue;
   const c=this.traffic.find(o=>o.id===e.carId);
   if(e.stage==='planned'){
    if(!c||c.mode!=='cruise'||c.signal){this.drop(e,c);continue;}
    // If the player has changed lanes, the car switches to whatever it can still do to them.
    const kind=this.fits(c,e.kind)||e.kind;if(kind!==e.kind){e.kind=kind;c.role=kind;}
    const left=c.z-this.reach(kind==='battery'?BODY.battery:c),need=this.gain(kind,c,CUE[kind]);
    if(left>need)continue;
    // Fire only with the full warning time and the spacing after other hazards; otherwise free the car and plan again.
    if(this.fits(c,kind)===kind&&left>need-1.5&&this.clock+CUE[kind]>=this.busyUntil+this.spacing*.8)this.trigger(e,c);else this.drop(e,c);
    continue;
   }
   if(e.stage==='braking'&&e.kind==='battery'&&c&&c.mode!=='crashed'&&this.clock>=e.ejectAt)this.eject(e,c);
   const threat=e.batteryId?this.batteries.find(b=>b.id===e.batteryId):c;
   const passed=!threat||(e.kind==='rear'?threat.z>this.reach(threat)+.5||(threat.mode==='crashed'&&threat.z<0):threat.z<-this.reach(threat)-.5);
   const fizzled=e.kind==='battery'&&e.stage==='braking'&&c?.mode==='crashed';
   if(passed||fizzled){e.resolved=true;this.dodged++;}
  }
  this.events=this.events.filter(e=>!e.resolved||e.age<8);
  // One hazard is lined up at a time, and at most two are live at once.
  const open=this.events.filter(e=>!e.resolved);
  if(this.autoSpawn&&this.time>=this.nextEvent&&open.length<2&&!open.some(e=>e.stage==='planned')){const event=this.plan();if(!event)this.nextEvent=this.time+.2;else if(event.stage==='planned')this.nextEvent=Infinity;}
 }
 // Ordinary drivers now and then signal and change lanes, more eagerly when stuck behind something slower.
 wander(dt,v){
  for(const c of this.traffic){
   if(c.mode!=='cruise'||c.signal||c.role||c.z<-150||c.z>240)continue;
   // A wreck or an emergency stop ahead makes a driver pull out urgently; a slow car only once they are stuck behind it.
   const lead=this.leader(c,v),urgent=lead&&lead.stopping&&lead.gap<260,stuck=lead&&lead.gap<45&&lead.speed<c.cruise-4;
   if(this.random()>=(urgent?6:stuck?1.4:.05)*dt)continue;
   const first=this.random()<.5?-1:1;
   for(const dir of [first,-first])if(Math.abs(c.lane+dir)<=1&&this.laneClear(c,c.lane+dir)){this.signalLane(c,dir);break;}
  }
 }
 // New cars enter far ahead, inside the haze, and never wall off every lane at the moment they reach the player.
 spawnTraffic(v){
  if(this.time<this.nextTraffic)return;
  this.nextTraffic=this.time+Math.max(.7,1.5-this.time/150)+this.random()*.6;
  if(this.traffic.filter(o=>o.z>0).length>=10)return;
  // New cars favour the player's lane, so there is usually someone ahead of them who might brake.
  const lane=this.random()<.35?this.lane:Math.floor(this.random()*3)-1,z=210+this.random()*60,roll=this.random(),pace=this.random();
  // Mostly sedans, with SUVs, MPVs and trucks mixed in; trucks run a little closer to the player's speed.
  const model=roll<.13?'suv':roll<.34?'mpv':roll<.43?'truck':roll<.49?'semi':'sedan',{length}=BODY[model];
  const speed=v*(BODY[model].deck?.7+pace*.08:.6+pace*.2),t=z/Math.max(1,v-speed),blocked=new Set([lane]);
  // Long vehicles occupy a lane for longer as the player passes them.
  for(const o of this.obstacles()){const closing=v-o.speed;if(closing>1&&o.z>0&&Math.abs(o.z/closing-t)<1.4+((o.length+length)/2-4.6)/closing)blocked.add(Math.round(o.x/4));}
  if(blocked.size<3&&!this.traffic.some(o=>(Math.abs(o.x-lane*4)<2.6||o.lane===lane)&&Math.abs(o.z-z)<(o.length+length)/2+25))this.addTraffic(lane,z,speed,model);
 }
}
