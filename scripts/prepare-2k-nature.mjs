import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

// Fetch original Poly Haven 2K photography for the active landscape assets.
// This script never enlarges the retained 1K delivery images or edits their UVs.
// Usage: node scripts/prepare-2k-nature.mjs [download-cache-directory]
// Dependencies: curl; Python with Pillow, NumPy and SciPy. License: CC0-1.0.
const run=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const cache=path.resolve(process.argv[2]||path.join(os.tmpdir(),'wild-frontier-nature-2k-source'));
const dest=path.join(root,'dist/hd2k');
await fs.mkdir(cache,{recursive:true});
const surfaces=[
 ['ground.jpg','rocky_trail','Diffuse'],['ground-normal.jpg','rocky_trail','nor_gl'],
 ['rock.jpg','rock_01','Diffuse'],['rock-normal.jpg','rock_01','nor_gl'],
 ['grass.jpg','leafy_grass','Diffuse'],['grass-normal.jpg','leafy_grass','nor_gl'],['grass-rough.jpg','leafy_grass','Rough'],
 ['forest.jpg','brown_mud_leaves_01','Diffuse'],['forest-normal.jpg','brown_mud_leaves_01','nor_gl'],
 ['metal-normal.jpg','metal_plate','nor_gl'],['metal-rough.jpg','metal_plate','Rough'],
 ['wall.jpg','plaster_brick_01','Diffuse'],['wall-normal.jpg','plaster_brick_01','nor_gl'],['wall-rough.jpg','plaster_brick_01','Rough'],
 ['roof.jpg','grey_roof_tiles','Diffuse'],['roof-normal.jpg','grey_roof_tiles','nor_gl'],['roof-rough.jpg','grey_roof_tiles','Rough'],
 ['wood.jpg','wood_planks_dirt','Diffuse'],['wood-normal.jpg','wood_planks_dirt','nor_gl'],['wood-rough.jpg','wood_planks_dirt','Rough']
];
const models=['island_tree_02','woodland_tree_03','grass_medium_02','rock_face_01','rock_moss_set_01','fern_02','flower_heliophila'];
const apiCache=new Map();
async function curl(url,file){
 try {const st=await fs.stat(file);if(st.size>0)return;}catch{}
 await fs.mkdir(path.dirname(file),{recursive:true});
 const tmp=file+'.part';
 await run('curl',['--fail','--location','--silent','--show-error','--retry','3','--connect-timeout','25','--max-time','180',url,'-o',tmp],{maxBuffer:2*1024*1024});
 await fs.rename(tmp,file);
}
async function api(name){
 if(!apiCache.has(name))apiCache.set(name,(async()=>{const f=path.join(cache,`${name}.json`);await curl(`https://api.polyhaven.com/files/${name}`,f);return JSON.parse(await fs.readFile(f,'utf8'));})());
 return apiCache.get(name);
}
async function parallel(items,n,work){let i=0;await Promise.all(Array.from({length:n},async()=>{for(;;){const at=i++;if(at>=items.length)return;await work(items[at],at);}}));}
const jobs=[];
for(const [name,asset,map] of surfaces){
 const a=await api(asset),source=a[map]?.['2k']?.jpg;
 if(!source)throw new Error(`Missing original 2K source: ${asset}/${map}`);
 jobs.push({target:`textures/${name}`,file:`hd2k/textures/${name}`,source:source.url,md5:source.md5});
}
for(const name of models){
 const asset=name==='woodland_tree_03'?'tree_small_02':name,a=await api(asset),dir=path.join(root,'dist/nature',name);
 const gltf=JSON.parse(await fs.readFile(path.join(dir,name.includes('tree')?'high.gltf':'model.gltf'),'utf8'));
 const include=a.gltf?.['2k']?.gltf?.include;
 if(!include)throw new Error(`Missing 2K glTF image list: ${asset}`);
 for(const image of gltf.images){
  if(!image.uri||/^data:/.test(image.uri))throw new Error(`Expected an external image in ${name}`);
  const original=image.uri.replace('_1k','_2k'),key=original.replace(/\.png$/,'.jpg'),source=include[key];
  if(!source)throw new Error(`Missing native 2K image ${asset}/${key}`);
  const job={target:`nature/${name}/${image.uri}`,file:`hd2k/nature/${name}/${original}`,source:source.url,md5:source.md5};
  if(image.uri.endsWith('.png')){
   const alphaKey=key.includes('_leaves_')?'leaves_alpha':'alpha',alpha=(a[alphaKey]||a[alphaKey[0].toUpperCase()+alphaKey.slice(1)])?.['2k']?.png;
   if(!alpha)throw new Error(`Missing original 16-bit 2K alpha ${asset}/${alphaKey}`);
   job.alpha=alpha.url;job.alphaMd5=alpha.md5;
  }
  jobs.push(job);
 }
}
const sky='https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr';
jobs.push({target:'environment/sky.hdr',file:'hd2k/environment/sky.hdr',source:sky,kind:'hdr'});
await parallel(jobs,6,async(job,i)=>{
 job.local=path.join(cache,createHash('sha256').update(job.source).digest('hex').slice(0,16)+path.extname(new URL(job.source).pathname));
 await curl(job.source,job.local);
 if(job.md5&&createHash('md5').update(await fs.readFile(job.local)).digest('hex')!==job.md5)throw new Error(`Source checksum mismatch: ${job.source}`);
 if(job.alpha){job.alphaLocal=path.join(cache,createHash('sha256').update(job.alpha).digest('hex').slice(0,16)+'.png');await curl(job.alpha,job.alphaLocal);if(createHash('md5').update(await fs.readFile(job.alphaLocal)).digest('hex')!==job.alphaMd5)throw new Error(`Alpha checksum mismatch: ${job.alpha}`);}
 console.log(`${i+1}/${jobs.length} downloaded ${job.target}`);
});
const config=path.join(cache,'conversion-jobs.json');await fs.writeFile(config,JSON.stringify({root,jobs}));
await fs.mkdir(dest,{recursive:true});
const python=String.raw`
import json,sys,re
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
cfg=json.loads(Path(sys.argv[1]).read_text());root=Path(cfg['root']);entries=[]
for job in cfg['jobs']:
 out=root/'dist'/job['file'];out.parent.mkdir(parents=True,exist_ok=True)
 if job.get('kind')=='hdr':
  raw=Path(job['local']).read_bytes();match=re.search(rb'-Y (\d+) \+X (\d+)',raw[:1024]);h,w=map(int,match.groups())
  if (w,h)!=(2048,1024):raise ValueError('HDR must be original 2048x1024')
  out.write_bytes(raw)
 else:
  im=Image.open(job['local']).convert('RGB');w,h=im.size
  if (w,h)!=(2048,2048):raise ValueError(f'Original 2K source size differs: {job["target"]} {im.size}')
  if job.get('alphaLocal'):
   raw=np.asarray(Image.open(job['alphaLocal']));raw=raw[:,:,0] if raw.ndim==3 else raw
   if raw.shape!=(h,w):raise ValueError('Alpha size mismatch')
   alpha=np.rint(raw.astype('float32')/(257 if raw.max()>255 else 1)).clip(0,255).astype('uint8')
   rgba=np.empty((h,w,4),dtype='uint8');rgba[:,:,:3]=np.asarray(im);rgba[:,:,3]=alpha
   # Dilation changes only invisible RGB, never silhouette, alpha or UV orientation.
   transparent=alpha==0;nearest=distance_transform_edt(transparent,return_distances=False,return_indices=True)
   rgba[transparent,:3]=rgba[nearest[0][transparent],nearest[1][transparent],:3]
   Image.fromarray(rgba).save(out,optimize=True)
  else:im.save(out,quality=93,subsampling=0,optimize=True)
 entry={k:job[k] for k in ('target','file','source')};entry.update(width=w,height=h,native=True)
 if job.get('kind'):entry['kind']=job['kind']
 if job.get('alpha'):entry['alphaSource']=job['alpha']
 entries.append(entry)
# A new native 2048px periodic normal field: deterministic band-limited Fourier
# components differentiated analytically on the 2K lattice, not an enlarged 1K map.
n=2048;u=np.arange(n,dtype=np.float64)/n;tau=2*np.pi;x,z=np.meshgrid(u,u);dx=np.zeros((n,n));dz=np.zeros((n,n));rng=np.random.default_rng(235711)
for k in range(52):
 freq=int(rng.integers(3,130));angle=rng.uniform(0,tau);kx=int(round(freq*np.cos(angle)));kz=int(round(freq*np.sin(angle)))
 if kx==0 and kz==0:continue
 phase=rng.uniform(0,tau);s=np.sin(tau*(kx*x+kz*z)+phase);amp=.12/(np.hypot(kx,kz)**1.35)
 dx+=amp*kx*s;dz+=amp*kz*s
normal=np.stack((-dx,-dz,np.ones_like(dx)),axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
out=root/'dist/hd2k/textures/water-normal.jpg';out.parent.mkdir(parents=True,exist_ok=True);Image.fromarray(np.rint((normal*.5+.5)*255).clip(0,255).astype('uint8')).save(out,quality=93,subsampling=0,optimize=True)
entries.append(dict(target='textures/water-normal.jpg',file='hd2k/textures/water-normal.jpg',width=n,height=n,native=True,source='scripts/prepare-2k-nature.mjs: native periodic 2048px Fourier wave normal'))
entries.sort(key=lambda e:e['target'])
notes=['All 20 active surface photographic maps and all 33 external images in the seven active nature glTF models use original official 2048x2048 Poly Haven sources. No 1K images enlarged.','Photographic RGB and UV orientation retained; normal maps are OpenGL; ARM maps retain original AO/Roughness/Metal channels. JPEG quality 93 with full 4:4:4 chroma.','Foliage alpha uses the original 16-bit PNG divided by 257. Invisible RGB is dilated without changing alpha.','Water normal is generated directly on a periodic 2048px Fourier lattice. It is an authored wave field, not a photograph or enlarged lower-resolution texture.','Sky is unmodified official 2048x1024 RGBE HDR. All Poly Haven assets CC0-1.0.']
(root/'dist/hd2k/nature-manifest.json').write_text(json.dumps(dict(entries=entries,notes=notes),indent=2)+'\n')
print(json.dumps(dict(entries=len(entries),bytes=sum((root/'dist'/e['file']).stat().st_size for e in entries))))
`;
const result=await run(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python',['-c',python,config],{maxBuffer:4*1024*1024});process.stdout.write(result.stdout);
const manifest=JSON.parse(await fs.readFile(path.join(dest,'nature-manifest.json'),'utf8'));
const sources=['# Native 2K landscape assets','','Poly Haven official original files. License: CC0-1.0 — https://polyhaven.com/license','',...manifest.notes.map(t=>'- '+t),'','Reproduce: `node scripts/prepare-2k-nature.mjs /path/to/download-cache`','','## Exact source files',''];
for(const e of manifest.entries){sources.push(`- \`${e.target}\` → \`${e.file}\` (${e.width}×${e.height})`, `  Source: ${e.source}`);if(e.alphaSource)sources.push(`  Original alpha: ${e.alphaSource}`);}
await fs.writeFile(path.join(dest,'NATURE-SOURCES.md'),sources.join('\n')+'\n');
