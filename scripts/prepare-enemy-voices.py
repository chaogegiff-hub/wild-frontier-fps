"""Generate project-authored Mandarin AI callouts, then normalize local MP3s.

Development only: pip install edge-tts==7.3.1 (plus ffmpeg/ffprobe on PATH).
Runtime playback is local and requires no account, API key or speech service.
"""
import asyncio, json, os, subprocess
from pathlib import Path
import edge_tts
from edge_tts.communicate import _SSL_CTX

ROOT=Path(__file__).resolve().parent.parent
DEST=ROOT/'dist/audio/enemy'
LINES={
    'spot':['发现他了！','他在那里，盯紧他！'],
    'attack':['别让他跑了！','瞄准目标，开火！'],
    'reload':['我换弹，掩护我！'],
    'lost':['人不见了，注意搜索！'],
    'vehicle':['他开车过来了，小心！'],
    'grenade':['榴弹！快躲开！'],
}
PROFILES=[('scout','侦察兵','zh-CN-YunxiNeural','+15%','+6Hz'),('veteran','老兵','zh-CN-YunyangNeural','-3%','-16Hz'),('leader','队长','zh-CN-YunjianNeural','+7%','-6Hz')]

async def main():
    if os.environ.get('SSL_CERT_FILE'):
        _SSL_CTX.load_verify_locations(cafile=os.environ['SSL_CERT_FILE'])
    DEST.mkdir(parents=True,exist_ok=True)
    semaphore=asyncio.Semaphore(3)
    async def clip(profile,kind,index,text):
        ident,label,voice,rate,pitch=profile
        key=f'enemy-{ident}-{kind}-{index}'
        path=DEST/f'{ident}-{kind}-{index}.mp3'
        async with semaphore:
            raw=DEST/f'{key}.raw.mp3'
            if not path.exists() or path.stat().st_size<1000:
                await edge_tts.Communicate(text,voice,rate=rate,pitch=pitch).save(str(raw))
                subprocess.run(['ffmpeg','-y','-v','error','-i',str(raw),'-af','silenceremove=start_periods=1:start_duration=0.015:start_threshold=-46dB,highpass=f=120,lowpass=f=7200,loudnorm=I=-18:TP=-2:LRA=7','-ar','24000','-ac','1','-c:a','libmp3lame','-b:a','64k',str(path)],check=True)
                raw.unlink()
            duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(path)]))
            print(f'PASS {key}: {duration:.2f}s',flush=True)
            return key,{'file':path.name,'text':text,'profile':ident,'kind':kind,'duration':round(duration,3),'synthetic':True}
    results=await asyncio.gather(*(clip(p,k,i,t) for p in PROFILES for k,lines in LINES.items() for i,t in enumerate(lines)))
    manifest={'version':'2.24','language':'zh-CN','synthetic':True,'profiles':[{'id':p[0],'label':p[1],'sourceVoice':p[2],'rate':p[3],'pitch':p[4]} for p in PROFILES],'clips':dict(results)}
    (DEST/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(f'Generated {len(results)} local Mandarin voice clips.')

if __name__=='__main__':asyncio.run(main())
