import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';

function seeded(seed){let n=seed;return ()=>((n=(n*1664525+1013904223)>>>0)/4294967296);}
function run(g,seconds,hz=120){for(let i=0;i<seconds*hz;i++)g.update(1/hz);}

test('SU7 traffic appears from the opening and stays a minority in varied traffic',()=>{
 const g=new Game({random:seeded(37)});g.start();assert.ok(g.traffic.some(c=>c.model==='su7'));
 const count={};g.time=60;g.update(1/120);
 for(let i=0;i<3000;i++){g.traffic=[];g.nextTraffic=0;g.spawnTraffic(g.speed/3.6);for(const c of g.traffic){count[c.model]=(count[c.model]||0)+1;if(c.model==='su7')assert.equal(c.color,'#087fb7');}}
 const total=Object.values(count).reduce((a,b)=>a+b,0);
 assert.ok(count.su7/total>.06&&count.su7/total<.10,JSON.stringify(count));
 assert.ok(count.sedan/total>.36&&count.sedan/total<.44,JSON.stringify(count));
 for(const model of ['sedan','suv','mpv','m9','truck','semi'])assert.ok(count[model]>0,model);
});

test('SU7 collision and flyover remain consistent in both modes and at all supported frame rates',()=>{
 for(const mode of ['normal','jet']){
  const impacts=[];
  for(const hz of [30,60,120]){
   const g=new Game({mode,autoSpawn:false,trafficEnabled:false});g.start();g.time=10000;g.update(1/120);g.addTraffic(0,18,0,'su7');
   const at=g.time;run(g,2,hz);assert.equal(g.phase,'over',`${mode} at ${hz} Hz`);impacts.push(g.time-at);
  }
  assert.ok(Math.max(...impacts)-Math.min(...impacts)<.01);
  const g=new Game({mode,autoSpawn:false,trafficEnabled:false});g.start();g.altitude=1.6;g.setHeld(true);g.addTraffic(0,0,0,'su7');run(g,.2);assert.equal(g.phase,'running','flying over the sedan clears its body');
 }
});
