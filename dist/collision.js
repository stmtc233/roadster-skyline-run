// Oriented cab/cargo footprints in simulation coordinates: +z is forward.
// Shared scratch objects stay outside game state, so prediction copies remain independent.
const TRUCK=[{width:2.42,length:2.26,offset:4.87,height:3.82,deck:true},{width:2.5,length:9.6,offset:-1.2,height:3.9,deck:true}];
const SEMI=[{width:2.48,length:2.4,offset:7.05,height:3.84,deck:true},{width:1.9,length:1.15,offset:5.275,height:1.35,deck:false},{width:2.55,length:12.95,offset:-1.775,height:3.9,deck:true}];
const A={},B={},CONTACT={nx:0,nz:0,depth:0,x:0,z:0};
const parts=o=>o.model==='truck'?TRUCK:o.model==='semi'?SEMI:null;
export const bodyYaw=o=>(o.yaw||0)-(o.model==='player'||o.mode==='crashed'||o.mode==='veering'?0:(o.vx||0)*.045);
export function extentX(o){const y=bodyYaw(o);return Math.abs(Math.cos(y))*o.width/2+Math.abs(Math.sin(y))*o.length/2;}
export function extentZ(o){const y=bodyYaw(o);return Math.abs(Math.sin(y))*o.width/2+Math.abs(Math.cos(y))*o.length/2;}
function shape(o,part,out) {
  const p=parts(o)?.[part]||o,y=bodyYaw(o),s=Math.sin(y),c=Math.cos(y),offset=p.offset||0,player=o.model==='player';
  out.x=o.x-s*offset;out.z=o.z+c*offset;out.c=c;out.s=s;
  out.w=p.width/2-(player?.09:.05);out.l=p.length/2-(player?.095:.025);out.height=p.height;out.deck=p.deck;
}
function separated(a,b,nx,nz,dx,dz) {
  const ra=a.w*Math.abs(a.c*nx+a.s*nz)+a.l*Math.abs(-a.s*nx+a.c*nz);
  const rb=b.w*Math.abs(b.c*nx+b.s*nz)+b.l*Math.abs(-b.s*nx+b.c*nz);
  const distance=dx*nx+dz*nz,depth=ra+rb-Math.abs(distance);
  if(depth<=0)return true;
  if(depth<CONTACT.depth){const sign=distance<0?-1:1;CONTACT.depth=depth;CONTACT.nx=nx*sign;CONTACT.nz=nz*sign;}
  return false;
}
function touch(a,b) {
  const dx=b.x-a.x,dz=b.z-a.z;CONTACT.depth=Infinity;
  return !(separated(a,b,a.c,a.s,dx,dz)||separated(a,b,-a.s,a.c,dx,dz)||separated(a,b,b.c,b.s,dx,dz)||separated(a,b,-b.s,b.c,dx,dz));
}
// The returned contact is borrowed until the next collision query.
export function collisionContact(a,b) {
  if(!a.deck&&!b.deck&&!bodyYaw(a)&&!bodyYaw(b)){
    const dx=b.x-a.x,dz=b.z-a.z,player=a.model==='player'||b.model==='player';
    const px=(a.width+b.width)/2-(player?.14:.1)-Math.abs(dx),pz=(a.length+b.length)/2-(player?.12:.05)-Math.abs(dz);
    if(px<=0||pz<=0)return null;
    CONTACT.depth=Math.min(px,pz);CONTACT.nx=px<pz?(dx<0?-1:1):0;CONTACT.nz=px<pz?0:(dz<0?-1:1);
    CONTACT.x=(a.x+b.x)/2;CONTACT.z=(a.z+b.z)/2;return CONTACT;
  }
  const radius=(a.length+b.length+a.width+b.width)/2;
  if(Math.abs(a.z-b.z)>radius||Math.abs(a.x-b.x)>radius)return null;
  for(let i=0;i<(parts(a)?.length||1);i++)for(let j=0;j<(parts(b)?.length||1);j++){
    shape(a,i,A);shape(b,j,B);
    if(touch(A,B)){CONTACT.x=(A.x+B.x)/2;CONTACT.z=(A.z+B.z)/2;return CONTACT;}
  }
  return null;
}
export function collisionHeight(a,b) {
  if(!b.deck)return collisionContact(a,b)?b.height||0:0;
  if(Math.abs(a.z-b.z)>(a.length+b.length+b.width)/2)return 0;
  let height=0;
  for(let i=0;i<(parts(a)?.length||1);i++)for(let j=0;j<(parts(b)?.length||1);j++){
    shape(a,i,A);shape(b,j,B);if(touch(A,B))height=Math.max(height,B.height||0);
  }
  return height;
}
export function roofHeight(player,car,altitude) {
  if(Math.abs(player.z-car.z)>(player.length+car.length+car.width)/2)return 0;
  let height=0;
  shape(player,0,A);
  for(let j=0;j<(parts(car)?.length||1);j++){
    shape(car,j,B);if(B.deck&&altitude+.1>=B.height&&touch(A,B))height=Math.max(height,B.height);
  }
  return height;
}

const inverseMass=o=>o.poleHitAt>=0&&o.speed===0?0:1/o.mass;
// A low restitution impulse conserves momentum along the contact normal; crush/friction dissipate energy.
export function resolveImpact(a,b,contact) {
  const {nx,nz,depth,x,z}=contact,ia=inverseMass(a),ib=inverseMass(b),sum=ia+ib;
  if(!sum)return 0;
  const avx=a.vx||0,bvx=b.vx||0,dx=avx-bvx,dz=a.speed-b.speed,closing=dx*nx+dz*nz;
  const severity=Math.hypot(dx,dz),impulse=Math.max(0,closing)*1.08/sum;
  const tx=-nz,tz=nx,tangent=Math.max(-impulse*.22,Math.min(impulse*.22,(dx*tx+dz*tz)/sum));
  const jx=nx*impulse+tx*tangent,jz=nz*impulse+tz*tangent,loss=closing>1?Math.min(.12,closing/300):0;
  a.vx=(avx-jx*ia)*(1-loss);b.vx=(bvx+jx*ib)*(1-loss);
  a.speed=Math.max(0,(a.speed-jz*ia)*(1-loss));b.speed=Math.max(0,(b.speed+jz*ib)*(1-loss));
  const inertiaA=a.mass*(a.width*a.width+a.length*a.length)/12,inertiaB=b.mass*(b.width*b.width+b.length*b.length)/12;
  const torqueA=((x-a.x)*jz-(z-a.z)*jx)*.2,torqueB=((x-b.x)*jz-(z-b.z)*jx)*.2;
  a.spin=(a.spin||0)-torqueA/inertiaA;b.spin=(b.spin||0)+torqueB/inertiaB;
  a.spin=Math.max(-1.2,Math.min(1.2,a.spin));b.spin=Math.max(-1.2,Math.min(1.2,b.spin));
  // Resolve the shallow contact along its normal instead of moving a side-swipe behind the whole truck.
  const correction=depth+.002;
  a.x-=nx*correction*ia/sum;a.z-=nz*correction*ia/sum;
  b.x+=nx*correction*ib/sum;b.z+=nz*correction*ib/sum;
  return severity;
}
