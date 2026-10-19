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

export function createMPV() {
  const g=new THREE.Group(); g.name='V800 gold and black MPV';
  const gold=mat('#c8b98b',.72,.25), paint=mat('#111b23',.68,.21);
  const glazing=mat('#16232e',.48,.13,{side:THREE.DoubleSide});
  const trim=mat('#d6d2bc',.87,.19,{side:THREE.DoubleSide});
  const arch=mat('#11171b',.2,.5,{side:THREE.DoubleSide});
  // 5.495 m body, 2.006 m beam, 1.85 m roof: low nose and long sliding-door cabin.
  loft([{z:-2.7475,w:.84,b:.23,t:1.03,r:.58},{z:-2.56,w:.976,b:.21,t:1.12,r:.64},
    {z:-1.87,w:1.003,b:.20,t:1.19,r:.70},{z:.5,w:1.003,b:.20,t:1.20,r:.72},
    {z:2.40,w:.966,b:.22,t:1.20,r:.67},{z:2.7475,w:.87,b:.27,t:1.16,r:.62}],paint,g);
  loft([{z:-2.69,w:.82,b:1.015,t:1.055,r:.60},{z:-2.43,w:.94,b:1.07,t:1.14,r:.68},
    {z:-1.93,w:.93,b:1.14,t:1.205,r:.66}],gold,g);
  cabin(g,gold,[{z:-1.99,w:.925,b:1.17,t:1.23,r:.79},{z:-.87,w:.91,b:1.17,t:1.81,r:.79},
    {z:-.49,w:.92,b:1.17,t:1.85,r:.80},{z:1.75,w:.92,b:1.17,t:1.84,r:.80},
    {z:2.42,w:.90,b:1.17,t:1.76,r:.77},{z:2.64,w:.87,b:1.17,t:1.65,r:.74}]);
  const windshield=[[-.85,1.25,-2.01],[.85,1.25,-2.01],[.77,1.805,-.92],[-.77,1.805,-.92]];
  panel(g,glazing,windshield);
  // Slim gold roof rails and the polished surround follow the actual window slope.
  for(const side of [-1,1]) {
    const windows=[
      [[.918,1.25,-1.84],[.828,1.745,-.87],[.828,1.765,-.48],[.925,1.25,-.48]],
      [[.925,1.25,-.40],[.828,1.765,-.40],[.828,1.758,1.17],[.925,1.25,1.17]],
      [[.925,1.25,1.25],[.828,1.758,1.25],[.819,1.68,2.28],[.900,1.25,2.45]]
    ];
    for(const points of windows) panel(g,glazing,points.map(([x,y,z])=>[side*x,y,z]));
    const outline=[[side*.918,1.235,-1.90],[side*.835,1.773,-.88],
      [side*.834,1.788,1.75],[side*.82,1.708,2.32],[side*.905,1.235,2.48],[side*.918,1.235,-1.90]];
    for(let i=0;i<outline.length-1;i++)edge(g,trim,outline[i],outline[i+1],.012);
    strip(g,trim,side*1.008,.36,.15,.018,.024,4.54);
    strip(g,M.black,side*1.008,.965,.95,.008,.012,2.03); // sliding rail
    for(const z of [-.43,1.26])edge(g,M.black,[side*1.006,.44,z],[side*1.006,1.16,z],.006);
    for(const z of [-.62,-.22]) {
      round(g,M.black,side*1.01,1.03,z,.018,.078,.35,.012);
      strip(g,trim,side*1.026,1.046,z,.018,.026,.31);
    }
    round(g,gold,side*1.074,1.25,-1.35,.26,.15,.34,.05);
    strip(g,trim,side*1.13,1.22,-1.36,.15,.025,.26);
    hazard(g,side*1.137,1.226,-1.36,.16,.028,.27);
    for(const z of [-1.77,1.68])wheelArch(g,arch,side,z,.415);
  }
  // A smooth closed face replaces the old full-height grille.
  round(g,paint,0,.82,-2.718,1.56,.44,.065,.045);
  const jewel=mesh(new THREE.OctahedronGeometry(.105,0),trim,g,0,.87,-2.764);
  jewel.scale.set(.46,1.35,.20);
  edge(g,trim,[0,.735,-2.788],[0,1.005,-2.788],.005);
  for(const side of [-1,1]) {
    strip(g,M.black,side*.68,1.085,-2.692,.47,.09,.09);
    strip(g,M.head,side*.68,1.105,-2.742,.44,.026,.025);
    round(g,trim,side*.866,.875,-2.677,.14,.39,.08,.035);
    round(g,M.black,side*.866,.879,-2.727,.108,.35,.035,.025);
    for(const y of [.77,.87,.97])round(g,M.head,side*.867,y,-2.75,.047,.063,.018,.012);
    hazard(g,side*.889,.87,-2.758,.022,.30,.018);
    round(g,M.black,side*.64,.375,-2.70,.43,.14,.07,.025);
    strip(g,M.head,side*.64,.39,-2.747,.34,.022,.025);
    strip(g,trim,side*.64,.32,-2.746,.44,.023,.025);
  }
  box(g,M.black,0,.35,-2.733,.77,.21,.045);
  for(const x of [-.30,-.15,0,.15,.30])box(g,M.darkAlloy,x,.35,-2.761,.018,.17,.018);
  strip(g,trim,0,.25,-2.73,1.7,.023,.035);
  round(g,M.black,0,.56,-2.759,.50,.15,.02,.008);badge(g,'V800',0,.56,-2.774,.42,.13);
  panel(g,glazing,[[-.78,1.27,2.66],[-.70,1.65,2.65],[.70,1.65,2.65],[.78,1.27,2.66]]);
  strip(g,gold,0,1.76,2.40,1.64,.055,.31);
  for(const side of [-1,1]) {
    strip(g,M.black,side*.817,1.02,2.69,.16,.60,.05);
    strip(g,M.red,side*.817,1.04,2.722,.058,.53,.03);
    hazard(g,side*.86,.81,2.724,.045,.15,.03);
  }
  strip(g,M.red,0,1.29,2.694,1.60,.024,.035);
  strip(g,trim,0,.37,2.72,1.68,.028,.025);badge(g,'V800',0,.87,2.741,.44,.13);
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
  return g;
}

export function createSUV() {
  const g=new THREE.Group();g.name='iCAR 03T red and black SUV';
  const paint=mat('#d52332',.47,.27), black=mat('#111a20',.35,.34);
  const glazing=mat('#182932',.48,.17,{side:THREE.DoubleSide});
  const arch=mat('#182127',.20,.51,{side:THREE.DoubleSide});
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
    for(const y of [.84,.94,1.04,1.14])strip(g,M.red,side*.78,y,2.283,.055,.071,.025);
    hazard(g,side*.84,.97,2.285,.025,.27,.025);
  }
  wheels(g,-1.40,1.40,.98,.405);return g;
}

export function createSedan({color,braking=false}={}) {
  const g=new THREE.Group();g.name=braking?'braking sedan':'traffic sedan';
  const paint=color===undefined?M.champagne:mat(color,.56,.29);
  const brake=mat('#bc1427',.08,.23,{emissive:'#ff1830',emissiveIntensity:braking?3.6:.35});
  g.userData.brakeLights=[];
  round(g,paint,0,.56,0,1.83,.55,4.56,.18);
  loft([{z:-1.18,w:.74,b:.67,t:.73,r:.4},{z:-.52,w:.71,b:.72,t:1.36,r:.46},
    {z:.65,w:.72,b:.72,t:1.37,r:.47},{z:1.35,w:.73,b:.68,t:.77,r:.4}],M.glass,g);
  round(g,paint,0,1.39,.07,1.23,.07,1.05,.05);
  for(const side of [-1,1]) {
    box(g,paint,side*.72,1.04,.18,.06,.59,.11);
    g.userData.brakeLights.push(strip(g,brake,side*.64,.75,2.28,.48,.12,.07));
    strip(g,M.head,side*.63,.64,-2.26,.46,.07,.06);
  }
  g.userData.brakeLights.push(strip(g,brake,0,.76,2.29,.46,.035,.055));
  round(g,M.black,0,.32,2.27,1.65,.13,.1,.04);
  wheels(g,-1.42,1.39,.84,.32);return g;
}

export function createBattery() {
  const g=new THREE.Group(); g.name='detached EV battery';
  round(g,M.battery,0,.165,0,1.8,.30,1.8,.06);
  box(g,M.black,0,.3225,0,1.68,.035,1.66);
  for(const x of [-.61,-.31,0,.31,.61]) box(g,M.darkAlloy,x,.338,0,.06,.024,1.47);
  for(const s of [-1,1]) {box(g,M.alloy,s*.86,.21,0,.08,.13,1.32);box(g,M.blue,s*.4,.20,.878,.23,.075,.035);}
  return g;
}
