"""Generate the recorded combat callouts with a local, instruction-capable model.

Development tool only. Supply a complete local Qwen 1.7B CustomVoice model,
including its speech_tokenizer directory. Model weights never ship in the game.
Install CPU torch/torchaudio 2.9.1, qwen-tts==0.1.1, and ffmpeg/ffprobe first.
No remote inference service, API key, pitch shift or speed change is used.
"""
import argparse, hashlib, json, os, pathlib, subprocess, time

ROOT=pathlib.Path(__file__).resolve().parent.parent

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--model',required=True,type=pathlib.Path)
    parser.add_argument('--cache',required=True,type=pathlib.Path)
    parser.add_argument('--output',type=pathlib.Path,default=ROOT/'dist/audio/enemy')
    parser.add_argument('--threads',type=int,default=8)
    parser.add_argument('--only',help='Generate one named key without publishing a manifest')
    args=parser.parse_args()
    os.environ.setdefault('HF_HUB_OFFLINE','1')
    os.environ.setdefault('TOKENIZERS_PARALLELISM','false')
    import torch, numpy as np, soundfile as sf
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(args.threads);torch.set_num_interop_threads(1)
    plan=json.loads((ROOT/'sources/combat-voice-direction.json').read_text())
    clips=[c for c in plan['clips'] if not args.only or c['key']==args.only]
    if not clips:raise ValueError('Unknown clip key')
    args.output.mkdir(parents=True,exist_ok=True);args.cache.mkdir(parents=True,exist_ok=True)
    print('Loading local instruction-capable Qwen3-TTS 1.7B',flush=True)
    model=Qwen3TTSModel.from_pretrained(str(args.model),device_map='cpu',dtype=torch.bfloat16,attn_implementation='sdpa')
    if model.model.tts_model_size=='0b6':raise ValueError('The 0.6B model ignores emotion instructions; use 1.7B')
    manifest={'version':'2.26-local-voices1','language':'zh-CN','synthetic':True,'generatedLocally':True,'generator':plan['generator'],'profiles':plan['profiles'],'clips':{}}
    for c in clips:
        recipe={**c,'generator':plan['generator']};digest=hashlib.sha256(json.dumps(recipe,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        raw=args.cache/(digest+'.wav');record=args.cache/(digest+'.json');started=time.time()
        if not raw.exists():
            torch.manual_seed(c['seed'])
            with torch.inference_mode():
                wavs,sr=model.generate_custom_voice(text=c['text'],language='Chinese',speaker=c['voice'],instruct=c['instruction'],max_new_tokens=96,non_streaming_mode=True,temperature=.9,top_k=50)
            audio=np.asarray(wavs[0],dtype=np.float32)
            if not np.isfinite(audio).all() or np.max(np.abs(audio))<.01:raise ValueError('Invalid voice output: '+c['key'])
            if not .4<=len(audio)/sr<=7.5:raise ValueError('Abnormal callout duration: '+c['key'])
            sf.write(raw,audio,sr,subtype='FLOAT');record.write_text(json.dumps(recipe,ensure_ascii=False,indent=2)+'\n')
        output=args.output/c['output_file'];temporary=output.with_suffix('.working.mp3');target=-22 if c['kind']=='lost' else -17
        subprocess.run(['ffmpeg','-y','-v','error','-i',str(raw),'-af',f'highpass=f=75,lowpass=f=10500,loudnorm=I={target}:TP=-2:LRA=14','-ar','24000','-ac','1','-c:a','libmp3lame','-b:a','64k',str(temporary)],check=True)
        duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(temporary)]))
        temporary.replace(output)
        manifest['clips'][c['key']]={'file':output.name,'text':c['text'],'profile':c['profile'],'kind':c['kind'],'duration':round(duration,3),'instruction':c['instruction'],'seed':c['seed'],'recipeSha256':digest,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'synthetic':True}
        print(f"PASS {c['key']}: {duration:.2f}s; generated/prepared in {time.time()-started:.2f}s",flush=True)
        (args.cache/'progress.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    if not args.only:
        if len(manifest['clips'])!=len(plan['clips']):raise ValueError('Incomplete voice bank')
        target=args.output/'manifest.json';temporary=target.with_suffix('.working.json');temporary.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');temporary.replace(target)
    print(f'Prepared {len(clips)} local combat voice clips.',flush=True)

if __name__=='__main__':main()
