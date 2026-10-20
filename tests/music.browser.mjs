import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
// Optional real-media regression; run separately from the dependency-free rules tests.
// Route instrumentation stays inside this test and never changes the served files.
const base=process.env.GAME_URL||'http://127.0.0.1:4173/';
const reports=[];
async function open({fallback=false,enabled=true,blocked=false,webAudio=true}={}){
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage(),requests=[],errors=[];
 await context.addInitScript(value=>{localStorage.setItem('roadster-music',value?'1':'0');globalThis.__qaFreeze=true;},enabled);
 if(!webAudio)await context.addInitScript(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;});
 page.on('request',r=>{if(/\/audio\//.test(r.url()))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('const seenHints=', 'globalThis.__qaMusic=music;globalThis.__qaGame=game;\nconst seenHints=').replace('game.update(dt);','game.update(globalThis.__qaFreeze?0:dt);')});});
 if(fallback)await page.route('**/?qa=music-stages',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replaceAll('audio/webm; codecs="opus"','audio/x-unsupported-codec')});});
 if(blocked)await page.route('**/audio/*',route=>route.fulfill({status:404,body:'unavailable'}));
 await page.goto(base+'?qa=music-stages');await page.locator('#start:not([disabled])').waitFor({timeout:45000});
 return {context,page,requests,errors};
}
const snapshot=page=>page.evaluate(()=>{const a=document.querySelector('#bgm'),m=globalThis.__qaMusic;return {src:a.currentSrc,time:a.currentTime,duration:a.duration,paused:a.paused,volume:Number((m.gain?.gain.value??a.volume).toFixed(6)),phase:document.querySelector('#game-shell').dataset.phase,result:!document.querySelector('#result').hidden,error:a.error?.code??null,preload:a.preload};});
const playing=page=>page.waitForFunction(()=>{const a=document.querySelector('#bgm');return !a.paused&&a.currentTime>.05;},null,{timeout:12000});
const crash=page=>page.evaluate(()=>{const g=globalThis.__qaGame;g.traffic=[];g.events=[];g.crash(g.addTraffic(0,0,0),g.speed/3.6);});
const settle=page=>page.evaluate(()=>{const g=globalThis.__qaGame;for(let i=0;i<240;i++)g.update(1/120);});
try{
 for(const fallback of [false,true]){
  const {context,page,requests,errors}=await open({fallback}),ext=fallback?'.m4a':'.webm';
  assert.equal((await snapshot(page)).paused,true);assert.equal((await snapshot(page)).volume,.2);assert.deepEqual(requests,[],'initial home must not download music');
  if(fallback){await page.locator('#music').tap();await page.locator('#music').tap();}else await page.locator('[data-mode="normal"]').tap();await playing(page);
  const home=await snapshot(page);assert.ok(home.src.endsWith('bgm'+ext),'home must use the vocal BGM');assert.equal(home.volume,.2);assert.ok(Math.abs(home.duration-187.307)<.1);
  assert.ok(requests.every(u=>u.endsWith('bgm'+ext)),'home downloads only the supported vocal BGM');
  await page.locator('#bgm').evaluate(a=>a.currentTime=8);await page.waitForFunction(()=>document.querySelector('#bgm').currentTime>7.9);
  await page.locator('#start').tap();await playing(page);
  const run=await snapshot(page);assert.ok(run.src.endsWith('bgm'+ext));assert.equal(run.volume,.45);assert.ok(run.time<2,'new run restarts original BGM');
  await page.locator('#bgm').evaluate(a=>a.currentTime=12);await page.waitForFunction(()=>document.querySelector('#bgm').currentTime>11.9);await page.locator('#pause').tap();
  const paused=await snapshot(page);assert.equal(paused.paused,true);await page.waitForTimeout(150);assert.equal((await snapshot(page)).time,paused.time);
  await page.locator('#resume').tap();assert.equal((await snapshot(page)).paused,true);await page.waitForTimeout(1000);assert.equal((await snapshot(page)).paused,true);
  await page.waitForFunction(()=>document.querySelector('#game-shell').dataset.phase==='running');await playing(page);const resumed=await snapshot(page);assert.ok(resumed.time>=paused.time-.05,`resume continues original BGM: ${JSON.stringify({paused,resumed})}`);
  await page.locator('#pause').tap();await page.locator('#restart-paused').tap();await playing(page);assert.ok((await snapshot(page)).time<2,'pause restart rewinds original BGM');
  await page.locator('#bgm').evaluate(a=>a.currentTime=16);await page.waitForFunction(()=>document.querySelector('#bgm').currentTime>15.9);
  await crash(page);await page.waitForFunction(()=>document.querySelector('#game-shell').dataset.phase==='over');
  const impact=await snapshot(page);assert.equal(impact.paused,true);assert.equal(impact.result,false);await page.waitForTimeout(200);assert.equal((await snapshot(page)).time,impact.time,'crash slide stays silent');
  await settle(page);await page.locator('#result').waitFor({state:'visible'});await playing(page);
  const result=await snapshot(page);assert.ok(result.src.endsWith('bgm'+ext),'result must use the vocal BGM');assert.equal(result.volume,.1);assert.ok(result.time>=impact.time-.05&&result.time<impact.time+2,'result continues from the crash position');
  await page.waitForFunction(t=>document.querySelector('#bgm').currentTime>t+.05,impact.time);
  await page.evaluate(async()=>{await globalThis.__qaMusic.ctx.suspend();window.dispatchEvent(new Event('blur'));});assert.equal((await snapshot(page)).paused,true);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>globalThis.__qaMusic.ctx.state==='running',null,{timeout:5000});await playing(page);assert.equal((await snapshot(page)).volume,.1);
  await page.locator('#bgm').evaluate(a=>a.currentTime=a.duration-.15);await page.waitForFunction(()=>document.querySelector('#bgm').currentTime<2,null,{timeout:6000});assert.equal((await snapshot(page)).paused,false);
  await page.locator('#again').tap();await playing(page);assert.ok((await snapshot(page)).src.endsWith('bgm'+ext));assert.ok((await snapshot(page)).time<2);
  await crash(page);await page.waitForFunction(()=>document.querySelector('#game-shell').dataset.phase==='over');await settle(page);await page.locator('#result').waitFor({state:'visible'});await playing(page);
  await page.locator('#bgm').evaluate(a=>a.currentTime=19);await page.waitForFunction(()=>document.querySelector('#bgm').currentTime>18.9);
  await page.locator('#home').tap();await playing(page);assert.equal((await snapshot(page)).volume,.2);assert.ok((await snapshot(page)).time<2,'returning home restarts the vocal BGM');
  await page.locator('#sound').tap();assert.equal((await snapshot(page)).paused,false,'effects toggle must not mute music');
  await page.locator('#music').tap();assert.equal((await snapshot(page)).paused,true);await page.locator('#start').tap();await crash(page);await page.waitForFunction(()=>document.querySelector('#game-shell').dataset.phase==='over');await settle(page);await page.locator('#result').waitFor({state:'visible'});assert.equal((await snapshot(page)).paused,true,'disabled music stays off at settlement');
  assert.ok(requests.every(u=>u.endsWith('bgm'+ext)),'every stage must use the same supported vocal BGM');assert.deepEqual(errors,[]);reports.push({fallback,home,run,paused,impact,result,requests,errors});await context.close();
 }
 const direct=await open();await direct.page.locator('#start').tap();await playing(direct.page);assert.ok(direct.requests.length>0&&direct.requests.every(u=>u.endsWith('/bgm.webm')),'direct start must download only game music');assert.deepEqual(direct.errors,[]);reports.push({directStart:true,requests:direct.requests});await direct.context.close();
 const disabled=await open({enabled:false});await disabled.page.locator('#start').tap();await crash(disabled.page);await disabled.page.waitForFunction(()=>document.querySelector('#game-shell').dataset.phase==='over');await settle(disabled.page);await disabled.page.locator('#result').waitFor({state:'visible'});assert.deepEqual(disabled.requests,[],'music disabled must not download audio');assert.equal((await snapshot(disabled.page)).paused,true);reports.push({disabled:true,requests:disabled.requests});await disabled.context.close();
 const broken=await open({blocked:true});await broken.page.locator('#start').tap();await crash(broken.page);await broken.page.waitForFunction(()=>document.querySelector('#game-shell').dataset.phase==='over');await settle(broken.page);await broken.page.locator('#result').waitFor({state:'visible'});assert.deepEqual(broken.errors,[],'missing music must not break gameplay');reports.push({blocked:true,errors:broken.errors});await broken.context.close();
 const legacy=await open({webAudio:false});await legacy.page.locator('[data-mode="normal"]').tap();await playing(legacy.page);assert.equal((await snapshot(legacy.page)).volume,.2);await legacy.page.locator('#start').tap();await playing(legacy.page);assert.equal((await snapshot(legacy.page)).volume,.45);await crash(legacy.page);await legacy.page.waitForFunction(()=>document.querySelector('#game-shell').dataset.phase==='over');assert.equal((await snapshot(legacy.page)).paused,true);await settle(legacy.page);await legacy.page.locator('#result').waitFor({state:'visible'});await playing(legacy.page);assert.equal((await snapshot(legacy.page)).volume,.1);assert.deepEqual(legacy.errors,[]);reports.push({webAudioUnavailable:true,errors:legacy.errors});await legacy.context.close();
 console.log('PASS: both audio formats, all music stages, pause/resume/restarts, looping, independent toggles, disabled downloads and unavailable audio');
}finally{await browser.close();}
