#!/usr/bin/env python3
"""Thin cloth gloves over the CC0 anatomical hand and finger mesh.
Retains the authored skinning and a short cotton forearm continuation for weapon
view. Swimming hides that continuation and uses original skin-textured arms.
"""
import copy,json,math
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'dist/models/fps-arms';OUT=ROOT/'dist/models/gloved-hands';OUT.mkdir(parents=True,exist_ok=True);(OUT/'textures').mkdir(exist_ok=True)
source=json.loads((SRC/'model.gltf').read_text());binary=(SRC/'model.bin').read_bytes()
components={5123:np.uint16,5126:np.float32};sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def read(i):
 a=source['accessors'][i];v=source['bufferViews'][a['bufferView']];return np.frombuffer(binary,components[a['componentType']],a['count']*sizes[a['type']],v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,sizes[a['type']]).copy()
p=source['meshes'][0]['primitives'][0];A={k:read(v) for k,v in p['attributes'].items()};indices=read(p['indices']).reshape(-1,3);nodes=copy.deepcopy(source['nodes']);nodes=[n for n in nodes if 'mesh' not in n];parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])};names={n.get('name'):i for i,n in enumerate(nodes)};world={}
def wm(i):
 if i in world:return world[i]
 n=nodes[i];m=np.eye(4);m[:3,:3]=Rotation.from_quat(n.get('rotation',[0,0,0,1])).as_matrix()*n.get('scale',[1,1,1]);m[:3,3]=n.get('translation',[0,0,0]);world[i]=wm(parents[i])@m if i in parents else m;return world[i]
for i in range(len(nodes)):wm(i)
skin=copy.deepcopy(source['skins'][0]);joint_for_node={n:i for i,n in enumerate(skin['joints'])};materials=[
 {'name':'tactical_woven_cloth','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.98,'metallicRoughnessTexture':{'index':2}},'normalTexture':{'index':1,'scale':.25}},
 {'name':'cotton_glove_seams','pbrMetallicRoughness':{'baseColorFactor':[.17,.19,.15,1],'metallicFactor':0,'roughnessFactor':.98}},
 {'name':'woven_wrist_cuff','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'baseColorFactor':[.93,.95,.91,1],'metallicFactor':0,'roughnessFactor':.98,'metallicRoughnessTexture':{'index':2}},'normalTexture':{'index':1,'scale':.22}},
 {'name':'cotton_weapon_sleeve','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'baseColorFactor':[.70,.74,.68,1],'metallicFactor':0,'roughnessFactor':.98,'metallicRoughnessTexture':{'index':2}},'normalTexture':{'index':1,'scale':.20}}
]
for i in [0,2,3]:materials[i]['extensions']={'KHR_materials_sheen':{'sheenColorFactor':[.16,.17,.15],'sheenRoughnessFactor':.88}}

# Tiled original PBR maps: woven threads, cross-over height and subtle dye/noise.
rng=np.random.default_rng(52619);N=256;yy,xx=np.mgrid[:N,:N];period=16
threadx=.5+.5*np.cos(2*np.pi*xx/period);thready=.5+.5*np.cos(2*np.pi*yy/period);over=((xx//period+yy//period)%2)==0
height=np.where(over,threadx+.36*thready,thready+.36*threadx);height+=rng.normal(0,.035,(N,N))
noise=rng.normal(0,.9,(N,N))+2*(height-height.mean());base=np.clip(np.array([65,72,64])[None,None,:]+noise[:,:,None],0,255).astype(np.uint8)
Image.fromarray(base).save(OUT/'textures/cloth-color.png',optimize=True)
def normal_map(h,strength,file):
 dx=(np.roll(h,-1,1)-np.roll(h,1,1))*strength;dy=(np.roll(h,-1,0)-np.roll(h,1,0))*strength;n=np.stack([-dx,-dy,np.ones_like(h)],2);n/=np.linalg.norm(n,axis=2,keepdims=True);Image.fromarray(np.clip((n*.5+.5)*255,0,255).astype(np.uint8)).save(OUT/'textures'/file,optimize=True)
normal_map(height,.20,'cloth-normal.png');rough=np.zeros((N,N,3),np.uint8);rough[:,:,0]=255;rough[:,:,1]=np.clip(238+height*3,0,255);Image.fromarray(rough).save(OUT/'textures/cloth-roughness.png',optimize=True)
leather=rng.normal(0,1.5,(N,N));leather+=.7*np.cos(xx*.15+np.sin(yy*.085)*2);color=np.clip(np.array([46,53,45])[None,None,:]+leather[:,:,None],0,255).astype(np.uint8);Image.fromarray(color).save(OUT/'textures/leather-color.png',optimize=True);normal_map(leather,.045,'leather-normal.png')
# Non-indexed working vertices retain normals, UV islands and up to four weights.
parts=[[] for _ in materials];stats={};cut=-.003

def mix(a,b,t):
 q={k:(a[k]*(1-t)+b[k]*t) for k in ['p','n','uv','local']};q['n']/=np.linalg.norm(q['n'])
 wt={}
 for v,f in [(a,1-t),(b,t)]:
  for j,w in zip(v['j'],v['w']):wt[int(j)]=wt.get(int(j),0)+float(w)*f
 picks=sorted(wt.items(),key=lambda z:-z[1])[:4];q['j']=np.array([j for j,w in picks]+[0]*(4-len(picks)),np.uint16);q['w']=np.array([w for j,w in picks]+[0]*(4-len(picks)));q['w']/=q['w'].sum();return q

def triangle(mat,vs):parts[mat].extend(vs)
def vertex(local,n,uv,h,j):
 return {'p':(h@np.r_[local,1])[:3],'n':h[:3,:3]@np.asarray(n),'uv':np.asarray(uv),'local':np.asarray(local),'j':np.array([j,0,0,0],np.uint16),'w':np.array([1.,0,0,0])}

def ellipsoid(center,radius,side,h,j,mat,segments=16,rings=6):
 c=np.array(center);r=np.array(radius);vs=[]
 for a in range(rings+1):
  phi=np.pi*a/rings
  for b in range(segments+1):
   theta=2*np.pi*b/segments;v=np.array([np.sin(phi)*np.cos(theta),np.cos(phi),np.sin(phi)*np.sin(theta)]);nn=v/r;nn/=np.linalg.norm(nn);vs.append(vertex(c+r*v,nn,[b/segments*2,a/rings*2],h,j))
 for a in range(rings):
  for b in range(segments):
   i=a*(segments+1)+b;triangle(mat,[vs[i],vs[i+1],vs[i+segments+1]]);triangle(mat,[vs[i+1],vs[i+segments+2],vs[i+segments+1]])

def tube(a,b,r,h,j,mat,segments=6):
 a=np.array(a);b=np.array(b);axis=(b-a)/np.linalg.norm(b-a);cross=np.cross(axis,[0,0,1])
 if np.linalg.norm(cross)<.01:cross=np.cross(axis,[0,1,0])
 cross/=np.linalg.norm(cross);other=np.cross(axis,cross);rings=[]
 for k,c in enumerate([a,b]):
  ring=[]
  for q in range(segments):
   n=cross*np.cos(q*2*np.pi/segments)+other*np.sin(q*2*np.pi/segments);ring.append(vertex(c+n*r,n,[q/segments,k],h,j))
  rings.append(ring)
 for q in range(segments):
  nq=(q+1)%segments;triangle(mat,[rings[0][q],rings[1][q],rings[0][nq]]);triangle(mat,[rings[0][nq],rings[1][q],rings[1][nq]])

for side in ['L','R']:
 hand=names['hand'+side];h=wm(hand);inv=np.linalg.inv(h);jhand=joint_for_node[hand];local=(np.c_[A['POSITION'],np.ones(len(A['POSITION']))]@inv.T)[:,:3]
 valid_side=A['POSITION'][:,0]<0 if side=='L' else A['POSITION'][:,0]>0
 original=[]
 for tri in indices:
  if not np.all(valid_side[tri]):continue
  poly=[]
  for i in tri:
   poly.append({'p':A['POSITION'][i].astype(float),'n':A['NORMAL'][i].astype(float),'uv':A['TEXCOORD_0'][i].astype(float)*36,'j':A['JOINTS_0'][i].copy(),'w':A['WEIGHTS_0'][i].astype(float),'local':local[i].copy()})
  clipped=[]
  for ia in range(len(poly)):
   a=poly[ia];b=poly[(ia+1)%len(poly)];da=a['local'][1]-cut;db=b['local'][1]-cut
   if da>=0:clipped.append(a)
   if (da>=0)!=(db>=0):clipped.append(mix(a,b,da/(da-db)))
  if len(clipped)<3:continue
  for i in range(1,len(clipped)-1):
   vs=[copy.deepcopy(v) for v in [clipped[0],clipped[i],clipped[i+1]]]
   # Expand garment 0.65 mm, preserving the original finger topology.
   for v in vs:
    v['p']+=v['n']*.00065
    if v['local'][1]<.015:v['j']=np.array([jhand,0,0,0],np.uint16);v['w']=np.array([1.,0,0,0])
   triangle(0,vs);original.extend([v['p'] for v in vs])
 # Thin open cotton cuff, with a single subtle sewn edge rather than a disk.
 seg=24;rs=[]
 for y,rx,rz in [(-.012,.0334,.0257),(-.009,.0342,.0263),(.003,.0342,.0263),(.006,.0335,.0257)]:
  ring=[]
  for k in range(seg):
   th=2*np.pi*k/seg;c=np.array([rx*np.cos(th),y,.001+rz*np.sin(th)]);n=np.array([np.cos(th)/rx,0,np.sin(th)/rz]);n/=np.linalg.norm(n);ring.append(vertex(c,n,[k/seg*7,(y+.012)*100],h,jhand))
  rs.append(ring)
 for r in range(3):
  for k in range(seg):
   nk=(k+1)%seg;triangle(2,[rs[r][k],rs[r+1][k],rs[r][nk]]);triangle(2,[rs[r][nk],rs[r+1][k],rs[r+1][nk]])
 for k in range(16):
  a=2*np.pi*k/16;b=2*np.pi*(k+1)/16;tube([.0344*np.cos(a),-.006,.001+.0265*np.sin(a)],[.0344*np.cos(b),-.006,.001+.0265*np.sin(b)],.0003,h,jhand,1,4)
 # Original forearm surface keeps the wrist connected below the weapon frame.
 # This fourth primitive is removed from the swimming clone.
 for tri in indices:
  if not np.all(valid_side[tri]):continue
  poly=[{'p':A['POSITION'][i].astype(float),'n':A['NORMAL'][i].astype(float),'uv':A['TEXCOORD_0'][i].astype(float)*28,'j':A['JOINTS_0'][i].copy(),'w':A['WEIGHTS_0'][i].astype(float),'local':local[i].copy()} for i in tri]
  for boundary,direction in [(-.70,1),(-.005,-1)]:
   clipped=[]
   for ia,a in enumerate(poly):
    b=poly[(ia+1)%len(poly)];da=(a['local'][1]-boundary)*direction;db=(b['local'][1]-boundary)*direction
    if da>=0:clipped.append(a)
    if (da>=0)!=(db>=0):clipped.append(mix(a,b,da/(da-db)))
   poly=clipped
   if len(poly)<3:break
  for k in range(1,len(poly)-1):
   vs=copy.deepcopy([poly[0],poly[k],poly[k+1]])
   for v in vs:v['p']+=v['n']*.001
   triangle(3,vs)
 # Remaining source mesh is confined to the hand and finger region.
 arr=np.array(original);stats[side]={'sourceHandVerticesBoundMin':arr.min(0).tolist(),'sourceHandVerticesBoundMax':arr.max(0).tolist(),'handBone':'hand'+side,'handControl':'hand'+side+'control','cuffLengthMeters':.018,'cuffLocalY':[-.012,.006],'sourceGeometryLocalYMinimum':cut}

# Export indexed primitives and unchanged rig/inverse bind matrices.
g={'asset':{'version':'2.0','generator':'Anatomical thin cloth glove adaptation'},'scene':0,'scenes':[{'nodes':[i for i,n in enumerate(nodes) if i not in parents]}],'nodes':nodes,'skins':[skin],'meshes':[],'materials':materials,'images':[{'uri':'textures/'+f} for f in ['cloth-color.png','cloth-normal.png','cloth-roughness.png','leather-color.png','leather-normal.png']],'textures':[{'source':i,'sampler':0} for i in range(5)],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],'accessors':[],'bufferViews':[],'buffers':[],'extras':{'source':'https://opengameart.org/content/fps-arms-rigged-only','anatomyAuthor':'para / MakeHuman','license':'CC0-1.0','unit':'meter','description':'Thin cloth gloves over authored human hand anatomy, with short weapon-only cotton forearm continuation.'}}
g['extensionsUsed']=['KHR_materials_sheen']
chunks=[];off=0
def add(arr,type,component=5126,target=34962):
 global off
 arr=np.ascontiguousarray(arr,dtype=components[component]);padding=(-off)%4
 if padding:chunks.append(bytes(padding));off+=padding
 view=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':arr.nbytes,**({'target':target} if target else {})});a={'bufferView':view,'componentType':component,'count':len(arr),'type':type}
 if type=='VEC3':a['min']=arr.min(0).tolist();a['max']=arr.max(0).tolist()
 g['accessors'].append(a);chunks.append(arr.tobytes());off+=arr.nbytes;return len(g['accessors'])-1
skin['inverseBindMatrices']=add(read(source['skins'][0]['inverseBindMatrices']),'MAT4',target=0)
prims=[];allpositions=[]
for mi,vs in enumerate(parts):
 lookup={};rows=[];ii=[]
 for v in vs:
  values=np.r_[v['p'],v['n'],v['uv'],v['j'],v['w']];key=tuple(np.round(values,7))
  if key not in lookup:lookup[key]=len(rows);rows.append(values)
  ii.append(lookup[key])
 a=np.array(rows);allpositions.extend(a[:,:3]);prims.append({'attributes':{'POSITION':add(a[:,:3],'VEC3'),'NORMAL':add(a[:,3:6],'VEC3'),'TEXCOORD_0':add(a[:,6:8],'VEC2'),'JOINTS_0':add(a[:,8:12],'VEC4',5123),'WEIGHTS_0':add(a[:,12:16],'VEC4')},'indices':add(np.array(ii).reshape(-1,1),'SCALAR',5123,34963),'material':mi})
g['meshes'].append({'name':'TacticalGlovedHands','primitives':prims});g['nodes'].append({'name':'TacticalGlovedHands','mesh':0,'skin':0});g['scenes'][0]['nodes'].append(len(nodes)-1);g['buffers']=[{'uri':'model.bin','byteLength':off}]
(OUT/'model.bin').write_bytes(b''.join(chunks));(OUT/'model.gltf').write_text(json.dumps(g,separators=(',',':')))
# Bone transform integrity: hands still match the preserved inverse binds.
binds=read(source['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);err=max(np.max(abs(wm(n)@binds[i]-np.eye(4))) for i,n in enumerate(skin['joints']))
pp=np.array(allpositions);meta={'source':g['extras']['source'],'license':'CC0-1.0','anatomyAuthor':'para / MakeHuman','newWork':'Thin cotton shell, open wrist cuffs, cloth PBR sheen and anatomical weapon wrist continuation','triangles':sum(len(v)//3 for v in parts),'vertices':sum(g['accessors'][p['attributes']['POSITION']]['count'] for p in prims),'bindRestError':float(err),'bindBoundsMin':pp.min(0).tolist(),'bindBoundsMax':pp.max(0).tolist(),'handRegions':stats,'materials':[{ 'name':m['name'],'triangles':len(v)//3} for m,v in zip(materials,parts)],'forearmAndUpperArmGeometry':'cotton arm continuation below the weapon frame; hidden while swimming; no visible upper arms in weapon view'}
(OUT/'conversion.json').write_text(json.dumps(meta,indent=2))
(OUT/'SOURCE.md').write_text("""# Anatomical cloth gloves

The human hand mesh, finger rig, original inverse bind matrices and weights derive
from FPS Arms (rigged, only), by para / MakeHuman, CC0.
Source: https://opengameart.org/content/fps-arms-rigged-only
License: https://creativecommons.org/publicdomain/zero/1.0/

A thin 0.65 mm cotton shell follows the original palm and finger topology.
There are no leather plates, rubber knuckle blocks, closure tabs or closed wrist
end caps. Open 18 mm woven cuffs and fine seams overlap the wrist. An
anatomical cotton arm continuation keeps weapon wrists connected below the
frame; swimming removes this primitive and uses the source skin-textured arms.

Mapped cloth materials use rough diffuse textile shading and cloth sheen.
The five original surface images are retained for manifest compatibility; leather
images are unused. The runtime HD cloth maps are native 2K. All added work is CC0.
The human anatomy is authored, not a scanned or filmed person.
Rebuild: python scripts/prepare-gloved-hands.py
""")
print(json.dumps(meta,indent=2))
