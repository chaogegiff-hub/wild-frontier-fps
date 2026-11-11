// Pose actual game meshes for the existing native GLES layout renderer.
// This is an asset inspection, not browser gameplay or phone footage.
import fs from 'node:fs';import path from 'node:path';
import * as THREE from '../dist/vendor/three.module.js';
import {localAssets} from './local-assets.mjs';import {createEnemyModel} from '../dist/weapons.js';import {bulletHit} from '../dist/bullet-hit.js';
const output=path.resolve(process.argv[2]);fs.mkdirSync(output,{recursive:true});const {assets,surfaces}=await localAssets(),textures=new Map(),records=[];
function texture(map){if(!map)return null;if(textures.has(map.uuid))return textures.get(map.uuid);const c=document.createElement('canvas');c.width=map.image.width;c.height=map.image.height;c.getContext('2d').drawImage(map.image,0,0);const file=`texture-${textures.size}.png`;fs.writeFileSync(path.join(output,file),c.toBuffer('image/png'));const result={file,flipY:map.flipY};textures.set(map.uuid,result);return result;}
for(const [id,label,direction,headshot]of [[0,'front torso',{x:0,y:0,z:-1},false],[2,'side head',{x:1,y:0,z:0},true]]){
 const actor=createEnemyModel(id,assets,surfaces),scene=new THREE.Group();scene.add(actor);const floor=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshBasicMaterial({color:0x89928c,side:THREE.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.position.y=-.025;scene.add(floor);for(let i=0;i<60;i++)actor.userData.animate(1/60,{walk:0,sees:true,weaponReady:1},{groundAt:()=>0});const hit=bulletHit({x:0,y:0,z:0,yaw:0},{point:{x:0,y:headshot?1.96:1.35,z:0},direction,headshot,damage:200});
 let age=0;for(const time of [0,.1,.65,2.6]){
  while(age<time-1e-8){actor.userData.fall(1/120,()=>0,undefined,[],hit);age+=1/120;}
  const camera=new THREE.PerspectiveCamera(44,16/9,.05,30);camera.position.set(3,1.5,3);camera.lookAt(0,.75,0);camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);const item={aspect:16/9,slot:`${label} / ${time.toFixed(2)}s / model QA`,projection:camera.projectionMatrix.toArray(),parts:[]};
  scene.traverse(o=>{
   if(!o.isMesh||!o.visible)return;if(o.isSkinnedMesh)o.skeleton.update();const g=o.geometry.clone(),p=g.attributes.position;
   if(o.isSkinnedMesh){for(let i=0;i<p.count;i++){const v=new THREE.Vector3();o.getVertexPosition(i,v);p.setXYZ(i,v.x,v.y,v.z);}g.computeVertexNormals();}g.applyMatrix4(camera.matrixWorldInverse.clone().multiply(o.matrixWorld));const n=g.attributes.normal,uv=g.attributes.uv,vertex=new Float32Array(p.count*8);for(let i=0;i<p.count;i++)vertex.set([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i),uv?uv.getX(i):0,uv?uv.getY(i):0],i*8);
   const key=`${records.length}-${item.parts.length}`,vfile=key+'-vertices.bin',ifile=key+'-indices.bin',indices=g.index?new Uint32Array(g.index.array):Uint32Array.from({length:p.count},(_,i)=>i);fs.writeFileSync(path.join(output,vfile),Buffer.from(vertex.buffer));fs.writeFileSync(path.join(output,ifile),Buffer.from(indices.buffer));const m=o.material;if(Array.isArray(m))throw new Error('Split multimaterial geometry before export');item.parts.push({name:o.name,vertices:vfile,indices:ifile,count:indices.length,color:m.color.toArray(),texture:texture(m.map),alphaTest:m.alphaTest||0,doubleSided:m.side===THREE.DoubleSide});g.dispose();
  });records.push(item);
 }
}
fs.writeFileSync(path.join(output,'layout.json'),JSON.stringify(records));console.log(`Exported ${records.length} actual skinned collapse snapshots; native model QA only.`);
