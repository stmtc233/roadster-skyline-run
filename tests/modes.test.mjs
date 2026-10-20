import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';
import {drive} from './pilot.mjs';

function game(mode){const g=new Game({mode,autoSpawn:false,trafficEnabled:false});g.start();return g;}
function run(g,seconds,hz=120){for(let i=0;i<Math.round(seconds*hz);i++)g.update(1/hz);}
function seeded(seed){let n=seed;return ()=>((n=(n*1664525+1013904223)>>>0)/4294967296);}

test('normal mode defaults to the slower curve while jet mode retains the original speeds',()=>{
 const normal=game(),jet=game('jet');
 assert.equal(normal.speed,112);assert.equal(jet.speed,140);
 run(normal,28);run(jet,28);
 assert.ok(normal.speed>243&&normal.speed<244);assert.ok(jet.speed>304&&jet.speed<305);
 run(normal,172);run(jet,172);
 assert.ok(normal.speed>319&&normal.speed<320);assert.ok(jet.speed>399&&jet.speed<400);
});

test('both mode curves cover consistent distance at 30, 60 and 120 Hz',()=>{
 for(const mode of ['normal','jet']){
  const runs=[30,60,120].map(hz=>{const g=game(mode);run(g,10,hz);return g;});
  for(const g of runs){assert.equal(g.score,Math.floor(g.distance/10));assert.equal(g.gas,100);}
  assert.ok(Math.abs(runs[0].distance-runs[2].distance)<.01);
 }
 const normal=game('normal'),jet=game('jet');run(normal,10);run(jet,10);
 assert.ok(Math.abs(normal.distance/jet.distance-.8)<1e-9);
});

test('restart retains the chosen mode and switching modes resets the run safely',()=>{
 const g=game('jet');run(g,1);g.start();assert.equal(g.mode,'jet');assert.equal(g.speed,140);assert.equal(g.distance,0);
 g.start('normal');assert.equal(g.mode,'normal');assert.equal(g.speed,112);assert.equal(g.gas,100);
 g.start('toString');assert.equal(g.mode,'normal');assert.equal(g.speed,112);
});

test('automatic rear thrust runs only in jet mode while driving and spends no flight gas',()=>{
 const g=new Game({mode:'jet',autoSpawn:false,trafficEnabled:false});assert.equal(g.boosting,false);
 g.start();assert.equal(g.boosting,true);run(g,10);assert.equal(g.gas,100);
 g.gas=0;assert.equal(g.boosting,true);
 g.pause();assert.equal(g.boosting,false);g.resume();assert.equal(g.boosting,true);
 g.addTraffic(0,10,0);run(g,1);assert.equal(g.phase,'over');assert.equal(g.boosting,false);
 g.start('normal');assert.equal(g.boosting,false);
});

test('mode selection preserves flight height, flight drain and the 25 gas air roll',()=>{
 for(const mode of ['normal','jet']){
  const g=game(mode);g.setHeld(true);run(g,1.2);
  assert.equal(g.altitude,8);assert.ok(Math.abs(g.gas-70)<.01);
  const gas=g.gas;assert.equal(g.moveLane(1),true);assert.equal(gas-g.gas,25);
 }
});

test('slower mode still gives the full warning window for all five hazards',()=>{
 for(const [kind,min,max] of [['front',2.1,2.7],['rear',2.7,3.3],['battery',2.7,3.3],['breakdown',2.3,2.9],['parked',3.1,3.7]]){
  const g=game('normal');g.time=30;g.update(1/120);
  if(kind==='parked'){g.moveLane(1);run(g,.5);}
  const event=g.spawn(kind);assert.ok(event,kind);const at=g.time;
  for(let i=0;i<8*120&&g.phase==='running';i++)g.update(1/120);
  assert.equal(g.phase,'over',kind);assert.ok(g.time-at>=min&&g.time-at<=max,`${kind}: ${g.time-at}`);
 }
});

test('normal mode remains survivable from launch and near its speed limit',()=>{
 for(let seed=1;seed<=8;seed++){
  const g=new Game({mode:'normal',random:seeded(seed)});g.start();if(seed>4)g.time=200;
  drive(g,180);assert.equal(g.phase,'running',`seed ${seed}: ${g.cause}`);assert.ok(g.dodged>10);
 }
});

test('normal-mode top-speed impacts cannot tunnel at 30, 60 or 120 Hz',()=>{
 for(const kind of ['front','rear','battery','breakdown','parked','traffic']){
  const impacts=[30,60,120].map(hz=>{
   const g=game('normal');g.time=10000;g.update(1/120);
   if(kind==='parked'){g.moveLane(1);run(g,.5);}
   if(kind==='traffic')g.addTraffic(0,15,0);else g.spawn(kind);
   const at=g.time;run(g,4,hz);assert.equal(g.phase,'over',`${kind} at ${hz} Hz`);return g.time-at;
  });
  assert.ok(Math.max(...impacts)-Math.min(...impacts)<.01,kind);
 }
});
