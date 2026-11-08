"""Native GLES asset-only diagnostic: alpha coverage, finite buffers, LOD images.

Usage: python scripts/check-new-nature.py original-download-root output-folder
This renders asset meshes in EGL, not the browser or a phone game session.
"""
import ctypes as C
import json
import pathlib
import sys
import numpy as np
from PIL import Image, ImageDraw

source_root=pathlib.Path(sys.argv[1])
out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
repo=pathlib.Path(__file__).resolve().parents[1]
N=512
E=C.CDLL('libEGL.so.1');P=C.c_void_p;I=C.c_int;U=C.c_uint;F=C.c_float
E.eglGetProcAddress.argtypes=[C.c_char_p];E.eglGetProcAddress.restype=P
get_display=C.CFUNCTYPE(P,U,P,C.POINTER(I))(E.eglGetProcAddress(b'eglGetPlatformDisplayEXT'))
dpy=get_display(0x31DD,None,None)
E.eglInitialize.argtypes=[P,C.POINTER(I),C.POINTER(I)];E.eglInitialize.restype=U
major=I();minor=I();assert E.eglInitialize(dpy,C.byref(major),C.byref(minor))
E.eglBindAPI.argtypes=[U];E.eglBindAPI.restype=U;assert E.eglBindAPI(0x30A0)
E.eglChooseConfig.argtypes=[P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)];E.eglChooseConfig.restype=U
config=P();count=I();assert E.eglChooseConfig(dpy,(I*15)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3025,24,0x3038),C.byref(config),1,C.byref(count)) and count.value
E.eglCreatePbufferSurface.argtypes=[P,P,C.POINTER(I)];E.eglCreatePbufferSurface.restype=P
surface=E.eglCreatePbufferSurface(dpy,config,(I*5)(0x3057,N,0x3056,N,0x3038));assert surface
E.eglCreateContext.argtypes=[P,P,P,C.POINTER(I)];E.eglCreateContext.restype=P
context=E.eglCreateContext(dpy,config,None,(I*3)(0x3098,3,0x3038));assert context
E.eglMakeCurrent.argtypes=[P,P,P,P];E.eglMakeCurrent.restype=U;assert E.eglMakeCurrent(dpy,surface,surface,context)
def gl(name,ret,*args):return C.CFUNCTYPE(ret,*args)(E.eglGetProcAddress(name.encode()))
create=gl('glCreateShader',U,U);shader_source=gl('glShaderSource',None,U,I,C.POINTER(C.c_char_p),C.POINTER(I));compile_=gl('glCompileShader',None,U);get=gl('glGetShaderiv',None,U,U,C.POINTER(I))
create_program=gl('glCreateProgram',U);attach=gl('glAttachShader',None,U,U);link=gl('glLinkProgram',None,U);get_program=gl('glGetProgramiv',None,U,U,C.POINTER(I))
use=gl('glUseProgram',None,U);location=gl('glGetUniformLocation',I,U,C.c_char_p);uniform1i=gl('glUniform1i',None,I,I);uniform1f=gl('glUniform1f',None,I,F);uniform_mat=gl('glUniformMatrix4fv',None,I,I,U,P)
gen_buffers=gl('glGenBuffers',None,I,C.POINTER(U));bind_buffer=gl('glBindBuffer',None,U,U);buffer_data=gl('glBufferData',None,U,C.c_ssize_t,P,U)
gen_vaos=gl('glGenVertexArrays',None,I,C.POINTER(U));bind_vao=gl('glBindVertexArray',None,U);enable_attr=gl('glEnableVertexAttribArray',None,U);attr=gl('glVertexAttribPointer',None,U,I,U,U,I,P)
gen_tex=gl('glGenTextures',None,I,C.POINTER(U));bind_tex=gl('glBindTexture',None,U,U);tex_image=gl('glTexImage2D',None,U,I,I,I,I,I,U,U,P);tex_param=gl('glTexParameteri',None,U,U,I)
clear_color=gl('glClearColor',None,F,F,F,F);clear=gl('glClear',None,U);enable=gl('glEnable',None,U);draw=gl('glDrawElements',None,U,I,U,P);pixels=gl('glReadPixels',None,I,I,I,I,U,U,P)
viewport=gl('glViewport',None,I,I,I,I);get_error=gl('glGetError',U)
vert=b'''#version 300 es
precision highp float;
layout(location=0) in vec3 pos; layout(location=1) in vec3 normal;
layout(location=2) in vec2 tex;
uniform mat4 mvp; out vec2 uv; out vec3 n;
void main(){uv=tex;n=normal;gl_Position=mvp*vec4(pos,1.0);}
'''
frag=b'''#version 300 es
precision highp float;
uniform sampler2D diffuse; uniform float cutoff;
in vec2 uv; in vec3 n; out vec4 color;
void main(){vec4 t=texture(diffuse,uv);if(t.a<cutoff)discard;
float light=.55+.45*max(0.0,dot(normalize(n),normalize(vec3(-.4,.8,-.3))));
color=vec4(t.rgb*light,1.0);}
'''
program=create_program()
for code,typ in [(vert,0x8B31),(frag,0x8B30)]:
 s=create(typ);text=C.c_char_p(code);shader_source(s,1,C.byref(text),None);compile_(s);ok=I();get(s,0x8B81,C.byref(ok));assert ok.value;attach(program,s)
link(program);ok=I();get_program(program,0x8B82,C.byref(ok));assert ok.value;use(program)
uniform1i(location(program,b'diffuse'),0);enable(0x0B71);viewport(0,0,N,N)

def load(file,offset=None):
 d=json.loads(file.read_text());binary=(file.parent/d['buffers'][0]['uri']).read_bytes()
 components={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'};sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
 def array(index):
  a=d['accessors'][index];v=d['bufferViews'][a['bufferView']];dtype=np.dtype(components[a['componentType']]);n=sizes[a['type']];start=v.get('byteOffset',0)+a.get('byteOffset',0)
  out=np.ndarray((a['count'],n),dtype=dtype,buffer=binary,offset=start,strides=(v.get('byteStride',dtype.itemsize*n),dtype.itemsize)).copy()
  if a['componentType']==5126: assert np.isfinite(out).all()
  return out
 rendered=[]
 for mesh in d['meshes']:
  for primitive in mesh['primitives']:
   indices=array(primitive['indices']).reshape(-1).astype('uint32');pos=array(primitive['attributes']['POSITION']);normal=array(primitive['attributes']['NORMAL']);uv=array(primitive['attributes']['TEXCOORD_0'])
   if offset is not None:pos-=np.array(offset,dtype='float32')
   assert indices.max()<len(pos)
   vertices=np.concatenate([pos,normal,uv],axis=1).astype('float32');vao=U();gen_vaos(1,C.byref(vao));bind_vao(vao)
   vbo=U();gen_buffers(1,C.byref(vbo));bind_buffer(0x8892,vbo);buffer_data(0x8892,vertices.nbytes,vertices.ctypes.data,0x88E4)
   for i,size,at in [(0,3,0),(1,3,12),(2,2,24)]:enable_attr(i);attr(i,size,0x1406,0,32,P(at))
   ebo=U();gen_buffers(1,C.byref(ebo));bind_buffer(0x8893,ebo);buffer_data(0x8893,indices.nbytes,indices.ctypes.data,0x88E4)
   mat=d['materials'][primitive['material']];ti=mat['pbrMetallicRoughness']['baseColorTexture']['index'];image=d['images'][d['textures'][ti]['source']]
   im=Image.open(file.parent/image['uri']).convert('RGBA');leaf='leaves' in mat['name']
   if leaf and image['uri'].endswith('.jpg'):
    raw=np.asarray(Image.open(file.parent/'textures/alpha.png'));raw=raw[:,:,0] if raw.ndim==3 else raw
    mask=(raw.astype('float32')/(257 if raw.max()>255 else 1)).round().clip(0,255).astype('uint8');im.putalpha(Image.fromarray(mask))
   if leaf:
    a=np.array(im)[:,:,3];assert a.min()==0 and a.max()>240 and np.mean(a>102)>.05
    if offset is None:assert mat['alphaMode']=='MASK' and mat['doubleSided']
   texture=U();gen_tex(1,C.byref(texture));bind_tex(0x0DE1,texture);rgba=np.array(im,dtype='uint8');tex_image(0x0DE1,0,0x1908,im.width,im.height,0,0x1908,0x1401,rgba.ctypes.data)
   for setting,val in [(0x2801,0x2601),(0x2800,0x2601),(0x2802,0x2901),(0x2803,0x2901)]:tex_param(0x0DE1,setting,val)
   rendered.append((vao.value,texture.value,len(indices),leaf))
 return rendered

def matrix(angle,tilt=1.4):
 a=np.deg2rad(angle);center=np.array([0,1.7,0]);eye=center+np.array([np.sin(a)*9,tilt,np.cos(a)*9]);f=(center-eye);f/=np.linalg.norm(f);s=np.cross(f,[0,1,0]);s/=np.linalg.norm(s);u=np.cross(s,f)
 view=np.eye(4);view[:3,:3]=np.array([s,u,-f]);view[:3,3]=-view[:3,:3]@eye
 proj=np.diag([1/2.6,1/2.6,-2/20,1]);proj[2,3]=-1
 return np.ascontiguousarray((proj@view).T,dtype='float32')

def render(model,angle,only_leaves=False,tilt=1.4):
 clear_color(0,0,0,0);clear(0x4000|0x100);m=matrix(angle,tilt);uniform_mat(location(program,b'mvp'),1,0,m.ctypes.data)
 for vao,texture,count,leaf in model:
  if only_leaves and not leaf:continue
  bind_vao(vao);bind_tex(0x0DE1,texture);uniform1f(location(program,b'cutoff'),.40 if leaf else .0);draw(0x0004,count,0x1405,None)
 rgba=np.empty((N,N,4),dtype='uint8');pixels(0,0,N,N,0x1908,0x1401,rgba.ctypes.data);assert get_error()==0
 return rgba[::-1].copy()

meta=json.loads((repo/'dist/nature/island_tree_02/conversion.json').read_text())
models=[('original',load(source_root/'island_tree_02/model.gltf',meta['origin'])),('high',load(repo/'dist/nature/island_tree_02/high.gltf')),('low',load(repo/'dist/nature/island_tree_02/low.gltf'))]
sheet=Image.new('RGB',(N*3,(N+32)*3),'#cad4dd');draw_text=ImageDraw.Draw(sheet);coverage=[]
for row,angle in enumerate([0,45,90]):
 masks=[]
 for col,(name,model) in enumerate(models):
  rgba=render(model,angle);im=Image.fromarray(rgba);background=Image.new('RGBA',im.size,'#cad4dd');background.alpha_composite(im)
  sheet.paste(background.convert('RGB'),(N*col,(N+32)*row));draw_text.text((N*col+10,(N+32)*row+N+5),f'{name}, azimuth {angle}',fill='black')
  masks.append(render(model,angle,True)[:,:,3]>0)
 for col,(name,_) in enumerate(models[1:],1):
  original=masks[0];reduced=masks[col];iou=np.sum(original&reduced)/np.sum(original|reduced);ratio=np.sum(reduced)/np.sum(original)
  coverage.append({'view':angle,'lod':name,'leafAreaRatio':float(ratio),'leafIoU':float(iou)})
sheet.save(out/'tree-lod-native.png')
(out/'coverage.json').write_text(json.dumps(coverage,indent=2)+'\n')
print(json.dumps(coverage,indent=2))
for item in coverage: assert item['leafAreaRatio']>.78,item
rock=load(repo/'dist/nature/rock_face_01/model.gltf');Image.fromarray(render(rock,45)).save(out/'rock-native.png')
atlas=Image.new('RGBA',(2048,256))
for frame,angle in enumerate(range(0,360,45)):
 image=Image.fromarray(render(models[0][1],angle,tilt=0)).resize((256,256),Image.Resampling.LANCZOS)
 # Fill transparent texel RGB with nearest opaque color; prevents black mip
 # fringes while retaining alpha zero and the true photographed silhouette.
 from scipy.ndimage import distance_transform_edt
 rgba=np.asarray(image).copy();transparent=rgba[:,:,3]<2
 nearest=distance_transform_edt(transparent,return_distances=False,return_indices=True)
 rgba[transparent,:3]=rgba[nearest[0][transparent],nearest[1][transparent],:3]
 atlas.paste(Image.fromarray(rgba),(frame*256,0))
atlas.save(out/'tree-impostor-atlas.png',optimize=True)
(out/'impostor.json').write_text(json.dumps({'source':'https://polyhaven.com/a/island_tree_02','license':'CC0-1.0','frames':8,'frameSize':256,'atlas':[2048,256],'angles':list(range(0,360,45)),'planeSizeMeters':[5.2,5.2],'planeCenterY':1.7,'centerXZ':[0,0],'viewConvention':'angle0 camera at +Z, positive angles toward +X','notes':'Only for distant LOD; near object remains a textured 3D mesh. Native image bake of original CC0 mesh with photographed diffuse and correct alpha.'},indent=2)+'\n')
print('PASS finite buffers, correct leaf alpha, all LOD leaf silhouettes retain at least 78% of original projected area. Asset-only native rendering; no browser or device session.')
