import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';
import {drive} from './pilot.mjs';
function run(g,s,hz=120){for(let i=0;i<Math.round(s*hz);i++)g.update(1/hz);}
function game(){const g=new Game({autoSpawn:false,trafficEnabled:false});g.start();return g;}
test('raised ceiling, fuel and exhaustion rearm',()=>{const g=game();g.setHeld(true);run(g,1.2);assert.equal(g.altitude,8);assert.ok(Math.abs(g.gas-70)<.1);run(g,5);assert.equal(g.altitude,0);assert.equal(g.thrusting,false);run(g,2);assert.ok(g.gas>50);g.setHeld(false);g.setHeld(true);run(g,.5);assert.ok(g.altitude>3);});
test('lane changes interpolate and clamp at edges',()=>{const g=game();g.moveLane(1);run(g,.1);assert.ok(g.x>0&&g.x<4);run(g,.3);assert.equal(g.x,4);g.moveLane(1);run(g,.4);assert.equal(g.x,4);g.moveLane(-1);g.moveLane(-1);run(g,.7);assert.equal(g.x,-4);});
test('pause freezes movement/fuel/score and resume releases input',()=>{const g=game();g.setHeld(true);g.moveLane(1);run(g,.1);g.pause();const a=[g.distance,g.gas,g.x,g.altitude];run(g,10);assert.deepEqual([g.distance,g.gas,g.x,g.altitude],a);g.resume();run(g,1);assert.ok(g.distance>a[0]);assert.equal(g.held,false);});
test('faster distance scoring is frame-rate independent',()=>{const a=[30,60,120].map(h=>{const g=game();run(g,10,h);return g;});for(const g of a){assert.ok(g.distance>350);assert.ok(g.speed>140&&g.speed<300);assert.equal(g.score,Math.floor(g.distance/10));}assert.ok(Math.abs(a[0].distance-a[2].distance)<.01);});
for(const kind of ['front','rear','battery']){
 test(`${kind}: ground impact ends run`,()=>{const g=game();g.spawn(kind);run(g,4);assert.equal(g.phase,'over');assert.ok(g.cause);const d=g.distance;run(g,2);assert.equal(g.distance,d);});
 test(`${kind}: flight clears obstacle`,()=>{const g=game();g.spawn(kind);run(g,1.05);g.setHeld(true);run(g,2.4);g.setHeld(false);run(g,1.5);assert.equal(g.phase,'running');assert.equal(g.dodged,1);});
 test(`${kind}: open-lane evasion consumes no gas`,()=>{const g=game();const e=g.spawn(kind);run(g,.5);g.moveLane(e.sourceX<0?1:-1);run(g,4);assert.equal(g.phase,'running');assert.equal(g.gas,100);assert.equal(g.dodged,1);});
}
test('SUV stops and flashes before ejection; stopped world location is fixed',()=>{const g=game();const e=g.spawn('battery');run(g,.7);assert.equal(e.sourceSpeed,0);assert.equal(e.stage,'hazards');assert.equal(e.batteryVisible,false);const z=g.distance+e.sourceZ;run(g,.6);assert.ok(Math.abs(g.distance+e.sourceZ-z)<.01);assert.equal(e.batteryVisible,false);run(g,.4);assert.equal(e.stage,'ejected');assert.equal(e.batteryVisible,true);});
test('ordinary traffic exists and can collide during lane changes',()=>{const g=new Game({autoSpawn:false});g.start();assert.ok(g.traffic.length>=3);const h=game();h.traffic.push({id:99,x:4,z:0,speed:120/3.6,width:1.85,length:4.6,height:1.45});h.moveLane(1);run(h,.4);assert.equal(h.phase,'over');});
test('early danger and restart reset',()=>{const g=new Game({trafficEnabled:false});g.start();run(g,1.6);assert.ok(g.events.length);g.moveLane(1);g.setHeld(true);g.start();assert.equal(g.x,0);assert.equal(g.lane,0);assert.equal(g.gas,100);assert.equal(g.held,false);assert.equal(g.distance,0);});
test('attentive lane pilot survives varied high-speed traffic',()=>{for(let seed=1;seed<=12;seed++){let n=seed;const random=()=>((n=(n*1664525+1013904223)>>>0)/4294967296);const g=new Game({random});g.start();g.time=200;drive(g,180);assert.equal(g.phase,'running',`seed ${seed}, ${g.cause}`);assert.ok(g.dodged>20);}});

test('special spawning preserves traffic already visible in its proposed location',()=>{
 const g=game();g.autoSpawn=true;g.nextEvent=0;
 const car=g.addTraffic(0,67,30);run(g,.1);
 assert.ok(g.traffic.includes(car),'a visible ordinary car must not disappear for a new hazard');
 assert.equal(g.events.length,0,'overlapping special event must wait for a clear location');
 run(g,12);assert.ok(g.eventCount>0,'deferring a conflict must not disable special events');
});

test('ordinary traffic does not spawn inside a special vehicle at high speed',()=>{
 const g=game();g.time=10000;g.speed=300;g.random=()=>.5;
 g.spawn('front');g.trafficEnabled=true;g.nextTraffic=0;g.update(1/120);
 assert.equal(g.traffic.length,0,'candidate ordinary car overlaps the visible braking sedan');
});

test('300 km/h collision cannot tunnel through obstacles at 30, 60 or 120 Hz',()=>{
 for(const kind of ['front','rear','battery','traffic']) {
  const impacts=[30,60,120].map(hz=>{
   const g=game();g.time=10000;g.speed=300;
   if(kind==='traffic')g.addTraffic(0,15,0);else g.spawn(kind);
   run(g,4,hz);assert.equal(g.phase,'over',`${kind} at ${hz} Hz`);return g.time;
  });
  assert.ok(Math.max(...impacts)-Math.min(...impacts)<.01,kind);
 }
});
