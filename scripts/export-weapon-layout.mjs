// Export posed, skinned geometry for an asset-only native GLES layout check.
// This is not a browser screenshot or device performance measurement.
import fs from 'node:fs';import path from 'node:path';
import * as THREE from '../dist/vendor/three.module.js';
import {localAssets} from './local-assets.mjs';
import {createViewModels,weaponViewFov,weaponViewPosition} from '../dist/weapons.js';
import {WEAPONS,zoomFov} from '../dist/core.js';
import {AimOverlay} from '../dist/aim-overlay.js';
const output=path.resolve(process.argv[2]);fs.mkdirSync(output,{recursive:true});
const aiming=process.argv.includes('--aim');
const {assets,surfaces}=await localAssets(),views=createViewModels(assets,surfaces),textures=new Map(),records=[];
function texture(map){
  if(!map)return null;if(textures.has(map.uuid))return textures.get(map.uuid);
  const c=document.createElement('canvas');c.width=map.image.width;c.height=map.image.height;c.getContext('2d').drawImage(map.image,0,0);
  const file=`texture-${textures.size}.png`;fs.writeFileSync(path.join(output,file),c.toBuffer('image/png'));const result={file,flipY:map.flipY};textures.set(map.uuid,result);return result;
}
for(const aspect of [.6,16/9])for(const slot of aiming?[1,2]:[0,1,2]){
  const root=views.roots[slot];root.position.copy(aiming?root.userData.aimPose.position:weaponViewPosition(aspect));if(aiming)root.quaternion.copy(root.userData.aimPose.quaternion);root.updateMatrixWorld(true);
  const camera=new THREE.PerspectiveCamera(weaponViewFov(aspect),aspect,.02,5);camera.updateMatrixWorld(true);
  const item={aspect,slot,aiming,projection:camera.projectionMatrix.toArray(),parts:[]};
  if(aiming){const canvas=document.createElement('canvas'),width=aspect<1?480:800,height=aspect<1?800:450;new AimOverlay(canvas).update({active:true,mode:WEAPONS[slot].id,fov:zoomFov(75,WEAPONS[slot].zoom),width,height});item.overlay=`reticle-${records.length}.png`;fs.writeFileSync(path.join(output,item.overlay),canvas.toBuffer('image/png'));}
  root.traverse(o=>{
    if(!o.isMesh)return;if(o.isSkinnedMesh)o.skeleton.update();
    const g=o.geometry.clone(),p=g.attributes.position;
    if(o.isSkinnedMesh){for(let i=0;i<p.count;i++){const v=new THREE.Vector3();o.getVertexPosition(i,v);p.setXYZ(i,v.x,v.y,v.z);}g.computeVertexNormals();}
    g.applyMatrix4(o.matrixWorld);const n=g.attributes.normal,uv=g.attributes.uv,vertex=new Float32Array(p.count*8);
    for(let i=0;i<p.count;i++)vertex.set([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i),uv?uv.getX(i):0,uv?uv.getY(i):0],i*8);
    const id=`${records.length}-${item.parts.length}`,vfile=id+'-vertices.bin',ifile=id+'-indices.bin';
    const indices=g.index?new Uint32Array(g.index.array):Uint32Array.from({length:p.count},(_,i)=>i);fs.writeFileSync(path.join(output,vfile),Buffer.from(vertex.buffer));fs.writeFileSync(path.join(output,ifile),Buffer.from(indices.buffer));
    const m=o.material;item.parts.push({name:o.name,vertices:vfile,indices:ifile,count:indices.length,color:m.color.toArray(),texture:texture(m.map),alphaTest:m.alphaTest||0,skinned:o.isSkinnedMesh,doubleSided:m.side===THREE.DoubleSide});
  });records.push(item);
}
fs.writeFileSync(path.join(output,'layout.json'),JSON.stringify(records));console.log(`Exported actual posed weapon and FPS-hand geometry for ${records.length} ${aiming?'aimed':'hip'} view layouts.`);
