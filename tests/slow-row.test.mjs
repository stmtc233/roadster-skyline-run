import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';
import {drive} from './pilot.mjs';

function seeded(seed){let n=seed;return ()=>((n=(n*1664525+1013904223)>>>0)/4294967296);}
function game(mode='normal',random=()=>0){const g=new Game({mode,random,autoSpawn:false,trafficEnabled:false});g.start();g.time=60;g.update(1/120);return g;}
function run(g,seconds,hz=120){for(let i=0;i<seconds*hz;i++)g.update(1/hz);}
function row(g){g.nextTraffic=0;g.spawnTraffic(g.speed/3.6);return g.traffic.filter(c=>c.row);}
function modeledRow(g,rolls){const values=[0,0,...rolls,0,0];let i=0;g.random=()=>values[i++]??0;return row(g);}

test('a successful traffic roll adds three slow cars abreast in the distant haze',()=>{
 const models=new Set();
 for(let seed=1;seed<=80;seed++){
  const g=game('normal',seeded(seed));g.random=(()=>{const random=g.random;let n=0;return ()=>++n===2?0:random();})();
  const cars=row(g);assert.equal(cars.length,3,`seed ${seed}`);
  assert.deepEqual(cars.map(c=>c.lane),[-1,0,1]);assert.equal(new Set(cars.map(c=>c.z)).size,1);assert.equal(new Set(cars.map(c=>c.speed)).size,1);
  for(const c of cars){assert.ok(c.z>=240);assert.ok(c.speed<g.speed/3.6*.6);assert.equal(c.x,c.lane*4);models.add(c.model);}
 }
 assert.deepEqual([...models].sort(),['m9','mpv','sedan','semi','su7','suv','truck']);
});

test('slow rows are probabilistic, have an opening grace period and cannot stack',()=>{
 const early=game();early.time=14;assert.equal(row(early).length,0);
 const missed=game('normal',()=>.5);assert.equal(row(missed).length,0);
 const g=game();assert.equal(row(g).length,3);const after=g.rowAfter;
 g.traffic=[];assert.equal(row(g).length,0);assert.equal(g.rowAfter,after);
 g.traffic=[];g.time=after;assert.equal(row(g).length,3);g.time+=30;row(g);assert.equal(g.traffic.filter(c=>c.row).length,3);
 g.start();assert.equal(g.rowAfter,15);assert.equal(g.traffic.filter(c=>c.row).length,0);
});

test('slow rows spawn atomically only when all three lanes have space and capacity',()=>{
 const g=game();g.addTraffic(1,310,20,'semi');assert.equal(row(g).length,0);
 const crowded=game();for(let i=0;i<8;i++)crowded.addTraffic(i%3-1,20+i*20,20);assert.equal(row(crowded).length,0);
});

test('a slow row reserves braking distance for a fast truck approaching from behind',()=>{
 const g=game('jet');g.time=200;g.update(1/120);g.addTraffic(0,240,g.speed/3.6*.78,'semi');
 assert.equal(g.spawnSlowRow(g.speed/3.6),false,'a legal highway-speed truck must not be spawned straight into a slow queue');
 assert.equal(g.traffic.filter(c=>c.row).length,0);
});

test('later traffic also leaves enough braking room behind an active slow row',()=>{
 const g=game('jet');g.time=200;g.update(1/120);assert.ok(g.spawnSlowRow(g.speed/3.6));
 g.random=()=>.45;g.nextTraffic=0;g.spawnTraffic(g.speed/3.6);
 assert.equal(g.traffic.length,3,'a faster truck must wait until it can safely follow the row');
});

test('a selected row waits briefly for a safe opening instead of filling it with ordinary cars',()=>{
 const g=game('jet');g.time=200;g.update(1/120);g.addTraffic(0,240,g.speed/3.6*.6);
 assert.equal(row(g).length,0);g.random=()=>.5;run(g,1.5);assert.equal(row(g).length,0);
 assert.equal(g.traffic.length,1,'reserve the opening while the existing car pulls clear');
 run(g,2);assert.equal(row(g).length,3,'retry the selected formation after the road clears');
 const blocked=game('jet');blocked.addTraffic(1,310,0,'semi');assert.equal(row(blocked).length,0);
 blocked.random=()=>.5;blocked.time+=6;assert.equal(row(blocked).length,0);
 assert.equal(blocked.traffic.length,2,'give up after the short wait and resume ordinary traffic');
});

test('slow cars remain abreast, brake together for obstacles and keep their lanes',()=>{
 const g=game();const cars=modeledRow(g,[.05,.3,.8]);assert.equal(cars.length,3);
 const leader=g.addTraffic(-1,cars[0].z+100,0);leader.mode='broken';
 const speed=cars[0].speed;
 run(g,1);assert.ok(cars[0].speed<speed);
 assert.ok(Math.max(...cars.map(c=>c.z))-Math.min(...cars.map(c=>c.z))<1e-8);
 assert.equal(new Set(cars.map(c=>c.speed)).size,1);
 g.random=()=>0;g.wander(1,g.speed/3.6);assert.ok(cars.every(c=>c.signal===0));
 for(const c of cars)c.z=100;
 for(const kind of ['front','battery','breakdown'])assert.equal(g.candidates(kind).length,0,kind);
 for(const c of cars)c.row=false;
 for(const kind of ['front','battery','breakdown'])assert.ok(g.candidates(kind).length>0,`${kind} has an otherwise eligible car`);
 for(const c of cars)c.row=true;
 const snapshot=cars.map(c=>[c.z,c.speed]);g.pause();run(g,1);assert.deepEqual(cars.map(c=>[c.z,c.speed]),snapshot);
});

test('a slow row still collides on the ground and can be flown over in either mode',()=>{
 for(const mode of ['normal','jet'])for(const hz of [30,60,120])for(const lane of [-1,0,1])for(const roll of [.05,.2,.3,.4,.5,.55,.8]){
  const grounded=game(mode);const cars=modeledRow(grounded,[roll,roll,roll]);assert.equal(cars.length,3);grounded.lane=lane;grounded.x=lane*4;
  for(const c of cars){c.z=30;c.speed=c.cruise=grounded.speed/3.6*.5;}
  run(grounded,2,hz);assert.equal(grounded.phase,'over',`${mode}, ${hz} Hz, lane ${lane}`);
  const flying=game(mode);const airborne=modeledRow(flying,[roll,roll,roll]);flying.lane=lane;flying.x=lane*4;
  for(const c of airborne){c.z=65;c.speed=c.cruise=flying.speed/3.6*.5;}
  flying.setHeld(true);run(flying,2,hz);assert.equal(flying.phase,'running');assert.ok(airborne.every(c=>c.z< -flying.reach(c)));
 }
});

test('a row dissolves after being passed or disrupted by a real collision',()=>{
 const g=game();const cars=row(g);assert.equal(cars.length,3);
 for(const c of cars)c.z=-30;run(g,1/120);assert.ok(cars.every(c=>!c.row));
 const crashed=game();const others=row(crashed);crashed.wreck(others[0],.5);run(crashed,1/120);assert.ok(others.every(c=>!c.row));
});

test('mixed traffic with slow rows remains survivable in both modes',()=>{
 let seen=0;
 for(const mode of ['normal','jet'])for(let seed=1;seed<=4;seed++){
  const g=new Game({mode,random:seeded(seed+100)});g.start();if(seed>2)g.time=200;
  for(let i=0;i<180&&g.phase==='running';i++){drive(g,1);if(g.traffic.some(c=>c.row))seen++;}
  assert.equal(g.phase,'running',`${mode} seed ${seed}: ${g.cause}`);
 }
 assert.ok(seen>0,'live generation must actually exercise the new formation');
});
