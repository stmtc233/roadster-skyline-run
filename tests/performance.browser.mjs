import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const base=process.env.GAME_URL||'http://127.0.0.1:4173/';
const reports=[],failures=[];
const check=(label,fn)=>{try{fn();}catch(e){failures.push(`${label}: ${e.message}`);}};
try {
 for(const viewport of [{width:390,height:844},{width:375,height:667}]) {
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[],requests=[],sizes=[];
  await context.addInitScript(()=>localStorage.setItem('roadster-music','0'));
  // Offline fixtures must be the unmodified, pinned Three.js distribution files.
  if(process.env.THREE_FIXTURES)await page.route('https://cdn.bootcdn.net/**',async route=>{
   const file=new URL(route.request().url()).pathname.split('/').pop();
   await route.fulfill({contentType:'text/javascript',body:await readFile(resolve(process.env.THREE_FIXTURES,file)),headers:{'access-control-allow-origin':'*'}});
  });
  page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(/\.js$/.test(r.url()))sizes.push(r.body().then(b=>b.length));});
  await page.route('**/app.js',async route=>{
   const response=await route.fetch();
   await route.fulfill({response,body:(await response.text()).replace('const bestValue=', 'globalThis.__qaGame=game;const bestValue=')});
  });
  await page.route('**/scene.js',async route=>{
   const response=await route.fetch();
   const code=(await response.text()).replace('resize();return {render,resize,ready};',`globalThis.__qaDraws=0;const draw=renderer.render.bind(renderer);renderer.render=(...args)=>{globalThis.__qaDraws++;return draw(...args);};globalThis.__qaRenderer=renderer;resize();return {render,resize,ready};`);
   await route.fulfill({response,body:code});
  });
  await page.goto(base);await page.locator('#start:not([disabled])').waitFor({timeout:45000});
  await page.waitForFunction(()=>globalThis.__qaDraws>0);
  const bytes=(await Promise.all(sizes)).reduce((a,b)=>a+b,0);
  check('initial module budget',()=>assert.ok(bytes<900000,`received ${bytes} JavaScript bytes; budget is 900000`));
  check('music stays lazy',()=>assert.equal(requests.filter(u=>u.includes('/audio/')).length,0));
  const idle=async()=>{
   await page.waitForTimeout(200);
   const before=await page.evaluate(()=>__qaDraws);await page.waitForTimeout(600);
   return (await page.evaluate(()=>__qaDraws))-before;
  };
  const homeDraws=await idle();check('static home',()=>assert.equal(homeDraws,0,'home must not redraw an unchanged scene'));
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:resolve(process.env.SCREENSHOT_DIR,`home-${viewport.width}.png`)});
  const beforeMode=await page.evaluate(()=>__qaDraws);await page.locator('#mode-jet').tap();
  await page.waitForFunction(n=>__qaDraws>n,beforeMode);
  assert.equal(await page.locator('#mode-jet').getAttribute('aria-pressed'),'true');
  await page.locator('#start').tap();await page.waitForFunction(()=>Number(document.querySelector('#distance').textContent.replaceAll(',',''))>0);
  await page.keyboard.down('Space');await page.waitForFunction(()=>parseFloat(document.querySelector('#altitude').textContent)>1);await page.keyboard.up('Space');
  await page.keyboard.press('ArrowRight');
  await page.locator('#pause').tap();await page.waitForFunction(()=>document.querySelector('#game-shell').dataset.phase==='paused');
  const pausedDraws=await idle();check('static pause',()=>assert.equal(pausedDraws,0,'pause must not redraw an unchanged scene'));
  const beforeResize=await page.evaluate(()=>__qaDraws);await page.setViewportSize({width:viewport.width-5,height:viewport.height-5});
  await page.waitForFunction(n=>__qaDraws>n,beforeResize);
  await page.locator('#resume').tap();await page.waitForFunction(()=>document.querySelector('#game-shell').dataset.phase==='running');
  const d=await page.locator('#distance').textContent();await page.waitForFunction(old=>document.querySelector('#distance').textContent!==old,d);
  await page.locator('#pause').tap();await page.locator('#restart-paused').tap();
  await page.waitForFunction(()=>document.querySelector('#game-shell').dataset.phase==='running');
  await page.evaluate(()=>{const g=__qaGame;g.traffic=[];g.events=[];g.crash(g.addTraffic(0,0,0),g.speed/3.6);});
  await page.locator('#result').waitFor({state:'visible',timeout:12000});
  const resultDraws=await idle();check('static result',()=>assert.equal(resultDraws,0));
  await page.locator('#home').tap();await page.waitForFunction(()=>document.querySelector('#game-shell').dataset.phase==='ready');
  await page.locator('#mode-normal').tap();await page.locator('#start').tap();
  await page.waitForFunction(()=>Number(document.querySelector('#distance').textContent.replaceAll(',',''))>0);
  check('page errors',()=>assert.deepEqual(errors,[]));
  check('duplicate modules',()=>assert.equal(new Set(requests.filter(u=>u.endsWith('.js'))).size,requests.filter(u=>u.endsWith('.js')).length));
  reports.push({viewport,bytes,homeDraws,pausedDraws,resultDraws,errors});await context.close();
 }
 console.log(JSON.stringify({reports,failures},null,2));assert.deepEqual(failures,[]);
} finally {await browser.close();}
