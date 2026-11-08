import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import * as THREE from '../dist/vendor/three.module.js';
import {mapConcurrent,retryAsset,photoTexture,resilientModelTextures} from '../dist/asset-loading.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import './local-assets.mjs';

let active=0,peak=0;
const values=await mapConcurrent([0,1,2,3,4,5,6],2,async n=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;return n*3;});
assert.equal(peak,2);assert.deepEqual(values,[0,3,6,9,12,15,18]);console.log('PASS bounded asset work preserves order and limits simultaneous decoders');
let attempts=0;assert.equal(await retryAsset('材质',async()=>{if(++attempts===1)throw new Error('temporary');return 42;}),42);assert.equal(attempts,2);
await assert.rejects(retryAsset('树木材质',async()=>{throw new Error('bad image');}),e=>e.message.includes('战场树木材质读取失败')&&e.cause.message==='bad image');console.log('PASS transient asset failures retry once and permanent failures identify the resource');
const require=createRequire(import.meta.url),{loadImage}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const savedBitmap=globalThis.createImageBitmap,savedCreate=document.createElementNS,url=URL.createObjectURL(new Blob([fs.readFileSync(new URL('../dist/nature/woodland_tree_02/impostor.png',import.meta.url))],{type:'image/png'}));
class DecodedImage extends EventTarget{
  set src(value){fetch(value).then(r=>r.arrayBuffer()).then(b=>loadImage(Buffer.from(b))).then(image=>{this.width=image.width;this.height=image.height;this.dispatchEvent(new Event('load'));},()=>this.dispatchEvent(new Event('error')));}
}
try{
  globalThis.createImageBitmap=async()=>{throw new Error('ImageBitmap is exposed but decoding failed');};
  document.createElementNS=(_,tag)=>{assert.equal(tag,'img');return new DecodedImage();};
  const texture=await photoTexture(url);assert.equal(texture.image.width,2048);assert.equal(texture.image.height,256);assert.ok(texture.version>0);
  console.log('PASS actual PNG falls back through TextureLoader when ImageBitmap rejects');
  const folder=new URL('../dist/models/gl6/',import.meta.url).pathname,model=JSON.parse(fs.readFileSync(path.join(folder,'model.gltf')));
  for(const item of [...model.buffers,...model.images])if(item.uri){const bytes=fs.readFileSync(path.join(folder,item.uri)),mime=item.uri.endsWith('.png')?'image/png':item.uri.endsWith('.jpg')?'image/jpeg':'application/octet-stream';item.uri=`data:${mime};base64,${bytes.toString('base64')}`;}
  const parsed=await resilientModelTextures(new GLTFLoader()).parseAsync(JSON.stringify(model),'');let maps=0;
  parsed.scene.traverse(object=>{if(object.isMesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.map){assert.ok(material.map.image.width>0);maps++;}});assert.ok(maps>0);
  console.log('PASS the actual GL-6 model retains decoded textures when every ImageBitmap decode fails');
}finally{globalThis.createImageBitmap=savedBitmap;document.createElementNS=savedCreate;THREE.Cache.clear();URL.revokeObjectURL(url);}
console.log('Browser and iPhone rendering have not been tested.');
