import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import './local-assets.mjs';

const input=process.argv[2];if(!input)throw new Error('Pass the original Jeep GLB path.');
const root=new URL('../',import.meta.url).pathname,out=path.join(root,'dist/models/jeep');fs.mkdirSync(out,{recursive:true});
const original=fs.readFileSync(input),jsonLength=original.readUInt32LE(12),source=JSON.parse(original.subarray(20,20+jsonLength)),binStart=28+jsonLength;
const require=createRequire(import.meta.url),sharp=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/sharp');
const names=['glass-color.png','glass-orm.jpg','body-color.jpg','body-orm.jpg','body-emissive.png','body-normal.jpg','tires-color.jpg','tires-orm.jpg','tires-normal.jpg'];
const images=[];
for(let i=0;i<source.images.length;i++){
  const view=source.bufferViews[source.images[i].bufferView],bytes=original.subarray(binStart+(view.byteOffset||0),binStart+(view.byteOffset||0)+view.byteLength),name=names[i];
  const image=sharp(bytes),quality=name.includes('orm')?84:name.includes('normal')?88:92,result=name.endsWith('.png')?await image.png({compressionLevel:9,palette:i===0,colours:128,dither:0}).toBuffer():await image.jpeg({quality,chromaSubsampling:'4:4:4',mozjpeg:true}).toBuffer();
  fs.writeFileSync(path.join(out,name),result);images.push({uri:name,mimeType:name.endsWith('.png')?'image/png':'image/jpeg'});
}
const model=await new GLTFLoader().parseAsync(original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength),'');model.scene.updateMatrixWorld(true);
const box=new THREE.Box3().setFromObject(model.scene),transform=new THREE.Matrix4().makeTranslation(0,-box.min.y,0).multiply(new THREE.Matrix4().makeRotationY(Math.PI));
const chunks=[],bufferViews=[],accessors=[],nodes=[],meshes=[],sceneNodes=[];let byteLength=0,triangles=0;
function append(array,type,count,componentType,target,min,max){
  const padding=(4-byteLength%4)%4;if(padding){chunks.push(Buffer.alloc(padding));byteLength+=padding;}
  const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength),index=bufferViews.length;bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:bytes.length,target});chunks.push(bytes);byteLength+=bytes.length;
  accessors.push({bufferView:index,componentType,count,type,...(min?{min,max}:{})});return accessors.length-1;
}
const wheelNames={tireFrontLeft:'front-left',tireFrontRight:'front-right',tireBackLeft:'rear-left',tireBackRight:'rear-right'};
model.scene.traverse(object=>{
  if(!object.isMesh)return;const geometry=object.geometry.clone().applyMatrix4(transform.clone().multiply(object.matrixWorld)),wheel=Object.keys(wheelNames).find(name=>object.name.startsWith(name));
  geometry.computeBoundingBox();const center=geometry.boundingBox.getCenter(new THREE.Vector3());if(wheel)geometry.translate(-center.x,-center.y,-center.z);geometry.computeBoundingBox();
  const attributes={};for(const [name,semantic] of [['position','POSITION'],['normal','NORMAL'],['uv','TEXCOORD_0'],['tangent','TANGENT']]){
    const a=geometry.attributes[name];if(!a)continue;const array=new Float32Array(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let j=0;j<a.itemSize;j++)array[i*a.itemSize+j]=a.getComponent(i,j);
    attributes[semantic]=append(array,'VEC'+a.itemSize,a.count,5126,34962,name==='position'?geometry.boundingBox.min.toArray():null,name==='position'?geometry.boundingBox.max.toArray():null);
  }
  const indices=geometry.index?geometry.index.array:Uint32Array.from({length:geometry.attributes.position.count},(_,i)=>i),index=append(indices,'SCALAR',indices.length,indices.BYTES_PER_ELEMENT===2?5123:5125,34963);
  triangles+=indices.length/3;const material=source.materials.findIndex(m=>m.name===object.material.name);meshes.push({name:object.name,primitives:[{attributes,indices:index,material,mode:4}]});
  const node={name:wheel?'wheel-'+wheelNames[wheel]:object.name,mesh:meshes.length-1};if(wheel)node.translation=center.toArray();sceneNodes.push(nodes.length);nodes.push(node);
});
const gltf={asset:{version:'2.0',generator:'Wild Frontier licensed asset preparation',extras:{...source.asset.extras,modifications:'Baked source transforms, grounded Y, front -Z, independent wheel pivots, re-encoded original 1K images.'}},scene:0,scenes:[{nodes:sceneNodes}],nodes,meshes,accessors,bufferViews,buffers:[{uri:'geometry.bin',byteLength}],images,textures:source.textures,samplers:source.samplers,materials:source.materials};
fs.writeFileSync(path.join(out,'model.gltf'),JSON.stringify(gltf));fs.writeFileSync(path.join(out,'geometry.bin'),Buffer.concat(chunks));
const archive=path.join(root,'source-assets/jeep');fs.mkdirSync(archive,{recursive:true});fs.copyFileSync(input,path.join(archive,'original.glb'));
const sourceNote=`# Jeep vehicle asset\n\nJeep by DJMaesen (bumstrum)\n- Author: https://sketchfab.com/bumstrum\n- Original: https://sketchfab.com/3d-models/jeep-8dd9a0b3faa84aaa813431b44c716a6d\n- License: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/\n- Public distribution: https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-156/8dd9a0b3faa84aaa813431b44c716a6d.glb\n- Original SHA-256: ${createHash('sha256').update(original).digest('hex')}\n\nAuthor-built model (18,417 triangles in public metadata; 18,415 triangles in the imported runtime geometry), original UVs, interior, axles, suspension, independent tires and nine PBR/alpha images. Source maps are native 1024 x 1024; they are not presented as native 2K scans. Source dimensions retained (about 3.98 m long, 2.12 m wide, 1.84 m high).\n\nChanges: baked object transforms, changed nose to -Z, grounded tires, moved wheel pivots to their actual centers, lossless geometry attributes, photographic-style authored wear textures re-encoded as JPEG/PNG. Vehicle copies share geometry and images. Original GLB is retained outside the runtime output in source-assets/jeep/original.glb. No manufacturer endorsement implied.\n`;
fs.writeFileSync(path.join(out,'SOURCES.md'),sourceNote);console.log(JSON.stringify({triangles,bytes:fs.readdirSync(out).reduce((n,file)=>n+fs.statSync(path.join(out,file)).size,0),wheelNames:Object.values(wheelNames)}));
