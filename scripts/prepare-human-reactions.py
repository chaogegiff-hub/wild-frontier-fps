"""Prepare real human pain performances from HaelDB's CC0 archive.

No paid API, TTS, cloning, pitch shifting or speed changes. The original archive
is SHA256-verified; the edit plan preserves the source and exact excerpt per take.
Requires ffmpeg/ffprobe. Download into a development cache, never the web root.
"""
import argparse, array, hashlib, json, math, pathlib, subprocess, urllib.request, zipfile

ROOT=pathlib.Path(__file__).resolve().parent.parent

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--cache',required=True,type=pathlib.Path);args=parser.parse_args()
    plan=json.loads((ROOT/'sources/human-vocal-reactions.json').read_text());args.cache.mkdir(parents=True,exist_ok=True)
    archive=args.cache/'haeldb-yelling-sounds.zip'
    if not archive.exists():
        with urllib.request.urlopen(plan['source']['archive'],timeout=60) as response:archive.write_bytes(response.read())
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=plan['source']['archiveSha256']:raise ValueError('Original archive hash mismatch')
    output=ROOT/'dist/audio/reactions';output.mkdir(parents=True,exist_ok=True)
    manifest={'version':'2.27-human-pain1','humanRecorded':True,'synthetic':False,'source':plan['source'],'processing':plan['processing'],'clips':{}}
    with zipfile.ZipFile(archive) as z:
        entries={pathlib.PurePosixPath(n).name:n for n in z.namelist() if n.lower().endswith('.wav')}
        for c in plan['clips']:
            data=z.read(entries[c['source_file']]);raw=args.cache/c['source_file'];raw.write_bytes(data)
            # Mild cleanup, retaining breaths and the natural performance envelope.
            filters=f"atrim=start={c['start']}:end={c['end']},asetpts=PTS-STARTPTS,highpass=f=75,lowpass=f=12000,afade=t=in:d=0.004,afade=t=out:st={max(0,c['end']-c['start']-.035):.5f}:d=0.035"
            pcm=subprocess.check_output(['ffmpeg','-v','error','-i',str(raw),'-af',filters,'-ar','32000','-ac','1','-f','f32le','pipe:1'])
            samples=array.array('f');samples.frombytes(pcm);peak=max(abs(v) for v in samples);assert peak>.002,c['key']
            gain=10**(c['targetPeakDbfs']/20)/peak
            path=output/c['output_file']
            subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar','32000','-ac','1','-i','pipe:0','-af',f'volume={gain:.9f}','-c:a','libmp3lame','-b:a','80k',str(path)],input=pcm,check=True)
            decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ar','32000','-ac','1','-f','f32le','pipe:1']);a=array.array('f');a.frombytes(decoded)
            peak_db=20*math.log10(max(abs(v) for v in a));rms_db=20*math.log10(math.sqrt(sum(v*v for v in a)/len(a)));duration=len(a)/32000
            assert .16<duration<2.6 and -.5>peak_db and rms_db>-35,(c['key'],duration,peak_db,rms_db)
            manifest['clips'][c['key']]={'file':path.name,'profile':c['profile'],'kind':c['kind'],'performer':c['performer'],'duration':round(duration,5),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'sourceFile':c['source_file'],'sourceSha256':hashlib.sha256(data).hexdigest(),'sourceExcerpt':[c['start'],c['end']],'peakDbfs':round(peak_db,2),'rmsDbfs':round(rms_db,2)}
            print('PASS',c['key'],f'{duration:.2f}s',f'{peak_db:.2f}dBFS',flush=True)
    (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print('Prepared',len(manifest['clips']),'human-recorded vocal reactions;',sum(c['bytes'] for c in manifest['clips'].values()),'bytes',flush=True)

if __name__=='__main__':main()
