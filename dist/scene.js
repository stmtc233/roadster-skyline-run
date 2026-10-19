import * as THREE from 'three';
import { createRoadster, createMPV, createSedan, createSUV, createBattery } from './models.js';

const clamp = THREE.MathUtils.clamp;
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
  const rearCamera=new THREE.PerspectiveCamera(63,3,.15,220);
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

  const player=createRoadster(); scene.add(player);
  const shadowTexture=makeShadowTexture();
  const playerShadow=makeShadow(shadowTexture,2.6,5.1);scene.add(playerShadow);
  const jetMat=new THREE.MeshBasicMaterial({color:'#c5f0ff',transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide});
  const jetCoreMat=new THREE.MeshBasicMaterial({color:'#f5ffff',transparent:true,opacity:.6,depthWrite:false});
  const jets=new THREE.Group(); player.add(jets);
  for(const x of [-.65,.65]) for(const z of [-1.17,1.14]) {
    const jet=new THREE.Group(); jet.position.set(x,.18,z); jets.add(jet);
    const shell=new THREE.Mesh(new THREE.CylinderGeometry(.045,.27,1.15,12,1,true),jetMat);shell.position.y=-.6;jet.add(shell);
    const core=new THREE.Mesh(new THREE.CylinderGeometry(.025,.11,.75,10,1,true),jetCoreMat);core.position.y=-.40;jet.add(core);
    const nozzle=new THREE.Mesh(new THREE.TorusGeometry(.055,.018,5,10),new THREE.MeshStandardMaterial({color:'#a8d7dd',metalness:.8,roughness:.3}));
    nozzle.rotation.x=Math.PI/2;jet.add(nozzle);
  }
  const eventViews=new Map(), pools={front:[],rear:[],battery:[]};
  const trafficViews=new Map(),trafficPool=[];
  let canvasRect=null,mirrorRect=null,mirrorElement=null,lastMirrorMeasure=0;
  let width=1,height=1;
  function resize() {
    canvasRect=canvas.getBoundingClientRect(); width=Math.max(1,canvasRect.width);height=Math.max(1,canvasRect.height);
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
    mirrorElement=document.getElementById('mirror-view');mirrorRect=mirrorElement?.getBoundingClientRect()||null;
  }
  function createEventView(kind) {
    const root=new THREE.Group(); scene.add(root);
    const vehicle=kind==='front'?createSedan({braking:true}):kind==='rear'?createMPV():createBattery();root.add(vehicle);
    const shadow=makeShadow(shadowTexture,kind==='battery'?2.1:2.6,kind==='rear'?5.8:kind==='battery'?2.1:4.8);root.add(shadow);
    let source=null,sourceShadow=null,warning=null;
    if(kind==='battery') {
      source=createSUV();root.add(source);sourceShadow=makeShadow(shadowTexture,2.6,4.8);root.add(sourceShadow);
      warning=new THREE.Group();root.add(warning);
      const sparkMat=new THREE.MeshBasicMaterial({color:'#ffdd89',transparent:true,opacity:.8,depthWrite:false});
      for(let i=0;i<7;i++) {
        const spark=new THREE.Mesh(new THREE.SphereGeometry(.045,5,3),sparkMat);
        spark.position.set(Math.sin(i*2.4)*.6,.15+(i%3)*.12,Math.cos(i*2.4)*.55);warning.add(spark);
      }
    }
    return {root,vehicle,shadow,source,sourceShadow,warning,seen:false,kind};
  }
  function spin(vehicle,angle) { const wheels=vehicle.userData.wheels;if(wheels)for(const w of wheels)w.rotation.x=angle; }
  function render(state,dt) {
    if(!canvasRect)resize();
    const time=state.time||0,travel=state.distance||0,altitude=Math.max(0,state.altitude||0);
    const speed=state.speed||0;
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
    if(roadMat.map)roadMat.map.offset.y=(travel/700)%1;
    const px=state.x||0;
    player.position.set(px,altitude,0);
    // The simulation supplies the sole vertical position. Only small pitch changes express thrust.
    player.rotation.x=state.thrusting?-.025:0;
    player.rotation.y=-((state.lane||0)*4-px)*.025;
    player.rotation.z=-((state.lane||0)*4-px)*.018;
    spin(player,-travel/.32);
    playerShadow.position.set(px,.025,0);playerShadow.material.opacity=.35/(1+altitude*.22);
    playerShadow.scale.set(1+altitude*.055,1+altitude*.055,1);
    jets.visible=!!state.thrusting;
    if(jets.visible) {
      const pulse=.94+Math.sin(time*47)*.06;jets.scale.y=Math.min(1.4,Math.max(.28,altitude*.72))*pulse;
      jetMat.opacity=.22+Math.sin(time*23)*.035;
    }
    for(const view of eventViews.values())view.seen=false;
    for(const event of state.events||[]) {
      let view=eventViews.get(event.id);
      if(!view) {view=pools[event.kind]?.pop()||createEventView(event.kind);view.root.visible=true;eventViews.set(event.id,view);}
      view.seen=true;
      const x=event.x||0,z=-(event.z||0);
      view.vehicle.position.set(x,0,z);view.vehicle.rotation.set(0,0,0);
      view.shadow.position.set(x,.027,z);view.shadow.material.opacity=.3;
      view.vehicle.visible=true;
      spin(view.vehicle,-travel/(event.kind==='rear'?.36:.32));
      if(event.kind==='battery') {
        view.vehicle.visible=event.batteryVisible;
        const sx=Number.isFinite(event.sourceX)?event.sourceX:4;
        const sz=-Number(event.sourceZ??event.z??0);
        view.source.position.set(sx,0,sz);view.source.rotation.set(0,0,0);spin(view.source,-(event.wheelTravel||0)/.37);
        for(const lamp of view.source.userData.hazardLights||[]) {lamp.material.emissiveIntensity=event.hazardOn?5:0;lamp.material.color.set(event.hazardOn?'#ffb22c':'#553b21');}
        view.sourceShadow.position.set(sx,.026,sz);
        view.warning.position.set(sx,.15,sz+1.4);
        view.warning.visible=event.stage==='hazards'&&!event.resolved;
        view.warning.rotation.y=time*2;
        view.warning.scale.setScalar(.65+(Math.sin(time*31)+1)*.2);
        view.shadow.visible=view.vehicle.visible;
      }
    }
    for(const [id,view] of eventViews)if(!view.seen){view.root.visible=false;eventViews.delete(id);pools[view.kind].push(view);}
    for(const view of trafficViews.values())view.seen=false;
    for(const car of state.traffic||[]) {
      let view=trafficViews.get(car.id);
      if(!view){const root=new THREE.Group(),vehicle=trafficPool.pop()||createSedan({color:car.color,braking:false}),shadow=makeShadow(shadowTexture,2.5,4.8);root.add(vehicle,shadow);scene.add(root);view={root,vehicle,shadow,seen:true};trafficViews.set(car.id,view);}
      view.seen=true;view.vehicle.position.set(car.x,0,-car.z);spin(view.vehicle,-travel/.32);view.shadow.position.set(car.x,.027,-car.z);
    }
    for(const [id,view] of trafficViews)if(!view.seen){scene.remove(view.root);view.root.remove(view.vehicle);trafficPool.push(view.vehicle);view.shadow.geometry.dispose();view.shadow.material.dispose();trafficViews.delete(id);}
    const rise=altitude;
    camera.position.set(.55+px*.5,5.7+rise*.66,12.5+rise*.14);
    // A slight speed-dependent field of view conveys pace without changing obstacle geometry.
    const fov=61+clamp((speed-120)/160,0,1)*5;
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
    renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);renderer.clear();renderer.render(scene,camera);
    if(!mirrorElement||time-lastMirrorMeasure>.6||time<lastMirrorMeasure) {
      mirrorElement=document.getElementById('mirror-view');mirrorRect=mirrorElement?.getBoundingClientRect()||null;lastMirrorMeasure=time;
    }
    if(mirrorRect&&mirrorRect.width>5&&mirrorRect.height>5) {
      const vx=mirrorRect.left-canvasRect.left,vy=height-(mirrorRect.bottom-canvasRect.top),vw=mirrorRect.width,vh=mirrorRect.height;
      rearCamera.position.set(px,1.8+rise*.24,-1.8);rearCamera.lookAt(px*.5,1.2,85);
      const aspect=vw/vh;if(Math.abs(rearCamera.aspect-aspect)>.01){rearCamera.aspect=aspect;rearCamera.updateProjectionMatrix();}
      renderer.setScissorTest(true);renderer.setViewport(vx,vy,vw,vh);renderer.setScissor(vx,vy,vw,vh);
      renderer.clear(true,true,true);const wasVisible=player.visible;player.visible=false;
      renderer.render(scene,rearCamera);player.visible=wasVisible;renderer.setScissorTest(false);
      renderer.setViewport(0,0,width,height);
    }
  }
  resize();return {render,resize};
}

function asphaltTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),data=ctx.createImageData(128,128);
  let seed=1397;for(let i=0;i<data.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const c=174+(seed%35);data.data[i]=c;data.data[i+1]=c+2;data.data[i+2]=c+1;data.data[i+3]=255;}
  ctx.putImageData(data,0,0);const tex=new THREE.CanvasTexture(canvas);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(5,170);tex.colorSpace=THREE.SRGBColorSpace;return tex;
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
