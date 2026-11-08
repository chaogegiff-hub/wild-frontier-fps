import fs from 'node:fs';
import path from 'node:path';
import {MeshoptSimplifier} from './vendor/meshopt_simplifier.module.js';

// Build texture-preserving LODs from the unmodified CC0 Poly Haven tree.
// The original download stays outside the Site; only compact meshes are shipped.
const input=process.argv[2];
if(!input)throw new Error('Pass the downloaded tree directory.');
const source=JSON.parse(fs.readFileSync(path.join(input,'model.gltf'),'utf8'));
const bin=fs.readFileSync(path.join(input,source.buffers[0].uri));
const output=new URL('../source-assets/legacy/nature/tree/',import.meta.url).pathname;
fs.mkdirSync(output,{recursive:true});
fs.cpSync(path.join(input,'textures'),path.join(output,'textures'),{recursive:true});
const components={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function read(index){
  const a=source.accessors[index],v=source.bufferViews[a.bufferView],C=components[a.componentType],n=sizes[a.type],o=v.byteOffset+(a.byteOffset||0),stride=v.byteStride||n*C.BYTES_PER_ELEMENT;
  if(stride===n*C.BYTES_PER_ELEMENT)return new C(bin.buffer,bin.byteOffset+o,a.count*n);
  const out=new C(a.count*n);
  for(let i=0;i<a.count;i++)out.set(new C(bin.buffer,bin.byteOffset+o+i*stride,n),i*n);
  return out;
}
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures=true;
for(const [name,targets,error] of [['high',[10000,46000,5500],.007],['medium',[3200,13500,2200],.018],['low',[900,4300,750],.038]]){
  const d=structuredClone(source),chunks=[];let offset=0;d.accessors=[];d.bufferViews=[];
  const accessor=(array,type,componentType=5126)=>{
    const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
    const index=d.accessors.length,view=d.bufferViews.length,data=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
    d.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length});
    const count=array.length/sizes[type],a={bufferView:view,componentType,count,type};
    if(type==='VEC3'){
      a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<count;i++)for(let c=0;c<3;c++){a.min[c]=Math.min(a.min[c],array[i*3+c]);a.max[c]=Math.max(a.max[c],array[i*3+c]);}
    }
    d.accessors.push(a);chunks.push(data);offset+=data.length;return index;
  };
  let tris=0;
  for(let p=0;p<source.meshes[0].primitives.length;p++){
    const original=source.meshes[0].primitives[p],positions=read(original.attributes.POSITION),indices=new Uint32Array(read(original.indices));
    const [reduced]=MeshoptSimplifier.simplify(indices,positions,3,Math.min(indices.length,targets[p]*3),error,['Prune']);
    const [remap,count]=MeshoptSimplifier.compactMesh(reduced),primitive={attributes:{},indices:accessor(reduced,'SCALAR',5125),material:original.material};
    for(const [key,ai] of Object.entries(original.attributes)){
      const a=source.accessors[ai],n=sizes[a.type],old=read(ai),compact=new old.constructor(count*n);
      for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)compact.set(old.subarray(i*n,i*n+n),remap[i]*n);
      primitive.attributes[key]=accessor(compact,a.type,a.componentType);
    }
    d.meshes[0].primitives[p]=primitive;tris+=reduced.length/3;
  }
  d.materials.forEach(m=>{if(m.alphaMode==='BLEND'){m.alphaMode='MASK';m.alphaCutoff=.42;m.doubleSided=true;}});
  for(const image of d.images){
    const png=image.uri.replace('.jpg','.png');
    if(image.name.includes('alpha')&&fs.existsSync(path.join(output,png))){image.uri=png;image.mimeType='image/png';}
  }
  d.buffers=[{uri:`${name}.bin`,byteLength:offset}];
  fs.writeFileSync(path.join(output,`${name}.gltf`),JSON.stringify(d));
  fs.writeFileSync(path.join(output,`${name}.bin`),Buffer.concat(chunks));
  console.log(`${name}: ${tris} triangles, ${(offset/1048576).toFixed(2)} MiB`);
}
