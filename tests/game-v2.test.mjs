import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,SPEED} from '../dist/game.js';
import {drive} from './pilot.mjs';
function run(g,s,hz=120){for(let i=0;i<Math.round(s*hz);i++)g.update(1/hz);}
function game(){const g=new Game({autoSpawn:false,trafficEnabled:false});g.start();return g;}
function seeded(seed){let n=seed;return ()=>((n=(n*1664525+1013904223)>>>0)/4294967296);}
// A roadside breakdown only blocks an outer lane, so its tests start from the right-hand lane.
function staged(kind,g=game()){if(kind==='parked'){g.moveLane(1);run(g,.5);}return g;}
// Seconds until the run ends with nobody touching the controls.
function contactTime(g){const t=g.time;for(let i=0;i<8*120&&g.phase==='running';i++)g.update(1/120);return g.time-t;}
const KINDS=['front','rear','battery','breakdown','parked'];
test('raised ceiling, fuel and exhaustion rearm',()=>{const g=game();g.setHeld(true);run(g,1.2);assert.equal(g.altitude,8);assert.ok(Math.abs(g.gas-70)<.1);run(g,5);assert.equal(g.altitude,0);assert.equal(g.thrusting,false);run(g,2);assert.ok(g.gas>50);g.setHeld(false);g.setHeld(true);run(g,.5);assert.ok(g.altitude>3);});
test('lane changes interpolate and clamp at edges',()=>{const g=game();g.moveLane(1);run(g,.1);assert.ok(g.x>0&&g.x<4);run(g,.3);assert.equal(g.x,4);g.moveLane(1);run(g,.4);assert.equal(g.x,4);g.moveLane(-1);g.moveLane(-1);run(g,.7);assert.equal(g.x,-4);});
test('pause freezes movement/fuel/score and resume releases input',()=>{const g=game();g.setHeld(true);g.moveLane(1);run(g,.1);g.pause();const a=[g.distance,g.gas,g.x,g.altitude];run(g,10);assert.deepEqual([g.distance,g.gas,g.x,g.altitude],a);g.resume();run(g,1);assert.ok(g.distance>a[0]);assert.equal(g.held,false);});
test('faster distance scoring is frame-rate independent',()=>{const a=[30,60,120].map(h=>{const g=game();run(g,10,h);return g;});for(const g of a){assert.ok(g.distance>350);assert.ok(g.speed>140&&g.speed<300);assert.equal(g.score,Math.floor(g.distance/10));}assert.ok(Math.abs(a[0].distance-a[2].distance)<.01);});
test('speed launches briskly and builds toward top speed',()=>{const g=game();assert.equal(g.speed,SPEED.start);assert.equal(g.pace,0);run(g,10);assert.ok(g.speed>210);run(g,10);assert.ok(g.speed>260);run(g,40);assert.ok(g.speed>360&&g.speed<SPEED.top);assert.ok(g.pace>.85&&g.pace<1);});
for(const kind of KINDS){
 test(`${kind}: ground impact ends run`,()=>{const g=staged(kind);g.spawn(kind);run(g,4);assert.equal(g.phase,'over');assert.ok(g.cause);const d=g.distance;run(g,2);assert.equal(g.distance,d);});
 test(`${kind}: flight clears obstacle`,()=>{const g=staged(kind);g.spawn(kind);run(g,1.05);g.setHeld(true);run(g,2.4);g.setHeld(false);run(g,1.5);assert.equal(g.phase,'running');assert.equal(g.dodged,1);});
 test(`${kind}: open-lane evasion consumes no gas`,()=>{const g=staged(kind);const e=g.spawn(kind);run(g,.5);g.moveLane(e.sourceX<0?1:-1);run(g,4);assert.equal(g.phase,'running');assert.equal(g.gas,100);assert.equal(g.dodged,1);});
}
test('every hazard gives its cue well before contact',()=>{
 const expected={front:2.4,battery:3,rear:3,breakdown:2.6,parked:3.4};
 for(const kind of KINDS)for(const t of [0,40,10000]){
  const g=game();g.time=t;g.update(1/120);staged(kind,g);g.spawn(kind);const seconds=contactTime(g);
  assert.ok(seconds>expected[kind]-.25&&seconds<expected[kind]+.35,`${kind} at ${Math.round(g.maxSpeed)} km/h: ${seconds.toFixed(2)} s`);
 }
});
test('ordinary cars merge in ahead with a turn signal and fair warning, and are not counted as hazards',()=>{
 const g=new Game({autoSpawn:false,random:()=>0});g.start();g.traffic=[];g.nextTraffic=Infinity;g.time=30;g.update(1/120);
 const v=g.speed/3.6,speed=v*.7,near=g.addTraffic(1,20,speed),fair=g.addTraffic(1,20+(v-speed)*3.5,speed);
 g.update(1/120);g.random=()=>.99;
 assert.equal(near.signal,0,'too close to merge in ahead of the player');assert.equal(fair.signal,-1);
 const start=g.time;run(g,1);assert.equal(fair.x,4,'signals before moving');
 run(g,.6);assert.ok(fair.x<4);assert.equal(g.events.length,0);assert.equal(g.warning,null);
 for(let i=0;i<120*6&&g.phase==='running';i++)g.update(1/120);
 assert.equal(g.phase,'over');assert.ok(g.time-start>=3,`only ${(g.time-start).toFixed(2)} s from signal to contact`);
});
test('the battery SUV brakes with hazards on before the battery drops, then stays put',()=>{
 const g=game();const e=g.spawn('battery'),suv=g.traffic.find(c=>c.id===e.carId);
 run(g,.6);assert.ok(suv.hazard&&suv.brake);assert.equal(g.batteries.length,0);
 run(g,.8);assert.equal(e.stage,'ejected');assert.equal(g.batteries.length,1);
 g.moveLane(Math.sign(-suv.x));run(g,3);assert.equal(suv.speed,0);assert.ok(g.traffic.includes(suv));
 const spot=g.distance+suv.z;run(g,.5);assert.ok(Math.abs(g.distance+suv.z-spot)<.01);
});
test('the brake-failure car honks, then crashes into the car ahead and both slide to a stop',()=>{
 const g=game();g.time=30;g.update(1/120);
 const ahead=g.addTraffic(0,150,g.speed/3.6*.7),e=g.spawn('rear'),runaway=g.traffic.find(c=>c.id===e.carId);
 assert.ok(runaway.horn);g.moveLane(-1);
 let impactSpeed=0;
 for(let i=0;i<120*8&&runaway.mode!=='crashed';i++)g.update(1/120);
 assert.equal(runaway.mode,'crashed');assert.equal(ahead.mode,'crashed');assert.ok(runaway.hazard&&ahead.hazard&&!runaway.horn);
 impactSpeed=ahead.speed;run(g,1);assert.ok(Math.abs(impactSpeed-ahead.speed-6.5)<.1,'slides down at a steady rate rather than stopping dead');
 assert.ok(Math.abs(ahead.z-runaway.z)>=(ahead.length+runaway.length)/2-.05,'wrecks touch but never overlap');
 assert.equal(g.phase,'running');assert.equal(g.dodged,1);
 const h=game(),wreck=h.addTraffic(1,120,20);h.wreck(wreck,.5);run(h,3.5);assert.equal(wreck.speed,0);assert.equal(wreck.spin,0);assert.ok(wreck.yaw>0);
});
test('emergency braking flashes the brake lights, then they stay steady while the car holds its lower speed',()=>{
 const g=game();g.time=20;g.update(1/120);const e=g.spawn('front'),car=g.traffic.find(c=>c.id===e.carId);
 run(g,.4);assert.ok(car.brake&&car.flash);
 for(let i=0;i<120*4&&car.speed>car.brakeTo+1e-6;i++)g.update(1/120);
 run(g,.1);assert.ok(car.brake&&!car.flash);
});
test('a snapped suspension drags the MPV to a stop with hazards on, pulling toward the edge without leaving its lane',()=>{
 for(const lane of [-1,0,1]){
  const g=game();g.moveLane(lane);run(g,.5);const e=g.spawn('breakdown'),mpv=g.traffic.find(c=>c.id===e.carId);
  run(g,1/120);assert.equal(mpv.mode,'broken');assert.ok(mpv.hazard&&mpv.brake&&!mpv.flash);
  const side=mpv.broken%2===0?1:-1;if(lane)assert.equal(side,lane,'the outer wheel breaks, so it pulls toward the road edge');
  const speed=mpv.speed;run(g,.5);assert.ok(Math.abs(speed-mpv.speed-4)<.1,'drags down hard');
  g.moveLane(lane?-lane:1);run(g,4);
  assert.equal(g.phase,'running');assert.equal(mpv.speed,0);assert.equal(mpv.mode,'broken');
  assert.ok(Math.abs(mpv.x-(lane?lane*5.3:side*.9))<1e-6,`lane ${lane} rests at ${mpv.x}`);
 }
});
test('a roadside breakdown waits in the haze half on the road edge, and drivers in that lane go around it',()=>{
 for(let seed=1;seed<=5;seed++){
  const g=new Game({autoSpawn:false,random:seeded(seed)});g.start();g.traffic=[];g.nextTraffic=Infinity;g.time=30;g.update(1/120);
  g.moveLane(1);run(g,.5);
  const e=g.park(1,-Infinity),car=g.traffic.find(c=>c.id===e.carId);
  assert.ok(car.z>=215&&car.speed===0&&car.triangle&&car.hazard&&!car.brake);assert.equal(car.x,5.3);assert.equal(car.broken,4,'the outer rear wheel has collapsed');
  assert.ok(e.contactAt-g.clock>=3.4,'at least as much warning as its cue');
  const v=g.speed/3.6,follower=g.addTraffic(1,40,v*.7);g.moveLane(-1);
  run(g,7);assert.notEqual(follower.mode,'crashed',`seed ${seed}`);assert.notEqual(follower.lane,1,`seed ${seed}`);
  assert.equal(g.phase,'running');assert.equal(g.dodged,1);
 }
});
test('the player can land on a truck roof, ride it while regaining gas, and drop back to the road',()=>{
 const g=game();g.time=20;g.update(1/120);const v=g.speed/3.6,truck=g.addTraffic(0,3,v-3.5,'truck');
 g.altitude=5;g.gas=40;run(g,.4);
 assert.equal(g.floor,3.9);assert.equal(g.altitude,3.9);
 run(g,1);assert.equal(g.phase,'running');assert.equal(g.altitude,3.9);assert.ok(g.gas>60,'gas recovers on the roof');
 assert.ok(!truck.brake&&!truck.signal,'the truck carries the player without braking for them');
 g.moveLane(1);run(g,1.5);assert.equal(g.floor,0);assert.equal(g.altitude,0);assert.equal(g.phase,'running');
 const h=game();h.addTraffic(0,40,0,'semi');h.setHeld(true);run(h,.3);h.setHeld(false);run(h,3);
 assert.equal(h.phase,'over');assert.match(h.cause,/大货车/,'too low to reach the deck');
 assert.ok(truck.deck&&truck.height===3.9);
});
test('SUVs are a minority on the road, and trucks join the traffic',()=>{
 const g=new Game({random:seeded(11)});g.start();g.time=60;g.update(1/120);const count={};
 for(let i=0;i<3000;i++){g.traffic=[];g.nextTraffic=0;g.spawnTraffic(g.speed/3.6);for(const c of g.traffic)count[c.model]=(count[c.model]||0)+1;}
 const total=Object.values(count).reduce((a,b)=>a+b,0);
 assert.ok(count.suv/total<.16,`SUV share ${(count.suv/total).toFixed(2)}`);assert.ok(count.suv<count.mpv&&count.suv<count.sedan);
 assert.ok((count.truck+count.semi)/total>.1);
});
test('a wreck ahead is an obstacle that ends the run',()=>{
 const g=game();const wreck=g.addTraffic(0,60,0);g.wreck(wreck,.5);run(g,3);
 assert.equal(g.phase,'over');assert.match(g.cause,/事故车辆/);
});
test('drivers who see a wreck ahead brake and steer around it',()=>{
 for(let seed=1;seed<=5;seed++){
  const g=new Game({autoSpawn:false,random:seeded(seed)});g.start();g.traffic=[];g.nextTraffic=Infinity;g.time=30;g.update(1/120);
  const v=g.speed/3.6;g.moveLane(-1);run(g,.5);
  const wreck=g.addTraffic(0,220,0),follower=g.addTraffic(0,40,v*.7);g.wreck(wreck,0);
  run(g,.3);assert.ok(follower.brake,'brake lights come on');
  run(g,6);assert.notEqual(follower.mode,'crashed',`seed ${seed}`);assert.equal(follower.lane,1,`seed ${seed}`);
 }
});
test('ordinary lane changes never cut in close ahead of the player',()=>{
 const g=game();g.time=30;g.update(1/120);
 const close=g.addTraffic(1,25,g.speed/3.6*.7),far=g.addTraffic(-1,220,g.speed/3.6*.7);
 assert.equal(g.laneClear(close,0),false);assert.equal(g.laneClear(far,0),true);
});
test('the player crash slides on before the result settles',()=>{
 const g=game();g.time=20;g.update(1/120);g.spawn('front');
 for(let i=0;i<120*4&&g.phase==='running';i++)g.update(1/120);
 assert.equal(g.phase,'over');assert.equal(g.settled,false);
 const distance=g.distance,travel=g.travel;run(g,.5);
 assert.equal(g.distance,distance);assert.ok(g.travel>travel,'the wreck keeps sliding');assert.ok(g.speed<g.maxSpeed);
 run(g,1.2);assert.equal(g.settled,true);const rest=g.travel;run(g,1);assert.equal(g.travel,rest);
});
test('ordinary traffic exists and can collide during lane changes',()=>{const g=new Game({autoSpawn:false});g.start();assert.ok(g.traffic.length>=3);const h=game();h.addTraffic(1,0,120/3.6);h.moveLane(1);run(h,.4);assert.equal(h.phase,'over');});
test('early danger and restart reset',()=>{const g=new Game();g.start();run(g,1.6);assert.ok(g.events.length);g.moveLane(1);g.setHeld(true);g.start();assert.equal(g.x,0);assert.equal(g.lane,0);assert.equal(g.gas,100);assert.equal(g.held,false);assert.equal(g.distance,0);assert.equal(g.traffic.every(c=>c.mode==='cruise'),true);});
test('live hazards come from traffic already on the road, and new cars only appear far ahead',()=>{
 const g=new Game({random:seeded(7)});g.start();const kinds=new Set(),opening=new Set(g.traffic.map(c=>c.id)),firstZ=new Map();
 for(let i=0;i<900&&g.phase==='running';i++){
  drive(g,.1);
  for(const c of g.traffic)if(!firstZ.has(c.id)){firstZ.set(c.id,c.z);if(!opening.has(c.id))assert.ok(c.z>200||(c.role==='rear'&&c.z<0),`car ${c.id} appeared at ${c.z.toFixed(0)} m`);}
  for(const e of g.events){kinds.add(e.kind);if(e.kind!=='rear')assert.ok(opening.has(e.carId)||firstZ.get(e.carId)>200,`${e.kind} used car ${e.carId}, first seen at ${firstZ.get(e.carId)?.toFixed(0)} m`);}
 }
 assert.equal(g.phase,'running',g.cause);assert.deepEqual([...kinds].sort(),[...KINDS].sort());
});
test('attentive lane pilot survives varied high-speed traffic, and emergency braking is the most common hazard',()=>{
 const kinds={};
 for(let seed=1;seed<=12;seed++){
  const g=new Game({random:seeded(seed)});g.start();g.time=200;const seen=new Set();
  for(let s=0;s<180&&g.phase==='running';s++){drive(g,1);for(const e of g.events)if(e.stage!=='planned'&&!seen.has(e.id)){seen.add(e.id);kinds[e.kind]=(kinds[e.kind]||0)+1;}}
  assert.equal(g.phase,'running',`seed ${seed}, ${g.cause}`);assert.ok(g.dodged>20);
 }
 assert.deepEqual(Object.keys(kinds).sort(),[...KINDS].sort());
 for(const kind of KINDS)if(kind!=='front')assert.ok(kinds.front>kinds[kind],JSON.stringify(kinds));
});
test('top-speed collision cannot tunnel through obstacles at 30, 60 or 120 Hz',()=>{
 for(const kind of [...KINDS,'traffic']) {
  const impacts=[30,60,120].map(hz=>{
   const g=game();g.time=10000;g.speed=SPEED.top;
   if(kind==='traffic')g.addTraffic(0,15,0);else{staged(kind,g);g.spawn(kind);}
   run(g,4,hz);assert.equal(g.phase,'over',`${kind} at ${hz} Hz`);return g.time;
  });
  assert.ok(Math.max(...impacts)-Math.min(...impacts)<.01,kind);
 }
});
