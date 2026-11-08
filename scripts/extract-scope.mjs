import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../dist/vendor/three.module.js';
import {localModel} from './local-assets.mjs';
import {mergeVertices} from '../dist/vendor/BufferGeometryUtils.js';
import {MeshoptSimplifier} from './vendor/meshopt_simplifier.module.js';

// Extract the original CC0 modeled scope, so the M700 need not load another gun.
// The bounded region is above the original rifle's receiver and excludes its stock.
const source=await localModel('../source-assets/legacy/models/sniper.glb');source.scene.updateMatrixWorld(true);
const selection=[],box=new THREE.Box3();
source.scene.traverse(o=>{
  if(!o.isMesh)return;
  const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld),p=geometry.attributes.position,n=geometry.attributes.normal,indices=geometry.index?.array;
  const positions=[],normals=[];
  for(let i=0;i<(indices?.length||p.count);i+=3){
    const ids=[0,1,2].map(j=>indices?indices[i+j]:i+j),v=ids.map(k=>new THREE.Vector3().fromBufferAttribute(p,k));
    if(!v.every(a=>a.y>=.295&&a.z>=-.55&&a.z<=-.10))continue;
    for(let j=0;j<3;j++){box.expandByPoint(v[j]);positions.push(...v[j].toArray());normals.push(n.getX(ids[j]),n.getY(ids[j]),n.getZ(ids[j]));}
  }
  if(positions.length)selection.push({name:`scope_${o.material.name}`,positions,normals,material:o.material});
  geometry.dispose();
});
if(!selection.length)throw new Error('Scope region empty.');
const center=box.getCenter(new THREE.Vector3());center.y=box.min.y;
const g={asset:{version:'2.0',generator:'CC0 standalone scope extraction'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[],images:[],extras:{source:'https://3dassets.dev/assets/mega-weapon-pack-bolt-sniper-chassis-scoped-891e227c',license:'CC0-1.0',unit:'meter',axis:'+Z',baseAtY:0}};
let offset=0,triangles=0;const chunks=[];
await MeshoptSimplifier.ready;
function accessor(array,type,itemSize){
  const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=g.bufferViews.length;g.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,target:type==='SCALAR'?34963:34962});
  const a={bufferView:view,componentType:array instanceof Uint32Array?5125:5126,count:array.length/itemSize,type};
  if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.count;i++)for(let c=0;c<3;c++){a.min[c]=Math.min(a.min[c],array[i*3+c]);a.max[c]=Math.max(a.max[c],array[i*3+c]);}}
  const id=g.accessors.length;g.accessors.push(a);chunks.push(data);offset+=data.length;return id;
}
for(const part of selection){
  const p=new Float32Array(part.positions),n=new Float32Array(part.normals),uv=new Float32Array(p.length/3*2);
  for(let i=0;i<p.length;i+=3){p[i]-=center.x;p[i+1]-=center.y;p[i+2]-=center.z;uv[i/3*2]=Math.atan2(p[i+1]-.052,p[i])/(Math.PI*2)+.5;uv[i/3*2+1]=p[i+2]*8;}
  const raw=new THREE.BufferGeometry();raw.setAttribute('position',new THREE.BufferAttribute(p,3));raw.setAttribute('normal',new THREE.BufferAttribute(n,3));raw.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  const welded=mergeVertices(raw,1e-6),indices=new Uint32Array(welded.index.array),positions=welded.attributes.position.array;
  const budget={alloyDark:1800,steelBright:600,glass:192,emberRed:40}[part.material.name]||500;
  const [reduced]=MeshoptSimplifier.simplify(indices,positions,3,Math.min(indices.length,budget*3),.006);
  const [remap,count]=MeshoptSimplifier.compactMesh(reduced),attributes={};
  for(const [from,to] of [['position','POSITION'],['normal','NORMAL'],['uv','TEXCOORD_0']]){
    const a=welded.attributes[from],compact=new Float32Array(count*a.itemSize);
    for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)compact.set(a.array.subarray(i*a.itemSize,(i+1)*a.itemSize),remap[i]*a.itemSize);
    attributes[to]=accessor(compact,a.itemSize===2?'VEC2':'VEC3',a.itemSize);
  }
  const m=part.material,material=g.materials.length;
  g.materials.push({name:m.name,pbrMetallicRoughness:{baseColorFactor:[...m.color.toArray(),1],metallicFactor:m.metalness,roughnessFactor:m.roughness},doubleSided:m.name==='glass'});
  const mesh=g.meshes.length;g.meshes.push({name:part.name,primitives:[{attributes,indices:accessor(reduced,'SCALAR',1),material}]});
  g.scenes[0].nodes.push(g.nodes.length);g.nodes.push({name:part.name,mesh});triangles+=reduced.length/3;
  raw.dispose();welded.dispose();
}
g.nodes.push({name:'OpticalAxis',translation:[0,.052,0]});g.scenes[0].nodes.push(g.nodes.length-1);
g.buffers=[{uri:'scope.bin',byteLength:offset}];const output=new URL('../dist/models/optics/',import.meta.url).pathname;fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'scope.gltf'),JSON.stringify(g));fs.writeFileSync(path.join(output,'scope.bin'),Buffer.concat(chunks));
console.log(JSON.stringify({output,triangles,parts:selection.map(p=>p.name),min:box.min.clone().sub(center).toArray(),max:box.max.clone().sub(center).toArray(),bytes:offset},null,2));
