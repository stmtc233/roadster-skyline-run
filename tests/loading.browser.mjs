import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const base=process.env.GAME_URL||'http://127.0.0.1:4173/';
const runs=[];
try {
 for(let i=0;i<3;i++){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>errors.push(`${r.url()}: ${r.failure()?.errorText}`));
  await page.addInitScript(()=>{
   new MutationObserver(()=>{
    const start=document.querySelector('#start');
    if(start&&!start.disabled&&!globalThis.__qaReadyMs)globalThis.__qaReadyMs=performance.now();
   }).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  });
  const client=await context.newCDPSession(page);
  await client.send('Network.enable');await client.send('Network.setCacheDisabled',{cacheDisabled:true});
  await client.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:200000,uploadThroughput:100000});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#start:not([disabled])').waitFor({timeout:45000});
  const sample=await page.evaluate(()=>({readyMs:globalThis.__qaReadyMs,paint:performance.getEntriesByType('paint').map(e=>({name:e.name,ms:e.startTime})),resources:performance.getEntriesByType('resource').map(e=>({name:e.name,start:e.startTime,ms:e.duration})),errorShown:!document.querySelector('#error').hidden}));
  assert.equal(sample.errorShown,false);assert.deepEqual(errors,[]);assert.ok(sample.readyMs>0);
  runs.push({...sample,errors});await context.close();
 }
 const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const report={conditions:{runs:3,cache:false,latencyMs:100,downloadBytesPerSecond:200000,uploadBytesPerSecond:100000,viewport:'390x844',deviceScaleFactor:2,renderer:'Chromium SwiftShader'},medianReadyMs:median(runs.map(r=>r.readyMs)),medianFcpMs:median(runs.map(r=>r.paint.find(p=>p.name==='first-contentful-paint')?.ms??NaN)),runs};
 if(process.env.LOAD_REPORT)await writeFile(process.env.LOAD_REPORT,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
} finally{await browser.close();}
