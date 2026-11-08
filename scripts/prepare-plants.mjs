import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {MeshoptSimplifier} from './vendor/meshopt_simplifier.module.js';

// Prepare downloaded, unmodified CC0 Poly Haven assets for the browser.
// Usage: node scripts/prepare-plants.mjs /path/to/plants-source
// Each input folder must contain model.gltf, its .bin, and textures/{diff,
// nor_gl,arm}_1k.jpg plus alpha.png. Source downloads stay outside the Site.
// https://polyhaven.com/a/fern_02
// https://polyhaven.com/a/flower_heliophila
// https://polyhaven.com/license
const input=process.argv[2];
if(!input)throw new Error('Pass the directory containing fern_02 and flower_heliophila source folders.');
const output=new URL('../dist/nature/',import.meta.url).pathname;
const components={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures=true;

for(const [name,targets] of [['fern_02',null],['flower_heliophila',[4200,2500,1300]]]){
  const sourceDir=path.join(input,name),targetDir=path.join(output,name);
  const source=JSON.parse(fs.readFileSync(path.join(sourceDir,'model.gltf'),'utf8'));
  const binary=fs.readFileSync(path.join(sourceDir,source.buffers[0].uri));
  fs.mkdirSync(path.join(targetDir,'textures'),{recursive:true});

  // The official masks are 16-bit grayscale PNGs. Divide by 257 rather than
  // using Pillow's direct L conversion, which would clamp nearly all samples.
  execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python',['-c',`
from pathlib import Path
import sys
import numpy as np
from PIL import Image
name, source, target = sys.argv[1:]
source, target = Path(source), Path(target)
diff = Image.open(source / (name + '_diff_1k.jpg')).convert('RGB')
raw = np.asarray(Image.open(source / 'alpha.png'))
if raw.ndim == 3:
    raw = raw[:, :, 0]
mask = (raw.astype(np.float32) / (257 if raw.max() > 255 else 1)).round().clip(0,255).astype(np.uint8)
if mask.shape != (diff.height, diff.width):
    raise ValueError('Diffuse and alpha dimensions differ')
rgba = diff.convert('RGBA')
rgba.putalpha(Image.fromarray(mask, 'L'))
rgba.save(target / (name + '_diff_1k.png'), optimize=True)
` ,name,path.join(sourceDir,'textures'),path.join(targetDir,'textures')]);
  for(const suffix of ['nor_gl','arm'])fs.copyFileSync(path.join(sourceDir,'textures',`${name}_${suffix}_1k.jpg`),path.join(targetDir,'textures',`${name}_${suffix}_1k.jpg`));

  const d=structuredClone(source),chunks=[];
  let offset=0,triangles=0;
  d.accessors=[];d.bufferViews=[];
  function read(index){
    const a=source.accessors[index],v=source.bufferViews[a.bufferView],C=components[a.componentType],n=sizes[a.type];
    const start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*C.BYTES_PER_ELEMENT;
    const array=new C(a.count*n);
    for(let i=0;i<a.count;i++)array.set(new C(binary.buffer,binary.byteOffset+start+i*stride,n),i*n);
    return array;
  }
  function addAccessor(array,type,componentType){
    const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
    const view=d.bufferViews.length,data=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
    d.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.byteLength});
    const n=sizes[type],a={bufferView:view,componentType,count:array.length/n,type};
    if(type==='VEC3'){
      a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<a.count;i++)for(let j=0;j<3;j++){
        a.min[j]=Math.min(a.min[j],array[i*n+j]);a.max[j]=Math.max(a.max[j],array[i*n+j]);
      }
    }
    const index=d.accessors.length;d.accessors.push(a);chunks.push(data);offset+=data.byteLength;return index;
  }
  for(let m=0;m<source.meshes.length;m++)for(let p=0;p<source.meshes[m].primitives.length;p++){
    const original=source.meshes[m].primitives[p],positions=read(original.attributes.POSITION),normals=read(original.attributes.NORMAL),uv=read(original.attributes.TEXCOORD_0);
    let indices=new Uint32Array(read(original.indices));
    if(targets){
      const attrs=new Float32Array(positions.length/3*5);
      for(let i=0;i<positions.length/3;i++)attrs.set([uv[i*2],uv[i*2+1],normals[i*3],normals[i*3+1],normals[i*3+2]],i*5);
      // Attribute-aware simplification retains atlas UVs and leaf normals.
      const result=MeshoptSimplifier.simplifyWithAttributes(indices,positions,3,attrs,5,[.12,.12,.008,.008,.008],null,Math.min(indices.length,targets[m]*3),.08,['Prune']);
      indices=result[0];
      console.log(`${name} variant ${m}: ${indices.length/3} triangles, relative error ${result[1].toFixed(4)}`);
    }
    const [remap,count]=MeshoptSimplifier.compactMesh(indices);
    const primitive={attributes:{},indices:addAccessor(indices,'SCALAR',5125),material:original.material};
    for(const [key,index] of Object.entries(original.attributes)){
      const a=source.accessors[index],n=sizes[a.type],old=read(index),compact=new old.constructor(count*n);
      for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)compact.set(old.subarray(i*n,i*n+n),remap[i]*n);
      primitive.attributes[key]=addAccessor(compact,a.type,a.componentType);
    }
    d.meshes[m].primitives[p]=primitive;triangles+=indices.length/3;
  }
  d.materials.forEach(m=>{m.alphaMode='MASK';m.alphaCutoff=.42;m.doubleSided=true;});
  for(const image of d.images)if(image.uri.includes('_diff_')){image.uri=image.uri.replace('.jpg','.png');image.mimeType='image/png';}
  d.buffers=[{uri:`${name}.bin`,byteLength:offset}];
  fs.writeFileSync(path.join(targetDir,'model.gltf'),JSON.stringify(d));
  fs.writeFileSync(path.join(targetDir,`${name}.bin`),Buffer.concat(chunks));
  console.log(`${name}: ${triangles} triangles, ${(offset/1048576).toFixed(2)} MiB mesh`);
}
