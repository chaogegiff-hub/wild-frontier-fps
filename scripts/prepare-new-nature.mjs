import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {MeshoptSimplifier} from './vendor/meshopt_simplifier.module.js';

// Usage: node scripts/prepare-new-nature.mjs downloaded-source-directory
// Sources are the unmodified 1K glTFs from the public Poly Haven API.
// Only these new folders are written; startup packs are a separate build step.
const input=process.argv[2];
if(!input)throw new Error('Pass a directory containing island_tree_02 and rock_face_01.');
const output=new URL('../dist/nature/',import.meta.url).pathname;
const components={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures=true;
for(const [name,lods] of [
  ['island_tree_02',[['high',[3600,65000,1800],.055],['low',[1700,45000,1000],.09]]],
  ['rock_face_01',[['model',[12000],.014]]]
]){
  const sourceDir=path.join(input,name),targetDir=path.join(output,name);
  const source=JSON.parse(fs.readFileSync(path.join(sourceDir,'model.gltf'),'utf8'));
  const binary=fs.readFileSync(path.join(sourceDir,source.buffers[0].uri));
  fs.mkdirSync(path.join(targetDir,'textures'),{recursive:true});
  // Separate official alpha PNG is 16-bit grayscale. Convert 0..65535 to
  // 0..255 by division, never Pillow.convert('L'), which clamps most pixels.
  execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python',['-c',`
from pathlib import Path
import sys
import numpy as np
from PIL import Image
name, source, target = sys.argv[1:]
source, target = Path(source), Path(target)
for f in source.glob('*.jpg'):
    im = Image.open(f).convert('RGB')
    # Source 1K maps are JPEG quality ~100. Keep 1K detail, reduce transfer.
    if name == 'island_tree_02' and '_leaves_diff_' in f.name:
        raw = np.asarray(Image.open(source/'alpha.png'))
        if raw.ndim == 3: raw = raw[:,:,0]
        alpha = (raw.astype(np.float32)/(257 if raw.max()>255 else 1)).round().clip(0,255).astype(np.uint8)
        if alpha.shape != (im.height,im.width): raise ValueError('Alpha dimensions differ')
        im=im.convert('RGBA');im.putalpha(Image.fromarray(alpha,'L'))
        im.save(target/f.name.replace('.jpg','.png'),optimize=True)
    else:
        im.save(target/f.name,quality=86,subsampling=0,optimize=True)
`,name,path.join(sourceDir,'textures'),path.join(targetDir,'textures')]);
  function read(index){
    const a=source.accessors[index],v=source.bufferViews[a.bufferView],C=components[a.componentType],n=sizes[a.type];
    const start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*C.BYTES_PER_ELEMENT;
    const array=new C(a.count*n);
    for(let i=0;i<a.count;i++)array.set(new C(binary.buffer,binary.byteOffset+start+i*stride,n),i*n);
    return array;
  }
  const originalBBox={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const mesh of source.meshes)for(const p of mesh.primitives){
    const positions=read(p.attributes.POSITION);
    for(let i=0;i<positions.length;i++){
      const axis=i%3;originalBBox.min[axis]=Math.min(originalBBox.min[axis],positions[i]);
      originalBBox.max[axis]=Math.max(originalBBox.max[axis],positions[i]);
    }
  }
  // Center the complete crown/formation in XZ and set the lowest base to Y=0.
  const origin=[(originalBBox.min[0]+originalBBox.max[0])/2,originalBBox.min[1],(originalBBox.min[2]+originalBBox.max[2])/2];
  const metadata={name,source:`https://polyhaven.com/a/${name}`,license:'CC0-1.0',axis:'Y up, units meters',originalBBox,origin,lods:[]};
  for(const [lod,targets,error] of lods){
    const d=structuredClone(source),chunks=[];let offset=0;
    d.accessors=[];d.bufferViews=[];
    function addAccessor(array,type,componentType){
      const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
      const view=d.bufferViews.length,data=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
      d.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.byteLength});
      const n=sizes[type],a={bufferView:view,componentType,count:array.length/n,type};
      if(type==='VEC3'){
        a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];
        for(let i=0;i<a.count;i++)for(let c=0;c<3;c++){
          a.min[c]=Math.min(a.min[c],array[i*n+c]);a.max[c]=Math.max(a.max[c],array[i*n+c]);
        }
      }
      const index=d.accessors.length;d.accessors.push(a);chunks.push(data);offset+=data.byteLength;return index;
    }
    const parts=[];
    for(let m=0;m<source.meshes.length;m++)for(let p=0;p<source.meshes[m].primitives.length;p++){
      const original=source.meshes[m].primitives[p],positions=read(original.attributes.POSITION),normals=read(original.attributes.NORMAL),uv=read(original.attributes.TEXCOORD_0);
      const originalIndices=new Uint32Array(read(original.indices));
      const attrs=new Float32Array(positions.length/3*5);
      for(let i=0;i<positions.length/3;i++)attrs.set([uv[i*2],uv[i*2+1],normals[i*3],normals[i*3+1],normals[i*3+2]],i*5);
      const [indices,relativeError]=MeshoptSimplifier.simplifyWithAttributes(originalIndices,positions,3,attrs,5,[.15,.15,.008,.008,.008],null,Math.min(originalIndices.length,targets[p]*3),error,['Prune']);
      const [remap,count]=MeshoptSimplifier.compactMesh(indices);
      const primitive={attributes:{},indices:addAccessor(indices,'SCALAR',5125),material:original.material};
      for(const [key,index] of Object.entries(original.attributes)){
        const a=source.accessors[index],n=sizes[a.type],old=read(index),compact=new old.constructor(count*n);
        for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff){
          const dest=remap[i]*n;
          compact.set(old.subarray(i*n,i*n+n),dest);
          if(key==='POSITION')for(let c=0;c<3;c++)compact[dest+c]-=origin[c];
          // Binary-fraction rounding produces ZIP-friendly low bits while
          // retaining <0.13 mm position error, <0.07 pixel at 1K UV error,
          // and fine smooth normal directions. No extra runtime extension.
          if(a.componentType===5126){
            const precision=key==='POSITION'?4096:key.startsWith('TEXCOORD')?8192:2048;
            for(let c=0;c<n;c++)compact[dest+c]=Math.round(compact[dest+c]*precision)/precision;
          }
        }
        primitive.attributes[key]=addAccessor(compact,a.type,a.componentType);
      }
      d.meshes[m].primitives[p]=primitive;
      parts.push({material:source.materials[original.material].name,originalTriangles:originalIndices.length/3,triangles:indices.length/3,relativeError});
      console.log(`${name}/${lod} ${parts.at(-1).material}: ${indices.length/3} triangles, error ${relativeError.toFixed(4)}`);
    }
    for(const mat of d.materials)if(mat.alphaMode==='BLEND'){mat.alphaMode='MASK';mat.alphaCutoff=.40;mat.doubleSided=true;}
    for(const image of d.images)if(image.uri.includes('_leaves_diff_')){image.uri=image.uri.replace('.jpg','.png');image.mimeType='image/png';}
    d.buffers=[{uri:`${lod}.bin`,byteLength:offset}];
    d.nodes.forEach(n=>{delete n.translation;delete n.rotation;delete n.scale;delete n.matrix;});
    d.asset.generator='Wild Frontier attribute-aware Poly Haven conversion';
    fs.writeFileSync(path.join(targetDir,`${lod}.gltf`),JSON.stringify(d));
    fs.writeFileSync(path.join(targetDir,`${lod}.bin`),Buffer.concat(chunks));
    metadata.lods.push({name:lod,meshBytes:offset,triangles:parts.reduce((sum,p)=>sum+p.triangles,0),parts});
  }
  fs.writeFileSync(path.join(targetDir,'conversion.json'),JSON.stringify(metadata,null,2)+'\n');
  const author=name==='island_tree_02'?'Rob Tuytel (scanning and processing), Rico Cilliers (cleanup and processing)':'Dario Barresi';
  fs.writeFileSync(path.join(targetDir,'SOURCE.md'),`# ${name}\n\nSource: https://polyhaven.com/a/${name}\n\nAuthor: ${author}\n\nLicense: CC0-1.0 — https://polyhaven.com/license\n\nDownloaded the public 1K glTF and photo textures. Created compact LOD geometry using UV/normal-aware meshoptimizer simplification; kept photographed material UVs, leaf alpha and 1K PBR maps. Converted the official 16-bit leaf alpha by division by 257. Recompressed opaque JPEG maps at quality 86. Centered X/Z and grounded the base at Y=0; Y-up meters. Rounded float positions to 1/4096 m, UVs to 1/8192 and normals to 1/2048 for efficient ZIP transfer without runtime decoders. Native alpha silhouette comparison determines acceptable foliage LOD density. See conversion.json for exact bounds and triangle counts.\n\nReproduce: node scripts/prepare-new-nature.mjs /path/to/unmodified-downloads\n`);
}
