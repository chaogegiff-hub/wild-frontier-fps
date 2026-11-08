"""Original human upper arms and forearms, sharing the glove rig.
Uses original skin UVs. Smooth wrist weights keep skin inside the glove cuffs.
"""
import copy,json
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation
root=Path(__file__).resolve().parents[1];src=root/'dist/models/fps-arms';out=root/'dist/models/swim-sleeves';out.mkdir(parents=True,exist_ok=True)
g=json.loads((src/'model.gltf').read_text());raw=(src/'model.bin').read_bytes();types={5123:np.uint16,5126:np.float32};sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def read(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];return np.frombuffer(raw,types[a['componentType']],a['count']*sizes[a['type']],v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,sizes[a['type']]).copy()
p=g['meshes'][0]['primitives'][0];data={k:read(i) for k,i in p['attributes'].items()};triangles=read(p['indices']).reshape(-1,3);parents={c:i for i,n in enumerate(g['nodes']) for c in n.get('children',[])};names={n.get('name'):i for i,n in enumerate(g['nodes'])};world={}
def wm(i):
 if i not in world:
  n=g['nodes'][i];m=np.eye(4);m[:3,:3]=Rotation.from_quat(n.get('rotation',[0,0,0,1])).as_matrix()*n.get('scale',[1,1,1]);m[:3,3]=n.get('translation',[0,0,0]);world[i]=wm(parents[i])@m if i in parents else m
 return world[i]
rows=[];indices=[];lookup={}
def interpolate(a,b,t):
 q={k:a[k]*(1-t)+b[k]*t for k in ['p','n','uv','y']};weights={}
 for v,f in [(a,1-t),(b,t)]:
  for j,w in zip(v['j'],v['w']):weights[int(j)]=weights.get(int(j),0)+float(w)*f
 pick=sorted(weights.items(),key=lambda p:-p[1])[:4];q['j']=np.array([j for j,w in pick]+[0]*(4-len(pick)));q['w']=np.array([w for j,w in pick]+[0]*(4-len(pick)));q['w']/=q['w'].sum();return q
for side in ['L','R']:
 inv=np.linalg.inv(wm(names['hand'+side]));local=(np.c_[data['POSITION'],np.ones(len(data['POSITION']))]@inv.T)[:,:3];sideMask=data['POSITION'][:,0]<0 if side=='L' else data['POSITION'][:,0]>0
 for tri in triangles:
  if not np.all(sideMask[tri]):continue
  poly=[{'p':data['POSITION'][i].astype(float),'n':data['NORMAL'][i].astype(float),'uv':data['TEXCOORD_0'][i].astype(float),'j':data['JOINTS_0'][i],'w':data['WEIGHTS_0'][i].astype(float),'y':local[i,1]} for i in tri];clipped=[]
  for i,a in enumerate(poly):
   b=poly[(i+1)%3];da=-.007-a['y'];db=-.007-b['y']
   if da>=0:clipped.append(a)
   if (da>=0)!=(db>=0):clipped.append(interpolate(a,b,da/(da-db)))
  for i in range(1,len(clipped)-1):
   for v in [clipped[0],clipped[i],clipped[i+1]]:
    normal=v['n']/np.linalg.norm(v['n']);position=v['p']
    follow=np.clip((v['y']+.080)/.055,0,1);follow=follow*follow*(3-2*follow);weights={}
    for j,w in zip(v['j'],v['w']):weights[int(j)]=weights.get(int(j),0)+float(w)*(1-follow)
    handJoint=g['skins'][0]['joints'].index(names['hand'+side]);weights[handJoint]=weights.get(handJoint,0)+follow
    pick=sorted(weights.items(),key=lambda p:-p[1])[:4];joints=[j for j,w in pick]+[0]*(4-len(pick));ww=np.array([w for j,w in pick]+[0]*(4-len(pick)));ww/=ww.sum()
    row=np.r_[position,normal,v['uv'],joints,ww];key=tuple(np.round(row,7))
    if key not in lookup:lookup[key]=len(rows);rows.append(row)
    indices.append(lookup[key])
# Athletic muscle volume with taper at wrists and joints; original rig/UVs retained.
vertices=np.array(rows);original=vertices[:,:3].copy()
for side in ['L','R']:
 mask=original[:,0]<0 if side=='L' else original[:,0]>0
 for bone,length,gain,center,width in [('upper_arm',.25919,.16,.49,.32),('forearm',.26717,.12,.32,.30)]:
  matrix=wm(names[bone+side]);q=(np.c_[original,np.ones(len(vertices))]@np.linalg.inv(matrix).T)[:,:3];t=q[:,1]/length;joint=g['skins'][0]['joints'].index(names[bone+side]);weight=np.sum(np.where(vertices[:,8:12].astype(int)==joint,vertices[:,12:16],0),axis=1);e=np.exp(-((t-center)/width)**2)*np.clip(t/.13,0,1)*np.clip((1-t)/.14,0,1)*weight*mask;delta=np.zeros_like(q);delta[:,0]=q[:,0]*gain*e;delta[:,2]=q[:,2]*gain*1.12*e;vertices[:,:3]+=delta@matrix[:3,:3].T
# Loop subdivision smooths the silhouette and elbow skin weights.
# Weld adjacency by position while preserving separate UV island vertices.
canonical={};ids=[];source_rows=[]
for row in vertices:
 key=tuple(np.round(row[:3],6))
 if key not in canonical:canonical[key]=len(source_rows);source_rows.append(row.copy())
 ids.append(canonical[key])
faces=np.array(indices).reshape(-1,3);neighbors={i:set() for i in range(len(source_rows))};edges={}
for face in faces:
 a,b,c=[ids[i] for i in face]
 for u,v,w in [(a,b,c),(b,c,a),(c,a,b)]:
  neighbors[u].add(v);neighbors[v].add(u);edges.setdefault(tuple(sorted((u,v))),set()).add(w)
boundary={i:set() for i in neighbors}
for (a,b),opposite in edges.items():
 if len(opposite)==1:boundary[a].add(b);boundary[b].add(a)
def blend(points):
 position=np.zeros(3);weights={}
 for idx,factor in points:
  row=source_rows[idx];position+=row[:3]*factor
  for j,w in zip(row[8:12].astype(int),row[12:16]):weights[j]=weights.get(j,0)+w*factor
 picked=sorted(weights.items(),key=lambda item:-item[1])[:4];j=[i for i,w in picked]+[0]*(4-len(picked));w=np.array([w for i,w in picked]+[0]*(4-len(picked)));w/=w.sum();return position,np.array(j),w
moved={}
for i,near in neighbors.items():
 beta=3/16 if len(near)==3 else 3/(8*max(1,len(near)))
 # Keep cut wrist and shoulder boundaries sealed against the glove cuffs.
 moved[i]=blend([(i,1)]) if boundary[i] else blend([(i,1-len(near)*beta)]+[(n,beta)for n in near])
midpoints={}
for edge,opposite in edges.items():
 a,b=edge;midpoints[edge]=blend([(a,.375),(b,.375)]+[(i,.125)for i in opposite]) if len(opposite)==2 else blend([(a,.5),(b,.5)])
refined=[]
for old,i in zip(vertices,ids):
 row=old.copy();row[:3],row[8:12],row[12:16]=moved[i];refined.append(row)
edge_ids={};refined_indices=[]
def mid(a,b):
 key=tuple(sorted((int(a),int(b))))
 if key not in edge_ids:
  row=(vertices[a]+vertices[b])*.5;row[:3],row[8:12],row[12:16]=midpoints[tuple(sorted((ids[a],ids[b])))];edge_ids[key]=len(refined);refined.append(row)
 return edge_ids[key]
for a,b,c in faces:
 ab,bc,ca=mid(a,b),mid(b,c),mid(c,a);refined_indices.extend([a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca])
vertices=np.array(refined);indices=refined_indices

# Recompute smooth normals across UV seams.
sums={};keys=[tuple(np.round(p,6)) for p in vertices[:,:3]]
for tri in np.array(indices).reshape(-1,3):
 a,b,c=vertices[tri,:3];n=np.cross(b-a,c-a)
 for i in tri:sums[keys[i]]=sums.get(keys[i],np.zeros(3))+n
for i,key in enumerate(keys):vertices[i,3:6]=sums[key]/max(np.linalg.norm(sums[key]),1e-10)
rows=vertices.tolist()
new=copy.deepcopy(g);new['accessors']=[];new['bufferViews']=[];chunks=[];offset=0
def add(a,typ,component=5126,target=34962):
 global offset
 a=np.ascontiguousarray(a,dtype=types[component]);pad=(-offset)%4;chunks.append(bytes(pad));offset+=pad;view=len(new['bufferViews']);new['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':a.nbytes,**({'target':target}if target else {})});access={'bufferView':view,'componentType':component,'count':len(a),'type':typ}
 if typ=='VEC3':access.update(min=a.min(0).tolist(),max=a.max(0).tolist())
 new['accessors'].append(access);chunks.append(a.tobytes());offset+=a.nbytes;return len(new['accessors'])-1
new['skins'][0]['inverseBindMatrices']=add(read(g['skins'][0]['inverseBindMatrices']),'MAT4',target=0);a=np.array(rows);attributes={k:add(a[:,lo:hi],typ,component)for k,lo,hi,typ,component in [('POSITION',0,3,'VEC3',5126),('NORMAL',3,6,'VEC3',5126),('TEXCOORD_0',6,8,'VEC2',5126),('JOINTS_0',8,12,'VEC4',5123),('WEIGHTS_0',12,16,'VEC4',5126)]}
new['meshes']=[{'name':'AnatomicalSwimmingArms','primitives':[{'attributes':attributes,'indices':add(np.array(indices).reshape(-1,1),'SCALAR',5123,34963),'material':0}]}]
new['materials']=[{'name':'anatomical_arm_skin','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.68}}]
new['images']=[{'uri':'../fps-arms/textures/skin.jpg'}];new['textures']=[{'source':0,'sampler':0}];new['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}];new['buffers']=[{'uri':'model.bin','byteLength':offset}];new['extras']={'source':'https://opengameart.org/content/fps-arms-rigged-only','license':'CC0-1.0','description':'Original human skin UVs and anatomical upper arms/forearms; wrist weights blend into the original shared glove skeleton.'};new['nodes'][next(i for i,n in enumerate(new['nodes'])if'mesh'in n)]['name']='AnatomicalSwimmingArms'
(out/'model.gltf').write_text(json.dumps(new,separators=(',',':')));(out/'model.bin').write_bytes(b''.join(chunks))
(out/'SOURCE.md').write_text("""# Human swimming arms

CC0 anatomical arms by para / MakeHuman, from FPS Arms (rigged, only).
Source: https://opengameart.org/content/fps-arms-rigged-only
Original human arm proportions, skin UVs, inverse binds and bones are retained.
The wrist weights blend smoothly onto the hand joint inside the open cotton cuff.
The existing skin.jpg is the author's 1024px texture, not an upscaled native 2K
asset or a scanned/filmed person. No jacket offset or repeated fabric UVs remain.
The same muscular bare arm mesh is used for weapons, swimming and vaulting.
Athletic biceps/triceps and forearm contour sculpting is authored CC0 work;
original joint lengths, hand dimensions, UVs and wrist attachment are retained.
""")
print(json.dumps({'vertices':len(rows),'triangles':len(indices)//3,'bytes':offset,'joints':len(new['skins'][0]['joints'])}))
