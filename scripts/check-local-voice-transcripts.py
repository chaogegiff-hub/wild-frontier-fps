"""Independent local ASR audit of short recorded Chinese callouts.

Development only: pypinyin and a local Whisper-small or SenseVoice-int8
model. ASR agreement checks words; it does not establish acting quality.
"""
import argparse, concurrent.futures, hashlib, json, pathlib, re, subprocess, unicodedata

ROOT=pathlib.Path(__file__).resolve().parent.parent

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--engine',choices=['whisper','sensevoice'],default='whisper');parser.add_argument('--model',required=True);parser.add_argument('--output',required=True,type=pathlib.Path);args=parser.parse_args()
    from pypinyin import lazy_pinyin
    import numpy as np
    if args.engine=='whisper':
        from faster_whisper import WhisperModel
        model=WhisperModel(args.model,device='cpu',compute_type='int8',cpu_threads=4,num_workers=2,local_files_only=True)
    else:
        import sherpa_onnx
        model_path=pathlib.Path(args.model)
        model=sherpa_onnx.OfflineRecognizer.from_sense_voice(model=str(model_path/'model.int8.onnx'),tokens=str(model_path/'tokens.txt'),num_threads=3,language='zh',use_itn=True,provider='cpu')
    manifest=json.loads((ROOT/'dist/audio/enemy/manifest.json').read_text())
    def phones(text):return lazy_pinyin(re.sub(r'[^\u3400-\u9fff]','',unicodedata.normalize('NFKC',text)))
    def audit(item):
        key,c=item
        # Decode explicitly to Whisper's 16 kHz float input. This also keeps the
        # audit independent of PyAV version-specific file-opening arguments.
        pcm=subprocess.check_output(['ffmpeg','-v','error','-i',str(ROOT/'dist/audio/enemy'/c['file']),'-ar','16000','-ac','1','-f','f32le','pipe:1'])
        if args.engine=='whisper':
            segments,info=model.transcribe(np.frombuffer(pcm,dtype=np.float32),language='zh',beam_size=5,condition_on_previous_text=False,vad_filter=False,without_timestamps=True,no_speech_threshold=None)
            segments=list(segments);actual=''.join(s.text for s in segments).strip()
        else:
            stream=model.create_stream();stream.accept_waveform(16000,np.frombuffer(pcm,dtype=np.float32));model.decode_stream(stream);actual=stream.result.text.strip()
        want=c['text']
        # The leading pain sound is an expressive breath/groan, not a required
        # spoken syllable. Audit the words that follow it independently.
        if c['kind']=='wounded':want=re.sub(r'^[啊嘶呃]！','',want)
        expected=phones(want);observed=phones(actual);matched=expected==observed
        if c['kind']=='wounded':matched=any(observed[i:i+len(expected)]==expected for i in range(len(observed)))
        if c['kind']=='spot' and want=='在那儿！快！':matched=observed in [phones('在那儿快'),phones('在那快'),phones('在那里快')]
        if c['kind']=='lost':matched=observed in [phones(want),phones(want.replace('哪了','哪儿了')),phones(want.replace('哪了','哪儿了').replace('点','点儿'))]
        row={'key':key,'audioSha256':hashlib.sha256((ROOT/'dist/audio/enemy'/c['file']).read_bytes()).hexdigest(),'expected':c['text'],'transcript':actual,'phoneticMatch':matched,'expectedPhones':expected,'recognizedPhones':observed}
        if args.engine=='sensevoice':row['asrEmotionLabel']=stream.result.emotion;row['asrEventLabel']=stream.result.event
        print(('PASS' if matched else 'REVIEW'),key,repr(actual),'expected',repr(c['text']),flush=True);return row
    with concurrent.futures.ThreadPoolExecutor(max_workers=2 if args.engine=='whisper' else 1) as pool:rows=list(pool.map(audit,manifest['clips'].items()))
    result={'asr':'Systran/faster-whisper-small' if args.engine=='whisper' else 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17','device':'cpu','computeType':'int8','note':'Independent transcription audit. ASR may misrecognize expressive delivery; this does not measure naturalness or emotion.','clips':rows}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('Matched',sum(r['phoneticMatch'] for r in rows),'/',len(rows),flush=True)

if __name__=='__main__':main()
