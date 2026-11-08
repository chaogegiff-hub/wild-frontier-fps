import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {zipSync} from './vendor/three-fbx/fflate.module.js';
import {MODEL_FILES,TREE_IMPOSTOR,WOODLAND_IMPOSTOR} from '../dist/assets.js';
import {SURFACE_FILES} from '../dist/world.js';

// Bundle local game resources into a small number of requests. Geometry, UVs, animation,
// original photo sources and alpha cutouts remain intact; only images resize.
const require=createRequire(import.meta.url),sharp=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/sharp');
const dist=new URL('../dist/',import.meta.url).pathname;
const output=path.join(dist,'packs');fs.mkdirSync(output,{recursive:true});
fs.copyFileSync(new URL('./vendor/three-fbx/fflate.module.js',import.meta.url),path.join(dist,'vendor/fflate.module.js'));
fs.copyFileSync(new URL('./vendor/three-fbx/LICENSE',import.meta.url),path.join(dist,'vendor/fflate-LICENSE'));
const manifest={};let vehiclePack,swimPack;
async function resize(bytes,extension,size,closeup=false){
  const image=sharp(bytes).resize({width:size,height:size,fit:'inside',withoutEnlargement:true});
  return extension==='.png'?image.png({compressionLevel:9}).toBuffer():image.jpeg({quality:closeup?93:78,chromaSubsampling:closeup?'4:4:4':'4:2:0',mozjpeg:true}).toBuffer();
}
async function compactGlb(bytes,size){
  const jsonLength=bytes.readUInt32LE(12),data=JSON.parse(bytes.subarray(20,20+jsonLength));
  const binStart=20+jsonLength+8,original=bytes.subarray(binStart),chunks=[];let offset=0;
  const images=new Map((data.images||[]).filter(i=>i.bufferView!==undefined).map(i=>[i.bufferView,i]));
  for(let i=0;i<data.bufferViews.length;i++){
    const view=data.bufferViews[i];let part=original.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
    const image=images.get(i);if(image)part=await resize(part,image.mimeType==='image/png'?'.png':'.jpg',size);
    const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
    view.byteOffset=offset;view.byteLength=part.length;chunks.push(part);offset+=part.length;
  }
  data.buffers[0].byteLength=offset;
  const json=Buffer.from(JSON.stringify(data)),jsonPad=Buffer.alloc((4-json.length%4)%4,32),bin=Buffer.concat(chunks),binPad=Buffer.alloc((4-bin.length%4)%4);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+jsonPad.length+bin.length+binPad.length,8);header.writeUInt32LE(json.length+jsonPad.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length+binPad.length);binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,json,jsonPad,binHeader,bin,binPad]);
}
for(const [profile,size] of [['mobile',512],['desktop',1024]]){
  const models={...MODEL_FILES};if(profile==='mobile'){models.treeHigh=models.treeMedium;models.woodlandHigh=models.woodlandMedium;}
  const files=new Set(Object.values(models));
  for(const file of [...files])if(file.endsWith('.gltf')){
    const model=JSON.parse(fs.readFileSync(path.join(dist,file)));
    for(const item of [...model.buffers,...model.images])if(item.uri&&!item.uri.startsWith('data:'))files.add(path.posix.join(path.posix.dirname(file),item.uri));
  }
  Object.values(SURFACE_FILES).forEach(file=>files.add('textures/'+file));files.add('environment/sky.hdr');files.add(TREE_IMPOSTOR);files.add(WOODLAND_IMPOSTOR);
  files.add('audio/manifest.json');
  const sounds=JSON.parse(fs.readFileSync(path.join(dist,'audio/manifest.json')));
  Object.entries(sounds).filter(([key])=>key!=='forest').forEach(([,values])=>values.forEach(file=>files.add('audio/'+file)));
  const entries={};let originalBytes=0;
  for(const file of [...files].sort()){
    let bytes=fs.readFileSync(path.join(dist,file));originalBytes+=bytes.length;
    const extension=path.extname(file);
    const closeup=file.startsWith('models/akm/')||file.startsWith('models/rocketbox-soldier/');
    const keepAtlas=file===TREE_IMPOSTOR||file===WOODLAND_IMPOSTOR||file.endsWith('/woodland_leaf_clusters.png')||file.startsWith('models/jeep/');
    if(['.jpg','.png'].includes(extension)&&!keepAtlas){const detailSize=profile==='desktop'&&file.startsWith('models/akm/')?2048:1024;bytes=await resize(bytes,extension,file.startsWith('models/')||file.startsWith('nature/woodland_tree_03/')||['textures/grass.jpg','textures/grass-normal.jpg','textures/rock.jpg','textures/rock-normal.jpg'].includes(file)?detailSize:size,closeup);}
    else if(extension==='.glb')bytes=await compactGlb(bytes,size);
    entries[file]=[bytes,{mtime:new Date('2020-01-01T00:00:00Z')}];
  }
  // Hosting caps each static file at 25 MiB. Keep authored detail intact and
  // separate desktop geometry from images/audio instead of exceeding the cap.
  const isSwim=file=>file.startsWith('models/swim-sleeves/')||file==='models/fps-arms/textures/skin.jpg';
  const shared=Object.fromEntries(Object.entries(entries).filter(([file])=>file.startsWith('models/jeep/'))),swim=Object.fromEntries(Object.entries(entries).filter(([file])=>isSwim(file))),base=Object.fromEntries(Object.entries(entries).filter(([file])=>!file.startsWith('models/jeep/')&&!isSwim(file)));
  if(!vehiclePack){const packed=zipSync(shared,{level:9}),hash=createHash('sha256').update(packed).digest('hex'),file=`packs/vehicle-${hash.slice(0,12)}.pack`;fs.writeFileSync(path.join(dist,file),packed);vehiclePack={file,bytes:packed.length,files:Object.keys(shared).length};}
  if(!swimPack){const packed=zipSync(swim,{level:9}),hash=createHash('sha256').update(packed).digest('hex'),file=`packs/swim-${hash.slice(0,12)}.pack`;fs.writeFileSync(path.join(dist,file),packed);swimPack={file,bytes:packed.length,files:Object.keys(swim).length};}
  const groups=profile==='desktop'?[
    ['geometry',Object.fromEntries(Object.entries(base).filter(([file])=>/\.(bin|gltf|glb)$/.test(file)))],
    ['surfaces',Object.fromEntries(Object.entries(base).filter(([file])=>!/\.(bin|gltf|glb)$/.test(file)))]
  ]:[['',base]];
  const parts=groups.map(([label,contents])=>{
    const packed=zipSync(contents,{level:9});if(packed.length>25*1048576)throw new Error(`${profile} ${label} pack exceeds the hosting file limit`);
    const hash=createHash('sha256').update(packed).digest('hex'),file=`packs/${profile}${label?'-'+label:''}-${hash.slice(0,12)}.pack`;fs.writeFileSync(path.join(dist,file),packed);
    return {file,bytes:packed.length,files:Object.keys(contents).length};
  });parts.push(vehiclePack,swimPack);
  const bytes=parts.reduce((total,p)=>total+p.bytes,0);
  manifest[profile]={...(parts.length===1?parts[0]:{parts}),bytes,originalBytes,files:files.size,textureSize:size};
  console.log(`${profile}: ${(originalBytes/1048576).toFixed(2)} -> ${(bytes/1048576).toFixed(2)} MiB, ${files.size} files in ${parts.length} request(s)`);
}
fs.writeFileSync(path.join(dist,'startup-pack-manifest.js'),'// Generated by scripts/build-startup-packs.mjs.\nexport const STARTUP_PACKS='+JSON.stringify(manifest)+';\n');
const active=new Set(Object.values(manifest).flatMap(p=>(p.parts||[p]).map(part=>path.basename(part.file))));
for(const file of fs.readdirSync(output))if(file.endsWith('.pack')&&!active.has(file))fs.unlinkSync(path.join(output,file));
