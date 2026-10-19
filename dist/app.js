import {Game} from './game.js';
import {AudioEngine} from './audio.js';

const $=id=>document.getElementById(id);
const game=new Game();
const read=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,String(value));}catch{/* Storage can be disabled; gameplay is unaffected. */}};
let best=Math.max(0,Number(read('roadster-best','0'))||0);
const audio=new AudioEngine(read('roadster-muted','0')==='1');
// Each hazard type is explained once, the first time the player meets it; after that only the road shows it.
const seenHints=new Set(read('roadster-hints','').split(',').filter(Boolean));
let scene, activePointer=null, lastWarning=0, hintUntil=0, lastTime=0, resumeTimer=null, countdownToken=0;
let stage='ready', ended=false, swipe=null;
const ui={distance:$('distance'),score:$('score'),speed:$('speed'),gas:$('gas-number'),fill:$('gas-fill'),meter:$('gas-meter'),gasNote:$('gas-note'),altitude:$('altitude'),hint:$('hint'),hintText:$('hint-text'),mirror:$('mirror-frame'),feedback:$('feedback'),flight:$('flight-state'),thrust:$('thrust')};

function refreshBest(){ $('welcome-best').textContent=`最佳纪录 ${Math.floor(best).toLocaleString()} m`;$('best-hud').textContent=`最佳 ${Math.floor(best).toLocaleString()} m`;}
function syncSound(){const b=$('sound');b.classList.toggle('muted',audio.muted);b.setAttribute('aria-label',audio.muted?'开启声音':'关闭声音');b.querySelector('span').textContent=audio.muted?'声音关闭':'声音开启';}
function phase(value){stage=value;swipe=null;$('game-shell').dataset.phase=value;}
function release(){activePointer=null;game.setHeld(false);ui.thrust.classList.remove('pressed');}
function cancelCountdown(){countdownToken++;clearTimeout(resumeTimer);resumeTimer=null;$('countdown').hidden=true;}
function start(){
  cancelCountdown();audio.unlock();release();game.start();phase('running');ended=false;lastWarning=0;hintUntil=0;
  $('welcome').hidden=true;$('result').hidden=true;$('pause-panel').hidden=true;lastTime=performance.now();
}
function pause(){
  if(game.phase!=='running'&&stage!=='countdown')return;
  cancelCountdown();release();game.pause();phase('paused');$('pause-panel').hidden=false;audio.update(game);
}
function resume(){
  if(game.phase!=='paused'||stage==='countdown')return;
  audio.unlock();phase('countdown');$('pause-panel').hidden=true;
  $('countdown').hidden=false;let n=3;const token=++countdownToken;
  const tick=()=>{
    if(token!==countdownToken)return;
    if(n===0){$('countdown').hidden=true;game.resume();phase('running');lastTime=performance.now();return;}
    $('countdown').textContent=String(n--);audio.tone(540,.12);resumeTimer=setTimeout(tick,1000);
  };tick();
}
function finish(){
  if(ended)return;ended=true;
  const record=game.distance>best;best=Math.max(best,game.distance);write('roadster-best',best);refreshBest();
  $('result-eyebrow').textContent=record?'NEW PERSONAL BEST':'RUN COMPLETE';
  $('result-title').textContent=record?'新的里程碑。':'下一次，更远。';
  $('result-distance').textContent=Math.floor(game.distance).toLocaleString();
  $('result-cause').textContent=game.cause;$('result-score').textContent=game.score.toLocaleString();
  $('result-speed').textContent=Math.round(game.maxSpeed);$('result-best').textContent=`${Math.floor(best).toLocaleString()} m`;
  $('result').hidden=false;
}
function renderHud(){
  ui.distance.textContent=Math.floor(game.distance).toLocaleString();ui.score.textContent=game.score.toLocaleString();
  ui.speed.textContent=Math.round(game.speed);ui.gas.textContent=Math.ceil(game.gas);ui.fill.style.width=`${game.gas}%`;
  ui.meter.setAttribute('aria-valuenow',Math.round(game.gas));ui.meter.classList.toggle('low',game.gas<25);
  ui.altitude.textContent=`${game.altitude.toFixed(1)} m`;
  ui.gasNote.textContent=game.exhausted?'气量耗尽 · 松手后落地攒气':game.gas<25?'气量不足 · 注意落地时机':game.thrusting?'喷气飞行 · 持续耗气':game.altitude>.05?'正在下降 · 注意落点':'地面行驶 · 自动攒气';
  ui.flight.querySelector('b').textContent=game.thrusting?'喷气飞行':game.altitude>.05?'正在下降':['左车道','中间车道','右车道'][game.lane+1];
  $('thrust-label').textContent=game.exhausted?'松手攒气':game.thrusting?'松手降落':'按住起飞';
  const w=game.warning;
  if(w&&w.id!==lastWarning){lastWarning=w.id;if(!seenHints.has(w.kind)){seenHints.add(w.kind);write('roadster-hints',[...seenHints].join(','));ui.hintText.textContent=w.text;hintUntil=game.clock+3.2;}}
  ui.hint.hidden=!(game.phase==='running'&&game.clock<hintUntil);
  ui.mirror.classList.toggle('danger',game.phase==='running'&&game.traffic.some(c=>c.horn&&c.z<0));
  ui.feedback.textContent=game.time<4&&game.phase==='running'?'左右滑动变道 · 按住起飞':'';
}

$('start').addEventListener('click',start);$('again').addEventListener('click',start);$('restart-paused').addEventListener('click',start);
$('pause').addEventListener('click',pause);$('resume').addEventListener('click',resume);
$('home').addEventListener('click',()=>{cancelCountdown();release();game.start();game.phase='ready';phase('ready');$('result').hidden=true;$('welcome').hidden=false;});
$('sound').addEventListener('click',()=>{audio.unlock();audio.setMuted(!audio.muted);write('roadster-muted',audio.muted?'1':'0');syncSound();});
ui.thrust.addEventListener('pointerdown',e=>{
  if(game.phase!=='running'||activePointer!==null||e.button!==0)return;
  e.preventDefault();activePointer=e.pointerId;ui.thrust.setPointerCapture(e.pointerId);game.setHeld(true);ui.thrust.classList.add('pressed');audio.unlock();
});
ui.thrust.addEventListener('pointerup',e=>{if(e.pointerId===activePointer){e.preventDefault();release();}});
ui.thrust.addEventListener('pointercancel',e=>{if(e.pointerId===activePointer)pause();});
ui.thrust.addEventListener('lostpointercapture',e=>{if(e.pointerId===activePointer)pause();});
// Track a separate finger so a swipe never releases an ongoing thrust.
const shell=$('game-shell');
shell.addEventListener('pointerdown',e=>{
  if(game.phase!=='running'||swipe||e.button!==0||e.target.closest('button'))return;
  e.preventDefault();swipe={id:e.pointerId,x:e.clientX,y:e.clientY,used:false};shell.setPointerCapture(e.pointerId);
});
shell.addEventListener('pointermove',e=>{
  if(!swipe||e.pointerId!==swipe.id||swipe.used)return;
  const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;
  if(Math.abs(dx)>=32&&Math.abs(dx)>Math.abs(dy)*1.2){game.moveLane(Math.sign(dx));swipe.used=true;e.preventDefault();}
});
shell.addEventListener('pointerup',e=>{if(swipe?.id===e.pointerId)swipe=null;});
shell.addEventListener('pointercancel',e=>{if(swipe?.id===e.pointerId)pause();});
shell.addEventListener('lostpointercapture',e=>{if(swipe?.id===e.pointerId)pause();});
document.addEventListener('keydown',e=>{
  if(game.phase==='running'&&['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)){e.preventDefault();if(!e.repeat)game.moveLane(['ArrowLeft','KeyA'].includes(e.code)?-1:1);}
  if(e.code==='Space'&&game.phase==='running'){e.preventDefault();if(!e.repeat){game.setHeld(true);ui.thrust.classList.add('pressed');}}
  if(e.code==='Escape')pause();
});
document.addEventListener('keyup',e=>{if(e.code==='Space'){e.preventDefault();release();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',pause);
document.addEventListener('contextmenu',e=>{if(e.target.closest('#game-shell'))e.preventDefault();});
window.addEventListener('resize',()=>scene?.resize());
$('world').addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('error-text').textContent='图形画面已暂停，请重新加载继续。';$('error').hidden=false;});

function animate(now){
  const dt=lastTime?Math.min((now-lastTime)/1000,.1):0;lastTime=now;
  game.update(dt);for(const cue of game.cues.splice(0))audio.cue(cue);renderHud();audio.update(game);
  // On impact the controls drop away while the wreck slides; the result appears once it settles.
  if(game.phase==='over'&&stage==='running'){release();phase('over');}
  if(game.phase==='over'&&game.settled)finish();
  scene.render(game,dt);requestAnimationFrame(animate);
}
refreshBest();syncSound();
try {
  const {createScene}=await import('./scene.js');scene=createScene($('world'));scene.resize();
  $('loading').hidden=true;$('start').disabled=false;$('start').innerHTML='开始挑战 <span>↗</span>';
  requestAnimationFrame(animate);
} catch(error){
  console.error('Game initialization failed',error);$('loading').hidden=true;$('error').hidden=false;
}
