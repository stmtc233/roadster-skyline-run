import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,SPEED} from '../dist/game.js';
import {drive} from './pilot.mjs';
function run(g,s,hz=120){for(let i=0;i<Math.round(s*hz);i++)g.update(1/hz);}
function game(){const g=new Game({autoSpawn:false,trafficEnabled:false});g.start();return g;}
function seeded(seed){let n=seed;return ()=>((n=(n*1664525+1013904223)>>>0)/4294967296);}
// Seconds until the run ends with nobody touching the controls.
function contactTime(g){const t=g.time;for(let i=0;i<8*120&&g.phase==='running';i++)g.update(1/120);return g.time-t;}
const KINDS=['front','rear','battery','cutin'];
test('raised ceiling, fuel and exhaustion rearm',()=>{const g=game();g.setHeld(true);run(g,1.2);assert.equal(g.altitude,8);assert.ok(Math.abs(g.gas-70)<.1);run(g,5);assert.equal(g.altitude,0);assert.equal(g.thrusting,false);run(g,2);assert.ok(g.gas>50);g.setHeld(false);g.setHeld(true);run(g,.5);assert.ok(g.altitude>3);});
test('lane changes interpolate and clamp at edges',()=>{const g=game();g.moveLane(1);run(g,.1);assert.ok(g.x>0&&g.x<4);run(g,.3);assert.equal(g.x,4);g.moveLane(1);run(g,.4);assert.equal(g.x,4);g.moveLane(-1);g.moveLane(-1);run(g,.7);assert.equal(g.x,-4);});
test('pause freezes movement/fuel/score and resume releases input',()=>{const g=game();g.setHeld(true);g.moveLane(1);run(g,.1);g.pause();const a=[g.distance,g.gas,g.x,g.altitude];run(g,10);assert.deepEqual([g.distance,g.gas,g.x,g.altitude],a);g.resume();run(g,1);assert.ok(g.distance>a[0]);assert.equal(g.held,false);});
test('faster distance scoring is frame-rate independent',()=>{const a=[30,60,120].map(h=>{const g=game();run(g,10,h);return g;});for(const g of a){assert.ok(g.distance>350);assert.ok(g.speed>140&&g.speed<300);assert.equal(g.score,Math.floor(g.distance/10));}assert.ok(Math.abs(a[0].distance-a[2].distance)<.01);});
test('speed launches briskly and builds toward top speed',()=>{const g=game();assert.equal(g.speed,SPEED.start);assert.equal(g.pace,0);run(g,10);assert.ok(g.speed>210);run(g,10);assert.ok(g.speed>260);run(g,40);assert.ok(g.speed>360&&g.speed<SPEED.top);assert.ok(g.pace>.85&&g.pace<1);});
for(const kind of KINDS){
 test(`${kind}: ground impact ends run`,()=>{const g=game();g.spawn(kind);run(g,4);assert.equal(g.phase,'over');assert.ok(g.cause);const d=g.distance;run(g,2);assert.equal(g.distance,d);});
 test(`${kind}: flight clears obstacle`,()=>{const g=game();g.spawn(kind);run(g,1.05);g.setHeld(true);run(g,2.4);g.setHeld(false);run(g,1.5);assert.equal(g.phase,'running');assert.equal(g.dodged,1);});
 test(`${kind}: open-lane evasion consumes no gas`,()=>{const g=game();const e=g.spawn(kind);run(g,.5);g.moveLane(e.sourceX<0?1:-1);run(g,4);assert.equal(g.phase,'running');assert.equal(g.gas,100);assert.equal(g.dodged,1);});
}
test('every hazard gives its cue well before contact',()=>{
 const expected={front:2.4,cutin:2.7,battery:3,rear:3};
 for(const kind of KINDS)for(const t of [0,40,10000]){
  const g=game();g.time=t;g.update(1/120);g.spawn(kind);const seconds=contactTime(g);
  assert.ok(seconds>expected[kind]-.25&&seconds<expected[kind]+.35,`${kind} at ${Math.round(g.maxSpeed)} km/h: ${seconds.toFixed(2)} s`);
 }
});
test('a cut-in car signals before it moves into the player lane',()=>{
 const g=game();const e=g.spawn('cutin'),car=g.traffic.find(c=>c.id===e.carId),x=car.x;
 run(g,1);assert.equal(car.x,x);assert.equal(car.signal,Math.sign(-x));
 run(g,.5);assert.ok(Math.abs(car.x)<Math.abs(x));assert.equal(e.stage,'merging');
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
 assert.equal(g.laneClear(close,0,true),true,'a deliberate cut-in may target the player lane');
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
test('attentive lane pilot survives varied high-speed traffic',()=>{for(let seed=1;seed<=12;seed++){const g=new Game({random:seeded(seed)});g.start();g.time=200;drive(g,180);assert.equal(g.phase,'running',`seed ${seed}, ${g.cause}`);assert.ok(g.dodged>20);}});
test('top-speed collision cannot tunnel through obstacles at 30, 60 or 120 Hz',()=>{
 for(const kind of [...KINDS,'traffic']) {
  const impacts=[30,60,120].map(hz=>{
   const g=game();g.time=10000;g.speed=SPEED.top;
   if(kind==='traffic')g.addTraffic(0,15,0);else g.spawn(kind);
   run(g,4,hz);assert.equal(g.phase,'over',`${kind} at ${hz} Hz`);return g.time;
  });
  assert.ok(Math.max(...impacts)-Math.min(...impacts)<.01,kind);
 }
});
