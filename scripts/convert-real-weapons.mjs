import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import * as THREE from '../dist/vendor/three.module.js';
import {FBXLoader} from './vendor/three-fbx/FBXLoader.js';

// Convert the public CC0 nisu M4A1 FBX, preserving the author's UVs and PBR maps.
// Usage: node scripts/convert-real-weapons.mjs /path/to/extracted/M4A1 [m4a1]
//        node scripts/convert-real-weapons.mjs /path/to/extracted/Assets m700
// Output muzzle points along glTF +Z; dimensions are meters.
const require=createRequire(import.meta.url);
const sharp=require(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/sharp`);
const source=process.argv[2];
if(!source)throw new Error('Pass the extracted weapon directory.');
const id=process.argv[3]||'m4a1',sniper=id==='m700';
if(!['m4a1','m700'].includes(id))throw new Error('Choose m4a1 or m700.');
const output=new URL(`../dist/models/${id}/`,import.meta.url).pathname;
fs.mkdirSync(path.join(output,'textures'),{recursive:true});

// No DOM is required: images are converted separately and linked in the glTF.
const originalLoad=THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load=function(url){const t=new THREE.Texture();t.name=url;return t;};
globalThis.window={URL,innerWidth:1024,innerHeight:768};
const bytes=fs.readFileSync(path.join(source,sniper?'SKM_SniperR700.fbx':'M4A1.fbx'));
const scene=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
THREE.TextureLoader.prototype.load=originalLoad;
scene.updateMatrixWorld(true);
let meshes=[];scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
if(sniper){
  // The author supplies two LODs. Keep the detailed mesh, then split its rigid
  // mechanical joint groups into independent meshes for bolt/reload animation.
  const original=meshes.reduce((a,b)=>a.geometry.attributes.position.count>b.geometry.attributes.position.count?a:b);
  original.skeleton.update();const groups=new Map(),a=original.geometry.attributes;
  for(let i=0;i<a.position.count;i+=3){
    const bone=a.skinIndex.getX(i),name=original.skeleton.bones[bone].name;
    if([i,i+1,i+2].some(k=>a.skinWeight.getX(k)<.999||a.skinIndex.getX(k)!==bone))throw new Error('Non-rigid mechanical triangle.');
    if(!groups.has(name))groups.set(name,[]);groups.get(name).push(i,i+1,i+2);
  }
  meshes=[...groups].map(([name,indices])=>{
    const geometry=new THREE.BufferGeometry();
    for(const key of ['position','normal','uv']){
      const attr=a[key],out=new Float32Array(indices.length*attr.itemSize);
      for(let k=0;k<indices.length;k++)out.set(attr.array.subarray(indices[k]*attr.itemSize,(indices[k]+1)*attr.itemSize),k*attr.itemSize);
      geometry.setAttribute(key,new THREE.BufferAttribute(out,attr.itemSize));
    }
    const mesh=new THREE.Mesh(geometry);mesh.name=name;mesh.matrixWorld.copy(original.matrixWorld);return mesh;
  });
}
const sourceBox=new THREE.Box3();for(const o of meshes){o.geometry.computeBoundingBox();sourceBox.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));}
const length=sourceBox.max.z-sourceBox.min.z,targetLength=sniper?1.07:.88;
const scale=targetLength/length,center=sourceBox.getCenter(new THREE.Vector3()),axis=sniper?1:-1;
const normalization=new THREE.Matrix4().makeScale(axis*scale,scale,axis*scale);
normalization.setPosition(-axis*center.x*scale,-sourceBox.min.y*scale,-axis*center.z*scale);
const chunks=[],parts=[];
let offset=0,triangles=0;
const gltf={asset:{version:'2.0',generator:'CC0 FBX-to-glTF converter (three.js 0.164.1)'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],accessors:[],bufferViews:[],buffers:[],images:[{uri:'textures/base-color.jpg'},{uri:'textures/normal.jpg'},{uri:'textures/metal-rough.jpg'}],samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}],textures:[{source:0,sampler:0},{source:1,sampler:0},{source:2,sampler:0}],materials:[{name:`${id}_author_PBR`,pbrMetallicRoughness:{baseColorTexture:{index:0},metallicRoughnessTexture:{index:2},metallicFactor:1,roughnessFactor:1},normalTexture:{index:1},doubleSided:false}],extras:{source:sniper?'https://stein-indie.itch.io/m700':'https://opengameart.org/content/m4a1-assault-rifle',author:sniper?'Stein Games':'nisu',license:'CC0-1.0',unit:'meter',muzzleDirection:'+Z',length:targetLength}};
if(sniper)gltf.materials[0].occlusionTexture={index:2};
function accessor(array,type,itemSize){
  const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
  const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=gltf.bufferViews.length;
  gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,target:34962});
  const a={bufferView:view,componentType:5126,count:array.length/itemSize,type};
  if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.count;i++)for(let c=0;c<3;c++){a.min[c]=Math.min(a.min[c],array[i*3+c]);a.max[c]=Math.max(a.max[c],array[i*3+c]);}}
  const id=gltf.accessors.length;gltf.accessors.push(a);chunks.push(data);offset+=data.length;return id;
}
let muzzleVertices=[];
for(const o of meshes){
  const geometry=o.geometry.clone();geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalization,o.matrixWorld));
  geometry.computeBoundingBox();const box=geometry.boundingBox.clone();
  const pivot=sniper?new THREE.Vector3().setFromMatrixPosition(scene.getObjectByName(o.name).matrixWorld).applyMatrix4(normalization):box.getCenter(new THREE.Vector3());
  if(o.name==='Barrel'){
    const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++)if(p.getZ(i)>box.max.z-.0002)muzzleVertices.push(new THREE.Vector3().fromBufferAttribute(p,i));
  }
  geometry.translate(-pivot.x,-pivot.y,-pivot.z);
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
  const coords=new Float32Array(uv.array);for(let i=1;i<coords.length;i+=2)coords[i]=1-coords[i];
  const primitive={attributes:{POSITION:accessor(new Float32Array(p.array),'VEC3',3),NORMAL:accessor(new Float32Array(n.array),'VEC3',3),TEXCOORD_0:accessor(coords,'VEC2',2)},material:0};
  const mesh=gltf.meshes.length;gltf.meshes.push({name:o.name,primitives:[primitive]});
  gltf.scenes[0].nodes.push(gltf.nodes.length);gltf.nodes.push({name:o.name,mesh,translation:pivot.toArray()});
  triangles+=p.count/3;parts.push({name:o.name,triangles:p.count/3,pivot:pivot.toArray(),min:box.min.toArray(),max:box.max.toArray()});
  geometry.dispose();
}
const markers={};
if(sniper){
  for(const name of ['FX_FIRE','FX_CASING','ATTACH_SCOPE','ATTACH_SILENCER']){
    const bone=scene.getObjectByName(name),p=new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld).applyMatrix4(normalization);markers[name]=p.toArray();
    gltf.nodes.push({name,translation:p.toArray()});gltf.scenes[0].nodes.push(gltf.nodes.length-1);
  }
}
const muzzle=sniper?new THREE.Vector3(...markers.FX_FIRE):muzzleVertices.reduce((v,p)=>v.add(p),new THREE.Vector3()).multiplyScalar(1/muzzleVertices.length);
gltf.nodes.push({name:'Muzzle',translation:muzzle.toArray()});gltf.scenes[0].nodes.push(gltf.nodes.length-1);
gltf.extras.muzzle=muzzle.toArray();
gltf.buffers=[{uri:'model.bin',byteLength:offset}];
fs.writeFileSync(path.join(output,'model.bin'),Buffer.concat(chunks));
fs.writeFileSync(path.join(output,'model.gltf'),JSON.stringify(gltf));
await sharp(path.join(source,sniper?'T_SniperR700_C.png':'M4A1_Base_Color.png')).resize(1024,1024).removeAlpha().jpeg({quality:92,chromaSubsampling:'4:4:4'}).toFile(path.join(output,'textures/base-color.jpg'));
const normal=await sharp(path.join(source,sniper?'T_SniperR700_N.png':'M4A1_Normal.png')).resize(1024,1024).removeAlpha().toColourspace('srgb').raw().toBuffer();
if(sniper)for(let i=1;i<normal.length;i+=3)normal[i]=255-normal[i]; // Unreal DirectX -Y -> glTF OpenGL +Y.
await sharp(normal,{raw:{width:1024,height:1024,channels:3}}).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toFile(path.join(output,'textures/normal.jpg'));
const packed=Buffer.alloc(1024*1024*3);
if(sniper){
  const maor=await sharp(path.join(source,'T_SniperR700_MAOR.png')).resize(1024,1024).removeAlpha().toColourspace('srgb').raw().toBuffer();
  for(let i=0;i<1024*1024;i++){packed[i*3]=maor[i*3+1];packed[i*3+1]=255-maor[i*3+2];packed[i*3+2]=maor[i*3];}
}else{
  const rough=await sharp(path.join(source,'M4A1_Roughness.png')).resize(1024,1024).greyscale().raw().toBuffer();
  const metal=await sharp(path.join(source,'M4A1_Metallic.png')).resize(1024,1024).greyscale().raw().toBuffer();
  for(let i=0;i<rough.length;i++){packed[i*3]=255;packed[i*3+1]=rough[i];packed[i*3+2]=metal[i];}
}
await sharp(packed,{raw:{width:1024,height:1024,channels:3}}).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toFile(path.join(output,'textures/metal-rough.jpg'));
const min=[-((sourceBox.max.x-sourceBox.min.x)*scale)/2,0,-targetLength/2],max=[-min[0],(sourceBox.max.y-sourceBox.min.y)*scale,targetLength/2];
const metadata={source:gltf.extras.source,author:gltf.extras.author,license:'CC0-1.0',triangles,muzzle:muzzle.toArray(),markers,min,max,parts};
fs.writeFileSync(path.join(output,'conversion.json'),JSON.stringify(metadata,null,2));
console.log(JSON.stringify({output,triangles,muzzle:metadata.muzzle,min,max,parts:parts.map(p=>p.name)},null,2));
