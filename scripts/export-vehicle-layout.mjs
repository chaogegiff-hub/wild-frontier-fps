// Export actual vehicle and posed driver meshes for the native asset viewer.
// This checks geometry placement only, not the game's PBR lighting or browser GPU.
import fs from 'node:fs';import path from 'node:path';
import * as THREE from '../dist/vendor/three.module.js';
import {localAssets} from './local-assets.mjs';
import {Match,createWorldData} from '../dist/core.js';
import {makeVehicleViews} from '../dist/vehicles.js';
if(!process.argv[2])throw new Error('Pass a scratch output directory');
const output=path.resolve(process.argv[2]);fs.mkdirSync(output,{recursive:true});
const {assets}=await localAssets(),fleet=new Match(createWorldData()).fleet,views=makeVehicleViews(assets,fleet),textures=new Map(),records=[];
const car=fleet.cars[0];Object.assign(car,{x:0,y:0,z:0,yaw:0,pitch:0,roll:0});
function texture(map){
  if(!map)return null;if(textures.has(map.uuid))return textures.get(map.uuid);
  const c=document.createElement('canvas');c.width=map.image.width;c.height=map.image.height;c.getContext('2d').drawImage(map.image,0,0);
  const file=`texture-${textures.size}.png`;fs.writeFileSync(path.join(output,file),c.toBuffer('image/png'));const result={file,flipY:map.flipY};textures.set(map.uuid,result);return result;
}
for(const [label,occupied,eye,target] of [
  ['parked-front',false,[4,3,-5],[0,.8,0]],
  ['driver-front',true,[-3,2.7,-3.8],[-.25,1,0]],
  ['driver-rear',true,[2.3,3.3,5],[0,1,0]],
  ['driver-side',true,[-4.8,2.4,.3],[-.3,1,.1]]
]){
  fleet.driverId=occupied?car.id:null;views.update(0);const root=views.items[0].root;root.updateMatrixWorld(true);
  const camera=new THREE.PerspectiveCamera(50,16/9,.02,100);camera.position.fromArray(eye);camera.lookAt(...target);camera.updateMatrixWorld(true);
  const item={aspect:16/9,slot:label,projection:camera.projectionMatrix.toArray(),parts:[]};
  root.traverseVisible(o=>{
    if(!o.isMesh)return;if(o.isSkinnedMesh)o.skeleton.update();
    const g=o.geometry.clone(),p=g.attributes.position;
    if(o.isSkinnedMesh){for(let i=0;i<p.count;i++){const v=new THREE.Vector3();o.getVertexPosition(i,v);p.setXYZ(i,v.x,v.y,v.z);}g.computeVertexNormals();}
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse,o.matrixWorld));const n=g.attributes.normal,uv=g.attributes.uv,vertex=new Float32Array(p.count*8);
    for(let i=0;i<p.count;i++)vertex.set([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i),uv?uv.getX(i):0,uv?uv.getY(i):0],i*8);
    const id=`${records.length}-${item.parts.length}`,vfile=id+'-vertices.bin',ifile=id+'-indices.bin',indices=g.index?new Uint32Array(g.index.array):Uint32Array.from({length:p.count},(_,i)=>i);
    fs.writeFileSync(path.join(output,vfile),Buffer.from(vertex.buffer));fs.writeFileSync(path.join(output,ifile),Buffer.from(indices.buffer));
    const m=o.material;item.parts.push({name:o.name,vertices:vfile,indices:ifile,count:indices.length,color:m.color.toArray(),texture:texture(m.map),alphaTest:m.transparent ? .05 : (m.alphaTest||0)});g.dispose();
  });records.push(item);
}
fs.writeFileSync(path.join(output,'layout.json'),JSON.stringify(records));console.log(`Exported ${records.length} real vehicle/driver asset views.`);
