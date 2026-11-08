// Recover author-native equipment maps and generate new 2048px microfinish maps.
// Usage: node scripts/prepare-2k-equipment.mjs /path/to/author-originals
// Originals: extracted M700 T_SniperR700_{C,N,MAOR}.png; Rocketbox sm004_*.tga.
// Requires Python with Pillow, NumPy and SciPy. Does not modify model geometry/UVs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const originals=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw new Error('Supply the folder containing the original M700 PNG and Rocketbox TGA files.');
const python=String.raw`
import sys,json,math
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
root=Path(sys.argv[1]);src=Path(sys.argv[2]);dist=root/'dist';out=dist/'hd2k/equipment';out.mkdir(parents=True,exist_ok=True)
entries=[];details=[];N=2048
M700='https://stein-indie.itch.io/m700'
ROCKET='https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Military_Male_03/Textures'
def locate(name):
 files=list(src.rglob(name))
 if len(files)!=1: raise RuntimeError('Expected exactly one original '+name+', got '+str(files))
 return files[0]
def save(a,name,target,source,native=True):
 im=Image.fromarray(np.clip(a,0,255).astype(np.uint8),'RGB') if not isinstance(a,Image.Image) else a.convert('RGB')
 dest=out/name;dest.parent.mkdir(parents=True,exist_ok=True);im.save(dest,quality=93,subsampling=0,optimize=True)
 w,h=im.size;entries.append(dict(target=target,file=dest.relative_to(dist).as_posix(),width=w,height=h,native=native,source=source))
 return im
# Reuse current author's 2048px AKM exports without a second JPEG encoding.
for name in ['basecolor.jpg','normal.jpg','orm.jpg']:
 file='models/akm/'+name
 im=Image.open(dist/file)
 if im.size!=(2048,2048):raise RuntimeError('AKM native delivery map is not 2048px: '+file)
 entries.append(dict(target=file,file=file,width=2048,height=2048,native=True,source='https://opengameart.org/content/weathered-akm-rifle'))
# M700 original 2048px atlas. Preserve UV image orientation; only transform PBR channels.
c=np.array(Image.open(locate('T_SniperR700_C.png')).convert('RGB'))
n=np.array(Image.open(locate('T_SniperR700_N.png')).convert('RGB'))
m=np.array(Image.open(locate('T_SniperR700_MAOR.png')).convert('RGB'))
assert c.shape==n.shape==m.shape==(N,N,3)
n[:,:,1]=255-n[:,:,1] # Author's Unreal DirectX -> glTF OpenGL tangent normals.
orm=np.stack([m[:,:,1],255-m[:,:,2],m[:,:,0]],axis=2)
for a,name in [(c,'base-color'),(n,'normal'),(orm,'metal-rough')]:
 save(a,'m700/'+name+'.jpg','models/m700/textures/'+name+'.jpg',M700)
# Decode original TGAs in the same orientation as the existing glTF images.
for part in ['body','head','helmet','equipment','pistol']:
 for kind in ['color','normal']:
  stem='sm004_'+part+'_'+kind+('_acu' if kind=='color' and part in ['body','helmet','equipment'] else '')
  im=Image.open(locate(stem+'.tga')).convert('RGB');target='models/rocketbox-soldier/textures/'+stem+'.jpg'
  expected=(1024,1024) if part=='pistol' else ((2048,1024) if part=='equipment' else (2048,2048))
  if im.size!=expected:raise RuntimeError(stem+' unexpected original dimensions '+str(im.size))
  old=Image.open(dist/target).convert('RGB');reference=np.asarray(old,dtype=np.float32)
  errors=[]
  for candidate in [im,im.transpose(Image.Transpose.FLIP_TOP_BOTTOM)]:
   reduced=np.asarray(candidate.resize(old.size,Image.Resampling.LANCZOS),dtype=np.float32);errors.append(float(np.mean(np.abs(reduced-reference))))
  flipped=errors[1]+.2<errors[0]
  if flipped:im=im.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
  details.append(dict(file=stem,sourceSize=list(im.size),verticalFlip=flipped,existingOrientationMAE=errors))
  if part=='pistol':
   # Preserve honest native source resolution: do not enlarge this small holstered prop.
   w,h=im.size;entries.append(dict(target=target,file=target,width=w,height=h,native=False,source=ROCKET+' (author original 1024px; retained without upscaling)'))
  else:save(im,'rocketbox/'+stem+'.jpg',target,ROCKET)
# New original 2048px seamless finishes; generated directly at delivery resolution.
rng=np.random.default_rng(2026101802);yy,xx=np.mgrid[:N,:N].astype(np.float32)
def noise(sigma):
 a=gaussian_filter(rng.normal(size=(N,N)).astype(np.float32),sigma,mode='wrap');return a/(a.std()+1e-8)
def normal(h,strength):
 dx=(np.roll(h,-1,1)-np.roll(h,1,1))*.5*strength;dy=(np.roll(h,-1,0)-np.roll(h,1,0))*.5*strength
 a=np.stack([-dx,-dy,np.ones_like(h)],axis=2);a/=np.linalg.norm(a,axis=2,keepdims=True);return (a*.5+.5)*255
for name,color,rough,metal in [('metal',[47,51,49],.59,.80),('polymer',[32,35,31],.85,0)]:
 broad=noise(22);grain=noise(.60);small=noise(1.8)
 if name=='metal':
  # Fine sprayed coating and faint directional machining, not a painted noise enlargement.
  scratch=.18*np.sin(xx*.055+noise(12)*.25);h=.18*grain+.16*small+scratch
  shade=.80*grain+.45*small+.45*broad
 else:
  # Molded polymer has an independent isotropic stipple rather than the metal grain.
  h=.28*grain+.26*small+.06*broad;shade=.65*grain+.55*small+.3*broad
 base=np.array(color)[None,None,:]+shade[:,:,None]
 orm=np.stack([np.full((N,N),255),rough*255+small*2.1+broad*1.7,np.full((N,N),metal*255)],axis=2)
 for suffix,a in [('base',base),('orm',orm),('normal',normal(h,.30))]:
  save(a,'gl6/'+name+'-'+suffix+'.jpg','models/gl6/textures/'+name+'-'+suffix+'.png','Original project procedural '+name+' microfinish generated at 2048x2048; CC0')
# Textile: smooth thread crossovers with individually phased fibre bands, no hard checkerboard.
coarse=noise(30);fiber=noise(.55);dye=noise(6)
warp=.5+.5*np.cos(2*np.pi*xx/64+.035*np.sin(2*np.pi*yy/256))
weft=.5+.5*np.cos(2*np.pi*yy/64+.035*np.sin(2*np.pi*xx/256))
blend=.5+.18*np.sin(2*np.pi*xx/128)*np.sin(2*np.pi*yy/128)
threads=blend*warp+(1-blend)*weft
filaments=.08*np.cos(2*np.pi*xx/3+.3*np.sin(2*np.pi*yy/32))+.08*np.cos(2*np.pi*yy/3+.2*np.sin(2*np.pi*xx/64))
h=.33*threads+filaments+.025*fiber
clothcolor=np.array([65,72,64])[None,None,:]+(1.9*(threads-.5)+.55*filaments+.45*dye+.45*coarse)[:,:,None]
clothorm=np.stack([np.full((N,N),255),np.clip(241+threads*2+dye*.65,0,255),np.zeros((N,N))],axis=2)
for name,a in [('cloth-color',clothcolor),('cloth-normal',normal(h,.65)),('cloth-roughness',clothorm)]:
 save(a,'gloves/'+name+'.jpg','models/gloved-hands/textures/'+name+'.png','Original project procedural woven textile with independent 2048px fibres; CC0')
# Leather pores are independently sampled features, with gently broken wrinkles.
pores=(rng.random((N,N))>.988).astype(np.float32);pores=gaussian_filter(pores,.85,mode='wrap');pores/=pores.max()
leathergrain=noise(.9);wrinkles=noise(9);macro=noise(42)
leatherh=.10*leathergrain-.70*pores+.08*np.abs(wrinkles)
leathercolor=np.array([46,53,45])[None,None,:]+(.45*leathergrain-2.0*pores+.45*macro+.35*wrinkles)[:,:,None]
for name,a in [('leather-color',leathercolor),('leather-normal',normal(leatherh,.55))]:
 save(a,'gloves/'+name+'.jpg','models/gloved-hands/textures/'+name+'.png','Original project procedural leather with independent 2048px pores and wrinkles; CC0')
notes=[
 '27 mapped equipment images: 25 maps have a native 2048px long edge; the two tiny holstered-pistol maps remain author-original 1024x1024 and are explicitly native:false.',
 'Rocketbox equipment atlases are native 2048x1024, preserving original aspect ratio and UV orientation; body, head and helmet atlases are 2048x2048.',
 'M700 original 2048x2048 PNG maps restored from the author CC0 archive. Unreal DirectX normal green inverted; MAOR repacked R=AO,G=1-originalB,B=originalR. No resized 1K inputs.',
 'AKM reuses the existing original 4096px-derived 2048x2048 exports. No second encoding.',
 'GL6 and gloves retain original UV/material assignments. Their 2048px finishes are new authored procedural surfaces, not photographs, scans or enlargement of old 256px maps.',
 'New RGB delivery files use JPEG quality 93 with 4:4:4 chroma; all tangent normals use OpenGL convention. Texture dimensions alone do not add geometry or scanning detail.'
]
assert len(entries)==27 and sum(x['native'] for x in entries)==25
(dist/'hd2k/equipment-manifest.json').write_text(json.dumps(dict(entries=entries,notes=notes),indent=2)+'\n')
(out/'verification.json').write_text(json.dumps(dict(orientation=details,files=len(entries),native2k=25,bytes=sum((dist/e['file']).stat().st_size for e in entries)),indent=2)+'\n')
print(json.dumps(dict(entries=len(entries),native2k=25,deliveredMiB=round(sum(p.stat().st_size for p in out.rglob('*') if p.is_file())/1048576,2),orientation=details),indent=2))
`;
const result=spawnSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python',['-c',python,root,originals],{stdio:'inherit',maxBuffer:8*1024*1024});
if(result.status!==0)throw new Error('Equipment asset preparation failed: '+result.status);
fs.writeFileSync(path.join(root,'dist/hd2k/EQUIPMENT-SOURCES.md'),`# Equipment texture sources and delivery\n\n- **AKM**: LonesomeDucky, CC0. https://opengameart.org/content/weathered-akm-rifle . Reuse existing 2048px maps exported from author 4096px maps. Original UVs and PBR channels preserved.\n- **M700**: Stein Games, CC0. https://stein-indie.itch.io/m700 . Author explicitly provides 2048px textures in Sniper_R700_Free_CC0.zip. Restore original T_SniperR700_C/N/MAOR PNGs, preserve atlas orientation, invert DirectX normal green, repack MAOR to glTF ORM exactly as the existing converter.\n- **Military Male 03**: Microsoft / Rocketbox, MIT; original license in models/rocketbox-soldier/LICENSE.md. https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Professions/Military_Male_03/Textures . Original TGA maps: body/head/helmet 2048x2048, equipment 2048x1024, holstered pistol 1024x1024. Pistol maps remain 1024px and are explicitly native:false, never enlarged and labeled native 2K. Image orientation is checked against existing glTF maps before encoding.\n- **GL6 / gloves finish maps**: newly authored original project CC0 procedural coating, molded polymer, textile fibres and leather pore fields at 2048x2048. They preserve the original model UVs and material types; these are authored surfaces, not photographs or scans. GL6 base and roughness/metallic calibration matches existing finish, with new independent fine detail. Cloth avoids hard checkerboard pattern; leather uses independent pore fields. Glove anatomy/source rights are unchanged.\n\n27 mappings are listed in equipment-manifest.json: 25 native 2048px long-edge maps and two honest source-resolution 1024px small-prop maps. New RGB files use JPEG quality 93, chroma 4:4:4. Native OpenGL normals, UV orientation, original atlas aspect ratios and channel semantics are preserved. No model geometry, runtime or startup pack is changed by the preparation script. Reproduce with node scripts/prepare-2k-equipment.mjs /path/to/author-originals.\n`);
