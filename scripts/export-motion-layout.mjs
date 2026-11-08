// Native mesh and billboard inspection only; no browser/device screenshot.
import fs from 'node:fs';import path from 'node:path';import * as THREE from '../dist/vendor/three.module.js';
import {localAssets} from './local-assets.mjs';import {SwimView,swimViewFov} from '../dist/swim-view.js';import {weaponViewFov} from '../dist/weapons.js';
import {VehicleFleet} from '../dist/vehicle-physics.js';import {makeVehicleViews} from '../dist/vehicles.js';import {VehicleTrails} from '../dist/vehicle-trails.js';
import {BattleEffects} from '../dist/effects.js';
const dir=path.resolve(process.argv[2]);fs.mkdirSync(dir,{recursive:true});const {assets}=await localAssets(),swim=new SwimView(assets.hands,assets.swimArms),records=[],textures=new Map();
function texture(map){if(!map)return null;if(textures.has(map.uuid))return textures.get(map.uuid);const c=document.createElement('canvas');c.width=map.image.width;c.height=map.image.height;c.getContext('2d').drawImage(map.image,0,0);const file='texture-'+textures.size+'.png';fs.writeFileSync(path.join(dir,file),c.toBuffer('image/png'));const value={file,flipY:map.flipY};textures.set(map.uuid,value);return value;}
function snapshot(label,root,camera){
  root.updateMatrixWorld(true);camera.updateMatrixWorld(true);const item={aspect:camera.aspect,slot:label,projection:camera.projectionMatrix.toArray(),parts:[]};
  root.traverseVisible(o=>{
    if(!o.isMesh&&!o.isSprite)return;let g;
    if(o.isSprite){g=new THREE.PlaneGeometry(1,1);const rotation=camera.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),o.material.rotation));g.applyMatrix4(new THREE.Matrix4().compose(o.getWorldPosition(new THREE.Vector3()),rotation,o.getWorldScale(new THREE.Vector3())));g.applyMatrix4(camera.matrixWorldInverse);}
    else{g=o.geometry.clone();if(o.isSkinnedMesh){o.skeleton.update();const p=g.attributes.position;for(let i=0;i<p.count;i++){const v=new THREE.Vector3();o.getVertexPosition(i,v);p.setXYZ(i,v.x,v.y,v.z);}g.computeVertexNormals();}g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse,o.matrixWorld));}
    const a=g.attributes,vertices=new Float32Array(a.position.count*8);for(let i=0;i<a.position.count;i++)vertices.set([a.position.getX(i),a.position.getY(i),a.position.getZ(i),a.normal.getX(i),a.normal.getY(i),a.normal.getZ(i),a.uv?.getX(i)||0,a.uv?.getY(i)||0],i*8);
    const materials=Array.isArray(o.material)?o.material:[o.material],groups=Array.isArray(o.material)?g.groups:[{start:0,count:g.index?.count||a.position.count,materialIndex:0}];
    for(const part of groups){const mat=materials[part.materialIndex],indices=g.index?Uint32Array.from(g.index.array.slice(part.start,part.start+part.count)):Uint32Array.from({length:part.count},(_,i)=>part.start+i),id=records.length+'-'+item.parts.length,vfile=id+'-vertices.bin',ifile=id+'-indices.bin';fs.writeFileSync(path.join(dir,vfile),Buffer.from(vertices.buffer));fs.writeFileSync(path.join(dir,ifile),Buffer.from(indices.buffer));item.parts.push({name:o.name,vertices:vfile,indices:ifile,count:indices.length,color:mat.color.toArray(),texture:texture(mat.map),alphaTest:mat.alphaTest||0,opacity:mat.opacity});}g.dispose();
  });item.parts.sort((a,b)=>(a.opacity<1)-(b.opacity<1));records.push(item);
}
swim.group.visible=true;
for(const aspect of [.6,16/9])for(const phase of [0,.25,.5,.75]){
  swim.pose(phase,aspect,1);snapshot('swim-'+phase,swim.group,new THREE.PerspectiveCamera(swimViewFov(aspect),aspect,.02,5));
}
const scene=new THREE.Scene(),fleet=new VehicleFleet({terrain:()=>10,spawns:[{x:0,z:0,yaw:0}]}),views=makeVehicleViews(assets,fleet),fx=new VehicleTrails(scene,null,{terrain:()=>10,capacity:16});scene.add(views.group);fleet.driverId=0;const car=fleet.current;
const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,80),new THREE.MeshStandardMaterial({color:'#627052',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=9.99;scene.add(floor);
for(const moving of [false,true]){
  fx.reset(fleet);car.z=0;car.speed=moving?8:0;car.throttle=moving?1:0;for(let i=0;i<120;i++){if(moving)car.z-=8/60;fx.update(1/60,fleet);}views.update(0);
  const camera=new THREE.PerspectiveCamera(74,16/9,.05,200);camera.position.set(2.4,car.y+2.7,car.z+6);camera.lookAt(car.x,car.y+1.1,car.z);snapshot(moving?'driving-exhaust':'idle-exhaust',scene,camera);
}
if(process.argv.includes('--destruction')){
  fx.reset(fleet);fleet.destroy(car);const effects=new BattleEffects(scene,{explosion(){},casing(){}},{mobile:true});effects.explosion({x:car.x,y:car.y+.82,z:car.z},{vehicle:true});let time=0;
  for(const at of [.12,.70,1.40,6.50,22.50]){
    while(time<at){const dt=Math.min(1/60,at-time);time+=dt;car.wreckAge=time;effects.vehicleWrecks(dt,[car]);effects.update(dt);}views.update(0);
    const camera=new THREE.PerspectiveCamera(70,16/9,.05,200);camera.position.set(3.7,car.y+3.3,car.z+6.5);camera.lookAt(car.x,car.y+1.5,car.z);snapshot('vehicle-fire-'+at,scene,camera);
  }effects.clear();
}
fs.writeFileSync(path.join(dir,'layout.json'),JSON.stringify(records));console.log(`Exported ${records.length} actual gloved swimming, exhaust and optional vehicle destruction geometry views.`);
