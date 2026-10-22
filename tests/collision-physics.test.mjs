import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';

function game(random=()=>.99){const g=new Game({autoSpawn:false,trafficEnabled:false,random});g.start();return g;}
function run(g,seconds,hz=120){for(let i=0;i<Math.round(seconds*hz);i++)g.update(1/hz);}

test('a rotated truck hits only the lane area actually occupied by its body',()=>{
 for(const model of ['truck','semi']){
  const g=game(),t=g.addTraffic(0,3,0,model);g.x=4;g.lane=1;
  assert.equal(g.hit(t),false,'upright truck leaves the adjacent lane clear');
  t.yaw=.65;assert.equal(g.hit(t),true,'the rotated rear intrudes into the adjacent lane');
  t.z=-7;assert.equal(g.hit(t),false,'empty corner of the rotated bounding box stays clear');
 }
});

test('truck cab and cargo roof use their own collision heights',()=>{
 const g=game(),t=g.addTraffic(0,-6.4,0,'truck');g.altitude=4;
 assert.equal(g.deck(),3.82,'cab roof is lower than the cargo roof');
 t.z=0;assert.equal(g.deck(),3.9);g.altitude=3;assert.equal(g.hit(t),true);
});

test('traffic collides with a rotated trailer in the adjacent lane and separates without teleporting',()=>{
 const g=game(),t=g.addTraffic(0,100,20,'semi'),c=g.addTraffic(1,96,30,'sedan');t.yaw=.55;
 const beforeX=c.x,beforeZ=c.z,energy=t.mass*t.speed**2+c.mass*c.speed**2;
 g.collideTraffic();assert.equal(t.mode,'crashed');assert.equal(c.mode,'crashed');
 assert.ok(Math.abs(c.x-beforeX)<2&&Math.abs(c.z-beforeZ)<3,'resolve the local contact, not a full-length rear-end teleport');
 assert.ok(t.mass*(t.speed**2+t.vx**2)+c.mass*(c.speed**2+c.vx**2)<=energy+.001,'impact dissipates energy');
});

test('a follower brakes immediately for a trailer intruding into its lane, within finite braking limits',()=>{
 const g=game(),t=g.addTraffic(0,65,0,'semi'),c=g.addTraffic(1,35,25,'sedan');t.yaw=Math.PI/2;t.mode='crashed';
 g.drive(1/120,g.speed/3.6);assert.ok(c.speed<25);assert.ok(c.speed>24.8);assert.equal(c.brake,true);
 const clear=game(),upright=clear.addTraffic(0,65,0,'semi'),other=clear.addTraffic(1,35,25,'sedan');upright.mode='crashed';
 clear.drive(1/120,clear.speed/3.6);assert.equal(other.speed,25,'clear adjacent lane keeps moving');
});

test('collision impulse respects mass and heavily loaded trucks rotate less',()=>{
 const g=game(),truck=g.addTraffic(0,100,10,'truck'),car=g.addTraffic(0,93,35,'sedan');car.x=.5;
 g.collideTraffic();assert.equal(car.mode,'crashed');assert.ok(car.speed<35&&car.speed>0);assert.ok(truck.speed>=10&&truck.speed<35);
 assert.ok(Math.abs(truck.spin)<Math.abs(car.spin),'truck inertia resists angular acceleration');
 const speed=car.speed;g.drive(1/120,g.speed/3.6);assert.ok(car.speed<speed,'braking starts on the next physics step');
});

test('all M9 collision sources can ignite rapidly and an accident rolls only once',()=>{
 for(const source of ['traffic','player','lamp']){
  const g=game(()=>0),c=g.addTraffic(0,100,15,'m9');
  if(source==='traffic'){g.addTraffic(0,95.3,35,'sedan');g.collideTraffic();}
  else if(source==='player'){c.z=0;g.crash(c,35);}
  else {g.traffic=[];g.poleAfter=0;g.random=()=>.15;const m=g.addTraffic(1,95,24,'m9');g.plan();while(m.poleHitAt<0)g.update(1/120);g.traffic=[m];}
  const target=g.traffic.find(o=>o.model==='m9');assert.ok(target.fireAt>=0,source);
  g.random=()=>{throw Error('same accident rolled again');};g.wreck(target,.4,30);run(g,.35);
  assert.equal(target.fire,1,source);assert.equal(g.cues.filter(q=>q.type==='ignite').length,1);
 }
});

test('ordinary M9 crashes have a 38 percent base fire chance with higher odds for severe impacts',()=>{
 for(const [impact,want] of [[10,38],[40,70]]){
  let burning=0;
  for(let i=0;i<100;i++){
   const g=game(),c=g.addTraffic(1,100,20,'m9');g.random=()=>(i+.5)/100;g.wreck(c,.1,impact);if(c.fireAt>=0)burning++;
   g.random=()=>0;g.wreck(c,.1,impact);assert.equal(c.fireAt>=0,(i+.5)/100<want/100,'no repeated fire roll');
  }
  assert.equal(burning,want);
 }
 const g=game(()=>0),sedan=g.addTraffic(1,100,20,'sedan');g.wreck(sedan,.1,40);run(g,.5);assert.equal(sedan.fire,0);
});

test('collision and fire remain deterministic at 30, 60 and 120 Hz and freeze on pause',()=>{
 const results=[];
 for(const hz of [30,60,120]){
  const g=game(()=>0),c=g.addTraffic(1,100,25,'m9');g.addTraffic(1,95.3,40,'sedan');g.collideTraffic();assert.equal(c.mode,'crashed');run(g,.5,hz);assert.equal(c.fire,1);
  g.pause();const snapshot=JSON.stringify(g.traffic);run(g,1,hz);assert.equal(JSON.stringify(g.traffic),snapshot);
  g.resume();run(g,.5,hz);results.push([c.x,c.z,c.speed,c.yaw,c.fire]);
 }
 assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
});

test('player side impacts preserve lateral momentum and rear impacts fully separate',()=>{
 const g=game();g.x=2.3;g.lane=1;g.playerVx=13;
 const c=g.addTraffic(1,0,g.speed/3.6,'sedan');assert.equal(g.hit(c),true);
 g.crash(c,g.speed/3.6);assert.ok(g.crashLateral>0&&g.crashLateral<13);assert.ok(c.vx>0);
 const h=game(),truck=h.addTraffic(0,7.8,0,'truck');assert.equal(h.hit(truck),true);
 h.crash(truck,h.speed/3.6);assert.equal(h.hit(truck),false,'positional correction moves the player relative to every world object');
});

test('secondary wreck impacts still exchange momentum and merging cars preserve their heading',()=>{
 const g=game();Object.assign(g,{phase:'over',speed:0,crashSpeed:0,crashDrag:9});
 const incoming=g.addTraffic(0,-4,30,'sedan');g.wreck(incoming,0,30);g.update(1/120);
 assert.ok(g.crashSpeed>0,'already-crashed traffic can push the player wreck');assert.equal(g.hit(incoming),false);
 const h=game(),merging=h.addTraffic(1,100,20,'sedan');merging.vx=3.6;
 h.wreck(merging,0,15);assert.ok(Math.abs(merging.yaw+.162)<1e-9,'impact preserves the displayed steering angle');
});

test('a chain impact uses the updated player velocity for every contact in the same step',()=>{
 const g=game();Object.assign(g,{phase:'over',speed:0,crashSpeed:0,crashDrag:9});
 const rear=g.addTraffic(0,-4,30,'sedan'),front=g.addTraffic(0,4.5,0,'sedan');
 g.wreck(rear,0,30);g.wreck(front,0,0);g.update(1/120);
 assert.ok(g.crashSpeed>0,'rear impulse is retained after touching the front car');
 assert.ok(front.speed>0,'the second impact transfers momentum to the front car');
 assert.ok(Math.abs(g.speed/3.6-g.crashSpeed)<1e-9,'displayed and simulated speed agree');
});
