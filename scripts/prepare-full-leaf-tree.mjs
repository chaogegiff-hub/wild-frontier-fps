import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {MeshoptSimplifier as Simplifier} from './vendor/meshopt_simplifier.module.js';

// Source is the original, unmodified CC0 Poly Haven tree_small_02 glTF + .bin.
// Each disconnected original leaf retains its own 3D orientation, UV island,
// original photo alpha and PBR maps. No crown clusters or crossed cards are used.
const input=process.argv[2];
if(!input)throw new Error('Usage: node scripts/prepare-full-leaf-tree.mjs /path/to/original-tree-small-02');
const output=new URL('../dist/nature/woodland_tree_03/',import.meta.url).pathname;
const source=JSON.parse(fs.readFileSync(path.join(input,'model.gltf'),'utf8'));
const binary=fs.readFileSync(path.join(input,source.buffers[0].uri));
if(binary.length!==95102324)throw new Error('Use the original, unreduced source geometry.');
const sha256=crypto.createHash('sha256').update(binary).digest('hex');
const CTypes={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function read(index){const a=source.accessors[index],v=source.bufferViews[a.bufferView],C=CTypes[a.componentType],n=sizes[a.type],start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*C.BYTES_PER_ELEMENT;if(stride===n*C.BYTES_PER_ELEMENT)return new C(binary.buffer,binary.byteOffset+start,a.count*n);const out=new C(a.count*n);for(let i=0;i<a.count;i++)out.set(new C(binary.buffer,binary.byteOffset+start+i*stride,n),i*n);return out;}
const originalBBox={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
for(const mesh of source.meshes)for(const p of mesh.primitives){const a=source.accessors[p.attributes.POSITION];for(let c=0;c<3;c++){originalBBox.min[c]=Math.min(originalBBox.min[c],a.min[c]);originalBBox.max[c]=Math.max(originalBBox.max[c],a.max[c]);}}
const origin=[(originalBBox.min[0]+originalBBox.max[0])/2,originalBBox.min[1],(originalBBox.min[2]+originalBBox.max[2])/2];
await Simplifier.ready;Simplifier.useExperimentalFeatures=true;
const leaf=source.meshes[0].primitives.find(p=>source.materials[p.material].name.includes('leaves'));
const positions=read(leaf.attributes.POSITION),uv=read(leaf.attributes.TEXCOORD_0),normal=read(leaf.attributes.NORMAL),indices=read(leaf.indices);
const vertexCount=positions.length/3,parent=new Uint32Array(vertexCount);for(let i=0;i<parent.length;i++)parent[i]=i;
function find(x){while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;}
function union(a,b){a=find(a);b=find(b);if(a!==b)parent[b]=a;}
for(let t=0;t<indices.length;t+=3){union(indices[t],indices[t+1]);union(indices[t+1],indices[t+2]);}
const components=new Map();for(let t=0;t<indices.length;t+=3){let label=find(indices[t]),part=components.get(label);if(!part){part=[];components.set(label,part);}part.push(indices[t],indices[t+1],indices[t+2]);}
// Each source leaf is projected back onto its own original UV plane. This
// keeps the photographic alpha outline; topology-only reduction cut that outline.
const uv1=read(leaf.attributes.TEXCOORD_1),leafPositions=[],leafNormals=[],leafUvs=[],leafUv1=[];
function solve3(A,b){const m=A.map((row,i)=>[...row,b[i]]);for(let k=0;k<3;k++){let pivot=k;for(let i=k+1;i<3;i++)if(Math.abs(m[i][k])>Math.abs(m[pivot][k]))pivot=i;[m[k],m[pivot]]=[m[pivot],m[k]];if(Math.abs(m[k][k])<1e-12)return [0,0,b[2]/Math.max(A[2][2],1)];const div=m[k][k];for(let j=k;j<4;j++)m[k][j]/=div;for(let i=0;i<3;i++)if(i!==k){const f=m[i][k];for(let j=k;j<4;j++)m[i][j]-=f*m[k][j];}}return m.map(row=>row[3]);}
const leaves=[];let leafNumber=0;
for(const ar of components.values()){
 const ids=[...new Set(ar)],A=[[0,0,0],[0,0,0],[0,0,0]],rhs=Array.from({length:5},()=>[0,0,0]);let center=[0,0,0],averageNormal=[0,0,0],minUv=[Infinity,Infinity],maxUv=[-Infinity,-Infinity];
 for(const id of ids){const v=[uv[id*2],uv[id*2+1],1],values=[positions[id*3],positions[id*3+1],positions[id*3+2],uv1[id*2],uv1[id*2+1]];for(let k=0;k<3;k++){center[k]+=values[k]/ids.length;averageNormal[k]+=normal[id*3+k];for(let j=0;j<3;j++)A[k][j]+=v[k]*v[j];}for(let k=0;k<5;k++)for(let j=0;j<3;j++)rhs[k][j]+=v[j]*values[k];for(let k=0;k<2;k++){minUv[k]=Math.min(minUv[k],v[k]);maxUv[k]=Math.max(maxUv[k],v[k]);}}
 const coefficients=rhs.map(r=>solve3(A,r)),base=leafPositions.length/3,norm=Math.hypot(...averageNormal)||1;averageNormal=averageNormal.map(v=>v/norm);
 const corners=[[minUv[0],minUv[1]],[maxUv[0],minUv[1]],[maxUv[0],maxUv[1]],[minUv[0],maxUv[1]]];
 for(const v of corners){const fitted=coefficients.map(c=>c[0]*v[0]+c[1]*v[1]+c[2]);leafPositions.push(...fitted.slice(0,3));leafNormals.push(...averageNormal);leafUvs.push(...v);leafUv1.push(...fitted.slice(3));}
 const reducedSource=new Uint32Array([base,base+1,base+2,base,base+2,base+3]);
 let area=0;for(let t=0;t<ar.length;t+=3){const a=ar[t]*3,b=ar[t+1]*3,c=ar[t+2]*3,ab=[positions[b]-positions[a],positions[b+1]-positions[a+1],positions[b+2]-positions[a+2]],ac=[positions[c]-positions[a],positions[c+1]-positions[a+1],positions[c+2]-positions[a+2]];area+=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])*.5;}
 const hash=(((Math.imul(leafNumber+1,2654435761)>>>0)^Math.imul(leafNumber+11,1597334677))>>>0)/4294967296;
 const cell=center.map(v=>Math.floor(v/.32)).join(',');
 leaves.push({indices:reducedSource,center,cell,area,score:hash+.16*Math.min(1,area/.012),sourceTriangles:ar.length/3,order:leafNumber++});
}
const leafArrays={POSITION:new Float32Array(leafPositions),NORMAL:new Float32Array(leafNormals),TEXCOORD_0:new Float32Array(leafUvs),TEXCOORD_1:new Float32Array(leafUv1)};
// One representative per occupied 32 cm canopy voxel protects outer twigs.
// Additional leaves are deterministic, area-weighted samples of the source.
const cells=new Map();for(const l of leaves){const old=cells.get(l.cell);if(!old||l.area>old.area)cells.set(l.cell,l);}
const representatives=new Set([...cells.values()].map(l=>l.order));
leaves.sort((a,b)=>(Number(representatives.has(b.order))-Number(representatives.has(a.order)))||b.score-a.score||a.order-b.order);
fs.mkdirSync(path.join(output,'textures'),{recursive:true});
// Copy the already correctly converted RGBA photo; original alpha is 16-bit.
execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python',['-c',`
from pathlib import Path
from PIL import Image
import numpy as np,sys
from scipy.ndimage import distance_transform_edt
src,out,alpha=map(Path,sys.argv[1:])
for f in src.glob('*.jpg'):
 im=Image.open(f).convert('RGB')
 if '_leaves_diff_' in f.name:
  raw=np.asarray(Image.open(alpha));raw=raw[:,:,0] if raw.ndim==3 else raw
  mask=np.rint(raw.astype('float32')/(257 if raw.max()>255 else 1)).clip(0,255).astype('uint8')
  im=im.convert('RGBA');im.putalpha(Image.fromarray(mask))
  rgba=np.array(im);transparent=mask==0
  nearest=distance_transform_edt(transparent,return_distances=False,return_indices=True)
  rgba[transparent,:3]=rgba[nearest[0][transparent],nearest[1][transparent],:3]
  Image.fromarray(rgba).save(out/f.name.replace('.jpg','.png'),optimize=True)
 else:
  size=1024 if '_diff_' in f.name else 512
  if max(im.size)>size:im.thumbnail((size,size),Image.Resampling.LANCZOS)
  im.save(out/f.name,quality=84,subsampling=0,optimize=True)
`,path.join(input,'textures'),path.join(output,'textures'),new URL('../source-assets/legacy/nature/tree/textures/alpha.png',import.meta.url).pathname]);
const metadata={name:'woodland_tree_03',source:'https://polyhaven.com/a/tree_small_02',author:'Rico Cilliers',license:'CC0-1.0',originalBBox,origin,sourceGeometryBytes:binary.length,sourceGeometrySha256:sha256,sourceLeafComponents:components.size,sourceLeafTriangles:indices.length/3,leafRepresentation:'One UV-fitted leaf surface per original separate leaf/twig mesh island, preserving source location, orientation, original UV bounds and photographic alpha. No crossed crown cards or cluster atlas.',lods:[]};
for(const [lod,leafBudget,barkTargets] of [['high',60500,[1800,1600]],['low',40000,[900,700]]]){
 const d=structuredClone(source),chunks=[];let offset=0;d.accessors=[];d.bufferViews=[];
 function add(array,type,componentType){const pad=(-offset)&3;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=d.bufferViews.length;d.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length});const a={bufferView:view,componentType,count:array.length/sizes[type],type};if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.count;i++)for(let c=0;c<3;c++){a.min[c]=Math.min(a.min[c],array[i*3+c]);a.max[c]=Math.max(a.max[c],array[i*3+c]);}}const ai=d.accessors.length;d.accessors.push(a);chunks.push(data);offset+=data.length;return ai;}
 const selected=[];let leafTriangles=0;for(const l of leaves){const n=l.indices.length/3;if(leafTriangles+n<=leafBudget){selected.push(l);leafTriangles+=n;}}
 const leafIndices=new Uint32Array(leafTriangles*3);let cursor=0;for(const l of selected){leafIndices.set(l.indices,cursor);cursor+=l.indices.length;}
 const parts=[];let barkIndex=0;
 for(let m=0;m<source.meshes.length;m++)for(let p=0;p<source.meshes[m].primitives.length;p++){
  const old=source.meshes[m].primitives[p],isLeaf=source.materials[old.material].name.includes('leaves');let ix;
  if(isLeaf)ix=leafIndices;else{const pos=read(old.attributes.POSITION),norm=read(old.attributes.NORMAL),u=read(old.attributes.TEXCOORD_0),attr=new Float32Array(pos.length/3*5);for(let i=0;i<pos.length/3;i++)attr.set([u[i*2],u[i*2+1],norm[i*3],norm[i*3+1],norm[i*3+2]],i*5);[ix]=Simplifier.simplifyWithAttributes(new Uint32Array(read(old.indices)),pos,3,attr,5,[.15,.15,.008,.008,.008],null,barkTargets[barkIndex++]*3,.15,['Prune']);}
  const [remap,count]=Simplifier.compactMesh(ix),primitive={material:old.material,attributes:{},indices:add(ix,'SCALAR',5125)};
  for(const [key,ai] of Object.entries(old.attributes)){
   // Bark materials use TEXCOORD_1; leaf materials only use TEXCOORD_0.
   if(isLeaf&&key==='TEXCOORD_1')continue;
   const a=source.accessors[ai],n=sizes[a.type],src=isLeaf?leafArrays[key]:read(ai),dst=new src.constructor(count*n);
   for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff){const at=remap[i]*n;dst.set(src.subarray(i*n,i*n+n),at);if(key==='POSITION')for(let k=0;k<3;k++)dst[at+k]-=origin[k];if(a.componentType===5126){const precision=key==='POSITION'?4096:key.startsWith('TEXCOORD')?8192:2048;for(let k=0;k<n;k++)dst[at+k]=Math.round(dst[at+k]*precision)/precision;}}
   primitive.attributes[key]=add(dst,a.type,a.componentType);
  }
  d.meshes[m].primitives[p]=primitive;parts.push({name:source.materials[old.material].name,triangles:ix.length/3,vertices:count});
 }
 for(const mat of d.materials)if(mat.name.includes('leaves')){mat.alphaMode='MASK';mat.alphaCutoff=.38;mat.doubleSided=true;}
 for(const im of d.images)if(im.uri.includes('_leaves_diff_')){im.uri=im.uri.replace('.jpg','.png');im.mimeType='image/png';}
 d.buffers=[{uri:`${lod}.bin`,byteLength:offset}];d.asset.generator='Wild Frontier original individual leaf-island LOD';
 fs.writeFileSync(path.join(output,`${lod}.gltf`),JSON.stringify(d));fs.writeFileSync(path.join(output,`${lod}.bin`),Buffer.concat(chunks));
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const mesh of d.meshes)for(const p of mesh.primitives){const a=d.accessors[p.attributes.POSITION];for(let c=0;c<3;c++){min[c]=Math.min(min[c],a.min[c]);max[c]=Math.max(max[c],a.max[c]);}}
 metadata.lods.push({name:lod,triangles:parts.reduce((s,p)=>s+p.triangles,0),leafTriangles,retainedOriginalLeafComponents:selected.length,occupiedCanopyVoxels:cells.size,meshBytes:offset,bbox:{min,max},dimensions:max.map((v,i)=>v-min[i]),parts});
 console.log(lod,metadata.lods.at(-1).triangles,'triangles,',selected.length,'individual original leaf/twig islands');
}
metadata.farAtlas={reuse:'../woodland_tree_02/impostor.png',sameOriginalTree:true,frames:8,planeSizeMeters:[5.4,5.4],planeCenterY:2.28};
fs.writeFileSync(path.join(output,'conversion.json'),JSON.stringify(metadata,null,2)+'\n');
fs.writeFileSync(path.join(output,'SOURCE.md'),`# Original individual leaf woodland tree\n\nSource: https://polyhaven.com/a/tree_small_02\n\nAuthor: Rico Cilliers\n\nLicense: CC0-1.0 — https://polyhaven.com/license\n\nThe original tree's separate 3D leaf/twig islands are fitted individually to their own UV planes and original UV bounds, retaining their original spatial positions/orientations and full photographic alpha outlines. These individual leaf surfaces replace the fine curved tessellation of the source; no large crossed-photo-cluster crowns are used. The high LOD retains every original leaf/twig island. The middle LOD deterministically samples individual leaves while retaining every occupied 32 cm canopy voxel. This is an authored game LOD of a CC0 model, not a newly scanned tree.\n\nOriginal photographic leaf albedo uses the original 16-bit alpha divided by 257, stored RGBA at 1024px with transparent RGB edge dilation to prevent dark mip halos. Bark albedo remains 1024px; normal/ARM maps are 512px. The source's UV transforms and all material-used UV sets are preserved; only the unused leaf second UV channel is omitted. Grounded at Y=0 with the original crown centered on X/Z. The existing eight-view woodland_tree_02 far atlas was baked from this exact original model and coordinate convention.\n\nReproduce: node scripts/prepare-full-leaf-tree.mjs /path/to/original-tree-small-02\n\nExact triangle counts, source checksum, original leaf counts and dimensions: conversion.json.\n`);
