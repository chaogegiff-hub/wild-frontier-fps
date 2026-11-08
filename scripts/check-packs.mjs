import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {unzipSync} from '../dist/vendor/fflate.module.js';
import {STARTUP_PACKS} from '../dist/startup-pack-manifest.js';
import {MODEL_FILES} from '../dist/assets.js';
import {loadAssets,ASSET_GROUPS} from '../dist/assets.js';
import {SURFACE_FILES} from '../dist/world.js';
import {makeWorld} from '../dist/world.js';
import {createViewModels} from '../dist/weapons.js';
import {textureRegistry,HDTextureStreamer} from '../dist/graphics.js';
import {createWorldData,SPAWN,heightAt} from '../dist/core.js';
import * as THREE from '../dist/vendor/three.module.js';
import {loadStartupPack,assetUrl,releaseStartupPack} from '../dist/resource-pack.js';
import './local-assets.mjs';

const require=createRequire(import.meta.url),sharp=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/sharp'),{loadImage}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
const dist=new URL('../dist/',import.meta.url).pathname;
const fetchOriginal=globalThis.fetch;
for(const [profile,metadata] of Object.entries(STARTUP_PACKS)){
  const parts=metadata.parts||[metadata],payloads=new Map(),entries={};let received=0;
  for(const part of parts){
    const bytes=fs.readFileSync(path.join(dist,part.file)),files=unzipSync(bytes);payloads.set(part.file,bytes);received+=bytes.length;
    assert.equal(bytes.length,part.bytes);assert.ok(bytes.length<=25*1048576);assert.equal(Object.keys(files).length,part.files);
    for(const [file,data] of Object.entries(files)){assert.ok(!entries[file],`Duplicate file ${file}`);entries[file]=data;}
  }
  assert.equal(received,metadata.bytes);assert.equal(Object.keys(entries).length,metadata.files);
  const models={...MODEL_FILES};if(profile==='mobile'){models.treeHigh=models.treeMedium;models.woodlandHigh=models.woodlandMedium;}
  for(const file of Object.values(models)){
    assert.ok(entries[file],file);
    if(file.endsWith('.gltf')){
      const g=JSON.parse(Buffer.from(entries[file]));for(const a of [...g.buffers,...g.images])if(a.uri)assert.ok(entries[path.posix.join(path.posix.dirname(file),a.uri)],`${file}: ${a.uri}`);
    }
  }
  for(const file of Object.values(SURFACE_FILES))assert.ok(entries['textures/'+file],file);
  assert.ok(entries['audio/rifle-1.wav']);assert.ok(!entries['audio/forest.wav']);
  const leafFile=Object.keys(entries).find(file=>file.includes('island_tree_02_leaves_diff')&&file.endsWith('.png'));
  assert.ok(leafFile);const leaf=await sharp(entries[leafFile]).metadata();
  assert.equal(leaf.width,metadata.textureSize);assert.ok(leaf.hasAlpha);
  const crown=await sharp(entries['nature/woodland_tree_03/textures/tree_small_02_leaves_diff_1k.png']).metadata();assert.equal(crown.width,1024);assert.ok(crown.hasAlpha);assert.ok(!entries['nature/woodland_tree_02/textures/woodland_leaf_clusters.png']);
  for(const file of ['basecolor.jpg','normal.jpg','orm.jpg']){const m=await sharp(entries['models/akm/'+file]).metadata();assert.equal(m.width,profile==='mobile'?1024:2048);assert.equal(m.format,'jpeg');assert.equal(m.chromaSubsampling,'4:4:4');}
  const farCrown=await sharp(entries['nature/woodland_tree_02/impostor.png']).metadata();assert.equal(farCrown.width,2048);assert.equal(farCrown.height,256);
  let requests=0;const progress=[];globalThis.fetch=async url=>{
    for(const [file,bytes] of payloads)if(String(url).includes(file)){requests++;return new Response(bytes,{status:200});}
    return fetchOriginal(url);
  };
  await loadStartupPack({mobile:profile==='mobile',onProgress:(n,total)=>progress.push([n,total])});
  assert.equal(requests,parts.length);assert.equal(progress.at(-1)[0],metadata.bytes);assert.ok(progress.every(([n,total],i)=>total===metadata.bytes&&(!i||n>=progress[i-1][0])));
  for(const [key,file] of Object.entries(models)){
    assert.ok(assetUrl('./'+file).startsWith('blob:'));
    const source=await fetchOriginal(assetUrl('./'+file));assert.ok(source.ok);
    // Use the actual GLTFLoader with the runtime URL modifier, including all
    // external texture/bin dependencies and the repacked embedded GLBs.
    const {GLTFLoader}=await import('../dist/vendor/GLTFLoader.js');
    const model=await new GLTFLoader().loadAsync('./'+file);let vertices=0;
    model.scene.traverse(o=>{if(o.isMesh){const a=o.geometry.attributes.position;vertices+=a.count;for(const n of a.array)assert.ok(Number.isFinite(n));}});
    assert.ok(vertices>0,key);
  }
  await loadStartupPack({mobile:profile==='mobile'});assert.equal(requests,parts.length);
  const reported=[];const assets=await loadAssets(key=>reported.push(key),{mobile:profile==='mobile'});assert.equal(reported.length,ASSET_GROUPS);
  const surfaces={};for(const [key,file] of Object.entries(SURFACE_FILES)){const t=new THREE.Texture(await loadImage(entries['textures/'+file]));t.wrapS=t.wrapT=THREE.RepeatWrapping;surfaces[key]=t;}
  const registry=textureRegistry(assets,surfaces,MODEL_FILES,SURFACE_FILES),expected=new Set(Object.values(SURFACE_FILES).map(file=>'textures/'+file));
  for(const file of Object.values(MODEL_FILES)){
    const model=JSON.parse(fs.readFileSync(path.join(dist,file))),images=new Set();
    for(const material of model.materials||[])for(const ref of [material.pbrMetallicRoughness?.baseColorTexture,material.pbrMetallicRoughness?.metallicRoughnessTexture,material.normalTexture,material.occlusionTexture,material.emissiveTexture])if(ref)images.add(model.textures[ref.index].source);
    for(const i of images){const image=model.images[i];if(image.uri&&!image.uri.startsWith('data:'))expected.add(path.posix.join(path.posix.dirname(file),image.uri));}
  }
  assert.equal(registry.size,expected.size);for(const target of expected)assert.ok(registry.has(target),`HD material binding missing: ${target}`);
  if(profile==='mobile'){
    const target='models/akm/basecolor.jpg',record=registry.get(target),packFetch=globalThis.fetch;assert.equal([...record.textures][0].image.width,1024);
    globalThis.fetch=async url=>{const u=new URL(url);return u.protocol==='file:'&&u.pathname===path.join(dist,target)?new Response(fs.readFileSync(u),{headers:{'Content-Type':'image/jpeg'}}):packFetch(url);};
    let stream;try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('HD image upgrade stalled')),3000);stream=new HDTextureStreamer(new Map([[target,record]]),{onStatus:s=>{if(s.loaded===1){clearTimeout(timer);resolve();}else if(s.failed){clearTimeout(timer);reject(new Error('HD image upgrade failed'));}}});stream.start([{target,file:target,width:2048,height:2048}]);stream.setEnabled(true);stream.select({rifle:100});});assert.equal([...record.textures][0].image.width,2048);}finally{stream?.dispose();globalThis.fetch=packFetch;}
    console.log('PASS real 2K image decoding bypasses the mobile startup pack and preserves live material references');
  }
  const data=createWorldData(),scene=new THREE.Scene(),world=makeWorld(scene,data,surfaces,profile==='mobile'?'medium':'high',assets),views=createViewModels(assets,surfaces);
  const camera=new THREE.PerspectiveCamera(75,16/9,.08,1000);camera.position.set(SPAWN.x,heightAt(SPAWN.x,SPAWN.z)+1.72,SPAWN.z);world.update(1,camera);
  assert.ok(world.nature.treeBatches.flat().some(m=>m.count>0)||world.nature.treeDistant.count>0);assert.equal(views.roots.length,3);assert.ok(views.roots[0].userData.model.getObjectByName('OpticalAxis'));assert.ok(views.roots[0].getObjectByName('handR'));
  if(profile==='mobile'){assert.equal(assets.treeHigh,assets.treeMedium);assert.equal(assets.woodlandHigh,assets.woodlandMedium);}
  releaseStartupPack();THREE.Cache.clear();console.log(`PASS ${profile}: ${parts.length} download(s), continuous total progress, all models parsed, world and scoped weapons constructed`);
}
const desktop=STARTUP_PACKS.desktop.parts;assert.ok(desktop?.length===4);
let failSecond=true,attempts=0;globalThis.fetch=async url=>{
  const part=desktop.find(p=>String(url).includes(p.file));assert.ok(part);attempts++;
  return part===desktop[1]&&failSecond?new Response('unavailable',{status:503}):new Response(fs.readFileSync(path.join(dist,part.file)));
};
await assert.rejects(loadStartupPack({mobile:false}),/503/);assert.equal(attempts,desktop.length+1);
assert.ok(!assetUrl('./models/akm/model.gltf').startsWith('blob:'));
failSecond=false;const recovered=await loadStartupPack({mobile:false});assert.equal(recovered.files,STARTUP_PACKS.desktop.files);assert.equal(attempts,desktop.length*2+1);releaseStartupPack();
console.log('PASS second desktop part failure releases partial assets and a retry completes all parts');
const mobilePack=STARTUP_PACKS.mobile,cacheModes=[],retryProgress=[];
globalThis.fetch=async(url,{cache})=>{cacheModes.push(cache);const part=mobilePack.parts.find(p=>String(url).includes(p.file));assert.ok(part);return new Response(cacheModes.length===1?'broken cache':fs.readFileSync(path.join(dist,part.file)));};
await loadStartupPack({mobile:true,onProgress:n=>retryProgress.push(n)});assert.equal(cacheModes.filter(m=>m==='force-cache').length,mobilePack.parts.length);assert.equal(cacheModes.filter(m=>m==='reload').length,1);assert.equal(retryProgress.at(-1),mobilePack.bytes);assert.ok(retryProgress.every((n,i)=>!i||n>=retryProgress[i-1]));releaseStartupPack();
console.log('PASS an incomplete cached pack retries with fresh bytes and monotonic progress');
globalThis.fetch=async()=>new Response('unavailable',{status:503});
await assert.rejects(loadStartupPack({mobile:true}),/503/);assert.ok(!assetUrl('./models/gl6/model.gltf').startsWith('blob:'));
globalThis.fetch=async()=>new Response('truncated');await assert.rejects(loadStartupPack({mobile:true}),/不完整/);
globalThis.fetch=(_,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
await assert.rejects(loadStartupPack({mobile:true,idleTimeout:10,totalTimeout:50}),/超时/);
globalThis.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([80,75]));}}));
await assert.rejects(loadStartupPack({mobile:true,idleTimeout:10,totalTimeout:50}),/超时/);
globalThis.fetch=()=>new Promise(()=>{});
await assert.rejects(loadStartupPack({mobile:true,idleTimeout:10,totalTimeout:50}),/超时/);
globalThis.fetch=fetchOriginal;releaseStartupPack();
// The byte limit protects first-load time as the model set changes; comparing
// against uncompressed desktop inputs is not a stable phone download budget.
assert.ok(STARTUP_PACKS.mobile.bytes<22*1048576);
assert.ok(STARTUP_PACKS.desktop.bytes<34*1048576);
let hostedBytes=0;for(const file of fs.readdirSync(dist,{recursive:true})){const info=fs.statSync(path.join(dist,file));if(info.isFile()){hostedBytes+=info.size;assert.ok(info.size<=25*1048576,`Hosting file limit exceeded: ${file}`);}}
assert.ok(hostedBytes<250*1048576,'Expanded hosting archive budget exceeded');
console.log('PASS failed/truncated/stalled download recovery, download budgets and the hosting file limit');
