import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const output=resolve(process.env.SCREENSHOT_DIR||'test-results/pole-fire');await mkdir(output,{recursive:true});
const reports=[];
try {
 for(const viewport of [{width:390,height:844},{width:375,height:667}]) {
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
  await context.addInitScript(()=>localStorage.setItem('roadster-music','0'));
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  if(process.env.THREE_FIXTURES)await page.route('https://cdn.bootcdn.net/**',async route=>{
   const file=new URL(route.request().url()).pathname.split('/').pop();
   await route.fulfill({contentType:'text/javascript',body:await readFile(resolve(process.env.THREE_FIXTURES,file)),headers:{'access-control-allow-origin':'*'}});
  });
  await page.route('**/app.js',async route=>{
   const response=await route.fetch();
   await route.fulfill({response,body:(await response.text()).replace('const bestValue=','globalThis.__qaGame=game;const bestValue=').replace('await scene.ready;','await scene.ready;globalThis.__qaScene=scene;')});
  });
  await page.route('**/scene.js',async route=>{
   const response=await route.fetch();
   await route.fulfill({response,body:(await response.text()).replace('const roadside=createRoadside(scene);','globalThis.__qaWorld=scene;const roadside=createRoadside(scene);').replace('const carViews=new Map()','const carViews=globalThis.__qaViews=new Map()')});
  });
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:4173/');
  await page.locator('#start:not([disabled])').waitFor({timeout:45000});
  await page.locator('#start').tap();
  for(const mode of ['normal','jet'])for(const side of [-1,1]) {
   await page.evaluate(({side,mode})=>{
    const g=__qaGame;g.trafficEnabled=false;g.autoSpawn=false;g.start(mode);if(mode==='jet'){g.time=300;g.update(1/120);}g.poleAfter=0;g.random=()=>.15;
    g.addTraffic(side,mode==='jet'?185:95,mode==='jet'?80:24,'m9');const event=g.plan();if(event?.kind!=='pole')throw Error('Failed to stage live pole event');
    g.pause();__qaScene.render(g,0);
   },{side,mode});
   const stages=[];
   for(const [label,seconds] of [['approach',.5],['impact',-1],['ignition',.15],['fire',.2],['burning',.6]]) {
    const result=await page.evaluate(seconds=>{
     const g=__qaGame;g.resume();if(seconds<0){for(let i=0;i<480&&g.traffic[0].poleHitAt<0;i++)g.update(1/120);}else for(let i=0;i<Math.round(seconds*120);i++)g.update(1/120);g.pause();__qaScene.render(g,0);
     const c=g.traffic[0];return {clock:g.clock,x:c.x,z:c.z,speed:c.speed,hitAt:c.poleHitAt,fire:c.fire,smoke:c.smoke,
      flames:__qaWorld.getObjectByName('accident flames').count,puffs:__qaWorld.getObjectByName('accident smoke').count};
    },seconds);
    stages.push({label,...result});await page.screenshot({path:resolve(output,`${viewport.width}-${mode}-${side}-${label}.png`)});
   }
   assert.equal(stages[0].hitAt,-1);assert.equal(stages[0].flames,0);
   assert.ok(stages[1].hitAt>0);assert.equal(stages[1].speed,0);assert.equal(stages[1].flames,0);
   assert.ok(stages[2].puffs>0);assert.ok(stages[2].flames>0);
   assert.equal(stages[3].fire,1);assert.ok(stages[3].flames>=40);assert.ok(stages[3].puffs>0);
   const before=await page.screenshot();await page.waitForTimeout(250);assert.deepEqual(await page.screenshot(),before,'paused effect must remain still');
   await page.evaluate(()=>{const g=__qaGame;g.start();g.pause();__qaScene.render(g,0);});
   assert.equal(await page.evaluate(()=>__qaWorld.getObjectByName('accident flames').count),0);
   assert.equal(await page.evaluate(()=>__qaWorld.getObjectByName('accident smoke').count),0);
   reports.push({viewport,mode,side,stages});
  }
  for(const roll of [0,.99]) {
   const result=await page.evaluate(roll=>{
    const g=__qaGame;g.start('normal');g.trafficEnabled=false;g.autoSpawn=false;
    const m9=g.addTraffic(1,50,15,'m9');g.addTraffic(1,45.3,35,'sedan');g.random=()=>roll;g.collideTraffic();
    for(let i=0;i<48;i++)g.update(1/120);g.pause();__qaScene.render(g,0);
    return {fire:m9.fire,fireAt:m9.fireAt,mode:m9.mode,poleHitAt:m9.poleHitAt,flames:__qaWorld.getObjectByName('accident flames').count};
   },roll);
   assert.equal(result.mode,'crashed');assert.equal(result.poleHitAt,-1);
   assert.equal(result.fire,roll===0?1:0);assert.equal(result.flames,roll===0?40:0);
   await page.screenshot({path:resolve(output,`${viewport.width}-ordinary-m9-${roll===0?'fire':'clear'}.png`)});
   reports.push({viewport,scenario:'ordinary M9 collision',roll,...result});
  }
  for(const model of ['truck','semi']) {
   const result=await page.evaluate(model=>{
    const g=__qaGame;g.start('normal');g.trafficEnabled=false;g.autoSpawn=false;
    const truck=g.addTraffic(0,50,20,model),car=g.addTraffic(1,47,15,'sedan');truck.yaw=.65;car.vx=-3.6;g.collideTraffic();
    g.pause();__qaScene.render(g,0);const view=__qaViews.get(truck.id);
    return {truckMode:truck.mode,carMode:car.mode,renderedYaw:view.vehicle.rotation.y,physicsYaw:truck.yaw,truckSpeed:truck.speed,carSpeed:car.speed};
   },model);
   assert.equal(result.truckMode,'crashed');assert.equal(result.carMode,'crashed');assert.equal(result.renderedYaw,result.physicsYaw);
   assert.ok(result.truckSpeed<20&&result.carSpeed>15,'side impact transfers momentum from the heavier truck');
   await page.screenshot({path:resolve(output,`${viewport.width}-${model}-side-impact.png`)});
   reports.push({viewport,scenario:'rotated truck contact',model,...result});
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log(JSON.stringify({reports,output},null,2));
}finally{await browser.close();}
