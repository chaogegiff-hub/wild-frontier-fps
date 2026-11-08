import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {RGBELoader} from '../dist/vendor/RGBELoader.js';
import {MODEL_FILES,TREE_IMPOSTOR,WOODLAND_IMPOSTOR} from '../dist/assets.js';

const require=createRequire(import.meta.url);
const canvasPackage=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/@napi-rs/canvas`:'@napi-rs/canvas';
const {createCanvas,loadImage}=require(canvasPackage);
const dist=new URL('../dist/',import.meta.url).pathname;
globalThis.document={createElement:tag=>{if(tag!=='canvas')throw new Error(tag);return createCanvas(1,1);}};
globalThis.self=globalThis;
globalThis.ProgressEvent=class{constructor(type,fields){this.type=type;Object.assign(this,fields);}};
globalThis.createImageBitmap=async blob=>loadImage(Buffer.from(await blob.arrayBuffer()));

export async function localModel(file){
  const p=path.join(dist,file),bytes=fs.readFileSync(p),loader=new GLTFLoader();
  if(file.endsWith('.glb'))return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const g=JSON.parse(bytes.toString()),dir=path.dirname(p);
  for(const a of [...g.buffers,...g.images])if(a.uri){
    const full=path.join(dir,a.uri);if(!fs.existsSync(full))throw new Error(`Missing GLTF dependency ${full}`);
    const mime=a.mimeType||(a.uri.endsWith('.png')?'image/png':a.uri.endsWith('.jpg')?'image/jpeg':'application/octet-stream');
    a.uri=`data:${mime};base64,${fs.readFileSync(full).toString('base64')}`;
  }
  return loader.parseAsync(JSON.stringify(g),'');
}
export async function localAssets(){
  const files=MODEL_FILES;
  const models=Object.fromEntries(await Promise.all(Object.entries(files).map(async([key,file])=>{const model=await localModel(file);model.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.alphaTest>0)m.alphaToCoverage=true;});return [key,model];})));
  const b=fs.readFileSync(path.join(dist,'environment/sky.hdr')),h=new RGBELoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
  models.sky=new THREE.DataTexture(h.data,h.width,h.height,THREE.RGBAFormat,h.type);models.sky.mapping=THREE.EquirectangularReflectionMapping;models.sky.flipY=true;
  models.treeImpostor=new THREE.Texture(await loadImage(path.join(dist,TREE_IMPOSTOR)));models.treeImpostor.colorSpace=THREE.SRGBColorSpace;models.treeImpostor.flipY=false;
  models.woodlandImpostor=new THREE.Texture(await loadImage(path.join(dist,WOODLAND_IMPOSTOR)));models.woodlandImpostor.colorSpace=THREE.SRGBColorSpace;models.woodlandImpostor.flipY=false;
  const surfaces={};
  for(const [key,file] of Object.entries({ground:'ground',rock:'rock',normal:'ground-normal',rockNormal:'rock-normal',grass:'grass',grassNormal:'grass-normal',grassRough:'grass-rough',forest:'forest',forestNormal:'forest-normal',metalNormal:'metal-normal',metalRough:'metal-rough',waterNormal:'water-normal',wall:'wall',wallNormal:'wall-normal',wallRough:'wall-rough',roof:'roof',roofNormal:'roof-normal',roofRough:'roof-rough',wood:'wood',woodNormal:'wood-normal',woodRough:'wood-rough'})){
    surfaces[key]=new THREE.Texture(await loadImage(path.join(dist,`textures/${file}.jpg`)));surfaces[key].wrapS=surfaces[key].wrapT=THREE.RepeatWrapping;if(['ground','rock','grass','forest','wall','roof','wood'].includes(key))surfaces[key].colorSpace=THREE.SRGBColorSpace;
  }
  return {assets:models,surfaces};
}
