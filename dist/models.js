import * as THREE from 'three';

const mat = (color, metalness = 0, roughness = .45, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const M = {
  white: mat('#eeeee7', .48, .24), black: mat('#141b22', .45, .29), rubber: mat('#12171b', .05, .8),
  alloy: mat('#cbd4dc', .86, .22), darkAlloy: mat('#37414a', .78, .29),
  goldGlass: mat('#817241', .77, .15, { envMapIntensity: 1.4 }), glass: mat('#263e4a', .62, .18),
  red: mat('#ff263c', .05, .2, { emissive: '#ff1830', emissiveIntensity: 2.7 }),
  head: mat('#f5fdff', .1, .15, { emissive: '#d9efff', emissiveIntensity: 2.2 }),
  champagne: mat('#bcb49a', .67, .3), mpv: mat('#1c272d', .55, .24), suv: mat('#8caa9c', .43, .4),
  battery: mat('#303b44', .6, .37), blue: mat('#8de9ff', .3, .2, { emissive: '#37b3d5', emissiveIntensity: 1.3 }),
};
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(.33, .33, .21, 24);
const rimGeo = new THREE.CylinderGeometry(.245, .245, .225, 24);
const hubGeo = new THREE.CylinderGeometry(.06, .06, .25, 16);
const spokeGeo = (() => {
  const source = new THREE.BoxGeometry(.022,.43,.024).toNonIndexed(), positions=[], normals=[];
  for(let i=0;i<5;i++) {
    const part=source.clone().rotateX(i*Math.PI/5);
    positions.push(...part.attributes.position.array);normals.push(...part.attributes.normal.array);part.dispose();
  }
  source.dispose();const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));return g;
})();

function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
function box(parent, material, x, y, z, w, h, d) {
  const m = mesh(boxGeo, material, parent, x, y, z); m.scale.set(w, h, d); return m;
}
function roundedGeometry(w, h, d, r = .1) {
  r = Math.min(r, w / 3, h / 3, d / 3);
  // Extrusion bevels extend outside the shape, so inset to preserve requested dimensions.
  w-=r;h-=r;
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x+r,y); s.lineTo(x+w-r,y); s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+h-r); s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  s.lineTo(x+r,y+h); s.quadraticCurveTo(x,y+h,x,y+h-r);
  s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y);
  const g = new THREE.ExtrudeGeometry(s,{depth:d-r*2,curveSegments:3,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:r*.5,bevelThickness:r});
  g.translate(0,0,-d/2+r); g.computeVertexNormals(); return g;
}
function round(parent, material, x,y,z,w,h,d,r=.08) {
  return mesh(roundedGeometry(w,h,d,r),material,parent,x,y,z);
}
// Cross sections along the car's length give the Roadster a continuously tapered silhouette.
function loft(sections, material, parent) {
  const positions=[], indices=[];
  // Clockwise section: lower sill, shoulder, roof, mirrored around the centerline.
  for(const s of sections) {
    const {z,w,b,t,r}=s;
    positions.push(-w,b,z, -w,t-.07,z, -w*.76,t,z, -r,t+.035,z,
      r,t+.035,z, w*.76,t,z, w,t-.07,z, w,b,z);
  }
  for(let j=0;j<sections.length-1;j++) for(let i=0;i<8;i++) {
    const a=j*8+i,b=j*8+(i+1)%8,c=(j+1)*8+i,d=(j+1)*8+(i+1)%8;
    indices.push(a,c,b,b,c,d);
  }
  for(let i=1;i<7;i++) {indices.push(0,i,i+1); const e=(sections.length-1)*8; indices.push(e,e+i+1,e+i);}
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setIndex(indices); g.computeVertexNormals(); return mesh(g,material,parent);
}
function wheels(parent, front, rear, halfWidth, radius=.33) {
  const result=[];
  for(const z of [front,rear]) for(const side of [-1,1]) {
    const g=new THREE.Group(); g.position.set(side*halfWidth,radius,z); parent.add(g);
    const tire=mesh(wheelGeo,M.rubber,g); tire.rotation.z=Math.PI/2;
    const rim=mesh(rimGeo,M.darkAlloy,g); rim.rotation.z=Math.PI/2;
    const hub=mesh(hubGeo,M.alloy,g); hub.rotation.z=Math.PI/2;
    mesh(spokeGeo,M.alloy,g,side*.12,0,0);
    g.scale.setScalar(radius/.33); result.push(g);
  }
  parent.userData.wheels=result;
}
function strip(parent,material,x,y,z,w,h=.035,d=.035) {return round(parent,material,x,y,z,w,h,d,.012);}

// Small convex surface patches preserve the sloped glass and coachwork silhouette.
function panel(parent, material, vertices) {
  const geometry=new THREE.BufferGeometry(), indices=[];
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flat(),3));
  for(let i=1;i<vertices.length-1;i++) indices.push(0,i,i+1);
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return mesh(geometry,material,parent);
}
function edge(parent, material, a, b, radius=.01) {
  const start=new THREE.Vector3(...a), end=new THREE.Vector3(...b), delta=end.clone().sub(start);
  const m=mesh(new THREE.CylinderGeometry(radius,radius,delta.length(),6),material,parent);
  m.position.copy(start.add(end).multiplyScalar(.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()); return m;
}
function cabin(parent, material, sections) {
  const vertices=[],indices=[];
  for(const {z,w,b,t,r} of sections) {
    const shoulder=r+(w-r)*Math.min(1,.10/Math.max(.10,t-b));
    vertices.push(-w,b,z,-shoulder,t-.10,z,-r,t,z,r,t,z,shoulder,t-.10,z,w,b,z);
  }
  for(let j=0;j<sections.length-1;j++) for(let i=0;i<6;i++) {
    const a=j*6+i,b=j*6+(i+1)%6,c=a+6,d=b+6;indices.push(a,c,b,b,c,d);
  }
  const e=(sections.length-1)*6;
  for(let i=1;i<5;i++) indices.push(0,i,i+1,e,e+i+1,e+i);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geo.setIndex(indices);geo.computeVertexNormals();return mesh(geo,material,parent);
}
function tail(parent) {
  const m=mat('#ff263c',.05,.2,{emissive:'#ff1830',emissiveIntensity:1.1});m.userData.base=1.1;
  parent.userData.brakeLights=[];return m;
}
function hazard(parent,x,y,z,w,h,d) {
  const amber=mat('#c37608',.18,.22,{emissive:'#ff9400',emissiveIntensity:0});
  const light=strip(parent,amber,x,y,z,w,h,d);light.name='amber indicator';
  (parent.userData.hazardLights??=[]).push(light);return light;
}
function badge(parent,text,x,y,z,w,h) {
  if(typeof document==='undefined') return;
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,256,96);ctx.fillStyle='#e4e7e5';ctx.font='600 53px sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,128,49);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,roughness:.3,metalness:.5});
  const m=mesh(new THREE.PlaneGeometry(w,h),material,parent,x,y,z);if(z<0)m.rotation.y=Math.PI;
}
function wheelArch(parent,material,side,z,width=.49) {
  const vertices=[];
  for(let i=0;i<=12;i++) {
    const angle=Math.PI*i/12;
    vertices.push(side*1.005,.36+Math.sin(angle)*width,z+Math.cos(angle)*width,
      side*1.008,.36+Math.sin(angle)*(width+.065),z+Math.cos(angle)*(width+.065));
  }
  const geo=new THREE.BufferGeometry(),indices=[];
  for(let i=0;i<12;i++) {const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
  return mesh(geo,material,parent);
}

export function createRoadster() {
  const g=new THREE.Group(); g.name='2026 Roadster';
  loft([
    {z:-2.28,w:.67,b:.21,t:.39,r:.3},{z:-1.83,w:.87,b:.18,t:.56,r:.53},
    {z:-.85,w:.94,b:.19,t:.65,r:.55},{z:.65,w:.94,b:.19,t:.69,r:.57},
    {z:1.6,w:.91,b:.22,t:.75,r:.6},{z:2.18,w:.78,b:.28,t:.63,r:.58},
  ],M.white,g);
  loft([
    {z:-.92,w:.67,b:.59,t:.62,r:.45},{z:-.35,w:.69,b:.61,t:1.035,r:.43},
    {z:.53,w:.68,b:.63,t:1.04,r:.48},{z:1.26,w:.59,b:.63,t:.74,r:.4},
  ],M.goldGlass,g);
  // A narrow painted roof spine and raised rear shoulders make the glass cockpit readable.
  strip(g,M.white,0,1.078,.29,.055,.025,1.02);
  for(const s of [-1,1]) {
    box(g,M.black,s*.895,.26,.08,.08,.11,3.25);
    strip(g,M.black,s*.72,.78,1.39,.24,.025,.48);
    strip(g,M.black,s*.77,.7,-.05,.022,.025,1.26);
    round(g,M.white,s*.99,.67,-.67,.22,.10,.3,.04);
    strip(g,M.head,s*.57,.455,-2.20,.43,.035,.06);
  }
  round(g,M.black,0,.31,2.18,1.47,.22,.10,.05);
  strip(g,M.red,0,.615,2.224,1.42,.036,.045);
  strip(g,M.black,0,.69,1.92,1.50,.035,.24);
  // Diffuser fins and lower splitter add real depth in the principal rear chase view.
  for(const x of [-.54,-.27,0,.27,.54]) box(g,M.black,x,.24,2.16,.035,.15,.32);
  box(g,M.black,0,.24,-2.23,1.48,.045,.15);
  wheels(g,-1.4,1.42,.85,.32);
  return g;
}

// A snapped suspension arm: the wheel's foot kicks out from under the arch and the body corner settles onto it.
// Knuckles carry camber and toe, so the scene can keep rolling the inner wheel groups in userData.wheels.
function brokenSuspension(g,body) {
  const knuckles=g.userData.wheels.map(wheel=>{
    const knuckle=new THREE.Group();knuckle.position.copy(wheel.position);wheel.position.set(0,0,0);
    g.add(knuckle);knuckle.add(wheel);return knuckle;
  });
  const base=knuckles.map(knuckle=>knuckle.position.clone()),scale=g.userData.wheels[0].scale.x,radius=.33*scale,half=.105*scale;
  // Roll is exaggerated for the chase camera; the body pivots over the diagonal, whose corner lifts about 10 cm.
  const camber=.6,toe=.16,out=.1,back=.09,roll=.09,pitch=.024;
  // index follows userData.wheels (0 front-left, 1 front-right, 2 rear-left, 3 rear-right); amount 0 restores the intact car.
  g.userData.setBroken=(index,amount)=>{
    for(let i=0;i<knuckles.length;i++){knuckles[i].position.copy(base[i]);knuckles[i].rotation.set(0,0,0);}
    body.position.set(0,0,0);body.rotation.set(0,0,0);
    const a=Math.min(1,Math.max(0,amount||0)),knuckle=knuckles[index];if(!a||!knuckle)return;
    const sx=Math.sign(base[index].x),sz=Math.sign(base[index].z),kick=a*(2-a),fall=a*a,lean=camber*kick;
    // The wheel kicks out first and rides on its inner shoulder; the body then drops onto it.
    knuckle.rotation.set(0,-sx*toe*kick,sx*lean);
    knuckle.position.set(base[index].x+sx*out*kick,base[index].y+radius*(Math.cos(lean)-1)+half*Math.sin(lean),base[index].z+back*kick);
    // Drop above the wheel, sized so the sill corner past it ends about 5 cm off the road.
    const drop=sz<0?.143:.156;
    body.rotation.set(sz*pitch*fall,0,-sx*roll*fall);
    body.position.y=-(drop-roll-pitch*Math.abs(base[index].z))*fall;
  };
}

export function createMPV() {
  const g=new THREE.Group(); g.name='V800 gold and black MPV';
  // Coachwork sits in its own group so a collapsed corner can tilt it while the wheels stay on the road.
  const body=new THREE.Group(); body.name='MPV body'; g.add(body);
  const gold=mat('#c8b98b',.72,.25), paint=mat('#111b23',.68,.21);
  const glazing=mat('#16232e',.48,.13,{side:THREE.DoubleSide});
  const trim=mat('#d6d2bc',.87,.19,{side:THREE.DoubleSide});
  const arch=mat('#11171b',.2,.5,{side:THREE.DoubleSide});
  const head=M.head.clone(),red=tail(g);g.userData.headLight=head;
  // 5.495 m body, 2.006 m beam, 1.85 m roof: low nose and long sliding-door cabin.
  loft([{z:-2.7475,w:.84,b:.23,t:1.03,r:.58},{z:-2.56,w:.976,b:.21,t:1.12,r:.64},
    {z:-1.87,w:1.003,b:.20,t:1.19,r:.70},{z:.5,w:1.003,b:.20,t:1.20,r:.72},
    {z:2.40,w:.966,b:.22,t:1.20,r:.67},{z:2.7475,w:.87,b:.27,t:1.16,r:.62}],paint,body);
  loft([{z:-2.69,w:.82,b:1.015,t:1.055,r:.60},{z:-2.43,w:.94,b:1.07,t:1.14,r:.68},
    {z:-1.93,w:.93,b:1.14,t:1.205,r:.66}],gold,body);
  cabin(body,gold,[{z:-1.99,w:.925,b:1.17,t:1.23,r:.79},{z:-.87,w:.91,b:1.17,t:1.81,r:.79},
    {z:-.49,w:.92,b:1.17,t:1.85,r:.80},{z:1.75,w:.92,b:1.17,t:1.84,r:.80},
    {z:2.42,w:.90,b:1.17,t:1.76,r:.77},{z:2.64,w:.87,b:1.17,t:1.65,r:.74}]);
  const windshield=[[-.85,1.25,-2.01],[.85,1.25,-2.01],[.77,1.805,-.92],[-.77,1.805,-.92]];
  panel(body,glazing,windshield);
  // Slim gold roof rails and the polished surround follow the actual window slope.
  for(const side of [-1,1]) {
    const windows=[
      [[.918,1.25,-1.84],[.828,1.745,-.87],[.828,1.765,-.48],[.925,1.25,-.48]],
      [[.925,1.25,-.40],[.828,1.765,-.40],[.828,1.758,1.17],[.925,1.25,1.17]],
      [[.925,1.25,1.25],[.828,1.758,1.25],[.819,1.68,2.28],[.900,1.25,2.45]]
    ];
    for(const points of windows) panel(body,glazing,points.map(([x,y,z])=>[side*x,y,z]));
    const outline=[[side*.918,1.235,-1.90],[side*.835,1.773,-.88],
      [side*.834,1.788,1.75],[side*.82,1.708,2.32],[side*.905,1.235,2.48],[side*.918,1.235,-1.90]];
    for(let i=0;i<outline.length-1;i++)edge(body,trim,outline[i],outline[i+1],.012);
    strip(body,trim,side*1.008,.36,.15,.018,.024,4.54);
    strip(body,M.black,side*1.008,.965,.95,.008,.012,2.03); // sliding rail
    for(const z of [-.43,1.26])edge(body,M.black,[side*1.006,.44,z],[side*1.006,1.16,z],.006);
    for(const z of [-.62,-.22]) {
      round(body,M.black,side*1.01,1.03,z,.018,.078,.35,.012);
      strip(body,trim,side*1.026,1.046,z,.018,.026,.31);
    }
    round(body,gold,side*1.074,1.25,-1.35,.26,.15,.34,.05);
    strip(body,trim,side*1.13,1.22,-1.36,.15,.025,.26);
    hazard(body,side*1.137,1.226,-1.36,.16,.028,.27);
    for(const z of [-1.77,1.68])wheelArch(body,arch,side,z,.415);
  }
  // A smooth closed face replaces the old full-height grille.
  round(body,paint,0,.82,-2.718,1.56,.44,.065,.045);
  const jewel=mesh(new THREE.OctahedronGeometry(.105,0),trim,body,0,.87,-2.764);
  jewel.scale.set(.46,1.35,.20);
  edge(body,trim,[0,.735,-2.788],[0,1.005,-2.788],.005);
  for(const side of [-1,1]) {
    strip(body,M.black,side*.68,1.085,-2.692,.47,.09,.09);
    strip(body,head,side*.68,1.105,-2.742,.44,.026,.025);
    round(body,trim,side*.866,.875,-2.677,.14,.39,.08,.035);
    round(body,M.black,side*.866,.879,-2.727,.108,.35,.035,.025);
    for(const y of [.77,.87,.97])round(body,head,side*.867,y,-2.75,.047,.063,.018,.012);
    hazard(body,side*.889,.87,-2.758,.022,.30,.018);
    round(body,M.black,side*.64,.375,-2.70,.43,.14,.07,.025);
    strip(body,head,side*.64,.39,-2.747,.34,.022,.025);
    strip(body,trim,side*.64,.32,-2.746,.44,.023,.025);
  }
  box(body,M.black,0,.35,-2.733,.77,.21,.045);
  for(const x of [-.30,-.15,0,.15,.30])box(body,M.darkAlloy,x,.35,-2.761,.018,.17,.018);
  strip(body,trim,0,.25,-2.73,1.7,.023,.035);
  round(body,M.black,0,.56,-2.759,.50,.15,.02,.008);badge(body,'V800',0,.56,-2.774,.42,.13);
  panel(body,glazing,[[-.78,1.27,2.66],[-.70,1.65,2.65],[.70,1.65,2.65],[.78,1.27,2.66]]);
  strip(body,gold,0,1.76,2.40,1.64,.055,.31);
  for(const side of [-1,1]) {
    strip(body,M.black,side*.817,1.02,2.69,.16,.60,.05);
    g.userData.brakeLights.push(strip(body,red,side*.817,1.04,2.722,.058,.53,.03));
    hazard(body,side*.86,.81,2.724,.045,.15,.03);
  }
  g.userData.brakeLights.push(strip(body,red,0,1.29,2.694,1.60,.024,.035));
  strip(body,trim,0,.37,2.72,1.68,.028,.025);badge(body,'V800',0,.87,2.741,.44,.13);
  g.userData.hazardLights=body.userData.hazardLights;
  wheels(g,-1.77,1.68,.956,.395);
  for(const wheel of g.userData.wheels) {
    const side=Math.sign(wheel.position.x);
    const disc=mesh(new THREE.CylinderGeometry(.272,.272,.025,32),trim,wheel,side*.133,0,0);
    disc.rotation.z=Math.PI/2;
    const ventPositions=[],ventNormals=[];
    for(let i=0;i<18;i++) {
      const angle=i*Math.PI/9;
      const slot=boxGeo.toNonIndexed().scale(.012,.035,.021).rotateX(angle)
        .translate(side*.15,Math.cos(angle)*.252,Math.sin(angle)*.252);
      ventPositions.push(...slot.attributes.position.array);ventNormals.push(...slot.attributes.normal.array);slot.dispose();
    }
    const vents=new THREE.BufferGeometry();vents.setAttribute('position',new THREE.Float32BufferAttribute(ventPositions,3));
    vents.setAttribute('normal',new THREE.Float32BufferAttribute(ventNormals,3));mesh(vents,M.darkAlloy,wheel);
    const hub=mesh(new THREE.CylinderGeometry(.065,.065,.035,16),M.darkAlloy,wheel,side*.154,0,0);hub.rotation.z=Math.PI/2;
  }
  brokenSuspension(g,body);
  return g;
}

export function createM9() {
  const g=new THREE.Group();g.name='AITO M9 blue and silver SUV';
  const body=new THREE.Group();body.name='M9 body';g.add(body);
  const paint=mat('#174776',.65,.24),silver=mat('#c4cbd0',.73,.22);
  const glazing=mat('#14242e',.52,.14,{side:THREE.DoubleSide});
  const trim=mat('#cbd5dc',.87,.19),arch=mat('#17232c',.2,.5,{side:THREE.DoubleSide});
  const head=M.head.clone(),red=tail(g);g.userData.paint=paint;g.userData.headLight=head;
  // M9's long rounded hood and silver upper cabin distinguish it from the upright iCAR and V800.
  loft([{z:-2.615,w:.69,b:.37,t:1.075,r:.46},{z:-2.56,w:.83,b:.30,t:1.105,r:.60},
    {z:-2.38,w:.96,b:.26,t:1.12,r:.72},{z:-1.45,w:1.0,b:.25,t:1.17,r:.76},
    {z:.80,w:1.0,b:.25,t:1.17,r:.77},{z:2.08,w:.99,b:.26,t:1.17,r:.75},
    {z:2.38,w:.94,b:.29,t:1.14,r:.70},{z:2.56,w:.82,b:.33,t:1.09,r:.61},
    {z:2.615,w:.72,b:.37,t:1.055,r:.51}],paint,body);
  const hood=new THREE.BufferGeometry(),positions=[],indices=[];
  const sections=[[-2.575,.68,1.18],[-2.49,.79,1.19],[-2.10,.87,1.225],[-1.36,.90,1.245]];
  for(let i=0;i<sections.length;i++)for(let j=0;j<=8;j++) {
    const [z,w,y]=sections[i],t=j/4-1;positions.push(w*t,y-.045*t*t,z+(i===0?.08*t*t:0));
    if(i&&j){const a=i*9+j;indices.push(a-10,a-1,a-9,a-1,a,a-9);}
  }
  hood.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));hood.setIndex(indices);
  hood.computeVertexNormals();mesh(hood,silver,body);
  cabin(body,silver,[{z:-1.45,w:.91,b:1.15,t:1.22,r:.78},{z:-.57,w:.90,b:1.15,t:1.78,r:.78},
    {z:.04,w:.91,b:1.15,t:1.80,r:.79},{z:1.65,w:.90,b:1.15,t:1.79,r:.79},
    {z:2.22,w:.88,b:1.15,t:1.70,r:.77},{z:2.48,w:.85,b:1.15,t:1.37,r:.73}]);
  panel(body,glazing,[[-.891,1.245,-1.49],[.891,1.245,-1.49],[.779,1.775,-.63],[-.779,1.775,-.63]]);
  round(body,glazing,0,1.813,.66,1.48,.026,2.25,.08);
  round(body,M.black,0,1.861,-.51,.31,.095,.24,.04);
  strip(body,glazing,0,1.87,-.64,.235,.035,.018);
  for(const side of [-1,1]) {
    const windows=[
      [[.923,1.225,-1.34],[.806,1.735,-.54],[.806,1.757,.16],[.923,1.225,.16]],
      [[.923,1.225,.17],[.806,1.757,.17],[.806,1.747,1.29],[.920,1.225,1.29]],
      [[.920,1.225,1.30],[.806,1.747,1.30],[.797,1.66,2.09],[.887,1.225,2.32]]
    ];
    for(const points of windows)panel(body,glazing,points.map(([x,y,z])=>[side*x,y,z]));
    const outline=[[side*.918,1.216,-1.34],[side*.810,1.74,-.55],[side*.810,1.764,1.65],
      [side*.802,1.677,2.12],[side*.890,1.216,2.34],[side*.918,1.216,-1.34]];
    for(let i=0;i<outline.length-1;i++)edge(body,trim,outline[i],outline[i+1],.006);
    for(const z of [.165,1.295])panel(body,M.black,[[side*.925,1.225,z-.022],[side*.809,1.75,z-.022],
      [side*.809,1.75,z+.022],[side*.925,1.225,z+.022]]);
    box(body,arch,side*1.0,.33,.06,.065,.10,3.96);
    strip(body,trim,side*1.014,.40,.06,.018,.025,4.13);
    for(const z of [.17,1.35])edge(body,arch,[side*1.003,.49,z],[side*1.003,1.15,z],.006);
    for(const z of [-.16,1.05]) {
      round(body,arch,side*1.008,1.04,z,.018,.055,.28,.01);
      strip(body,trim,side*1.023,1.048,z,.018,.028,.23);
    }
    round(body,silver,side*1.066,1.26,-1.08,.24,.15,.31,.045);
    hazard(body,side*1.18,1.25,-1.10,.025,.027,.23);
    for(const z of [-1.60,1.60])wheelArch(body,arch,side,z,.43);
    strip(body,trim,side*.76,1.825,.66,.019,.018,2.25);
  }
  // The wide light bar, enclosed nose and low intake keep the front recognisably M9.
  strip(body,M.black,0,.997,-2.621,.94,.062,.035);
  strip(body,head,0,1.012,-2.643,.94,.022,.022);
  for(const side of [-1,1]) {
    const lamp=new THREE.Group();lamp.position.set(side*.67,1.025,-2.551);lamp.rotation.y=-side*.22;body.add(lamp);
    round(lamp,M.black,0,0,0,.50,.205,.075,.065);
    for(const x of [-.145,0,.145])round(lamp,head,x,.047,-.046,.095,.048,.020,.022);
    round(lamp,head,0,-.059,-.048,.44,.035,.020,.015);
    hazard(body,side*.897,.992,-2.544,.024,.11,.025);
    round(body,arch,side*.82,.55,-2.53,.18,.22,.10,.04);
    strip(body,trim,side*.80,.415,-2.552,.25,.028,.025);
  }
  round(body,trim,0,.43,-2.619,1.36,.245,.035,.075);
  round(body,M.black,0,.43,-2.642,1.28,.19,.028,.06);
  for(const x of [-.46,-.23,0,.23,.46])box(body,M.darkAlloy,x,.43,-2.648,.017,.12,.016);
  strip(body,trim,0,.30,-2.51,1.66,.027,.04);
  badge(body,'AITO',0,.90,-2.642,.27,.075);
  badge(body,'M9',0,.755,-2.642,.39,.12);
  panel(body,glazing,[[-.78,1.24,2.50],[-.78,1.40,2.50],[.78,1.40,2.50],[.78,1.24,2.50]]);
  panel(body,glazing,[[-.78,1.40,2.50],[-.745,1.68,2.24],[.745,1.68,2.24],[.78,1.40,2.50]]);
  strip(body,silver,0,1.744,2.16,1.62,.055,.27);
  strip(body,M.black,0,1.10,2.605,1.40,.062,.035);
  g.userData.brakeLights.push(strip(body,red,0,1.12,2.631,1.38,.024,.027));
  for(const side of [-1,1]) {
    const lamp=new THREE.Group();lamp.position.set(side*.73,1.065,2.57);lamp.rotation.y=side*.27;body.add(lamp);
    round(lamp,M.black,0,0,0,.43,.20,.055,.06);
    g.userData.brakeLights.push(round(lamp,red,0,.048,.038,.40,.025,.020,.012));
    g.userData.brakeLights.push(round(lamp,red,0,-.045,.038,.36,.038,.020,.016));
    strip(lamp,red,side*.182,.005,.038,.025,.10,.020);
    hazard(body,side*.75,1.064,2.606,.21,.025,.025);
    strip(body,red,side*.81,.43,2.565,.17,.03,.025);
  }
  round(body,M.black,0,.35,2.62,1.47,.16,.08,.05);
  strip(body,trim,0,.44,2.642,1.49,.025,.028);
  badge(body,'AITO',0,.88,2.62,.46,.095);badge(body,'M9',.64,.82,2.642,.23,.10);
  round(body,M.black,0,.72,2.61,.48,.14,.025,.008);badge(body,'M9',0,.72,2.63,.35,.10);
  g.userData.hazardLights=body.userData.hazardLights;
  wheels(g,-1.60,1.60,.963,.39);
  for(const wheel of g.userData.wheels) {
    const spoke=mesh(spokeGeo,M.alloy,wheel,Math.sign(wheel.position.x)*.122,0,0);spoke.rotation.x=.18;
  }
  brokenSuspension(g,body);return g;
}

export function createSUV() {
  const g=new THREE.Group();g.name='iCAR 03T red and black SUV';
  const paint=mat('#d52332',.47,.27), black=mat('#111a20',.35,.34);
  const glazing=mat('#182932',.48,.17,{side:THREE.DoubleSide});
  const arch=mat('#182127',.20,.51,{side:THREE.DoubleSide}),red=tail(g);
  // Faceted shoulders, high hood and nearly vertical cabin keep its boxy stance.
  cabin(g,paint,[{z:-2.27,w:.86,b:.35,t:1.24,r:.70},{z:-2.02,w:.98,b:.30,t:1.27,r:.80},
    {z:-1.13,w:.99,b:.29,t:1.29,r:.81},{z:1.94,w:.99,b:.32,t:1.26,r:.81},{z:2.20,w:.91,b:.37,t:1.24,r:.76}]);
  cabin(g,black,[{z:-1.28,w:.88,b:1.22,t:1.29,r:.77},{z:-1.01,w:.88,b:1.22,t:1.86,r:.78},
    {z:1.81,w:.88,b:1.22,t:1.86,r:.78},{z:2.02,w:.87,b:1.22,t:1.80,r:.77}]);
  panel(g,glazing,[[-.815,1.30,-1.29],[.815,1.30,-1.29],[.753,1.78,-1.04],[-.753,1.78,-1.04]]);
  for(const side of [-1,1]) {
    for(const [front,rear] of [[-1.13,-.10],[-.01,.95],[1.04,1.82]]) {
      panel(g,glazing,[[side*.885,1.29,front],[side*.798,1.77,front+.06],
        [side*.798,1.77,rear],[side*.885,1.29,rear]]);
    }
    for(const z of [-1.40,1.40]) {
      wheelArch(g,arch,side,z,.455);
      for(const d of [-1,1])box(g,black,side*.996,.42,z+d*.48,.15,.33,.11);
    }
    box(g,black,side*1.015,.32,0,.14,.17,1.85);
    for(const z of [-.05,.98])edge(g,black,[side*.996,.48,z],[side*.996,1.21,z],.007);
    for(const z of [-.34,.73])box(g,black,side*1.005,1.12,z,.024,.05,.23);
    round(g,black,side*1.06,1.39,-1.15,.25,.20,.30,.035);
    hazard(g,side*1.175,1.38,-1.17,.026,.032,.22);
    edge(g,black,[side*.70,1.91,-.75],[side*.70,1.91,1.71],.036);
    for(const z of [-.65,1.55])box(g,black,side*.70,1.88,z,.07,.10,.13);
  }
  // Narrow grille with horizontal eyes joined to segmented vertical I-shaped lamps.
  box(g,black,0,1.12,-2.295,1.58,.16,.055);
  strip(g,M.darkAlloy,0,1.175,-2.33,1.47,.018,.02);
  badge(g,'iCAR',-.31,1.12,-2.334,.31,.10);
  for(const side of [-1,1]) {
    round(g,black,side*.80,.985,-2.29,.16,.51,.09,.025);
    strip(g,M.head,side*.65,1.115,-2.341,.22,.04,.025);
    strip(g,M.head,side*.80,1.155,-2.348,.07,.058,.022);
    for(const y of [.81,.895,.98])strip(g,M.head,side*.80,y,-2.348,.052,.068,.022);
    strip(g,M.head,side*.80,.765,-2.348,.073,.038,.022);
    hazard(g,side*.855,.91,-2.351,.021,.26,.02);
    round(g,black,side*.93,.85,-2.19,.105,.36,.15,.025);
    for(const y of [.76,.82,.88,.94])box(g,M.darkAlloy,side*.93,y,-2.277,.065,.014,.018);
  }
  round(g,black,0,.53,-2.30,1.98,.35,.26,.055);
  round(g,M.darkAlloy,0,.52,-2.447,.85,.18,.04,.025);
  for(const side of [-1,1]) {
    round(g,black,side*.51,.51,-2.458,.18,.50,.16,.025);
    box(g,M.darkAlloy,side*.51,.69,-2.552,.13,.032,.02);
    round(g,M.darkAlloy,side*.83,.57,-2.455,.17,.12,.025,.015);
    strip(g,M.head,side*.83,.58,-2.474,.09,.052,.018);
  }
  for(const x of [-.25,0,.25])box(g,paint,x,.325,-2.443,.13,.08,.08);
  badge(g,'03T',0,.53,-2.477,.53,.12);
  panel(g,glazing,[[-.77,1.30,2.032],[-.74,1.76,2.035],[.74,1.76,2.035],[.77,1.30,2.032]]);
  round(g,black,0,.43,2.24,1.90,.25,.17,.04);
  round(g,paint,0,1.11,2.29,.94,.86,.27,.065);
  round(g,black,0,1.11,2.444,.82,.73,.055,.045);
  box(g,M.darkAlloy,0,1.11,2.48,.70,.59,.025);badge(g,'iCAR',0,1.11,2.50,.43,.14);
  for(const side of [-1,1]) {
    round(g,black,side*.78,1.0,2.24,.15,.53,.07,.025);
    for(const y of [.84,.94,1.04,1.14])g.userData.brakeLights.push(strip(g,red,side*.78,y,2.283,.055,.071,.025));
    hazard(g,side*.84,.97,2.285,.025,.27,.025);
  }
  wheels(g,-1.40,1.40,.98,.405);return g;
}

export function createSedan({color,braking=false}={}) {
  const g=new THREE.Group();g.name=braking?'braking sedan':'traffic sedan';
  const paint=color===undefined?M.champagne:mat(color,.56,.29);
  const brake=mat('#bc1427',.08,.23,{emissive:'#ff1830',emissiveIntensity:braking?3.6:.35});brake.userData.base=.35;
  g.userData.brakeLights=[];g.userData.paint=paint;
  round(g,paint,0,.56,0,1.83,.55,4.56,.18);
  loft([{z:-1.18,w:.74,b:.67,t:.73,r:.4},{z:-.52,w:.71,b:.72,t:1.36,r:.46},
    {z:.65,w:.72,b:.72,t:1.37,r:.47},{z:1.35,w:.73,b:.68,t:.77,r:.4}],M.glass,g);
  round(g,paint,0,1.39,.07,1.23,.07,1.05,.05);
  for(const side of [-1,1]) {
    box(g,paint,side*.72,1.04,.18,.06,.59,.11);
    g.userData.brakeLights.push(strip(g,brake,side*.64,.75,2.28,.48,.12,.07));
    strip(g,M.head,side*.63,.64,-2.26,.46,.07,.06);
    hazard(g,side*.83,.62,-2.25,.12,.06,.06);hazard(g,side*.66,.635,2.285,.36,.045,.05);
  }
  g.userData.brakeLights.push(strip(g,brake,0,.76,2.29,.46,.035,.055));
  round(g,M.black,0,.32,2.27,1.65,.13,.1,.04);
  wheels(g,-1.42,1.39,.84,.32);return g;
}

// Heavy trucks. Static parts are merged per material, so a whole rig costs a handful of draw calls;
// only the wheels, brake lamps and indicators stay separate because the scene animates them.
const unitBox=boxGeo.toNonIndexed(),unitQuad=new THREE.PlaneGeometry(1,1).toNonIndexed();
const unitRod=new THREE.CylinderGeometry(.5,.5,1,8).toNonIndexed();
// Open fender shell arching over the top of a wheel, axis along x.
const unitArc=new THREE.CylinderGeometry(.5,.5,1,8,1,true,.42,2.3).rotateZ(Math.PI/2).toNonIndexed();
const partMatrix=new THREE.Matrix4(),partQuat=new THREE.Quaternion(),partEuler=new THREE.Euler(),partPos=new THREE.Vector3();
const partScale=new THREE.Vector3(),partColor=new THREE.Color(),upAxis=new THREE.Vector3(0,1,0),rigs=new Map();
const TRUCK={
  skin:mat('#dde2e1',.3,.42), post:mat('#c2c9cb',.8,.3), deck:mat('#a2a9aa',.45,.55),
  dark:mat('#1a1f24',.35,.62), grey:mat('#4b535a',.4,.45), glass:mat('#17252e',.72,.08),
  mirror:mat('#a9bcc6',.95,.05), lens:mat('#e8e4da',.2,.15),
  rim:mat('#c9cdca',.6,.32,{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4}),
  fender:mat('#15181b',.1,.72,{side:THREE.DoubleSide}),
  marker:mat('#d88a18',.2,.3,{emissive:'#ff8d00',emissiveIntensity:1.3}),
  // Tape, panel seams and hoses are vertex-coloured; the offset keeps flush decals from z-fighting.
  decal:mat('#ffffff',.12,.34,{vertexColors:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4}),
};
const TAPE=['#d0121c','#f1f3f1'],SEAM='#737b7c',GAP='#20262a';

function merge(list) {
  const position=[],normal=[],color=[];
  for(const [x,y,z,w,h,d,unit,rx,ry,rz,tint] of list) {
    partMatrix.compose(partPos.set(x,y,z),partQuat.setFromEuler(partEuler.set(rx,ry,rz)),partScale.set(w,h,d));
    const part=unit.clone().applyMatrix4(partMatrix),count=part.attributes.position.count;
    position.push(...part.attributes.position.array);normal.push(...part.attributes.normal.array);
    if(tint){partColor.set(tint);for(let i=0;i<count;i++)color.push(partColor.r,partColor.g,partColor.b);}
    part.dispose();
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
  if(color.length)geometry.setAttribute('color',new THREE.Float32BufferAttribute(color,3));
  return geometry;
}
// Collects parts per material; build() merges each set into one mesh, cached per rig so pooled copies share buffers.
function kit() {
  const sets=new Map();
  const put=(material,unit,x,y,z,w,h,d,rx=0,ry=0,rz=0,tint)=>{
    if(!sets.has(material))sets.set(material,[]);sets.get(material).push([x,y,z,w,h,d,unit,rx,ry,rz,tint]);
  };
  return {
    box:(material,x,y,z,w,h,d,rx,ry,rz)=>put(material,unitBox,x,y,z,w,h,d,rx,ry,rz),
    rod:(material,x,y,z,w,h,d,rx,ry,rz)=>put(material,unitRod,x,y,z,w,h,d,rx,ry,rz),
    arc:(material,x,y,z,w,r)=>put(material,unitArc,x,y,z,w,r*2,r*2),
    plane:(material,x,y,z,w,h,rx,ry)=>put(material,unitQuad,x,y,z,w,h,1,rx,ry),
    quad:(tint,x,y,z,w,h,rx,ry)=>put(TRUCK.decal,unitQuad,x,y,z,w,h,1,rx,ry,0,tint),
    shape:(material,geometry)=>put(material,geometry,0,0,0,1,1,1),
    link(material,a,b,r,tint) {
      const dir=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),len=dir.length();
      partEuler.setFromQuaternion(partQuat.setFromUnitVectors(upAxis,dir.normalize()));
      put(material,unitBox,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,r*2,len,r*2,partEuler.x,partEuler.y,partEuler.z,tint);
    },
    build(parent,name) {
      const cached=rigs.get(name)??[],meshes=new Map();let i=0;
      for(const [material,list] of sets){cached[i]??=merge(list);meshes.set(material,mesh(cached[i++],material,parent));}
      rigs.set(name,cached);return meshes;
    },
  };
}
// Flat-shaded shell through sections [z, half width, bottom, top, top-corner chamfer], listed front to back.
function hull(sections) {
  const rings=sections.map(([z,w,b,t,c])=>[[-w,b],[-w,t-c],[c-w,t],[w-c,t],[w,t-c],[w,b]].map(([x,y])=>new THREE.Vector3(x,y,z)));
  const points=[],last=rings.length-1;
  for(let j=0;j<last;j++)for(let i=0;i<6;i++) {
    const a=rings[j][i],b=rings[j][(i+1)%6],c=rings[j+1][i],d=rings[j+1][(i+1)%6];points.push(a,c,b,b,c,d);
  }
  for(let i=1;i<5;i++)points.push(rings[0][0],rings[0][i],rings[0][i+1],rings[last][0],rings[last][i+1],rings[last][i]);
  const geometry=new THREE.BufferGeometry().setFromPoints(points);geometry.computeVertexNormals();return geometry;
}
// Alternating red/white retroreflective tape (车身反光贴) from a to b, on a face turned by ry (0 rear, ±π/2 sides).
function tape(k,a,b,n,ry,size=.08) {
  const vertical=Math.abs(b[1]-a[1])>.01,len=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])/n;
  for(let i=0;i<n;i++) {
    const t=(i+.5)/n;
    k.quad(TAPE[i%2],a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t,vertical?size:len,vertical?len:size,0,ry);
  }
}
// hazard() with a plain box instead of the rounded extrusion, which costs far more triangles at truck lamp sizes.
function blinker(parent,x,y,z,w,h,d) {
  const light=hazard(parent,x,y,z,w,h,d);light.geometry.dispose();light.geometry=boxGeo;light.scale.set(w,h,d);return light;
}
const decals=new Map(),decalGeo=new THREE.PlaneGeometry(1,1);
// Enlarged rear number painted across the doors (fictional, not a plate); skipped without a DOM like badge().
function decal(parent,text,x,y,z,w,h) {
  if(typeof document==='undefined')return;
  let material=decals.get(text);
  if(!material) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.fillStyle='#15191c';ctx.font='900 150px "Arial Black",Impact,"Helvetica Neue",Arial,sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,84,500);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    material=new THREE.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,roughness:.55,metalness:.1,
      polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4});
    decals.set(text,material);
  }
  const m=mesh(decalGeo,material,parent,x,y,z);m.scale.set(w,h,1);m.castShadow=false;return m;
}
const truckTyre=new THREE.CylinderGeometry(.52,.52,.27,12).rotateZ(Math.PI/2);
// A dual pair is one drum pinched at the middle: it reads as two tyres for fewer triangles.
const dualTyre=new THREE.CylinderGeometry(.52,.52,.56,12,2).rotateZ(Math.PI/2);
for(let i=0,p=dualTyre.attributes.position;i<p.count;i++)if(Math.abs(p.getX(i))<1e-4)p.setXYZ(i,0,p.getY(i)*.9,p.getZ(i)*.9);
// Steel disc just proud of the tyre wall (its material is offset so it never z-fights) and a hexagonal hub.
const truckRim=merge([[.004,0,0,1,1,1,new THREE.CircleGeometry(.33,12).rotateY(Math.PI/2).toNonIndexed(),0,0,0],
  [.035,0,0,1,1,1,new THREE.CylinderGeometry(.15,0,.07,6).rotateZ(Math.PI/2).toNonIndexed(),0,0,0]]);
// 0.52 m wheels roll as groups; a dual pair shares one tyre mesh and the steel disc faces outward.
function truckWheels(parent,axles) {
  const result=[];
  for(const [z,x,dual] of axles)for(const side of [-1,1]) {
    const wheel=new THREE.Group();wheel.position.set(side*x,.52,z);parent.add(wheel);
    mesh(dual?dualTyre:truckTyre,M.rubber,wheel);
    mesh(truckRim,TRUCK.rim,wheel,side*(dual?.28:.135),0,0).rotation.y=side<0?Math.PI:0;
    result.push(wheel);
  }
  parent.userData.wheels=result;
}
// Flat-faced cab-over (平头) cab with a raked windscreen; its roof fairing (导流罩) tops out just under the 3.9 m box.
function truckCab(g,k,paint,{front,back,half:hw,roof:t,top,axle,sleeper}) {
  const zf=front+.08,b=1.12,sill=2.08,rake=.2,dark=TRUCK.dark;
  k.shape(paint,hull([[zf,hw,b,sill,.05],[zf+rake,hw,b,t-.08,.1],[zf+.34,hw,b,t,.14],[back,hw,b,t,.14]]));
  k.shape(paint,hull([[zf+.36,hw-.1,t-.16,t+.02,.02],[zf+.8,hw-.06,t-.16,top-.2,.12],
    [zf+1.2,hw-.02,t-.16,top-.03,.15],[back,hw,t-.16,top,.15]]));
  const tilt=Math.atan2(rake,t-.08-sill),glass=Math.hypot(rake,t-.08-sill)-.14;
  k.plane(TRUCK.glass,0,(sill+t-.08)/2+.012*Math.sin(tilt),zf+rake/2-.012*Math.cos(tilt),2*hw-.32,glass,tilt,Math.PI);
  k.box(dark,0,t-.03,zf+.1,2*hw-.24,.04,.28,.1);
  for(const x of [-.6,-.3,0,.3,.6])k.box(TRUCK.marker,x,t-.045,zf-.045,.09,.03,.02);
  // Grille, badge and a tall bumper carrying the headlamps, as on most Chinese heavy trucks.
  k.box(dark,0,1.58,zf-.012,2*hw-.66,.64,.03);
  for(const y of [1.38,1.53,1.68,1.83])k.box(M.alloy,0,y,zf-.03,2*hw-.74,.035,.02);
  for(const y of [1.24,1.93])k.box(M.alloy,0,y,zf-.02,2*hw-.6,.045,.04);
  k.box(dark,0,1.605,zf-.05,.58,.15,.02);badge(g,'TIANLU',0,1.605,zf-.07,.5,.17);
  k.box(TRUCK.grey,0,.8,front+.1,2*hw+.02,.62,.18);k.box(dark,0,.51,front+.03,2*hw-.2,.08,.05);
  k.box(dark,0,.78,(zf+back)/2,1.1,.6,back-zf-.6);k.box(dark,0,.52,axle,1.8,.12,.14);
  for(const s of [-1,1]) {
    k.box(dark,s*(hw-.4),.92,front+.025,.6,.2,.04);k.box(M.head,s*(hw-.46),.93,front+.004,.4,.1,.008);
    blinker(g,s*(hw-.17),.93,front+.006,.1,.1,.01);k.box(TRUCK.lens,s*(hw-.42),.64,front+.006,.18,.07,.012);
    const x=s*(hw+.003),ry=s*Math.PI/2;
    k.plane(TRUCK.glass,x,(2.18+t-.25)/2,zf+.74,.84,t-2.43,0,ry);
    if(sleeper)k.plane(TRUCK.glass,x,2.66,back-.42,.34,.4,0,ry);
    k.quad(GAP,x,(1.2+t-.24)/2,zf+1.34,.016,t-1.44,0,ry);k.quad(GAP,x,(1.2+sill)/2,zf+.18,.016,sill-1.2,0,ry);
    k.box(dark,s*(hw+.01),2.02,zf+1.2,.02,.04,.16);blinker(g,s*(hw+.006),1.7,zf+.42,.012,.07,.2);
    // Main and wide-angle mirrors hang on a tubular arm off the A-pillar.
    k.link(dark,[s*(hw-.02),2.92,zf+.32],[s*(hw+.2),3.0,zf+.22],.018);k.link(dark,[s*(hw-.02),2.2,zf+.36],[s*(hw+.2),2.12,zf+.22],.018);
    k.link(dark,[s*(hw+.2),3.0,zf+.22],[s*(hw+.2),2.12,zf+.22],.016);
    for(const [y,h] of [[2.62,.44],[2.22,.2]]) {k.box(dark,s*(hw+.22),y,zf+.2,.2,h,.07);k.box(TRUCK.mirror,s*(hw+.22),y,zf+.237,.16,h-.04,.006);}
    const step=axle+.7;
    for(const y of [.5,.86])k.box(dark,s*(hw-.13),y,step,.26,.045,.32);
    for(const dz of [-.17,.17])k.box(dark,s*(hw-.02),.72,step+dz,.03,.56,.025);
    k.arc(TRUCK.fender,s*1.02,.52,axle,.4,.6);
  }
}
// Van body: ribbed aluminium sides, a flat deck flush at y 3.9, red/white tape, marker lamps and rear swing doors.
function cargoBox(g,k,red,{from:z0,to:z1,half:hw,ribs,beam,under,number}) {
  const len=z1-z0,F=z1-.01,D=z1-.046,dark=TRUCK.dark,post=TRUCK.post;
  k.box(TRUCK.skin,0,2.57,(z0+.02+D)/2,2*hw-.06,2.54,D-z0-.02);
  k.box(dark,0,1.26,(z0+z1)/2,2*hw-.08,.08,len-.2);
  k.box(TRUCK.deck,0,3.87,(z0+.1+z1-.116)/2,2*hw-.08,.06,len-.216);
  for(let z=z0+.7;z<z1-.4;z+=.6)k.quad(SEAM,0,3.9,z,2*hw-.08,.025,-Math.PI/2);
  for(const [y,h] of [[3.82,.16],[1.32,.2]]) {
    k.box(post,0,y,z0+.05,2*hw-.008,h,.1);k.box(post,0,y,z1-.063,2*hw-.008,h,.106);
    for(const s of [-1,1])k.box(post,s*(hw-.022),y,(z0+F)/2,.036,h,F-z0);
  }
  for(let z=under;z<z1-.2;z+=ribs*1.5)k.box(dark,0,1.17,z,2*hw-.12,.1,.08);
  for(const s of [-1,1]) {
    k.box(post,s*(hw-.03),2.58,z0+.05,.052,2.32,.1);k.box(post,s*(hw-.045),2.58,z1-.063,.082,2.32,.106);
    for(let z=z0+ribs;z<z1-ribs*.6;z+=ribs)k.box(post,s*(hw-.019),2.58,z,.022,2.32,.07);
    k.box(dark,s*.5,1.22-beam/2,(under+z1-.3)/2,.13,beam,z1-.3-under);
    const side=s*(hw-.003),ry=s*Math.PI/2;
    tape(k,[side,1.32,z0+.12],[side,1.32,z1-.14],Math.round((len-.26)/.5),ry);
    tape(k,[side,3.82,z1-1.06],[side,3.82,z1-.14],2,ry);tape(k,[side,3.72,z1-.063],[side,2.92,z1-.063],2,ry,.07);
    for(let z=z0+1;z<z1-.8;z+=3)k.box(TRUCK.marker,s*(hw-.03),1.17,z,.03,.1,.11);
    k.box(TRUCK.marker,s*(hw-.16),3.82,z0-.006,.12,.06,.012);k.box(red,s*(hw-.045),3.66,z1-.005,.06,.1,.01);
    // Rear outline tape on the door frame.
    tape(k,[s*(hw-.045),1.45,F+.001],[s*(hw-.045),3.56,F+.001],5,0,.07);
    for(const y of [1.62,2.25,2.95,3.5])k.box(dark,s*(hw-.16),y,z1-.031,.17,.07,.03);
  }
  for(const y of [3.84,1.32])tape(k,[.12-hw,y,F+.001],[hw-.12,y,F+.001],6,0);
  // Two swing doors: shut line, four lock rods with cams, guides and handles, and the painted number.
  k.quad(GAP,0,2.58,D+.001,.018,2.32);
  for(const x of [-.86,-.3,.3,.86]) {
    k.box(post,x,2.58,z1-.028,.03,2.22,.03);
    for(const y of [1.5,3.66])k.box(dark,x,y,z1-.031,.075,.07,.03);
    k.box(post,x+Math.sign(x)*.11,2.15,z1-.025,.24,.035,.026);
  }
  decal(g,number,0,2.92,D+.002,1.8,.56);
}
// Rear chassis: low combination lamps, the underride guard (后防护) and its tape.
function rearEnd(g,k,red,{at:z1,half:hw}) {
  const dark=TRUCK.dark;
  k.box(dark,0,1.1,z1-.26,2*hw-.3,.2,.12);k.box(TRUCK.post,0,.51,z1-.15,2*hw-.3,.16,.1);
  tape(k,[.18-hw,.51,z1-.099],[hw-.18,.51,z1-.099],7,0,.1);
  for(const s of [-1,1]) {
    k.box(dark,s*(hw-.33),1.0,z1-.22,.06,.2,.1);k.box(dark,s*(hw-.33),.93,z1-.16,.58,.18,.08);
    g.userData.brakeLights.push(box(g,red,s*(hw-.31),.93,z1-.114,.22,.11,.012));
    k.box(TRUCK.lens,s*(hw-.52),.93,z1-.114,.12,.11,.012);blinker(g,s*(hw-.12),.93,z1-.114,.1,.11,.012);
    k.box(dark,s*.62,.8,z1-.2,.08,.42,.08);
  }
}

export function createTruck() {
  const g=new THREE.Group();g.name='9.6 m cab-over box truck';
  const paint=mat('#b5252c',.5,.3),red=tail(g),k=kit(),dark=TRUCK.dark;g.userData.paint=paint;
  // 12.0 m overall (z -6..6). The 9.6 m van body spans z -3.6..6 and x ±1.25, with its flat deck at y 3.9.
  truckCab(g,k,paint,{front:-6,back:-3.74,half:1.21,roof:3.12,top:3.82,axle:-4.75});
  cargoBox(g,k,red,{from:-3.6,to:6,half:1.25,ribs:.6,beam:.2,under:-3.3,number:'G2026'});
  rearEnd(g,k,red,{at:6,half:1.25});
  for(const s of [-1,1]) {
    k.box(dark,s*.48,.87,-.05,.1,.28,11.3);k.box(paint,s*1.225,2.8,-3.68,.03,1.8,.16);
    for(const y of [.52,.82])k.box(TRUCK.post,s*1.21,y,-1.3,.04,.08,4.9);
    for(const z of [-3.7,-1.3,1.1])k.box(dark,s*1.17,.72,z,.04,.5,.05);
    for(const z of [1.9,3.25])k.arc(TRUCK.fender,s*.92,.52,z,.62,.58);
    k.box(TRUCK.fender,s*.92,1.09,2.575,.62,.02,1.35);
    k.box(M.rubber,s*.92,.64,3.9,.5,.88,.02);
  }
  k.rod(M.alloy,-.92,.68,-2.5,.56,1,.56,Math.PI/2);
  k.box(dark,.9,.72,-2.6,.5,.44,.6);
  for(const s of [-1,1])k.rod(TRUCK.grey,s*.72,.74,.1,.26,1,.26,Math.PI/2);
  for(const z of [1.9,3.25])k.box(dark,0,.52,z,1.6,.14,.14);
  truckWheels(g,[[-4.75,1.02,false],[1.9,.92,true],[3.25,.92,true]]);
  k.build(g,'truck');return g;
}

export function createSemi() {
  const g=new THREE.Group();g.name='cab-over tractor with box semi-trailer';
  const paint=mat('#1f4f8f',.5,.3),red=tail(g),k=kit(),dark=TRUCK.dark;g.userData.paint=paint;
  // 16.5 m overall (z -8.25..8.25). The 12.95 m trailer spans z -4.7..8.25 and x ±1.275, with its flat deck at y 3.9.
  truckCab(g,k,paint,{front:-8.25,back:-5.85,half:1.24,roof:3.3,top:3.84,axle:-7,sleeper:true});
  cargoBox(g,k,red,{from:-4.7,to:8.25,half:1.275,ribs:.8,beam:.34,under:-2,number:'G1688'});
  rearEnd(g,k,red,{at:8.25,half:1.275});
  // Tractor: fifth wheel and air lines in the open gap, snorkel, tanks and drive-axle fenders.
  k.box(TRUCK.grey,0,1.165,-3.5,1.3,.07,1.1);k.box(dark,0,1.06,-3.5,.95,.14,.7);k.box(M.alloy,0,1.1,-5.35,1,.03,.8);
  k.rod(dark,.95,2.25,-5.7,.2,1.9,.2);k.box(dark,.95,3.22,-5.7,.26,.12,.26);
  for(const [x,tint] of [[-.25,'#b3271e'],[.25,'#d1a21f'],[0,'#1b1f22']]) {
    k.link(TRUCK.decal,[x,2.05,-5.84],[x*1.4,1.62,-5.3],.022,tint);k.link(TRUCK.decal,[x*1.4,1.62,-5.3],[x*1.6,1.5,-4.69],.022,tint);
  }
  k.rod(M.alloy,-.95,.7,-5.15,.6,1.3,.6,Math.PI/2);
  k.box(dark,.92,.74,-5.45,.5,.45,.6);k.rod(TRUCK.grey,.92,.66,-4.75,.3,.6,.3,Math.PI/2);
  // Trailer: landing gear (支腿) with its cross shaft and crank, side guards and a tri-axle bogie.
  k.box(dark,0,1,-1.4,1.9,.05,.05);k.box(dark,-1.1,.98,-1.4,.16,.03,.03);
  for(const s of [-1,1]) {
    k.box(dark,s*.45,.87,-4.8,.1,.28,6.5);k.box(paint,s*1.25,2.7,-5.665,.03,2,.41);
    for(const z of [-3.85,-2.5])k.arc(TRUCK.fender,s*.92,.52,z,.62,.58);
    k.box(TRUCK.fender,s*.92,1.09,-3.175,.62,.02,1.35);
    k.box(M.rubber,s*.92,.64,-1.86,.5,.88,.02);
    k.box(dark,s*.95,.93,-1.4,.13,.54,.13);k.box(TRUCK.grey,s*.95,.48,-1.4,.09,.42,.09);k.box(dark,s*.95,.27,-1.4,.28,.06,.32);
    k.link(dark,[s*.95,.8,-1.4],[s*.5,1,-.3],.025);
    for(const y of [.52,.82])k.box(TRUCK.post,s*1.235,y,1.35,.04,.08,4.5);
    for(const z of [-.8,1.35,3.5])k.box(dark,s*1.2,.72,z,.04,.5,.05);
    for(const z of [4.25,5.56,6.87])k.arc(TRUCK.fender,s*.95,.52,z,.62,.58);
    k.box(TRUCK.fender,s*.95,1.09,5.56,.62,.02,2.62);
    k.box(M.rubber,s*.95,.64,7.52,.5,.88,.02);
  }
  for(const z of [-3.85,-2.5,4.25,5.56,6.87])k.box(dark,0,.52,z,1.6,.14,.14);
  truckWheels(g,[[-7,1.02,false],[-3.85,.92,true],[-2.5,.92,true],[4.25,.95,true],[5.56,.95,true],[6.87,.95,true]]);
  k.build(g,'semi');return g;
}

export function createBattery() {
  const g=new THREE.Group(); g.name='detached EV battery';
  round(g,M.battery,0,.165,0,1.8,.30,1.8,.06);
  box(g,M.black,0,.3225,0,1.68,.035,1.66);
  for(const x of [-.61,-.31,0,.31,.61]) box(g,M.darkAlloy,x,.338,0,.06,.024,1.47);
  for(const s of [-1,1]) {box(g,M.alloy,s*.86,.21,0,.08,.13,1.32);box(g,M.blue,s*.4,.20,.878,.23,.075,.035);}
  return g;
}

// Folding warning triangle: reflective red frame with a fluorescent inner band on a wire stand, face toward +Z.
export function createTriangle() {
  const g=new THREE.Group(); g.name='warning triangle';
  const side=.45,band=.06,depth=.014,tall=side*Math.sqrt(3)/2,inradius=side/(2*Math.sqrt(3));
  const outline=inset=>{const s=(inradius-inset)/inradius;return [[-side/2,0],[side/2,0],[0,tall]].map(([x,y])=>new THREE.Vector2(x*s,inradius+(y-inradius)*s));};
  const ring=(outer,inner)=>{const shape=new THREE.Shape(outline(outer));shape.holes.push(new THREE.Path(outline(inner)));return shape;};
  const red=mat('#e3202c',.1,.32,{emissive:'#ff1a12',emissiveIntensity:.75});
  const glow=mat('#ff6a3a',0,.5,{emissive:'#ff3d1a',emissiveIntensity:.45});
  // Leaning back a little shows the face to the raised chase camera.
  const plate=new THREE.Group(); plate.position.y=.045; plate.rotation.x=-.1; g.add(plate);
  mesh(new THREE.ExtrudeGeometry(ring(0,band),{depth,bevelEnabled:false}).translate(0,0,-depth/2),red,plate);
  mesh(new THREE.ShapeGeometry(ring(band*.55,band)),glow,plate,0,0,depth/2+.002);
  edge(g,M.darkAlloy,[-.2,.012,0],[.2,.012,0],.006);
  for(const s of [-1,1]) {
    edge(g,M.darkAlloy,[s*.19,.008,-.16],[s*.19,.008,.07],.006);
    edge(g,M.darkAlloy,[s*.12,.012,0],[s*.12,.05,0],.005);
    box(g,M.rubber,s*.19,.01,-.16,.03,.02,.04);
  }
  return g;
}
