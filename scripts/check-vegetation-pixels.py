"""Native GLES checks of exported foliage fragments; no browser/device session."""
import ctypes as C
from pathlib import Path
import sys
import numpy as np

root=Path(sys.argv[1]);width=height=64
E=C.CDLL('libEGL.so.1');P=C.c_void_p;I=C.c_int;U=C.c_uint;F=C.c_float
E.eglGetProcAddress.argtypes=[C.c_char_p];E.eglGetProcAddress.restype=P
get_display=C.CFUNCTYPE(P,U,P,C.POINTER(I))(E.eglGetProcAddress(b'eglGetPlatformDisplayEXT'));dpy=get_display(0x31DD,None,None)
E.eglInitialize.argtypes=[P,C.POINTER(I),C.POINTER(I)];E.eglInitialize.restype=U;assert E.eglInitialize(dpy,C.byref(I()),C.byref(I()))
E.eglBindAPI.argtypes=[U];E.eglBindAPI.restype=U;assert E.eglBindAPI(0x30A0)
E.eglChooseConfig.argtypes=[P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)];E.eglChooseConfig.restype=U
config=P();count=I();assert E.eglChooseConfig(dpy,(I*13)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038),C.byref(config),1,C.byref(count)) and count.value
E.eglCreatePbufferSurface.argtypes=[P,P,C.POINTER(I)];E.eglCreatePbufferSurface.restype=P;surface=E.eglCreatePbufferSurface(dpy,config,(I*5)(0x3057,width,0x3056,height,0x3038))
E.eglCreateContext.argtypes=[P,P,P,C.POINTER(I)];E.eglCreateContext.restype=P;context=E.eglCreateContext(dpy,config,None,(I*3)(0x3098,3,0x3038))
E.eglMakeCurrent.argtypes=[P,P,P,P];E.eglMakeCurrent.restype=U;assert E.eglMakeCurrent(dpy,surface,surface,context)
def gl(name,ret,*args):return C.CFUNCTYPE(ret,*args)(E.eglGetProcAddress(name.encode()))
create=gl('glCreateShader',U,U);source=gl('glShaderSource',None,U,I,C.POINTER(C.c_char_p),P);compile_=gl('glCompileShader',None,U);get=gl('glGetShaderiv',None,U,U,C.POINTER(I));shader_log=gl('glGetShaderInfoLog',None,U,I,P,C.c_char_p)
create_program=gl('glCreateProgram',U);attach=gl('glAttachShader',None,U,U);link=gl('glLinkProgram',None,U);use=gl('glUseProgram',None,U);get_program=gl('glGetProgramiv',None,U,U,C.POINTER(I))
location=gl('glGetUniformLocation',I,U,C.c_char_p);f1=gl('glUniform1f',None,I,F);i1=gl('glUniform1i',None,I,I)
genbuf=gl('glGenBuffers',None,I,C.POINTER(U));bindbuf=gl('glBindBuffer',None,U,U);bufdata=gl('glBufferData',None,U,C.c_ssize_t,P,U);genvao=gl('glGenVertexArrays',None,I,C.POINTER(U));bindvao=gl('glBindVertexArray',None,U);enattr=gl('glEnableVertexAttribArray',None,U);attr=gl('glVertexAttribPointer',None,U,I,U,U,I,P)
gentex=gl('glGenTextures',None,I,C.POINTER(U));bindtex=gl('glBindTexture',None,U,U);teximage=gl('glTexImage2D',None,U,I,I,I,I,I,U,U,P);texparam=gl('glTexParameteri',None,U,U,I)
draw=gl('glDrawArrays',None,U,I,I);pixels=gl('glReadPixels',None,I,I,I,I,U,U,P);viewport=gl('glViewport',None,I,I,I,I);clearcolor=gl('glClearColor',None,F,F,F,F);clear=gl('glClear',None,U);error=gl('glGetError',U)
vertex=b'''#version 300 es
precision highp float;layout(location=0)in vec2 position;uniform float cameraShift;uniform float frame;uniform float grassDistance;
out vec2 vMapUv;out float vTreeFrame;out vec2 vLodRange;out vec3 vVegetationAnchor;out float vMeadowDistance;out vec3 vMeadowTint;out float vPlantHeight;
void main(){vMapUv=vec2(.5);vTreeFrame=frame;vLodRange=vec2(0.0,.5);vVegetationAnchor=vec3(position,0)+vec3(.013,.021,.037);vMeadowDistance=grassDistance;vMeadowTint=vec3(1);vPlantHeight=.3;gl_Position=vec4(position*.5-vec2(cameraShift,0),0,1);}'''
positions=np.array([[-2,-2],[2,-2],[2,2],[-2,-2],[2,2],[-2,2]],dtype='float32');vao=U();genvao(1,C.byref(vao));bindvao(vao);vbo=U();genbuf(1,C.byref(vbo));bindbuf(0x8892,vbo);bufdata(0x8892,positions.nbytes,positions.ctypes.data,0x88E4);enattr(0);attr(0,2,0x1406,0,8,None)
texture=np.zeros((1,8,4),dtype='uint8');texture[0,0]=[200,100,50,255];tex=U();gentex(1,C.byref(tex));bindtex(0x0DE1,tex);teximage(0x0DE1,0,0x1908,8,1,0,0x1908,0x1401,texture.ctypes.data)
for setting,value in [(0x2801,0x2600),(0x2800,0x2600),(0x2802,0x812F),(0x2803,0x812F)]:texparam(0x0DE1,setting,value)
viewport(0,0,width,height);failures=[]
for name in ['tree-mask','grass-coverage','tree-photos']:
 program=create_program()
 for code,typ in [(vertex,0x8B31),((root/(name+'.frag')).read_bytes(),0x8B30)]:
  s=create(typ);text=C.c_char_p(code);source(s,1,C.byref(text),None);compile_(s);ok=I();get(s,0x8B81,C.byref(ok));log=C.create_string_buffer(16384);shader_log(s,16384,None,log);assert ok.value,log.value.decode();attach(program,s)
 link(program);ok=I();get_program(program,0x8B82,C.byref(ok));assert ok.value,name+' did not link';use(program);i1(location(program,b'map'),0);f1(location(program,b'detailDistance'),16)
 def render(shift=0,frame=.5,distance=12):
  f1(location(program,b'cameraShift'),shift);f1(location(program,b'frame'),frame);f1(location(program,b'grassDistance'),distance);clearcolor(0,0,0,0);clear(0x4000);draw(0x0004,0,6);image=np.empty((height,width,4),dtype='uint8');pixels(0,0,width,height,0x1908,0x1401,image.ctypes.data);assert error()==0;return image
 if name=='grass-coverage':
  for distance in [1,5,10,15,20,23,50,100,500]:
   image=render(distance=distance);coverage=np.mean(image[4:-4,4:-4,0]>0)
   if coverage<.999:failures.append(f'grass coverage at {distance} m: {coverage:.2%}, expected unchanged full coverage')
   else:print(f'PASS native grass coverage remains complete at {distance} m')
 elif name.endswith('mask'):
  a=render();b=render(.25);match=np.mean(a[4:-4,12:-4,0]==b[4:-4,4:-12,0]);coverage=np.mean(a[:,:,0]>0)
  if match<.999 or not .10<coverage<.90:failures.append(f'{name}: world-aligned coverage {match:.2%}, density {coverage:.2%}')
  else:print(f'PASS native camera translation preserves {name} coverage: {match:.2%}')
 else:
  for frame in [.5,7.5]:
   p=render(frame=frame)[height//2,width//2];expected=np.array([200,100,50]);
   if np.max(np.abs(p[:3].astype(int)-expected))>2 or not 126<=p[3]<=129:failures.append(f'tree photos frame {frame}: {p.tolist()}')
   else:print(f'PASS native transparent tree blend keeps leaf colour at frame {frame}')
for failure in failures:print('FAIL '+failure)
assert not failures,f'{len(failures)} vegetation pixel regressions'
print('Native foliage pixel checks passed; browser/device rendering was not tested.')
