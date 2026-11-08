import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import * as THREE from '../dist/vendor/three.module.js';
import {mergeVertices} from '../dist/vendor/BufferGeometryUtils.js';
import {FBXLoader} from './vendor/three-fbx/FBXLoader.js';

// CC0 para / MakeHuman FPS-only anatomical arms. Input is extracted archive:
// https://opengameart.org/sites/default/files/fps%20arms.7z
// No body filtering or soldier mesh. Geometry and skeleton are in meters, Y up.
const source=process.argv[2];if(!source)throw new Error('Pass extracted fps arms directory.');
const target=new URL('../dist/models/fps-arms/',import.meta.url).pathname;
fs.mkdirSync(path.join(target,'textures'),{recursive:true});
const require=createRequire(import.meta.url),sharp=require(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/sharp`);
const originalLoad=THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load=function(url){const t=new THREE.Texture();t.name=url;return t;};
globalThis.window={URL,innerWidth:1024,innerHeight:768};
const bytes=fs.readFileSync(path.join(source,'FPS ARMS RIG 1.fbx'));
const scene=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
THREE.TextureLoader.prototype.load=originalLoad;scene.updateMatrixWorld(true);
let model;scene.traverse(o=>{if(o.isSkinnedMesh)model=o;});if(!model)throw new Error('Missing skinned arms mesh.');
model.skeleton.update();
// Bake the exported rest pose to world meters, then regenerate inverse binds.
// FBX skin axes are no longer implicitly tied to an imported body transform.
let geo=model.geometry.clone(),p=geo.attributes.position,v=new THREE.Vector3();
for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);model.applyBoneTransform(i,v);v.applyMatrix4(model.matrixWorld);p.setXYZ(i,v.x,v.y,v.z);}
const normalMatrix=new THREE.Matrix3().getNormalMatrix(model.matrixWorld);
if(geo.attributes.normal){const n=geo.attributes.normal;for(let i=0;i<n.count;i++){v.fromBufferAttribute(n,i).applyNormalMatrix(normalMatrix);n.setXYZ(i,v.x,v.y,v.z);}}else geo.computeVertexNormals();
if(geo.attributes.uv){for(let i=0;i<geo.attributes.uv.count;i++)geo.attributes.uv.setY(i,1-geo.attributes.uv.getY(i));}
geo=mergeVertices(geo,1e-6);geo.computeBoundingBox();
const joints=model.skeleton.bones;
const allBones=[];scene.traverse(o=>{if(o.isBone)allBones.push(o);});
// The author uses detached hand IK handles in Blender. Attach those to forearms
// while preserving global rest transforms so runtime two-bone IK is sufficient.
for(const side of ['L','R']){
 const hand=scene.getObjectByName(`hand${side}control`),forearm=scene.getObjectByName(`forearm${side}`);
 forearm.attach(hand);
}
scene.updateMatrixWorld(true);
const gltf={asset:{version:'2.0',generator:'CC0 FPS arms converter (three.js 0.164.1)'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],skins:[],accessors:[],bufferViews:[],buffers:[],images:[{uri:'textures/skin.jpg'}],textures:[{source:0,sampler:0}],samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}],materials:[{name:'anatomical_skin',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:.74},doubleSided:false}],extras:{source:'https://opengameart.org/content/fps-arms-rigged-only',author:'para; MakeHuman team',license:'CC0-1.0',unit:'meter',up:'+Y',forward:'-Z',description:'Authored anatomical FPS-only arms and skin texture; no photogrammetry.'}};
let offset=0;const chunks=[];
function accessor(array,type,itemSize,componentType=5126,target=34962){
 const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
 const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=gltf.bufferViews.length;
 gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,...(target?{target}:{})});
 const a={bufferView:view,componentType,count:array.length/itemSize,type};
 if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.count;i++)for(let c=0;c<3;c++){a.min[c]=Math.min(a.min[c],array[i*3+c]);a.max[c]=Math.max(a.max[c],array[i*3+c]);}}
 const idx=gltf.accessors.length;gltf.accessors.push(a);chunks.push(data);offset+=data.length;return idx;
}
const nodeIds=new Map(allBones.map((b,i)=>[b,i]));
// Bone positions are also meters: discard FBX's uniform 0.1 bone scale and
// rebuild local joint transforms from world positions and orientations.
const boneWorld=new Map(allBones.map(b=>[b,new THREE.Matrix4().compose(b.getWorldPosition(new THREE.Vector3()),b.getWorldQuaternion(new THREE.Quaternion()),new THREE.Vector3(1,1,1))]));
for(const b of allBones){
 const parent=nodeIds.has(b.parent)?b.parent:null;
 const local=parent?new THREE.Matrix4().copy(boneWorld.get(parent)).invert().multiply(boneWorld.get(b)):boneWorld.get(b);
 const t=new THREE.Vector3(),r=new THREE.Quaternion(),s=new THREE.Vector3();local.decompose(t,r,s);
 gltf.nodes.push({name:b.name,translation:t.toArray(),rotation:r.toArray(),scale:s.toArray(),children:b.children.filter(c=>nodeIds.has(c)).map(c=>nodeIds.get(c))});
 if(!parent)gltf.scenes[0].nodes.push(nodeIds.get(b));
}
const binds=new Float32Array(joints.length*16);
for(let i=0;i<joints.length;i++)new THREE.Matrix4().copy(boneWorld.get(joints[i])).invert().toArray(binds,i*16);
gltf.skins.push({name:'FPSArms',inverseBindMatrices:accessor(binds,'MAT4',16,5126,0),joints:joints.map(b=>nodeIds.get(b)),skeleton:0});
const a=geo.attributes;
const primitive={attributes:{POSITION:accessor(new Float32Array(a.position.array),'VEC3',3),NORMAL:accessor(new Float32Array(a.normal.array),'VEC3',3),TEXCOORD_0:accessor(new Float32Array(a.uv.array),'VEC2',2),JOINTS_0:accessor(new Uint16Array(a.skinIndex.array),'VEC4',4,5123),WEIGHTS_0:accessor(new Float32Array(a.skinWeight.array),'VEC4',4)},indices:accessor(new Uint16Array(geo.index.array),'SCALAR',1,5123,34963),material:0};
gltf.meshes.push({name:'FPSAnatomicalArms',primitives:[primitive]});
gltf.nodes.push({name:'FPSAnatomicalArms',mesh:0,skin:0});gltf.scenes[0].nodes.push(gltf.nodes.length-1);
gltf.buffers=[{uri:'model.bin',byteLength:offset}];
fs.writeFileSync(path.join(target,'model.bin'),Buffer.concat(chunks));
fs.writeFileSync(path.join(target,'model.gltf'),JSON.stringify(gltf));
await sharp(path.join(source,'new_diff.png')).resize(1024,1024).removeAlpha().jpeg({quality:93,chromaSubsampling:'4:4:4'}).toFile(path.join(target,'textures/skin.jpg'));
const metadata={source:gltf.extras.source,author:gltf.extras.author,license:gltf.extras.license,triangles:geo.index.count/3,vertices:a.position.count,min:geo.boundingBox.min.toArray(),max:geo.boundingBox.max.toArray(),unit:'meter',up:'+Y',armBones:{left:{upper:'upper_armL',forearm:'forearmL',hand:'handLcontrol',handMesh:'handL'},right:{upper:'upper_armR',forearm:'forearmR',hand:'handRcontrol',handMesh:'handR'}},arms:{}};
for(const side of ['L','R']){
 const shoulder=scene.getObjectByName(`upper_arm${side}`).getWorldPosition(new THREE.Vector3()),elbow=scene.getObjectByName(`forearm${side}`).getWorldPosition(new THREE.Vector3()),wrist=scene.getObjectByName(`hand${side}control`).getWorldPosition(new THREE.Vector3());
 metadata.arms[side]={shoulder:shoulder.toArray(),elbow:elbow.toArray(),wrist:wrist.toArray(),upperLength:shoulder.distanceTo(elbow),forearmLength:elbow.distanceTo(wrist)};
}
fs.writeFileSync(path.join(target,'conversion.json'),JSON.stringify(metadata,null,2));
console.log(JSON.stringify({output:target,...metadata},null,2));
