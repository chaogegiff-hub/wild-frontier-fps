"""Rebuild CC0 recorded foley from the independently recorded source contacts.
No shoe splash is used for swimming, and no synthetic layer for glass.
"""
import json,subprocess,wave,hashlib,argparse
from pathlib import Path
import numpy as np
from scipy.signal import butter,sosfilt
p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,required=True);args=p.parse_args();out=Path(__file__).resolve().parents[1]/'dist/audio';sources={s['key']:s for s in json.loads((args.source_dir/'sources.json').read_text())};manifest=json.loads((out/'manifest.json').read_text());meta=json.loads((out/'SOURCES.json').read_text());rate=32000
specs={'grass':('footstep',[1.448,7.828,21.458,27.883],.40),'gravel':('footstepGravel',[15.708,26.668,45.263,56.828],.40),'wood':('footstepWood',[.373,2.328,4.848,7.478],.34),'stone':('footstepStone',[.423,2.493,5.588,8.978],.36),'swim':('swimStroke',[4.99,12.82,19.125,27.95],.62),'mirror':('glassBreak',[.0671875],1.4208)}
for kind,(key,starts,duration)in specs.items():
 data=subprocess.check_output(['ffmpeg','-v','error','-i',str(args.source_dir/(kind+'.mp3')),'-ar',str(rate),'-ac','1','-f','f32le','-']);audio=np.frombuffer(data,dtype='<f4');files=[]
 for i,start in enumerate(starts,1):
  a=audio[round(start*rate):round((start+duration)*rate)].copy();a-=a.mean();a=sosfilt(butter(2,65,fs=rate,btype='highpass',output='sos'),a);a[:32]*=np.linspace(0,1,32);n=min(len(a),1120);a[-n:]*=np.linspace(1,0,n);a*=10**(-6/20)/max(np.max(np.abs(a)),1e-9);file='glass-break.wav' if kind=='mirror' else f'swim-stroke-{i}.wav' if kind=='swim' else f'footstep-{kind}-{i}.wav'
  with wave.open(str(out/file),'wb')as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(np.round(a*32767).astype('<i2').tobytes())
  b=(out/file).read_bytes();source=sources[kind].copy();source.pop('mirrorLinks',None);meta[file]={'duration':len(a)/rate,'channels':1,'sampleRate':rate,'bits':16,'bytes':len(b),'peakDbFS':-6,'sha256':hashlib.sha256(b).hexdigest(),'source':source,'sourceStart':start,'processing':'Distinct real recorded contact; 65 Hz highpass, normalized with short edit fades. Swimming source is actual hand movement in a sink, used as foley, not an outdoor swimmer recording.' if kind=='swim' else 'Distinct real recorded contact, 65 Hz highpass, normalized with short edit fades.'};files.append(file)
 manifest[key]=files
for file in ['footstep-1.wav','footstep-2.wav']:(out/file).unlink(missing_ok=True);meta.pop(file,None)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2));(out/'SOURCES.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2));print('Prepared 21 real foley recordings.')
