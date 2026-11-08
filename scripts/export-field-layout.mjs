// Export real grass/tree geometry and source photos for a native asset layout
// diagnostic. This is not a browser screenshot, full lighting or phone QA.
import fs from 'node:fs';import path from 'node:path';
import * as THREE from '../dist/vendor/three.module.js';
import {localAssets} from './local-assets.mjs';
import {makeWorld} from '../dist/world.js';
import {createWorldData,SPAWN,heightAt} from '../dist/core.js';
const folder=path.resolve(process.argv[2]);fs.mkdirSync(folder,{recursive:true});
const {assets,surfaces}=await localAssets(),data=createWorldData(),scene=new THREE.Scene(),world=makeWorld(scene,data,surfaces,'medium',assets),textures=new Map(),records=[];
function texture(map){
 if(!map)return null;if(textures.has(map.uuid))return textures.get(map.uuid);
 const c=document.createElement('canvas');c.width=map.image.width;c.height=map.image.height;c.getContext('2d').drawImage(map.image,0,0);
 const file=`texture-${textures.size}.png`;fs.writeFileSync(path.join(folder,file),c.toBuffer('image/png'));const value={file,flipY:map.flipY};textures.set(map.uuid,value);return value;
}
const layouts=[{aspect:.6,x:SPAWN.x,z:SPAWN.z,yaw:0},{aspect:16/9,x:SPAWN.x,z:SPAWN.z,yaw:-.5}];
for(const [slot,layout] of layouts.entries()){
 const camera=new THREE.PerspectiveCamera(75,layout.aspect,.08,1000);camera.position.set(layout.x,heightAt(layout.x,layout.z)+1.72,layout.z);camera.rotation.order='YXZ';camera.rotation.set(-.08,layout.yaw,0);camera.updateMatrixWorld(true);world.nature.setQuality('medium');world.update(slot+1,camera);scene.updateMatrixWorld(true);
 const item={slot,aspect:layout.aspect,projection:new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).toArray(),parts:[]};
 scene.traverse(o=>{
  if(!o.isMesh||o.material.isShaderMaterial||!o.visible)return;
  const g=o.geometry,m=o.material,p=g.attributes.position,n=g.attributes.normal,map=m.map,uv=g.getAttribute(map?.channel?'uv'+map.channel:'uv'),instances=o.isInstancedMesh?o.count:g.attributes.aOffset?g.instanceCount:1;if(!instances)return;
  const source=g.index?g.index.array:Uint32Array.from({length:p.count},(_,i)=>i),vertex=new Float32Array(instances*p.count*8),indices=new Uint32Array(instances*source.length),transform=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3(),v=new THREE.Vector3(),normal=new THREE.Vector3(),tex=new THREE.Vector2();
  for(let k=0;k<instances;k++){
   transform.copy(o.matrixWorld);if(o.isInstancedMesh){const instance=new THREE.Matrix4();o.getMatrixAt(k,instance);transform.multiply(instance);}normalMatrix.getNormalMatrix(transform);if(map)map.updateMatrix();
   for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i);normal.fromBufferAttribute(n,i);tex.set(uv?uv.getX(i):0,uv?uv.getY(i):0);
    if(g.attributes.aOffset){const a=g.attributes,scale=new THREE.Vector3(a.aScale.getX(k),a.aScale.getY(k),a.aScale.getZ(k)),angle=a.aAngle.getX(k);v.multiply(scale).applyAxisAngle(new THREE.Vector3(0,1,0),angle).add(new THREE.Vector3(a.aOffset.getX(k),a.aOffset.getY(k),a.aOffset.getZ(k)));normal.divide(scale).normalize().applyAxisAngle(new THREE.Vector3(0,1,0),angle);}
    v.applyMatrix4(transform);normal.applyNormalMatrix(normalMatrix);if(map)tex.applyMatrix3(map.matrix);
    if(g.attributes.aFrame)tex.set((tex.x+g.attributes.aFrame.getX(k))/8,1-tex.y);
    if(o===world.terrain)tex.set(v.x*.5,v.z*.5);
    vertex.set([v.x,v.y,v.z,normal.x,normal.y,normal.z,tex.x,tex.y],(k*p.count+i)*8);
   }
   for(let i=0;i<source.length;i++)indices[k*source.length+i]=source[i]+k*p.count;
  }
  const id=`${slot}-${item.parts.length}`,vfile=id+'-vertices.bin',ifile=id+'-indices.bin';fs.writeFileSync(path.join(folder,vfile),Buffer.from(vertex.buffer));fs.writeFileSync(path.join(folder,ifile),Buffer.from(indices.buffer));
  const photo=o===world.terrain?surfaces.grass:map;item.parts.push({name:o.name||m.name,vertices:vfile,indices:ifile,count:indices.length,color:m.color?.toArray()||[1,1,1],texture:texture(photo),alphaTest:m.alphaTest||0});
 });records.push(item);
 console.log('Asset layout',slot,'grass near',world.nature.grassBatches.flat().reduce((n,m)=>n+m.count,0),'mid',world.grass.userData.coverage.count,'3D woodland',world.nature.woodlandBatches.map(b=>b[0].count));
}
fs.writeFileSync(path.join(folder,'layout.json'),JSON.stringify(records));
