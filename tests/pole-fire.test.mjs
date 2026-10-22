import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';

function run(g,seconds,hz=120){for(let i=0;i<Math.round(seconds*hz);i++)g.update(1/hz);}
function staged(mode='normal',side=1){
 const g=new Game({mode,autoSpawn:false,trafficEnabled:false,random:()=>.15});g.start();g.poleAfter=0;
 const c=g.addTraffic(side,95,24,'m9');
 const e=g.plan();assert.equal(e?.kind,'pole');assert.equal(e.carId,c.id);
 return {g,c,e};
}

test('M9 hits the pole before rapidly growing into a large fire, on both roadsides',()=>{
 for(const side of [-1,1]){
  const {g,c}=staged('normal',side),pole=c.poleWorldZ;
  run(g,.5);assert.ok(Math.abs(c.x)>4);assert.ok(c.speed>0);assert.equal(c.poleHitAt,-1);assert.equal(c.fire,0);
  for(let i=0;i<360&&c.poleHitAt<0;i++)g.update(1/120);
  assert.ok(c.poleHitAt>0);assert.equal(c.mode,'crashed');assert.equal(c.speed,0);assert.equal(c.fire,0);
  assert.ok(Math.abs(c.z+g.travel+Math.cos(c.yaw)*c.length/2+.18-pole)<.02,'nose contacts the pole');
  const world=c.z+g.travel;run(g,.15);assert.ok(c.smoke>0);assert.ok(c.fire>0,'ignites within 150 ms');
  run(g,.2);assert.equal(c.fire,1,'full fire within 350 ms');assert.ok(Math.abs(c.z+g.travel-world)<1e-7,'wreck stays fixed');
  assert.equal(g.cues.filter(q=>q.type==='crash').length,1);assert.equal(g.cues.filter(q=>q.type==='ignite').length,1);
 }
});

test('pole event freezes on pause, restarts cleanly and replays equally at different frame rates',()=>{
 const states=[];
 for(const hz of [30,60,120]){
  const {g,c}=staged();run(g,.5,hz);g.pause();const snapshot=JSON.stringify(c),clock=g.clock;
  run(g,3,hz);assert.equal(JSON.stringify(c),snapshot);assert.equal(g.clock,clock);
  g.resume();run(g,2.5,hz);states.push([c.x,c.z,c.poleHitAt,c.fire]);
  g.start();assert.equal(g.traffic.length,0);assert.equal(g.events.length,0);
 }
 assert.deepEqual(states[0],states[1]);assert.deepEqual(states[1],states[2]);
});

test('random director respects eligibility, probability, cooldown and existing formations',()=>{
 const {g,c}=staged();assert.equal(g.traffic.length,1);
 const second=g.addTraffic(-1,200,24,'m9');g.plan();assert.equal(second.role,'');
 for(const setup of ['middle','sedan','row','signal','near','roll']){
  const h=new Game({autoSpawn:false,trafficEnabled:false,random:()=>setup==='roll'?.5:.15});h.start();h.poleAfter=0;
  const car=h.addTraffic(setup==='middle'?0:1,setup==='near'?25:150,24,setup==='sedan'?'sedan':'m9');
  if(setup==='row')car.row=true;if(setup==='signal')car.signal=1;
  assert.notEqual(h.plan()?.kind,'pole',setup);assert.notEqual(car.role,'pole',setup);
 }
 assert.equal(c.model,'m9');
});

test('an interrupted approach cannot ignite without hitting the pole',()=>{
 const {g,c}=staged();run(g,.2);g.wreck(c,.5);run(g,3);
 assert.equal(c.poleHitAt,-1);assert.equal(c.fire,0);assert.equal(c.smoke,0);
});

test('the burning wreck remains a collision obstacle and can be flown over',()=>{
 for(const airborne of [false,true]){
  const {g,c}=staged();run(g,3);assert.ok(c.fire>0);
  g.x=4;g.lane=1;c.z=10;
  if(airborne){g.altitude=5;g.setHeld(true);}
  run(g,.4);assert.equal(g.phase,airborne?'running':'over');
 }
});

test('top-speed pole events wait until the impact is visible and then play consistently',()=>{
 const results=[];
 for(const hz of [30,60,120]){
  const g=new Game({mode:'jet',autoSpawn:false,trafficEnabled:false,random:()=>.15});g.start();g.time=300;g.update(1/120);g.poleAfter=0;
  const c=g.addTraffic(1,270,80,'m9');assert.notEqual(g.plan()?.kind,'pole','do not crash in distant fog');
  c.z=185;assert.equal(g.plan()?.kind,'pole');
  for(let i=0;i<hz*3&&c.poleHitAt<0;i++)g.update(1/hz);
  assert.ok(c.poleHitAt>0);assert.ok(c.z<150&&c.z>100,`visible impact at ${c.z} m`);
  run(g,.7,hz);assert.ok(c.fire>0);assert.ok(c.z>0,'ignition visible before passing');results.push(c.poleHitAt);
 }
 assert.ok(Math.max(...results)-Math.min(...results)<.01);
});
