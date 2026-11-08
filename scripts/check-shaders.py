import ctypes as C, json, pathlib, sys
E=C.CDLL('libEGL.so.1')
P=C.c_void_p; I=C.c_int; U=C.c_uint
E.eglGetProcAddress.argtypes=[C.c_char_p];E.eglGetProcAddress.restype=P
E.eglGetError.restype=I
get_display=C.CFUNCTYPE(P,U,P,C.POINTER(I))(E.eglGetProcAddress(b'eglGetPlatformDisplayEXT'))
dpy=get_display(0x31DD,None,None)
E.eglInitialize.argtypes=[P,C.POINTER(I),C.POINTER(I)];E.eglInitialize.restype=U
major=I();minor=I();assert E.eglInitialize(dpy,C.byref(major),C.byref(minor)),hex(E.eglGetError())
E.eglBindAPI.argtypes=[U];E.eglBindAPI.restype=U;assert E.eglBindAPI(0x30A0)
E.eglChooseConfig.argtypes=[P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)];E.eglChooseConfig.restype=U
attrs=(I*13)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038)
config=P();count=I();assert E.eglChooseConfig(dpy,attrs,C.byref(config),1,C.byref(count)) and count.value
E.eglCreatePbufferSurface.argtypes=[P,P,C.POINTER(I)];E.eglCreatePbufferSurface.restype=P
surf=E.eglCreatePbufferSurface(dpy,config,(I*5)(0x3057,16,0x3056,16,0x3038));assert surf
E.eglCreateContext.argtypes=[P,P,P,C.POINTER(I)];E.eglCreateContext.restype=P
ctx=E.eglCreateContext(dpy,config,None,(I*3)(0x3098,3,0x3038));assert ctx,hex(E.eglGetError())
E.eglMakeCurrent.argtypes=[P,P,P,P];E.eglMakeCurrent.restype=U;assert E.eglMakeCurrent(dpy,surf,surf,ctx)
def gl(name,ret,*args):
    return C.CFUNCTYPE(ret,*args)(E.eglGetProcAddress(name.encode()))
create=gl('glCreateShader',U,U);source=gl('glShaderSource',None,U,I,C.POINTER(C.c_char_p),C.POINTER(I));compile_=gl('glCompileShader',None,U);get=gl('glGetShaderiv',None,U,U,C.POINTER(I));log=gl('glGetShaderInfoLog',None,U,I,C.POINTER(I),C.c_char_p)
create_program=gl('glCreateProgram',U);attach=gl('glAttachShader',None,U,U);link=gl('glLinkProgram',None,U);get_program=gl('glGetProgramiv',None,U,U,C.POINTER(I));program_log=gl('glGetProgramInfoLog',None,U,I,C.POINTER(I),C.c_char_p)
version=gl('glGetString',C.c_char_p,U)(0x1F02).decode()
print(f'Native context: {version}')
folder=pathlib.Path(sys.argv[1]);programs=0;failures=[]
manifest=folder/'programs.json'
vertices=[folder/(p['stem']+'.vert') for p in json.loads(manifest.read_text())] if manifest.exists() else sorted(folder.glob('*.vert'))
for vertex in vertices:
    shader_ids=[];compiled=True
    for file,typ in [(vertex,0x8B31),(vertex.with_suffix('.frag'),0x8B30)]:
        s=create(typ);code=file.read_bytes();text=C.c_char_p(code);source(s,1,C.byref(text),None);compile_(s);ok=I();get(s,0x8B81,C.byref(ok))
        if manifest.exists():assert code.startswith(b'#version 300 es'),f'{file.name}: expected actual WebGL 2 program'
        buf=C.create_string_buffer(16384);log(s,16384,None,buf)
        if not ok.value:
            failures.append(f'{file.name}: {buf.value.decode()}');compiled=False
        shader_ids.append(s)
    if not compiled:continue
    prog=create_program()
    for s in shader_ids:attach(prog,s)
    link(prog);ok=I();get_program(prog,0x8B82,C.byref(ok));buf=C.create_string_buffer(16384);program_log(prog,16384,None,buf)
    if not ok.value:
        failures.append(f'{vertex.stem}: {buf.value.decode()}');continue
    print(f'PASS native GLES compile/link {vertex.stem}');programs+=1
for failure in failures:print(f'FAIL {failure}')
assert not failures,f'{len(failures)} shader compilation/link failures'
assert programs>0,'No shader programs were supplied'
print(f'{programs} shader programs compiled and linked; no browser/device render performed.')
