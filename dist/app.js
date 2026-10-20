import {Game,HINTS,AIR_LANE,MODES} from './game.js';
import {AudioEngine,BackgroundMusic} from './audio.js';

const $=id=>document.getElementById(id);
const read=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,String(value));}catch{/* Storage can be disabled; gameplay is unaffected. */}};
const game=new Game({mode:read('roadster-mode','normal')});
const bestValue=key=>{const n=Number(read(key,'0'));return Number.isFinite(n)?Math.max(0,n):0;};
// Existing records were earned at jet-mode speed. Keep them out of the slower mode's record.
const bestByMode={normal:bestValue('roadster-best-normal'),jet:Math.max(bestValue('roadster-best-jet'),bestValue('roadster-best'))};
const audio=new AudioEngine(read('roadster-muted','0')==='1');
const music=new BackgroundMusic($('bgm'),read('roadster-music','1')==='1');
// Each hazard type is explained once, the first time the player meets it; after that only the road shows it.
const seenHints=new Set(read('roadster-hints','').split(',').filter(Boolean));
let scene, activePointer=null, lastWarning=0, hintUntil=0, lastTime=0, resumeTimer=null, countdownToken=0;
let stage='ready', ended=false, swipe=null, laneNotice='', laneNoticeUntil=0, backgrounded=false;
const ui={distance:$('distance'),score:$('score'),speed:$('speed'),gas:$('gas-number'),fill:$('gas-fill'),meter:$('gas-meter'),gasNote:$('gas-note'),altitude:$('altitude'),hint:$('hint'),hintText:$('hint-text'),mirror:$('mirror-frame'),feedback:$('feedback'),flight:$('flight-state'),thrust:$('thrust')};

function refreshBest(){
  const best=bestByMode[game.mode],label=MODES[game.mode].label;
  $('welcome-best').textContent=`本模式最佳 ${Math.floor(best).toLocaleString()} m`;$('best-hud').textContent=`最佳 ${Math.floor(best).toLocaleString()} m`;
  $('mode-label').textContent=label;
  $('mode-note').textContent=game.mode==='jet'?'四尾喷与尾翼自动开启 · 不消耗飞行气量':'节奏放缓 20% · 更从容地应对车流';
  for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===game.mode));
  if(!$('start').disabled)$('start').innerHTML=`开始${label} <span>↗</span>`;
}
function chooseMode(mode){
  if(stage!=='ready'||!Object.hasOwn(MODES,mode))return;
  game.start(mode);game.phase='ready';write('roadster-mode',game.mode);refreshBest();renderHud();
}
function syncSound(){const b=$('sound');b.classList.toggle('muted',audio.muted);b.setAttribute('aria-label',audio.muted?'开启音效':'关闭音效');b.querySelector('span').textContent=audio.muted?'音效关闭':'音效开启';}
function syncMusic(){
  music.setSuspended(backgrounded||document.hidden||stage==='paused'||stage==='countdown');
  const b=$('music');b.classList.toggle('muted',!music.enabled);b.setAttribute('aria-checked',String(music.enabled));b.setAttribute('aria-label',music.enabled?'关闭背景音乐':'开启背景音乐');$('music-state').textContent=music.enabled?'背景音乐开启':'背景音乐关闭';
  b.title=$('bgm').error?'音乐暂不可用 · 可继续游戏':music.enabled?'背景音乐：开启':'背景音乐：关闭';
}
function phase(value){stage=value;swipe=null;$('game-shell').dataset.phase=value;syncMusic();}
function release(){activePointer=null;game.setHeld(false);ui.thrust.classList.remove('pressed');}
function cancelCountdown(){countdownToken++;clearTimeout(resumeTimer);resumeTimer=null;$('countdown').hidden=true;}
function start(){
  cancelCountdown();audio.unlock();release();game.start();phase('running');ended=false;lastWarning=0;hintUntil=0;laneNoticeUntil=0;
  music.unlock();syncMusic();
  refreshBest();
  $('welcome').hidden=true;$('result').hidden=true;$('pause-panel').hidden=true;lastTime=performance.now();
}
function pause(){
  if(game.phase!=='running'&&stage!=='countdown')return;
  cancelCountdown();release();game.pause();phase('paused');$('pause-panel').hidden=false;audio.update(game);
}
function resume(){
  if(game.phase!=='paused'||stage==='countdown')return;
  audio.unlock();phase('countdown');music.unlock();$('pause-panel').hidden=true;
  $('countdown').hidden=false;let n=3;const token=++countdownToken;
  const tick=()=>{
    if(token!==countdownToken)return;
    if(n===0){$('countdown').hidden=true;game.resume();phase('running');lastTime=performance.now();return;}
    $('countdown').textContent=String(n--);audio.tone(540,.12);resumeTimer=setTimeout(tick,1000);
  };tick();
}
function finish(){
  if(ended)return;ended=true;
  const record=game.distance>bestByMode[game.mode],best=bestByMode[game.mode]=Math.max(bestByMode[game.mode],game.distance);write(`roadster-best-${game.mode}`,best);refreshBest();
  $('result-mode').textContent=MODES[game.mode].label;
  $('result-eyebrow').textContent=record?'NEW PERSONAL BEST':'RUN COMPLETE';
  $('result-title').textContent=record?'新的里程碑。':'下一次，更远。';
  $('result-distance').textContent=Math.floor(game.distance).toLocaleString();
  $('result-cause').textContent=game.cause;$('result-score').textContent=game.score.toLocaleString();
  $('result-speed').textContent=Math.round(game.maxSpeed);$('result-best').textContent=`${Math.floor(best).toLocaleString()} m`;
  $('result').hidden=false;
}
// Each hint is shown once, the first time the player meets that situation.
function hint(kind,text){if(seenHints.has(kind))return;seenHints.add(kind);write('roadster-hints',[...seenHints].join(','));ui.hintText.textContent=text;hintUntil=game.clock+3.2;}
function changeLane(dir){
  const gas=game.gas,changed=game.moveLane(dir);
  if(changed&&game.gas<gas)laneNotice=`侧翻喷气 −${AIR_LANE.gas} 气量`;
  else if(!changed&&game.lane+dir>=-1&&game.lane+dir<=1&&game.altitude-game.deck()>.05&&game.gas<AIR_LANE.gas)laneNotice=`气量不足 ${AIR_LANE.gas} · 无法空中变道`;
  else return;
  laneNoticeUntil=game.clock+1.4;
}
function renderHud(){
  ui.distance.textContent=Math.floor(game.distance).toLocaleString();ui.score.textContent=game.score.toLocaleString();
  ui.speed.textContent=Math.round(game.speed);ui.gas.textContent=Math.floor(game.gas+1e-8);ui.fill.style.width=`${game.gas}%`;
  ui.meter.setAttribute('aria-valuenow',Math.floor(game.gas+1e-8));ui.meter.classList.toggle('low',game.gas<AIR_LANE.gas);
  ui.altitude.textContent=`${game.altitude.toFixed(1)} m`;
  const aloft=game.altitude-game.floor>.05,onTruck=!aloft&&game.floor>0;
  ui.gasNote.textContent=game.exhausted?'气量耗尽 · 松手后落地攒气':aloft&&game.gas<AIR_LANE.gas?'不足 25 气量 · 空中无法变道':game.rollRemaining>0?'侧翻喷气 · 已消耗 25 气量':game.thrusting?'喷气飞行 · 持续耗气':aloft?'空中变道 −25 · 松手下降':onTruck?'踩在货车车厢上 · 自动攒气':'地面行驶 · 自动攒气';
  ui.flight.querySelector('b').textContent=game.rollRemaining>0?'360° 侧翻变道':game.thrusting?'喷气飞行':aloft?'正在下降':onTruck?'货车车厢上':['左车道','中间车道','右车道'][game.lane+1];
  $('thrust-label').textContent=game.exhausted?'松手攒气':game.thrusting?'松手降落':'按住起飞';
  const w=game.warning;
  if(w&&w.id!==lastWarning){lastWarning=w.id;hint(w.kind,w.text);}
  else if(game.phase==='running'&&game.clock>=hintUntil&&!seenHints.has('truck')&&game.traffic.some(c=>c.deck&&c.z>40&&c.z<160))hint('truck',HINTS.truck);
  ui.hint.hidden=!(game.phase==='running'&&game.clock<hintUntil);
  ui.mirror.classList.toggle('danger',game.phase==='running'&&game.traffic.some(c=>c.horn&&c.z<0));
  ui.feedback.textContent=game.phase==='running'?(game.clock<laneNoticeUntil?laneNotice:game.time<4?'左右滑动变道 · 按住起飞':''):'';
}

$('start').addEventListener('click',start);$('again').addEventListener('click',start);$('restart-paused').addEventListener('click',start);
for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>chooseMode(button.dataset.mode));
$('pause').addEventListener('click',pause);$('resume').addEventListener('click',resume);
$('home').addEventListener('click',()=>{cancelCountdown();release();game.start();game.phase='ready';phase('ready');$('result').hidden=true;$('welcome').hidden=false;});
$('sound').addEventListener('click',()=>{audio.unlock();audio.setMuted(!audio.muted);write('roadster-muted',audio.muted?'1':'0');syncSound();});
$('music').addEventListener('click',()=>{music.setEnabled(!music.enabled);write('roadster-music',music.enabled?'1':'0');music.unlock();syncMusic();});
$('bgm').addEventListener('error',syncMusic);
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
  if(Math.abs(dx)>=32&&Math.abs(dx)>Math.abs(dy)*1.2){changeLane(Math.sign(dx));swipe.used=true;e.preventDefault();}
});
shell.addEventListener('pointerup',e=>{if(swipe?.id===e.pointerId)swipe=null;});
shell.addEventListener('pointercancel',e=>{if(swipe?.id===e.pointerId)pause();});
shell.addEventListener('lostpointercapture',e=>{if(swipe?.id===e.pointerId)pause();});
document.addEventListener('keydown',e=>{
  if(game.phase==='running'&&['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)){e.preventDefault();if(!e.repeat)changeLane(['ArrowLeft','KeyA'].includes(e.code)?-1:1);}
  if(e.code==='Space'&&game.phase==='running'){e.preventDefault();if(!e.repeat){game.setHeld(true);ui.thrust.classList.add('pressed');}}
  if(e.code==='Escape')pause();
});
document.addEventListener('keyup',e=>{if(e.code==='Space'){e.preventDefault();release();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();syncMusic();});
window.addEventListener('blur',()=>{backgrounded=true;pause();syncMusic();});window.addEventListener('focus',()=>{backgrounded=false;syncMusic();});
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
refreshBest();syncSound();syncMusic();
try {
  const {createScene}=await import('./scene.js');scene=createScene($('world'));await scene.ready;scene.resize();
  $('loading').hidden=true;$('start').disabled=false;refreshBest();
  requestAnimationFrame(animate);
} catch(error){
  console.error('Game initialization failed',error);$('loading').hidden=true;$('error').hidden=false;
}
