import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {MeshoptSimplifier} from './vendor/meshopt_simplifier.module.js';

// node scripts/prepare-woodland-tree.mjs unmodified-tree-small-02-directory
// Distinct asset folder: legacy tree LODs and app integration stay untouched.
const input=process.argv[2];
if(!input)throw new Error('Pass the original tree_small_02 directory.');
const output=new URL('../dist/nature/woodland_tree_02/',import.meta.url).pathname;
const source=JSON.parse(fs.readFileSync(path.join(input,'model.gltf'),'utf8'));
const binary=fs.readFileSync(path.join(input,source.buffers[0].uri));
const components={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function read(index){
  const a=source.accessors[index],v=source.bufferViews[a.bufferView],C=components[a.componentType],n=sizes[a.type];
  const start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*C.BYTES_PER_ELEMENT;
  const array=new C(a.count*n);
  for(let i=0;i<a.count;i++)array.set(new C(binary.buffer,binary.byteOffset+start+i*stride,n),i*n);
  return array;
}
const bbox={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
for(const mesh of source.meshes)for(const p of mesh.primitives){
  const a=source.accessors[p.attributes.POSITION];
  for(let c=0;c<3;c++){bbox.min[c]=Math.min(bbox.min[c],a.min[c]);bbox.max[c]=Math.max(bbox.max[c],a.max[c]);}
}
const origin=[(bbox.min[0]+bbox.max[0])/2,bbox.min[1],(bbox.min[2]+bbox.max[2])/2];
const metadata={name:'woodland_tree_02',originalAsset:'tree_small_02',source:'https://polyhaven.com/a/tree_small_02',author:'Rico Cilliers',license:'CC0-1.0',originalBBox:bbox,origin,lods:[]};
fs.mkdirSync(path.join(output,'textures'),{recursive:true});
execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python',['-c',`
from pathlib import Path
from PIL import Image
import sys,numpy as np
source,target,alpha=sys.argv[1:]
source,target=Path(source),Path(target)
for f in source.glob('*.jpg'):
 im=Image.open(f).convert('RGB')
 if '_leaves_diff_' in f.name:
  raw=np.asarray(Image.open(alpha));raw=raw[:,:,0] if raw.ndim==3 else raw
  mask=np.rint(raw.astype('float32')/(257 if raw.max()>255 else 1)).clip(0,255).astype('uint8')
  im=im.convert('RGBA');im.putalpha(Image.fromarray(mask));im.save(target/f.name.replace('.jpg','.png'),optimize=True)
 else:im.save(target/f.name,quality=86,subsampling=0,optimize=True)
`,path.join(input,'textures'),path.join(output,'textures'),new URL('../source-assets/legacy/nature/tree/textures/alpha.png',import.meta.url).pathname]);
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures=true;
for(const [lod,targets,error] of [['high',[2500,26000,1500],.15],['low',[1500,10000,500],.22]]){
  const d=structuredClone(source),chunks=[];let offset=0;d.accessors=[];d.bufferViews=[];
  function addAccessor(array,type,componentType){
    const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
    const view=d.bufferViews.length,data=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
    d.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.byteLength});
    const n=sizes[type],a={bufferView:view,componentType,count:array.length/n,type};
    if(type==='VEC3'){
      a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<a.count;i++)for(let c=0;c<3;c++){a.min[c]=Math.min(a.min[c],array[i*n+c]);a.max[c]=Math.max(a.max[c],array[i*n+c]);}
    }
    const index=d.accessors.length;d.accessors.push(a);chunks.push(data);offset+=data.byteLength;return index;
  }
  const parts=[];
  for(let m=0;m<source.meshes.length;m++)for(let p=0;p<source.meshes[m].primitives.length;p++){
    const original=source.meshes[m].primitives[p],positions=read(original.attributes.POSITION),normals=read(original.attributes.NORMAL),uv=read(original.attributes.TEXCOORD_0);
    const oldIndices=new Uint32Array(read(original.indices));
    const attrs=new Float32Array(positions.length/3*5);
    for(let i=0;i<positions.length/3;i++)attrs.set([uv[i*2],uv[i*2+1],normals[i*3],normals[i*3+1],normals[i*3+2]],i*5);
    const [indices,relativeError]=MeshoptSimplifier.simplifyWithAttributes(oldIndices,positions,3,attrs,5,[.15,.15,.008,.008,.008],null,Math.min(oldIndices.length,targets[p]*3),error,['Prune']);
    const [remap,count]=MeshoptSimplifier.compactMesh(indices);
    const primitive={attributes:{},indices:addAccessor(indices,'SCALAR',5125),material:original.material};
    for(const [key,index] of Object.entries(original.attributes)){
      const a=source.accessors[index],n=sizes[a.type],old=read(index),compact=new old.constructor(count*n);
      for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff){
        const dest=remap[i]*n;compact.set(old.subarray(i*n,i*n+n),dest);
        if(key==='POSITION')for(let c=0;c<3;c++)compact[dest+c]-=origin[c];
        if(a.componentType===5126){const precision=key==='POSITION'?4096:key.startsWith('TEXCOORD')?8192:2048;for(let c=0;c<n;c++)compact[dest+c]=Math.round(compact[dest+c]*precision)/precision;}
      }
      primitive.attributes[key]=addAccessor(compact,a.type,a.componentType);
    }
    d.meshes[m].primitives[p]=primitive;
    parts.push({material:source.materials[original.material].name,originalTriangles:oldIndices.length/3,triangles:indices.length/3,relativeError});
    console.log(`${lod} ${parts.at(-1).material}: ${indices.length/3} triangles`);
  }
  for(const mat of d.materials)if(mat.alphaMode==='BLEND'){mat.alphaMode='MASK';mat.alphaCutoff=.38;mat.doubleSided=true;}
  for(const image of d.images)if(image.uri.includes('_leaves_diff_')){image.uri=image.uri.replace('.jpg','.png');image.mimeType='image/png';}
  d.buffers=[{uri:`${lod}.bin`,byteLength:offset}];d.asset.generator='Wild Frontier woodland UV-aware conversion';
  fs.writeFileSync(path.join(output,`${lod}.gltf`),JSON.stringify(d));fs.writeFileSync(path.join(output,`${lod}.bin`),Buffer.concat(chunks));
  metadata.lods.push({name:lod,meshBytes:offset,triangles:parts.reduce((s,p)=>s+p.triangles,0),parts});
}
fs.writeFileSync(path.join(output,'conversion.json'),JSON.stringify(metadata,null,2)+'\n');
fs.writeFileSync(path.join(output,'SOURCE.md'),`# Woodland tree variant\n\nSource: https://polyhaven.com/a/tree_small_02\n\nAuthor: Rico Cilliers\n\nLicense: CC0-1.0 — https://polyhaven.com/license\n\nA different original 3D tree with photographic bark and leaf textures. The original UV islands and PBR maps are kept. The official separate 16-bit alpha is converted by division by 257. Grounded at Y=0, complete crown centered on X/Z; Y-up meters. Reduced meshes require a native projected foliage coverage check before acceptance. See conversion.json for exact dimensions and primitive counts.\n\nReproduce: node scripts/prepare-woodland-tree.mjs /path/to/tree_small_02\n`);
