import * as THREE from 'three';
import { createRoadster, createMPV, createM9, createSedan, createSU7, createSUV, createTruck, createSemi, createBattery, createTriangle } from './models.js';
import { AIR_LANE } from './game.js';

const clamp = THREE.MathUtils.clamp;
const smooth = t=>t*t*t*(t*(t*6-15)+10);
// Integrate a smooth velocity ramp, with a steady middle instead of a fast spin through 180 degrees.
function rollCurve(p) {
  const ramp=.18,u=Math.min(p,1-p)/ramp;
  if(u>=1)return (p-ramp/2)/(1-ramp);
  const edge=ramp*(u*u*u-.5*u*u*u*u)/(1-ramp);
  return p<.5?edge:1-edge;
}
export function createScene(canvas) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.autoClear=false;
  const scene=new THREE.Scene(); scene.background=new THREE.Color('#b7d9e6');
  scene.fog=new THREE.Fog('#c0d9da',95,390);
  // Locally painted sky supplies broad reflections on the gold glass and polished bodywork.
  const skyCanvas=document.createElement('canvas');skyCanvas.width=512;skyCanvas.height=256;
  const skyContext=skyCanvas.getContext('2d'),skyGradient=skyContext.createLinearGradient(0,0,0,256);
  skyGradient.addColorStop(0,'#68a6cd');skyGradient.addColorStop(.42,'#c4e2ed');
  skyGradient.addColorStop(.52,'#f6ebcb');skyGradient.addColorStop(.58,'#9baf93');skyGradient.addColorStop(1,'#59675a');
  skyContext.fillStyle=skyGradient;skyContext.fillRect(0,0,512,256);
  const skyTexture=new THREE.CanvasTexture(skyCanvas);skyTexture.mapping=THREE.EquirectangularReflectionMapping;skyTexture.colorSpace=THREE.SRGBColorSpace;
  const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(skyTexture).texture;
  skyTexture.dispose();pmrem.dispose();
  const camera=new THREE.PerspectiveCamera(59,1,.1,650);
  const rearCamera=new THREE.PerspectiveCamera(21,3.5,.15,240);
  const hemi=new THREE.HemisphereLight('#e3f2ff','#b3a283',2.8); scene.add(hemi);
  const sun=new THREE.DirectionalLight('#fff1d6',3.3); sun.position.set(-30,45,-25); scene.add(sun);
  sun.castShadow=true; sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-18,right:18,top:26,bottom:-26,near:1,far:110});
  sun.shadow.bias=-.0004; sun.shadow.normalBias=.03;
  scene.add(sun.target); sun.target.position.set(0,0,-10);
  const roadMat=new THREE.MeshStandardMaterial({color:'#747d7c',roughness:.96,map:asphaltTexture()});
  const grassMat=new THREE.MeshStandardMaterial({color:'#8d9e79',roughness:1});
  const road=new THREE.Mesh(new THREE.PlaneGeometry(12.4,700),roadMat);
  road.rotation.x=-Math.PI/2; road.position.set(0,-.015,-220); road.receiveShadow=true; scene.add(road);
  const land=new THREE.Mesh(new THREE.PlaneGeometry(1200,1000),grassMat);
  land.rotation.x=-Math.PI/2; land.position.set(0,-.05,-230); scene.add(land);
  const lineMat=new THREE.MeshBasicMaterial({color:'#f4f0db'});
  const dashGeo=new THREE.BoxGeometry(.11,.012,4.6);
  const dash=new THREE.InstancedMesh(dashGeo,lineMat,132); scene.add(dash);
  const transform=new THREE.Object3D();
  for(const side of [-1,1]) {
    const edge=new THREE.Mesh(new THREE.BoxGeometry(.12,.014,650),lineMat);
    edge.position.set(side*5.91,.006,-220);scene.add(edge);
    const rail=new THREE.Mesh(new THREE.BoxGeometry(.12,.20,650),new THREE.MeshStandardMaterial({color:'#e5dfc9',metalness:.25,roughness:.5}));
    rail.position.set(side*6.7,.72,-220);scene.add(rail);
  }
  const railPosts=new THREE.InstancedMesh(new THREE.BoxGeometry(.11,.67,.12),new THREE.MeshStandardMaterial({color:'#b4b7a7',metalness:.35,roughness:.6}),110);
  scene.add(railPosts);
  const trees=buildTrees(scene);
  buildHills(scene);
  const markers=buildMarkers(scene);

  // Roll about the chassis centre, keeping the simulation's wheel-bottom altitude unchanged.
  const rollPivot=new THREE.Group(),player=createRoadster();player.position.y=-.6;rollPivot.add(player);scene.add(rollPivot);
  const shadowTexture=makeShadowTexture();
  const playerShadow=makeShadow(shadowTexture,2.6,5.1);scene.add(playerShadow);
  const jetMat=new THREE.MeshBasicMaterial({color:'#c5f0ff',transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
  const jetCoreMat=new THREE.MeshBasicMaterial({color:'#f5ffff',transparent:true,opacity:.6,depthWrite:false});
  const jets=new THREE.Group(); player.add(jets);
  for(const x of [-.65,.65]) for(const z of [-1.17,1.14]) {
    const jet=new THREE.Group(); jet.position.set(x,.18,z); jets.add(jet);
    const shell=new THREE.Mesh(new THREE.CylinderGeometry(.045,.27,1.15,12,1,true),jetMat);shell.position.y=-.6;jet.add(shell);
    const core=new THREE.Mesh(new THREE.CylinderGeometry(.025,.11,.75,10,1,true),jetCoreMat);core.position.y=-.40;jet.add(core);
    const nozzle=new THREE.Mesh(new THREE.TorusGeometry(.055,.018,5,10),new THREE.MeshStandardMaterial({color:'#a8d7dd',metalness:.8,roughness:.3}));
    nozzle.rotation.x=Math.PI/2;jet.add(nozzle);
  }
  // Short side bursts start the roll, then the opposite nozzles arrest it. Cold gas appears as white vapour.
  const sideJets=[],sideJetMat=new THREE.MeshBasicMaterial({color:'#e1f6ff',transparent:true,opacity:.32,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
  const nozzleMat=new THREE.MeshStandardMaterial({color:'#9cb4bc',metalness:.85,roughness:.24});
  for(const side of [-1,1])for(const z of [-1.12,1.1]) {
    const jet=new THREE.Group();jet.position.set(side*.91,.64,z);jet.rotation.z=side*Math.PI/2;player.add(jet);
    const nozzle=new THREE.Mesh(new THREE.TorusGeometry(.058,.019,5,10),nozzleMat);nozzle.rotation.x=Math.PI/2;jet.add(nozzle);
    const burst=new THREE.Group();jet.add(burst);
    const shell=new THREE.Mesh(new THREE.CylinderGeometry(.045,.34,1.7,12,1,true),sideJetMat);shell.position.y=-.88;burst.add(shell);
    const core=new THREE.Mesh(new THREE.CylinderGeometry(.025,.13,1.2,10,1,true),jetCoreMat);core.position.y=-.62;burst.add(core);
    sideJets.push({burst,side});
  }
  // Four rear cold-gas ports sit in one row below the taillight, as on the official Roadster.
  const rearJets=new THREE.Group();rearJets.name='Roadster rear nozzles';rearJets.position.set(0,.31,2.34);rearJets.visible=false;player.add(rearJets);
  const rearBursts=new THREE.Group();rearBursts.name='Roadster rear thrust';rearBursts.visible=false;rearJets.add(rearBursts);
  const rearGasMat=new THREE.MeshBasicMaterial({color:'#e5f5ff',transparent:true,opacity:.25,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
  const rearNozzleGeo=new THREE.TorusGeometry(.085,.022,6,14),rearShellGeo=new THREE.CylinderGeometry(.05,.23,1.9,12,1,true),rearCoreGeo=new THREE.CylinderGeometry(.025,.10,1.15,10,1,true);
  for(const x of [-.57,-.19,.19,.57]) {
    const nozzle=new THREE.Mesh(rearNozzleGeo,nozzleMat);nozzle.position.x=x;rearJets.add(nozzle);
    const burst=new THREE.Group();burst.position.x=x;burst.rotation.x=-Math.PI/2;rearBursts.add(burst);
    const shell=new THREE.Mesh(rearShellGeo,rearGasMat);shell.position.y=-.96;burst.add(shell);
    const core=new THREE.Mesh(rearCoreGeo,jetCoreMat);core.position.y=-.59;burst.add(core);
  }
  // Wind streaks ring the chase camera's sides and top, clear of the lanes below, and fade in with pace.
  const streakMat=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0,depthWrite:false,toneMapped:false});
  const streaks=new THREE.InstancedMesh(new THREE.BoxGeometry(.035,.035,1),streakMat,64);
  streaks.frustumCulled=false;streaks.visible=false;scene.add(streaks);
  const streakSeeds=[];
  for(let i=0;i<64;i++) {
    const angle=THREE.MathUtils.degToRad(-25+(Math.sin(i*7.3)*.5+.5)*95),radius=3.6+(Math.sin(i*3.1)*.5+.5)*6.5,side=i%2?-1:1;
    streakSeeds.push({dx:side*Math.cos(angle)*radius,dy:Math.sin(angle)*radius,z:i*41.7});
  }
  // Sparks thrown up by wrecks while they are still sliding.
  const sparks=new THREE.InstancedMesh(new THREE.BoxGeometry(.05,.05,.24),new THREE.MeshBasicMaterial({color:'#ffc36e',toneMapped:false}),140);
  sparks.frustumCulled=false;sparks.count=0;scene.add(sparks);
  const carViews=new Map(),carPools={sedan:[],su7:[],suv:[],mpv:[],m9:[],truck:[],semi:[]},batteryViews=new Map(),batteryPool=[];
  const wheelRadius={sedan:.32,su7:.355,suv:.405,mpv:.395,m9:.39,truck:.52,semi:.52};
  const factories={sedan:()=>createSedan({color:'#c7c9c1'}),su7:createSU7,suv:createSUV,mpv:createMPV,m9:createM9,truck:createTruck,semi:createSemi};
  // A soft red halo behind the outermost brake lamps keeps braking readable at a distance, where the lamps are a few pixels.
  const glowMat=new THREE.SpriteMaterial({map:makeGlowTexture(),color:'#ff2a1c',blending:THREE.AdditiveBlending,depthWrite:false,transparent:true});
  const lampPosition=new THREE.Vector3();
  let canvasRect=null,mirrorRect=null,mirrorElement=null,lastMirrorMeasure=0;
  let width=1,height=1;
  let visualRoll=0,lastRollRemaining=0,lastRollDirection=0;
  let visualWingTime=0,lastWingTime=0;
  function resize() {
    canvasRect=canvas.getBoundingClientRect(); width=Math.max(1,canvasRect.width);height=Math.max(1,canvasRect.height);
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
    mirrorElement=document.getElementById('mirror-view');mirrorRect=mirrorElement?.getBoundingClientRect()||null;
  }
  function createCarView(car) {
    const root=new THREE.Group(),vehicle=factories[car.model]();
    const shadow=makeShadow(shadowTexture,car.width+.6,car.length+.35);root.add(vehicle,shadow);scene.add(root);
    vehicle.updateMatrixWorld(true);let left=null,right=null;
    for(const lamp of vehicle.userData.brakeLights||[]) {
      lamp.getWorldPosition(lampPosition);
      if(!left||lampPosition.x<left.x)left=lampPosition.clone();if(!right||lampPosition.x>right.x)right=lampPosition.clone();
    }
    const glows=[];
    for(const at of left?[left,right]:[]){const glow=new THREE.Sprite(glowMat);glow.position.set(at.x,at.y,at.z+.12);glow.visible=false;vehicle.add(glow);glows.push(glow);}
    // Roadside M9s carry a warning triangle placed well behind them on the road.
    let triangle=null;if(car.model==='m9'){triangle=createTriangle();triangle.position.z=32;root.add(triangle);}
    return {root,vehicle,shadow,triangle,glows,model:car.model,paint:'',pitch:0,broken:false,seen:false};
  }
  function createBatteryView() {
    const root=new THREE.Group(),vehicle=createBattery(),shadow=makeShadow(shadowTexture,2.1,2.1);root.add(vehicle,shadow);scene.add(root);
    return {root,vehicle,shadow,seen:false};
  }
  // Brake lights, turn signals, hazard lights and the runaway's flashing headlights all come from simulation flags.
  function lights(view,car,time) {
    const vehicle=view.vehicle,blink=Math.floor(time*3.2)%2===0,strobe=car.flash&&Math.floor(time*8)%2===1,lit=car.brake&&!strobe;
    // Emergency braking strobes the brake lights about four times a second, with a much larger halo.
    for(const lamp of vehicle.userData.brakeLights||[])lamp.material.emissiveIntensity=lit?3.6:lamp.material.userData.base??.35;
    for(const glow of view.glows){glow.visible=lit;glow.scale.setScalar(car.flash?1.5:.7);}
    for(const lamp of vehicle.userData.hazardLights||[]) {
      const on=blink&&(car.hazard||car.signal===Math.sign(lamp.position.x));
      if(lamp.userData.on!==on){lamp.userData.on=on;lamp.material.emissiveIntensity=on?5:0;lamp.material.color.set(on?'#ffb22c':'#553b21');}
    }
    const head=vehicle.userData.headLight;if(head)head.emissiveIntensity=car.horn&&Math.floor(time*7)%2===0?7:2.2;
  }
  function spin(vehicle,angle) { const wheels=vehicle.userData.wheels;if(wheels)for(const w of wheels)w.rotation.x=angle; }
  function render(state,dt) {
    if(!canvasRect)resize();
    const time=state.clock??state.time??0,travel=state.travel??state.distance??0,altitude=Math.max(0,state.altitude||0);
    const pace=state.pace||0;
    const dashOffset=((travel%12)+12)%12;
    for(let i=0;i<132;i++) {
      transform.position.set(i%2===0?-2:2,.007,32-Math.floor(i/2)*12+dashOffset);
      transform.updateMatrix();dash.setMatrixAt(i,transform.matrix);
    }
    dash.instanceMatrix.needsUpdate=true;
    for(let i=0;i<110;i++) {
      transform.position.set(i%2===0?-6.7:6.7,.37,35-Math.floor(i/2)*12+dashOffset);transform.updateMatrix();railPosts.setMatrixAt(i,transform.matrix);
    }
    railPosts.instanceMatrix.needsUpdate=true;
    for(let i=0;i<trees.entries.length;i++) {
      const tree=trees.entries[i],s=tree.scale,z=55-(((i*13.7-travel)%530+530)%530);
      transform.position.set(tree.x,s,z);transform.scale.setScalar(s);transform.updateMatrix();trees.trunks.setMatrixAt(i,transform.matrix);
      transform.position.set(tree.x,s*2.9,z);transform.scale.set(s*1.45,s*1.7,s*1.4);transform.updateMatrix();trees.crowns.setMatrixAt(i,transform.matrix);
      transform.position.set(tree.x+s*.55,s*2.4,z+s*.15);transform.scale.set(s,s*1.1,s);transform.updateMatrix();trees.branches.setMatrixAt(i,transform.matrix);
    }
    trees.trunks.instanceMatrix.needsUpdate=trees.crowns.instanceMatrix.needsUpdate=trees.branches.instanceMatrix.needsUpdate=true;
    transform.scale.set(1,1,1);
    for(let i=0;i<markers.length;i++) markers[i].position.z=30-(((i*103-travel)%520+520)%520);
    // One texture repeat spans 700/repeat.y metres of road, so the asphalt grain moves at true road speed.
    if(roadMat.map)roadMat.map.offset.y=(travel*roadMat.map.repeat.y/700)%1;
    const px=state.x||0;
    rollPivot.position.set(px,altitude+.6,0);
    // Pitch expresses thrust; the separate pivot completes the lateral roll.
    player.rotation.x=state.thrusting?-.025:0;
    player.rotation.y=-((state.lane||0)*4-px)*.025+(state.yaw||0);
    const rolling=state.rollRemaining>0;
    // Present the fractional simulation step too, so 144/165 Hz screens do not repeat a 120 Hz pose.
    const moving=state.phase==='running'||(state.phase==='over'&&!state.settled);
    const fraction=moving?clamp(state.accumulator||0,0,1/120):0;
    const progress=rolling?clamp(1-(state.rollRemaining-fraction)/AIR_LANE.duration,0,1):0;
    const newRoll=state.rollRemaining>lastRollRemaining||state.rollDirection!==lastRollDirection;
    visualRoll=rolling?(newRoll?progress:Math.max(visualRoll,progress)):0;
    lastRollRemaining=state.rollRemaining;lastRollDirection=state.rollDirection;
    const rollProgress=visualRoll,rollEase=rollCurve(rollProgress);
    rollPivot.rotation.z=rolling?-state.rollDirection*Math.PI*2*rollEase:0;
    // A smooth body arc clears the road and stays continuous when landing on a truck roof.
    // This is body animation only; collision altitude, HUD height and camera still follow the simulation.
    if(rolling){const lift=smooth(clamp(Math.min(rollProgress,1-rollProgress)/.22,0,1));rollPivot.position.y+=.7*lift;}
    player.rotation.z=rolling?0:-((state.lane||0)*4-px)*.018;
    for(const {burst,side} of sideJets) {
      const push=side===-state.rollDirection;
      const strength=rolling?(push?smooth(clamp(rollProgress/.12,0,1))*(1-smooth(clamp((rollProgress-.40)/.16,0,1))):smooth(clamp((rollProgress-.44)/.16,0,1))*(1-smooth(clamp((rollProgress-.86)/.14,0,1)))):0;
      burst.visible=strength>.001;
      burst.scale.set(Math.sqrt(strength),strength*(.98+Math.sin(time*19)*.02),Math.sqrt(strength));
    }
    spin(player,-travel/.32);
    // On a truck roof the shadow falls on the roof.
    const floor=state.floor||0,clearance=Math.max(0,altitude-floor);
    playerShadow.position.set(px,floor+.025,0);playerShadow.material.opacity=.35/(1+clearance*.22);
    playerShadow.scale.set(1+clearance*.055,1+clearance*.055,1);
    jets.visible=!!state.thrusting;
    if(jets.visible) {
      const pulse=.94+Math.sin(time*47)*.06;jets.scale.y=Math.min(1.4,Math.max(.28,altitude*.72))*pulse;
      jetMat.opacity=.22+Math.sin(time*23)*.035;
    }
    rearJets.visible=state.mode==='jet';rearBursts.visible=!!state.boosting;
    rearBursts.scale.z=.65+pace*.5+Math.sin(time*17)*.02;
    // Share the launch with rear thrust; simulation time freezes the wing on pause and impact.
    const wingTime=state.time||0;
    if(state.mode!=='jet'||state.phase==='ready'||wingTime<lastWingTime)visualWingTime=0;
    else if(state.boosting)visualWingTime=Math.max(visualWingTime,wingTime+fraction);
    lastWingTime=wingTime;
    player.userData.setWing(smooth(clamp(visualWingTime/1.1,0,1)),state.mode==='jet');
    for(const view of carViews.values())view.seen=false;
    let sparkCount=0;
    for(const car of state.traffic||[]) {
      let view=carViews.get(car.id);
      if(!view){view=carPools[car.model]?.pop()||createCarView(car);view.root.visible=true;view.pitch=0;carViews.set(car.id,view);}
      view.seen=true;
      if(view.paint!==car.color&&view.vehicle.userData.paint){view.vehicle.userData.paint.color.set(car.color);view.paint=car.color;}
      // Crash spin plus a slight steer into lane changes.
      const yaw=(car.yaw||0)-(car.vx||0)*.045;
      view.root.position.set(car.x,0,-car.z);view.vehicle.rotation.y=yaw;view.shadow.rotation.z=yaw;
      // Hard braking dips the nose; the rear rises while the front wheels stay planted.
      const pitch=car.mode==='crashed'||car.broken?0:car.flash?-.022:car.brake&&car.speed>0?-.008:0;
      view.pitch+=(pitch-view.pitch)*Math.min(1,dt*10);view.vehicle.rotation.x=view.pitch;view.vehicle.position.y=-view.pitch*car.length*.5;
      spin(view.vehicle,-(car.odo||0)/wheelRadius[view.model]);lights(view,car,time);
      const setBroken=view.vehicle.userData.setBroken;
      if(setBroken&&(car.broken||view.broken)) {
        // The collapsed corner drops over a quarter second; the dragged wheel no longer turns.
        setBroken(Math.max(0,car.broken-1),car.broken?clamp((time-car.brokenAt)/.3,0,1):0);view.broken=!!car.broken;
        if(car.broken)view.vehicle.userData.wheels[car.broken-1].rotation.x=0;
      }
      if(view.triangle)view.triangle.visible=!!car.triangle;
      if(car.mode==='crashed'&&car.speed>1.5)for(let k=0;k<8&&sparkCount<sparks.instanceMatrix.count;k++) {
        const seed=car.id*7.31+k*3.7,flicker=Math.sin(time*97+seed);
        transform.position.set(car.x+Math.sin(seed*2.1+time*40)*car.width*.5,.08+Math.abs(Math.sin(time*61+seed))*.35,-car.z+(k%2?1:-1)*car.length*.45+flicker*.6);
        transform.scale.setScalar(.6+Math.abs(flicker));transform.updateMatrix();sparks.setMatrixAt(sparkCount++,transform.matrix);
      }
      // A dragged corner throws a tail of sparks back along the road.
      if(car.mode==='broken'&&car.speed>.5) {
        const side=car.broken%2===0?1:-1,wheel=view.vehicle.userData.wheels?.[car.broken-1];
        const corner=wheel?wheel.position.z+wheel.parent.position.z:0;
        for(let k=0;k<20&&sparkCount<sparks.instanceMatrix.count;k++) {
          const seed=car.id*5.17+k*2.3,flicker=Math.sin(time*89+seed),reach=Math.min(6,car.speed*.3),trail=((k*.37+time*9)%1)*reach;
          transform.position.set(car.x+side*(.95+Math.abs(Math.sin(seed+time*31))*.35),.05+Math.abs(Math.sin(time*53+seed))*.55*(1-trail/6),-car.z+corner+.4+trail);
          transform.scale.setScalar(1.1+Math.abs(flicker)*1.2);transform.updateMatrix();sparks.setMatrixAt(sparkCount++,transform.matrix);
        }
      }
    }
    for(const [id,view] of carViews)if(!view.seen){view.root.visible=false;carViews.delete(id);carPools[view.model].push(view);}
    for(const view of batteryViews.values())view.seen=false;
    for(const battery of state.batteries||[]) {
      let view=batteryViews.get(battery.id);
      if(!view){view=batteryPool.pop()||createBatteryView();view.root.visible=true;batteryViews.set(battery.id,view);}
      view.seen=true;const lift=battery.lift||0;
      view.root.position.set(battery.x,0,-battery.z);view.vehicle.position.y=lift;view.vehicle.rotation.x=lift*.7;
      view.shadow.material.opacity=.3/(1+lift*3);
    }
    for(const [id,view] of batteryViews)if(!view.seen){view.root.visible=false;batteryViews.delete(id);batteryPool.push(view);}
    if(state.phase==='over'&&(state.speed||0)>5)for(let k=0;k<10&&sparkCount<sparks.instanceMatrix.count;k++) {
      const flicker=Math.sin(time*89+k*4.1);
      transform.position.set(px+Math.sin(k*2.7+time*37)*.9,.08+Math.abs(Math.sin(time*57+k))*.4,(k%2?-1:1)*2.2+flicker*.5);
      transform.scale.setScalar(.6+Math.abs(flicker));transform.updateMatrix();sparks.setMatrixAt(sparkCount++,transform.matrix);
    }
    transform.scale.set(1,1,1);sparks.count=sparkCount;sparks.instanceMatrix.needsUpdate=true;
    const rise=altitude;
    // As pace builds, the lens widens while the chase camera drops and closes in, with a faint road buzz.
    // Obstacle geometry is unchanged; only the view of it shifts.
    // An impact adds a sharp jolt that dies away while the wreck slides.
    const shake=pace*pace*.045+(state.phase==='over'?.3*Math.exp(-(state.crashTime||0)*3.5):0);
    camera.position.set(.55+px*.5+Math.sin(time*43)*shake*.5,5.7-pace*.55+rise*.66+Math.sin(time*61+1.7)*shake,12.5-pace*1.5+rise*.14);
    const fov=60+pace*15;
    if(Math.abs(camera.fov-fov)>.05){camera.fov=fov;camera.updateProjectionMatrix();}
    const aimY=1.05+rise*.60,normalAim=state.phase==='ready'?-6:-13.5;
    const compact=clamp((844-height)/144,0,1);
    let aimZ=normalAim;
    if(compact>0) {
      // Keep a conservative lower rear corner above the bottom 205 px on short phones.
      // This changes camera pitch only; the player's simulation altitude is untouched.
      const rearAngle=Math.atan2(camera.position.y-altitude,Math.hypot(camera.position.x,camera.position.z-2.4));
      const screenAngle=Math.atan((1-420/height)*Math.tan(THREE.MathUtils.degToRad(fov*.5)));
      const pitch=clamp(rearAngle-screenAngle,.1,1.05);
      const compactAim=camera.position.z-(camera.position.y-aimY)/Math.tan(pitch);
      aimZ=THREE.MathUtils.lerp(normalAim,compactAim,compact);
    }
    camera.lookAt(px*.65,aimY,aimZ);
    streakMat.opacity=Math.pow(pace,1.5)*.5;streaks.visible=streakMat.opacity>.01;
    if(streaks.visible) {
      // Each streak drains into a plane ahead of the camera before wrapping, so none pops in view.
      const length=2+pace*9;
      for(let i=0;i<streakSeeds.length;i++) {
        const seed=streakSeeds[i],head=15-(((seed.z-travel)%130+130)%130),near=Math.min(head,4),visible=Math.max(.001,near-head+length);
        transform.position.set(camera.position.x+seed.dx,camera.position.y+seed.dy,near-visible/2);transform.scale.set(1,1,visible);
        transform.updateMatrix();streaks.setMatrixAt(i,transform.matrix);
      }
      transform.scale.set(1,1,1);streaks.instanceMatrix.needsUpdate=true;
    }
    renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);renderer.clear();renderer.render(scene,camera);
    // Re-measured now and then, and every frame while the mirror is still hidden behind the start screen.
    if(!mirrorElement||!(mirrorRect?.width>5)||time-lastMirrorMeasure>.6||time<lastMirrorMeasure) {
      mirrorElement=document.getElementById('mirror-view');mirrorRect=mirrorElement?.getBoundingClientRect()||null;lastMirrorMeasure=time;
    }
    if(mirrorRect&&mirrorRect.width>5&&mirrorRect.height>5) {
      const vx=mirrorRect.left-canvasRect.left,vy=height-(mirrorRect.bottom-canvasRect.top),vw=mirrorRect.width,vh=mirrorRect.height;
      // A real mirror flips left and right. Mirroring the whole world keeps three.js face culling and lighting correct,
      // so the backward camera sits at the mirrored driver position.
      rearCamera.position.set(-px,1.45+rise*.85,-.4);rearCamera.lookAt(-px*.6,.95+rise*.45,60);
      const aspect=vw/vh;if(Math.abs(rearCamera.aspect-aspect)>.01){rearCamera.aspect=aspect;rearCamera.updateProjectionMatrix();}
      renderer.setScissorTest(true);renderer.setViewport(vx,vy,vw,vh);renderer.setScissor(vx,vy,vw,vh);
      renderer.clear(true,true,true);const wasVisible=player.visible,streaksVisible=streaks.visible;
      player.visible=playerShadow.visible=streaks.visible=false;scene.scale.x=-1;
      renderer.render(scene,rearCamera);
      scene.scale.x=1;player.visible=wasVisible;playerShadow.visible=true;streaks.visible=streaksVisible;renderer.setScissorTest(false);
      renderer.setViewport(0,0,width,height);
    }
  }
  // Compile hidden thrust effects while the loading screen is up, before the first manoeuvre.
  const ready=renderer.compileAsync(scene,camera);
  resize();return {render,resize,ready};
}

function asphaltTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),data=ctx.createImageData(128,128),noise=new Float32Array(128*128);
  let seed=1397;const next=()=>(seed=(seed*1664525+1013904223)>>>0)%35;
  for(let i=0;i<noise.length;i++)noise[i]=next();
  // Grain is smoothed along the road (canvas rows map to the road's length) so it streaks past at speed.
  for(let x=0;x<128;x++) {
    const groove=next()*.3-5;
    for(let y=0;y<128;y++) {
      let sum=0;for(let k=-5;k<=5;k++)sum+=noise[((y+k+128)%128)*128+x];
      const c=Math.round(clamp(191+groove+(sum/11-17)*3,170,212)),i=(y*128+x)*4;data.data[i]=c;data.data[i+1]=c+2;data.data[i+2]=c+1;data.data[i+3]=255;
    }
  }
  ctx.putImageData(data,0,0);const tex=new THREE.CanvasTexture(canvas);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(5,40);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function makeGlowTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
  const grad=ctx.createRadialGradient(32,32,0,32,32,32);grad.addColorStop(0,'rgba(255,255,255,1)');grad.addColorStop(.25,'rgba(255,255,255,.55)');grad.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);return new THREE.CanvasTexture(canvas);
}
function makeShadowTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
  const grad=ctx.createRadialGradient(32,32,4,32,32,31);grad.addColorStop(0,'rgba(15,28,36,0.85)');grad.addColorStop(.55,'rgba(15,28,36,0.5)');grad.addColorStop(1,'rgba(15,28,36,0)');
  ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);return new THREE.CanvasTexture(canvas);
}
function makeShadow(texture,w,l) {
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,l),new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.33,depthWrite:false}));
  m.rotation.x=-Math.PI/2;m.position.y=.025;m.renderOrder=1;return m;
}
function buildTrees(scene) {
  const entries=[],trunkGeo=new THREE.CylinderGeometry(.11,.17,2,5),leafGeo=new THREE.IcosahedronGeometry(1,0);
  const trunkMat=new THREE.MeshStandardMaterial({color:'#7c7860',roughness:1});
  const leaves=['#637f60','#79916b','#859a70','#526e59'].map(color=>new THREE.Color(color));
  const leafMat=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1});
  const trunks=new THREE.InstancedMesh(trunkGeo,trunkMat,76),crowns=new THREE.InstancedMesh(leafGeo,leafMat,76),branches=new THREE.InstancedMesh(leafGeo,leafMat,76);
  // Moving instance transforms cover a long road corridor, so avoid stale initial bounding spheres.
  trunks.frustumCulled=crowns.frustumCulled=branches.frustumCulled=false;
  scene.add(trunks,crowns,branches);
  for(let i=0;i<76;i++) {
    const side=i%2?-1:1;
    entries.push({x:side*(10+(Math.sin(i*3.7)*.5+.5)*30),scale:.75+(Math.sin(i*9.1)*.5+.5)*1.2});
    crowns.setColorAt(i,leaves[i%4]);branches.setColorAt(i,leaves[(i+1)%4]);
  }return {entries,trunks,crowns,branches};
}
function buildHills(scene) {
  const geo=new THREE.SphereGeometry(1,16,8);
  for(let i=0;i<12;i++) {
    const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:i%2?'#8ea58a':'#9eb29b',roughness:1}));
    m.position.set((i-5.5)*53,-18,-260-Math.sin(i*4.1)*75);
    m.scale.set(55+(i%3)*17,35+(i%4)*7,50);scene.add(m);
  }
}
function buildMarkers(scene) {
  const result=[],postGeo=new THREE.BoxGeometry(.07,.8,.07),postMat=new THREE.MeshStandardMaterial({color:'#d1d7c9'});
  for(let i=0;i<5;i++) {
    const g=new THREE.Group();g.position.x=7.6;
    const post=new THREE.Mesh(postGeo,postMat);post.position.y=.5;g.add(post);
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=112;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#eff2df';ctx.fillRect(0,0,128,112);ctx.fillStyle='#497366';ctx.fillRect(0,0,128,31);
    ctx.fillStyle='#f3f6ec';ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.fillText('G 2026',64,23);
    ctx.fillStyle='#365548';ctx.font='bold 38px sans-serif';ctx.fillText(String(120+i),64,77);ctx.font='15px sans-serif';ctx.fillText('km',64,101);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const plate=new THREE.Mesh(new THREE.PlaneGeometry(.66,.58),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
    plate.position.y=1.07;g.add(plate);scene.add(g);result.push(g);
  }return result;
}
