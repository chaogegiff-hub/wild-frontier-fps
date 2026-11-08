"""Bake spatial 3D foliage clusters from the original photographed tree.

Usage: python scripts/prepare-woodland-clusters.py original-tree-directory qa-folder
Native EGL asset processing only; no browser or running game is involved.
The result is real bark/branches plus distributed crossed photographic crowns,
a conventional alpha-card LOD derived from the original 3D leaf positions.
"""
from pathlib import Path
import sys,json,math,ctypes as C
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

# Reuse the compact, checked GLES bindings and source-photo alpha reader.
helper=Path(__file__).with_name('check-woodland-tree.py').read_text()
exec(compile(helper[:helper.index('\nmeta=json.loads')],str(Path(__file__)), 'exec'))
asset=repo/'dist/nature/woodland_tree_02'
meta=json.loads((asset/'conversion.json').read_text())
source=json.loads((source_root/'model.gltf').read_text())
sourcebin=(source_root/source['buffers'][0]['uri']).read_bytes()
types={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def array(doc,binary,index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];dt=np.dtype(types[a['componentType']]);n=sizes[a['type']]
 return np.ndarray((a['count'],n),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*n),dt.itemsize)).copy()

original=load(source_root/'model.gltf',meta['origin'])
leaf_primitive=next(p for p in source['meshes'][0]['primitives'] if 'leaves' in source['materials'][p['material']]['name'])
positions=array(source,sourcebin,leaf_primitive['attributes']['POSITION'])-np.array(meta['origin'],dtype='float32')
indices=array(source,sourcebin,leaf_primitive['indices']).reshape(-1,3).astype('uint32')
centroids=(positions[indices[:,0]]+positions[indices[:,1]]+positions[indices[:,2]])/3
# Preserve the actual branch-by-branch spatial distribution. A one-metre cell
# contains a local crown, not a copy of the complete tree placed everywhere.
grid=np.floor(centroids/1.0).astype('int32');cells,labels=np.unique(grid,axis=0,return_inverse=True)
order=np.argsort(labels,kind='stable');sorted_labels=labels[order]
starts=np.searchsorted(sorted_labels,np.arange(len(cells)));ends=np.searchsorted(sorted_labels,np.arange(len(cells))+1)
leafvao,leaftexture,_,_=next(part for part in original if part[3])
tile=128;views=[0,45,90,135,'top'];columns=16
atlas=Image.new('RGBA',(columns*tile,math.ceil(len(cells)*len(views)/columns)*tile))
cards=[];clusters=[]
def view_basis(angle):
 if angle=='top':return np.array([0,1,0.]),np.array([-1,0,0.]),np.array([0,0,1.])
 a=np.deg2rad(angle);normal=np.array([np.sin(a),0,np.cos(a)]);right=np.array([np.cos(a),0,-np.sin(a)]);return normal,right,np.array([0.,1,0])
def orthographic(center,normal,right,up,width,height):
 eye=center+normal*10;view=np.eye(4);view[:3,:3]=np.array([right,up,normal]);view[:3,3]=-view[:3,:3]@eye
 projection=np.diag([2/width,2/height,-2/20,1.]);projection[2,3]=-1
 return np.ascontiguousarray((projection@view).T,dtype='float32')

for cell_index,cell in enumerate(cells):
 local_indices=np.ascontiguousarray(indices[order[starts[cell_index]:ends[cell_index]]].reshape(-1),dtype='uint32')
 points=positions[np.unique(local_indices)];minimum=points.min(0);maximum=points.max(0);center=(minimum+maximum)/2
 bind_vao(leafvao);ebo=U();gen_buffers(1,C.byref(ebo));bind_buffer(0x8893,ebo);buffer_data(0x8893,local_indices.nbytes,local_indices.ctypes.data,0x88E4)
 clusters.append({'cell':cell.tolist(),'center':center.tolist(),'bounds':[minimum.tolist(),maximum.tolist()],'sourceTriangles':len(local_indices)//3})
 for view_index,angle in enumerate(views):
  normal,right,up=view_basis(angle);cx=(points-center)@right;cy=(points-center)@up
  width=float(max(abs(cx.min()),abs(cx.max()))*2+.02);height=float(max(abs(cy.min()),abs(cy.max()))*2+.02)
  clear_color(0,0,0,0);clear(0x4000|0x100);m=orthographic(center,normal,right,up,width,height)
  uniform_mat(location(program,b'mvp'),1,0,m.ctypes.data);bind_vao(leafvao);bind_tex(0x0DE1,leaftexture);uniform1f(location(program,b'cutoff'),.40);draw(0x0004,len(local_indices),0x1405,None)
  rgba=np.empty((N,N,4),dtype='uint8');pixels(0,0,N,N,0x1908,0x1401,rgba.ctypes.data);assert get_error()==0
  rgba=np.asarray(Image.fromarray(rgba[::-1].copy()).resize((tile,tile),Image.Resampling.LANCZOS)).copy()
  transparent=rgba[:,:,3]<2
  if not np.all(transparent):
   nearest=distance_transform_edt(transparent,return_distances=False,return_indices=True)
   rgba[transparent,:3]=rgba[nearest[0][transparent],nearest[1][transparent],:3]
  frame=cell_index*len(views)+view_index;atlas.paste(Image.fromarray(rgba),((frame%columns)*tile,(frame//columns)*tile))
  cards.append({'cluster':cell_index,'angle':angle,'center':center.tolist(),'normal':normal.tolist(),'right':right.tolist(),'up':up.tolist(),'width':width,'height':height,'frame':frame})
 print(f'cluster {cell_index+1}/{len(cells)}',flush=True) if (cell_index+1)%15==0 else None
# A losslessly stored adaptive RGBA palette keeps the spatial foliage atlas
# compact while retaining true alpha cutouts and dilated green edge RGB.
atlas=atlas.quantize(colors=256,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE)
atlas.save(asset/'textures/woodland_leaf_clusters.png',optimize=True)

def build(lod,allowed_angles):
 doc=json.loads((asset/f'{lod}.gltf').read_text());binary=(asset/doc['buffers'][0]['uri']).read_bytes();new_doc=json.loads(json.dumps(doc));new_doc['accessors']=[];new_doc['bufferViews']=[];chunks=[];offset=0
 def accessor(values,type_,component):
  nonlocal offset
  values=np.ascontiguousarray(values);pad=(-offset)%4
  if pad:chunks.append(bytes(pad));offset+=pad
  view=len(new_doc['bufferViews']);new_doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':values.nbytes});chunks.append(values.tobytes());offset+=values.nbytes
  a={'bufferView':view,'componentType':component,'count':len(values),'type':type_}
  if type_=='VEC3':a['min']=values.min(0).tolist();a['max']=values.max(0).tolist()
  ai=len(new_doc['accessors']);new_doc['accessors'].append(a);return ai
 selected=[c for c in cards if c['angle'] in allowed_angles];pos=[];normal=[];uv=[];ix=[]
 for c in selected:
  center=np.array(c['center']);right=np.array(c['right'])*c['width']/2;up=np.array(c['up'])*c['height']/2
  base=len(pos);pos.extend([center-right-up,center+right-up,center+right+up,center-right+up]);normal.extend([c['normal']]*4)
  column=c['frame']%columns;row=c['frame']//columns;inset=.5/tile
  # glTF image rows start at top; card top uses v=0 in each atlas tile.
  u0=(column+inset)/columns;u1=(column+1-inset)/columns;v0=(row+inset)/(atlas.height/tile);v1=(row+1-inset)/(atlas.height/tile)
  uv.extend([[u0,v1],[u1,v1],[u1,v0],[u0,v0]]);ix.extend([base,base+1,base+2,base,base+2,base+3])
 leafmat=next(i for i,m in enumerate(doc['materials']) if 'leaves' in m['name'])
 atlas_image=len(new_doc['images']);new_doc['images'].append({'uri':'textures/woodland_leaf_clusters.png','mimeType':'image/png','name':'woodland distributed photographed crown clusters'})
 atlas_texture=len(new_doc['textures']);new_doc['textures'].append({'source':atlas_image,'sampler':0})
 new_doc['materials'][leafmat]={'name':'woodland_tree_02_leaves_photographic_crown','alphaMode':'MASK','alphaCutoff':.34,'doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':atlas_texture},'metallicFactor':0,'roughnessFactor':.92}}
 tris=0
 for mesh_index,mesh in enumerate(doc['meshes']):
  primitives=[]
  for p in mesh['primitives']:
   if p['material']==leafmat:
    outp={'attributes':{'POSITION':accessor(np.array(pos,dtype='float32'),'VEC3',5126),'NORMAL':accessor(np.array(normal,dtype='float32'),'VEC3',5126),'TEXCOORD_0':accessor(np.array(uv,dtype='float32'),'VEC2',5126)},'indices':accessor(np.array(ix,dtype='uint32').reshape(-1,1),'SCALAR',5125),'material':leafmat};tris+=len(ix)//3
   else:
    outp={'attributes':{},'indices':accessor(array(doc,binary,p['indices']),'SCALAR',doc['accessors'][p['indices']]['componentType']),'material':p['material']};tris+=doc['accessors'][p['indices']]['count']//3
    for key,ai in p['attributes'].items():outp['attributes'][key]=accessor(array(doc,binary,ai),doc['accessors'][ai]['type'],doc['accessors'][ai]['componentType'])
   primitives.append(outp)
  new_doc['meshes'][mesh_index]['primitives']=primitives
 new_doc['buffers']=[{'uri':f'{lod}.bin','byteLength':offset}];new_doc['asset']['generator']='Wild Frontier spatial photographed leaf-cluster LOD';
 # Strip unused source leaf images so source-copy packing does not fetch them.
 used_textures=set()
 for m in new_doc['materials']:
  for key,val in m.items():
   if key.endswith('Texture') and isinstance(val,dict):used_textures.add(val['index'])
  for key,val in m.get('pbrMetallicRoughness',{}).items():
   if key.endswith('Texture') and isinstance(val,dict):used_textures.add(val['index'])
 tex_indices=sorted(used_textures);tex_remap={old:i for i,old in enumerate(tex_indices)};image_indices=sorted({new_doc['textures'][i]['source'] for i in tex_indices});image_remap={old:i for i,old in enumerate(image_indices)}
 new_doc['images']=[new_doc['images'][i] for i in image_indices];new_doc['textures']=[new_doc['textures'][i] for i in tex_indices]
 for t in new_doc['textures']:t['source']=image_remap[t['source']]
 for m in new_doc['materials']:
  for key,val in m.items():
   if key.endswith('Texture') and isinstance(val,dict):val['index']=tex_remap[val['index']]
  for key,val in m.get('pbrMetallicRoughness',{}).items():
   if key.endswith('Texture') and isinstance(val,dict):val['index']=tex_remap[val['index']]
 (asset/f'{lod}.gltf').write_text(json.dumps(new_doc,separators=(',',':')));(asset/f'{lod}.bin').write_bytes(b''.join(chunks))
 minimum=np.array([np.inf]*3);maximum=np.array([-np.inf]*3);parts=[]
 for mesh in new_doc['meshes']:
  for p in mesh['primitives']:
   a=new_doc['accessors'][p['attributes']['POSITION']];minimum=np.minimum(minimum,a['min']);maximum=np.maximum(maximum,a['max'])
   parts.append({'name':new_doc['materials'][p['material']]['name'],'triangles':new_doc['accessors'][p['indices']]['count']//3})
 return {'name':lod,'triangles':tris,'crownTriangles':len(ix)//3,'crownCards':len(selected),'meshBytes':offset,'bbox':{'min':minimum.tolist(),'max':maximum.tolist()},'dimensions':(maximum-minimum).tolist(),'parts':parts}

meta['lods']=[build('high',views),build('low',[0,90,'top'])]
meta['sourceDimensions']=[b-a for a,b in zip(meta['originalBBox']['min'],meta['originalBBox']['max'])]
meta['type']='Actual 3D bark/branches and spatial crossed photographic leaf-cluster LOD derived from original 3D leaf geometry; authored derived LOD, not a new scan.'
meta['clusters']=clusters;meta['atlas']={'size':list(atlas.size),'tileSize':tile,'views':views,'sourceColor':'unlit photographed diffuse, original alpha test .40; transparent RGB dilation','storage':'256-color adaptive RGBA PNG palette, no dithering','bytes':(asset/'textures/woodland_leaf_clusters.png').stat().st_size}
(asset/'conversion.json').write_text(json.dumps(meta,indent=2)+'\n')

# The distant complete-crown atlas uses the original 3D model, never the
# simplified candidate. Its neutral photo diffuse will be lit by the app.
# Restore the original source leaf index buffer after the cluster bakes.
bind_vao(leafvao);ebo=U();gen_buffers(1,C.byref(ebo));bind_buffer(0x8893,ebo);full=np.ascontiguousarray(indices.reshape(-1),dtype='uint32');buffer_data(0x8893,full.nbytes,full.ctypes.data,0x88E4)
far=Image.new('RGBA',(2048,256))
for frame,angle in enumerate(range(0,360,45)):
 rgba=render(original,angle,tilt=0);transparent=rgba[:,:,3]<2;nearest=distance_transform_edt(transparent,return_distances=False,return_indices=True);rgba[transparent,:3]=rgba[nearest[0][transparent],nearest[1][transparent],:3]
 far.paste(Image.fromarray(rgba),(frame*256,0))
far.save(asset/'impostor.png',optimize=True)
meta['impostor']={'size':[2048,256],'frames':8,'frameSize':256,'angles':list(range(0,360,45)),'planeSizeMeters':[5.4,5.4],'planeCenterY':2.28,'centerXZ':[0,0],'viewConvention':'angle0 camera +Z; positive angles toward +X; image row0 is top','bakedLighting':'unlit photographic diffuse, preserves original green color','bytes':(asset/'impostor.png').stat().st_size}
(asset/'conversion.json').write_text(json.dumps(meta,indent=2)+'\n')
(asset/'SOURCE.md').write_text('''# Woodland tree variant

Source: https://polyhaven.com/a/tree_small_02

Author: Rico Cilliers

License: CC0-1.0 — https://polyhaven.com/license

Uses the original different 3D tree and photographic bark and leaf textures.
The shipped LOD is actual reduced 3D bark/branches surrounded by local crossed
leaf-cluster surfaces distributed at the original leaf positions. Each local
crown cell is baked directly from its own original textured leaf triangles
at five directions (near LOD) or three directions (middle LOD), with correct
original alpha and no baked directional darkening. This is a derived game LOD,
not a claimed new scan and not a single flat whole-tree image.

Original bark UV sets and PBR maps are retained. The official separate 16-bit
leaf alpha is converted by division by 257. Transparent texel RGB is dilated
to prevent dark mip fringes. Tree grounded at Y=0 and whole crown centered X/Z,
Y-up metres. Distant eight-view atlas is rendered from the full original tree.
See conversion.json for dimensions, source cells, primitive counts, and atlas
orientation. Native projected-crown checks are asset checks, not browser QA.

Reproduce in order:
node scripts/prepare-woodland-tree.mjs /path/to/tree_small_02
python scripts/prepare-woodland-clusters.py /path/to/tree_small_02 /path/to/qa
python scripts/check-woodland-tree.py /path/to/tree_small_02 /path/to/qa
''')
print(json.dumps({'lods':meta['lods'],'clusters':len(clusters),'atlas':atlas.size,'atlasBytes':(asset/'textures/woodland_leaf_clusters.png').stat().st_size,'farBytes':(asset/'impostor.png').stat().st_size},indent=2))
