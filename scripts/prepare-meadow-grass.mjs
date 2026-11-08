import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {MeshoptSimplifier} from './vendor/meshopt_simplifier.module.js';

// Input is the unmodified public grass_medium_02 glTF plus 1K textures and
// the separate 16-bit alpha PNG from https://api.polyhaven.com/files/grass_medium_02.
// node scripts/prepare-meadow-grass.mjs /path/to/grass_medium_02
const sourceDir=process.argv[2];
if(!sourceDir)throw new Error('Pass the grass_medium_02 source folder.');
const targetDir=new URL('../dist/nature/grass_medium_02/',import.meta.url).pathname;
const source=JSON.parse(fs.readFileSync(path.join(sourceDir,'model.gltf'),'utf8'));
const binary=fs.readFileSync(path.join(sourceDir,source.buffers[0].uri));
const classes={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
const selected=[0,2,4],nearTargets=[450,600,850];
fs.mkdirSync(path.join(targetDir,'textures'),{recursive:true});
execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python',['-c',`
from pathlib import Path
import sys
import numpy as np
from PIL import Image
source, target = map(Path, sys.argv[1:])
color = Image.open(source / 'grass_medium_02_diff_1k.jpg').convert('RGB')
raw = np.asarray(Image.open(source / 'alpha.png'))
if raw.ndim == 3: raw = raw[:, :, 0]
alpha = np.rint(raw.astype(np.float32) / (257 if raw.max() > 255 else 1)).clip(0, 255).astype(np.uint8)
assert alpha.shape == (color.height, color.width)
rgba = color.convert('RGBA')
rgba.putalpha(Image.fromarray(alpha, 'L'))
rgba.save(target / 'grass_medium_02_diff_1k.png', optimize=True)
`,path.join(sourceDir,'textures'),path.join(targetDir,'textures')]);
for(const suffix of ['nor_gl','arm'])fs.copyFileSync(path.join(sourceDir,'textures',`grass_medium_02_${suffix}_1k.jpg`),path.join(targetDir,'textures',`grass_medium_02_${suffix}_1k.jpg`));
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures=true;

function read(index){
  const a=source.accessors[index],v=source.bufferViews[a.bufferView],C=classes[a.componentType],n=sizes[a.type];
  const start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*C.BYTES_PER_ELEMENT;
  const array=new C(a.count*n);
  for(let i=0;i<a.count;i++)array.set(new C(binary.buffer,binary.byteOffset+start+i*stride,n),i*n);
  return array;
}
function attributes(primitive){
  const position=read(primitive.attributes.POSITION),normal=read(primitive.attributes.NORMAL),uv=read(primitive.attributes.TEXCOORD_0);
  const weights=new Float32Array(position.length/3*5);
  for(let i=0;i<position.length/3;i++)weights.set([uv[i*2],uv[i*2+1],normal[i*3],normal[i*3+1],normal[i*3+2]],i*5);
  return {position,weights};
}
function bladeGroups(indices,vertices){
  // Each disconnected island is an actual photographed blade. Keeping all
  // islands in the far LOD avoids replacing the plant with unrelated quads.
  const parent=Uint32Array.from({length:vertices},(_,i)=>i);
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(let i=0;i<indices.length;i+=3){const r=root(indices[i]);parent[root(indices[i+1])]=r;parent[root(indices[i+2])]=r;}
  const groups=new Map();
  for(let i=0;i<indices.length;i+=3){const r=root(indices[i]);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(indices[i],indices[i+1],indices[i+2]);}
  return [...groups.values()].map(v=>new Uint32Array(v));
}

const stats=[];
for(const lod of ['model','low']){
  const d={asset:{version:'2.0',generator:'Wild Frontier CC0 grass preparation'},scene:0,scenes:[{nodes:[0,1,2]}],nodes:[],meshes:[],materials:structuredClone(source.materials),textures:structuredClone(source.textures),images:structuredClone(source.images),samplers:structuredClone(source.samplers||[]),buffers:[],bufferViews:[],accessors:[]};
  const chunks=[];let offset=0;
  function add(array,type,componentType){
    const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
    const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=d.bufferViews.length;
    d.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.byteLength});offset+=data.byteLength;chunks.push(data);
    const n=sizes[type],a={bufferView:view,componentType,count:array.length/n,type};
    if(type==='VEC3'){
      a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<a.count;i++)for(let j=0;j<3;j++){a.min[j]=Math.min(a.min[j],array[i*n+j]);a.max[j]=Math.max(a.max[j],array[i*n+j]);}
    }
    const index=d.accessors.length;d.accessors.push(a);return index;
  }
  for(let vi=0;vi<selected.length;vi++){
    const mi=selected[vi],original=source.meshes[mi].primitives[0],{position,weights}=attributes(original),originalIndices=new Uint32Array(read(original.indices));
    let indices,error=0;
    if(lod==='model'){
      [indices,error]=MeshoptSimplifier.simplifyWithAttributes(originalIndices,position,3,weights,5,[.3,.3,.01,.01,.01],null,nearTargets[vi]*3,.06,['Prune']);
    }else{
      const groups=bladeGroups(originalIndices,position.length/3),parts=[];
      for(const blade of groups){
        const result=MeshoptSimplifier.simplifyWithAttributes(blade,position,3,weights,5,[.3,.3,.005,.005,.005],null,12,.15,[]);
        parts.push(result[0]);error=Math.max(error,result[1]);
      }
      indices=new Uint32Array(parts.reduce((n,p)=>n+p.length,0));let cursor=0;
      for(const part of parts){indices.set(part,cursor);cursor+=part.length;}
    }
    const [remap,count]=MeshoptSimplifier.compactMesh(indices),primitive={attributes:{},indices:add(indices,'SCALAR',5125),material:original.material};
    const min=source.accessors[original.attributes.POSITION].min,max=source.accessors[original.attributes.POSITION].max;
    const center=[(min[0]+max[0])/2,min[1],(min[2]+max[2])/2];
    for(const [key,index] of Object.entries(original.attributes)){
      const a=source.accessors[index],n=sizes[a.type],old=read(index),compact=new old.constructor(count*n);
      for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff){
        compact.set(old.subarray(i*n,i*n+n),remap[i]*n);
        if(key==='POSITION')for(let j=0;j<3;j++)compact[remap[i]*n+j]-=center[j];
      }
      if(key==='POSITION'){
        let floor=Infinity;for(let i=1;i<compact.length;i+=3)floor=Math.min(floor,compact[i]);
        for(let i=1;i<compact.length;i+=3)compact[i]-=floor;
      }
      primitive.attributes[key]=add(compact,a.type,a.componentType);
    }
    const name=`grass_medium_02_${['a','c','e'][vi]}`;
    d.nodes.push({mesh:vi,name});d.meshes.push({name,primitives:[primitive]});
    const bounds=d.accessors[primitive.attributes.POSITION];
    stats.push({lod,variant:name,sourceTriangles:originalIndices.length/3,triangles:indices.length/3,vertices:count,relativeError:error,min:bounds.min,max:bounds.max});
  }
  for(const m of d.materials){m.alphaMode='MASK';m.alphaCutoff=.38;m.doubleSided=true;}
  for(const image of d.images)if(image.uri.includes('_diff_')){image.uri=image.uri.replace('.jpg','.png');image.mimeType='image/png';}
  const bin=`${lod}.bin`;d.buffers=[{uri:bin,byteLength:offset}];
  fs.writeFileSync(path.join(targetDir,`${lod}.gltf`),JSON.stringify(d));fs.writeFileSync(path.join(targetDir,bin),Buffer.concat(chunks));
}
fs.writeFileSync(path.join(targetDir,'conversion.json'),JSON.stringify({source:'https://polyhaven.com/a/grass_medium_02',author:'Rico Cilliers',license:'CC0-1.0',up:'Y',units:'metres',transforms:'Each clump centered in X/Z; its minimum Y grounded to zero; source display offsets removed.',alpha:'Separate original 16-bit grayscale PNG divided by 257 and combined with 1K diffuse; exact source silhouette, no crop.',stats},null,2)+'\n');
console.log(JSON.stringify(stats,null,2));
