import * as THREE from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Stripped chassis: open frame, exposed axles, burned wheels, no solid cabin panels.
export const VEHICLE_WRECK_DELAY=1.15;
export function makeVehicleWreck(model){
  const group=new THREE.Group();group.name='burned-black-empty-chassis';const pieces=[],metal=new THREE.MeshStandardMaterial({name:'charred-black-steel',color:'#1e211e',metalness:.24,roughness:.98}),rubber=new THREE.MeshStandardMaterial({name:'burned-black-rubber',color:'#10120f',roughness:1});
  const part=(g,x,y,z,rx=0,ry=0,rz=0)=>{g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1)));pieces.push(g.toNonIndexed());};
  const beam=(x,y,z,w,h,d)=>part(new THREE.BoxGeometry(w,h,d),x,y,z);
  const bar=(a,b,r=.028)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),d=end.clone().sub(start),g=new THREE.CylinderGeometry(r,r,d.length(),7);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));part(g,...start.add(end).multiplyScalar(.5).toArray());};
  for(const x of [-.69,.69]){beam(x,.37,0,.11,.16,3.55);bar([x,.48,-.65],[x,1.53,-.55]);bar([x,1.53,-.55],[x,1.48,.73]);bar([x,1.48,.73],[x,.47,1.32]);}
  for(const z of [-1.65,-1.10,-.2,.64,1.63])beam(0,.37,z,1.5,.11,.095);
  for(const z of [-.55,.73])bar([-.69,1.50,z],[.69,1.50,z]);
  for(const z of [-1.34,1.08]){bar([-.91,.415,z],[.91,.415,z],.065);part(new THREE.SphereGeometry(.12,8,5),0,.415,z);}
  beam(0,.49,.18,1.35,.055,2.3);beam(0,.57,-1.12,.74,.25,.66);bar([-.65,.55,-.56],[.65,.55,-.56],.025);
  for(const x of [-.39,.36]){beam(x,.66,.35,.42,.055,.43);bar([x-.2,.65,.52],[x-.2,1.12,.58],.022);bar([x+.2,.65,.52],[x+.2,1.12,.58],.022);bar([x-.2,1.12,.58],[x+.2,1.12,.58],.022);}
  const chassis=new THREE.Mesh(mergeGeometries(pieces,false),metal);chassis.name='exposed-frame-and-axles';chassis.castShadow=chassis.receiveShadow=true;group.add(chassis);pieces.forEach(g=>g.dispose());
  model.traverse(o=>{if(o.name.startsWith('wheel-')){const wheel=o.clone(true);wheel.traverse(m=>{if(m.isMesh){m.material=rubber;m.castShadow=m.receiveShadow=true;}});group.add(wheel);}});group.visible=false;return group;
}
