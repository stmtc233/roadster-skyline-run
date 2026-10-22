import * as THREE from 'three';
import {POLE} from './game.js';

// Fixed-size batches: no per-frame meshes, materials, textures or particle allocations.
export function createRoadside(scene) {
  const transform=new THREE.Object3D(),poleCount=44,particleLimit=440;
  function batch(name,geometry,material,count) {
    const mesh=new THREE.InstancedMesh(geometry,material,count);
    mesh.name=name;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);return mesh;
  }
  const metal=new THREE.MeshStandardMaterial({color:'#aebbc3',metalness:.65,roughness:.4});
  const housing=new THREE.MeshStandardMaterial({color:'#48565f',metalness:.55,roughness:.4});
  const poles=batch('roadside streetlight posts',new THREE.CylinderGeometry(.09,POLE.radius,7.5,8),metal,poleCount);
  const arms=batch('streetlight arms',new THREE.BoxGeometry(1.4,.11,.11),metal,poleCount);
  const lamps=batch('streetlight housings',new THREE.BoxGeometry(.6,.18,1.05),housing,poleCount);
  const lenses=batch('streetlight illuminated lenses',new THREE.BoxGeometry(.46,.025,.88),new THREE.MeshBasicMaterial({color:'#fff0ba',toneMapped:false}),poleCount);
  const flameGeo=new THREE.ConeGeometry(.5,1,7,1,true);
  const flames=batch('accident flames',flameGeo,new THREE.MeshBasicMaterial({color:'#ff6515',transparent:true,opacity:.86,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}),particleLimit);
  const cores=batch('accident flame cores',flameGeo,new THREE.MeshBasicMaterial({color:'#ffe49a',transparent:true,opacity:.94,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}),particleLimit);
  const smoke=batch('accident smoke',new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:'#34383a',roughness:1,transparent:true,opacity:.34,depthWrite:false}),particleLimit);
  flames.count=cores.count=smoke.count=0;
  const batches=[poles,arms,lamps,lenses,flames,cores,smoke];
  function put(mesh,index,x,y,z,sx=1,sy=1,sz=1,rz=0,ry=0) {
    transform.position.set(x,y,z);transform.rotation.set(0,ry,rz);transform.scale.set(sx,sy,sz);transform.updateMatrix();mesh.setMatrixAt(index,transform.matrix);
  }
  function update(state) {
    const travel=state.travel||0,time=state.clock||0,first=Math.floor((travel-160)/POLE.spacing);
    const cars=state.traffic||[];
    for(let i=0;i<poleCount;i++) {
      const side=i%2?1:-1,world=(first+Math.floor(i/2))*POLE.spacing,z=travel-world;
      let lean=0;
      for(const c of cars)if(c.poleHitAt>=0&&c.lane===side&&c.poleWorldZ===world){const age=time-c.poleHitAt;lean=-side*(.025+Math.sin(age*23)*.035*Math.exp(-age*3));break;}
      const x=side*POLE.x,sin=Math.sin(lean),cos=Math.cos(lean);
      put(poles,i,x-Math.sin(lean)*3.75,3.75,z,1,1,1,lean);
      // A single inward-facing arm puts each illuminated lamp above the road edge.
      put(arms,i,x-side*.65*cos-7.4*sin,7.4*cos-side*.65*sin,z,1,1,1,lean);
      put(lamps,i,x-side*1.3*cos-7.4*sin,7.4*cos-side*1.3*sin,z,1,1,1,lean);
      put(lenses,i,x-side*1.3*cos-7.295*sin,7.295*cos-side*1.3*sin,z,1,1,1,lean);
    }
    let fireCount=0,smokeCount=0;
    for(const c of cars) {
      if(c.fireAt<0)continue;
      const age=time-c.fireAt,sin=Math.sin(c.yaw),cos=Math.cos(c.yaw);
      // Broad overlapping flames engulf the hood and cabin; smoke rises above the fire.
      const hoodX=c.x-sin*1.75,hoodZ=-c.z-cos*1.75;
      if(c.fire>0)for(let k=0;k<40&&fireCount<particleLimit;k++) {
        const seed=c.id*1.37+k*2.39,life=(age*2.1+k*.137)%1;
        const size=(.4+(1-life)*.6)*c.fire,height=(1.8+Math.abs(Math.sin(seed+time*13))*3)*size;
        const localX=Math.sin(seed)*1.05,localZ=-.6+Math.cos(seed*1.7)*1.7;
        const x=c.x+cos*localX+sin*localZ+Math.sin(time*9+seed)*.15,z=-c.z-sin*localX+cos*localZ;
        const y=.65+life*1.8*c.fire+height*.5,tilt=Math.sin(time*12+seed)*.22;
        put(flames,fireCount,x,y,z,.85*size,height,.85*size,tilt);
        put(cores,fireCount,x,y-height*.12,z,.48*size,height*.75,.48*size,tilt);fireCount++;
      }
      if(c.smoke>0)for(let k=0;k<24&&smokeCount<particleLimit;k++) {
        const life=(age*.24+k/24)%1,seed=k*2.41+c.id,fade=Math.min(1,life*8)*(1-life),size=(.35+life*1.6)*c.smoke*fade;
        const x=hoodX+life*1.6+Math.sin(seed+age)*.35,z=hoodZ+Math.cos(seed)*.45+life*.5;
        put(smoke,smokeCount++,x,2.8+life*9*c.smoke,z,size*1.2,size*1.4,size*1.2,seed,time*.1);
      }
    }
    flames.count=cores.count=fireCount;smoke.count=smokeCount;
    for(const mesh of batches)mesh.instanceMatrix.needsUpdate=true;
  }
  return {update};
}
