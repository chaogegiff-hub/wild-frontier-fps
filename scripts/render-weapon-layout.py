"""Asset-only native GLES geometry/texture check; no browser/device session."""
import ctypes as C
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw

folder=Path(sys.argv[1]);width,height=800,800
E=C.CDLL('libEGL.so.1');P=C.c_void_p;I=C.c_int;U=C.c_uint;F=C.c_float
E.eglGetProcAddress.argtypes=[C.c_char_p];E.eglGetProcAddress.restype=P
get_display=C.CFUNCTYPE(P,U,P,C.POINTER(I))(E.eglGetProcAddress(b'eglGetPlatformDisplayEXT'));dpy=get_display(0x31DD,None,None)
E.eglInitialize.argtypes=[P,C.POINTER(I),C.POINTER(I)];E.eglInitialize.restype=U;assert E.eglInitialize(dpy,C.byref(I()),C.byref(I()))
E.eglBindAPI.argtypes=[U];E.eglBindAPI.restype=U;assert E.eglBindAPI(0x30A0)
E.eglChooseConfig.argtypes=[P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)];E.eglChooseConfig.restype=U
config=P();count=I();assert E.eglChooseConfig(dpy,(I*15)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3025,24,0x3038),C.byref(config),1,C.byref(count)) and count.value
E.eglCreatePbufferSurface.argtypes=[P,P,C.POINTER(I)];E.eglCreatePbufferSurface.restype=P;surface=E.eglCreatePbufferSurface(dpy,config,(I*5)(0x3057,width,0x3056,height,0x3038))
E.eglCreateContext.argtypes=[P,P,P,C.POINTER(I)];E.eglCreateContext.restype=P;context=E.eglCreateContext(dpy,config,None,(I*3)(0x3098,3,0x3038))
E.eglMakeCurrent.argtypes=[P,P,P,P];E.eglMakeCurrent.restype=U;assert E.eglMakeCurrent(dpy,surface,surface,context)
def gl(name,ret,*args):return C.CFUNCTYPE(ret,*args)(E.eglGetProcAddress(name.encode()))
create=gl('glCreateShader',U,U);source=gl('glShaderSource',None,U,I,C.POINTER(C.c_char_p),P);compile_=gl('glCompileShader',None,U);get=gl('glGetShaderiv',None,U,U,C.POINTER(I))
program=gl('glCreateProgram',U)();attach=gl('glAttachShader',None,U,U);link=gl('glLinkProgram',None,U);use=gl('glUseProgram',None,U)
vs=b'''#version 300 es
precision highp float;layout(location=0)in vec3 pos;layout(location=1)in vec3 normal;layout(location=2)in vec2 tex;
uniform mat4 projection;out vec2 uv;out vec3 n;void main(){uv=tex;n=normal;gl_Position=projection*vec4(pos,1.0);}'''
fs=b'''#version 300 es
precision highp float;uniform sampler2D photo;uniform vec3 tint;uniform float cutoff;uniform int hasPhoto;
in vec2 uv;in vec3 n;out vec4 color;void main(){vec4 t=hasPhoto==1?texture(photo,uv):vec4(pow(tint,vec3(.4545)),1.0);if(t.a<cutoff)discard;
vec3 nn=normalize(n);float light=.48+.65*max(0.0,dot(nn,normalize(vec3(-.5,.8,.6))));color=vec4(t.rgb*light,1.0);}'''
for code,typ in [(vs,0x8B31),(fs,0x8B30)]:
 s=create(typ);text=C.c_char_p(code);source(s,1,C.byref(text),None);compile_(s);ok=I();get(s,0x8B81,C.byref(ok));assert ok.value;attach(program,s)
link(program);use(program)
location=gl('glGetUniformLocation',I,U,C.c_char_p);mat=gl('glUniformMatrix4fv',None,I,I,U,P);f1=gl('glUniform1f',None,I,F);i1=gl('glUniform1i',None,I,I);f3=gl('glUniform3f',None,I,F,F,F)
genbuf=gl('glGenBuffers',None,I,C.POINTER(U));bindbuf=gl('glBindBuffer',None,U,U);bufdata=gl('glBufferData',None,U,C.c_ssize_t,P,U)
genvao=gl('glGenVertexArrays',None,I,C.POINTER(U));bindvao=gl('glBindVertexArray',None,U);enattr=gl('glEnableVertexAttribArray',None,U);attr=gl('glVertexAttribPointer',None,U,I,U,U,I,P)
gentex=gl('glGenTextures',None,I,C.POINTER(U));bindtex=gl('glBindTexture',None,U,U);teximage=gl('glTexImage2D',None,U,I,I,I,I,I,U,U,P);texparam=gl('glTexParameteri',None,U,U,I)
enable=gl('glEnable',None,U);draw=gl('glDrawElements',None,U,I,U,P);pixels=gl('glReadPixels',None,I,I,I,I,U,U,P);viewport=gl('glViewport',None,I,I,I,I);clearcolor=gl('glClearColor',None,F,F,F,F);clear=gl('glClear',None,U);error=gl('glGetError',U)
enable(0x0B71);i1(location(program,b'photo'),0)
items=json.loads((folder/'layout.json').read_text());arm_masks='--sleeves' in sys.argv
if arm_masks:
 items=[{**item,'parts':[{**p,'texture':None,'color':[1,1,1]} for p in item['parts'] if p.get('name')=='anatomical-swimming-arms']} for item in items if str(item['slot']).startswith('swim-')]
 assert len(items)>=8 and all(item['parts'] for item in items)
columns=3 if len(items)%3==0 else 2
sheet=Image.new('RGB',(width*columns,height*((len(items)+columns-1)//columns)),'#bdcbd1');labels=ImageDraw.Draw(sheet)
for index,item in enumerate(items):
 w=480 if item['aspect']<1 else 800;h=800 if item['aspect']<1 else 450
 viewport(0,0,w,h);clearcolor(.74,.80,.82,1);clear(0x4000|0x100)
 projection=np.array(item['projection'],dtype='float32');mat(location(program,b'projection'),1,0,projection.ctypes.data)
 for part in item['parts']:
  vertices=np.fromfile(folder/part['vertices'],dtype='<f4');indices=np.fromfile(folder/part['indices'],dtype='<u4');assert np.isfinite(vertices).all()
  vao=U();genvao(1,C.byref(vao));bindvao(vao);vbo=U();genbuf(1,C.byref(vbo));bindbuf(0x8892,vbo);bufdata(0x8892,vertices.nbytes,vertices.ctypes.data,0x88E4)
  for n,size,offset in [(0,3,0),(1,3,12),(2,2,24)]:enattr(n);attr(n,size,0x1406,0,32,P(offset))
  ebo=U();genbuf(1,C.byref(ebo));bindbuf(0x8893,ebo);bufdata(0x8893,indices.nbytes,indices.ctypes.data,0x88E4)
  t=part['texture'];i1(location(program,b'hasPhoto'),1 if t else 0);f3(location(program,b'tint'),*part['color']);f1(location(program,b'cutoff'),part['alphaTest'])
  if t:
   im=Image.open(folder/t['file']).convert('RGBA');rgba=np.ascontiguousarray(np.array(im)[::-1] if t['flipY'] else np.array(im));tex=U();gentex(1,C.byref(tex));bindtex(0x0DE1,tex);teximage(0x0DE1,0,0x1908,im.width,im.height,0,0x1908,0x1401,rgba.ctypes.data)
   for setting,value in [(0x2801,0x2601),(0x2800,0x2601),(0x2802,0x2901),(0x2803,0x2901)]:texparam(0x0DE1,setting,value)
  draw(0x0004,part['count'],0x1405,None)
 rgba=np.empty((h,w,4),dtype='uint8');pixels(0,0,w,h,0x1908,0x1401,rgba.ctypes.data);assert error()==0
 image=Image.fromarray(rgba[::-1].copy())
 if item.get('overlay'):image=Image.alpha_composite(image.convert('RGBA'),Image.open(folder/item['overlay']).convert('RGBA'))
 if arm_masks:
  rgb=rgba[::-1,:,:3].astype('int16');mask=(np.abs(rgb[:,:,0]-rgb[:,:,1])<2)&(np.abs(rgb[:,:,1]-rgb[:,:,2])<2);left=int(mask[:,:w//2].sum());right=int(mask[:,w//2:].sum());assert left+right>700,(item['slot'],item['aspect'],left,right);print('PASS actual sleeve pixels',item['slot'],item['aspect'],left,right)
 image.save(folder/f'{"arm-mask" if arm_masks else "view"}-{index}.png');row=index//columns;col=index%columns;sheet.paste(image.convert('RGB'),(col*width,row*height));labels.text((col*width+10,row*height+10),f"slot {item['slot']} / aspect {item['aspect']:.2f} / {'aim' if item.get('aiming') else 'hip'} asset layout",fill='black')
sheet.save(folder/('arm-mask-layout.png' if arm_masks else 'weapon-layout.png'));print('PASS native posed-geometry draws, portrait and landscape. Asset layout only; not browser screenshots.')
