import {clamp} from './core.js?v=2.25-drive-grass1';
import {assetUrl} from './resource-pack.js?v=2.25-drive-grass1';

// Firearms use recordings; the engine and dual-tone horn are synthesized.
export class GameAudio{
  constructor(){this.ctx=null;this.buffers={};this._enabled=true;this.active=false;this.sources=new Set();this.lockTones=new Set();this.movementSources=new Set();this.chatterSources=new Set();this.reactionSources=new Map();this.lastChoices=new Map();this.lockTargetId=null;this.lockBeepTimer=0;this.ready=false;}
  get enabled(){return this._enabled;}
  set enabled(value){this._enabled=value;if(this.master)this.master.gain.setTargetAtTime(value?.75:0,this.ctx.currentTime,.05);if(!value){this.clearLockAudio();this.stopChatter();this.stopReactions();}}
  init(){
    if(this.ctx)return;
    const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return;
    this.ctx=new Audio();const c=this.ctx;
    this.master=c.createGain();this.master.gain.value=this.enabled?.75:0;
    this.limiter=c.createDynamicsCompressor();Object.assign(this.limiter.threshold,{value:-12});this.limiter.knee.value=18;this.limiter.ratio.value=4;this.limiter.attack.value=.003;this.limiter.release.value=.16;
    this.master.connect(this.limiter).connect(c.destination);
    this.echo=c.createDelay(1);this.echo.delayTime.value=.23;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=2600;
    const echoGain=c.createGain();echoGain.gain.value=.09;this.echo.connect(filter).connect(echoGain).connect(this.master);
  }
  async load(){
    try{
      this.init();if(!this.ctx)return;
      const response=await fetch(assetUrl('./audio/manifest.json'));if(!response.ok)throw new Error('Audio manifest unavailable');const files=await response.json();
      await Promise.all(Object.entries(files).map(async([key,paths])=>{
        const result=await Promise.allSettled(paths.map(async file=>{
          const response=await fetch(assetUrl('./audio/'+file));if(!response.ok)throw new Error('Audio unavailable: '+file);
          return this.ctx.decodeAudioData(await response.arrayBuffer());
        }));this.buffers[key]=result.filter(r=>r.status==='fulfilled').map(r=>r.value);
      }));
      this.ready=true;this.startAmbience();
    }catch(error){console.warn('Recorded audio unavailable',error);}
  }
  resume(){
    if(!this.enabled)return;try{this.init();if(this.ctx?.state==='suspended')this.ctx.resume().catch(()=>{});this.startAmbience();}catch{}
  }
  async loadChatter(){
    if(this.voiceLoadPromise)return this.voiceLoadPromise;
    this.voiceLoadPromise=(async()=>{
      try{
        this.init();if(!this.ctx)throw new Error('AudioContext unavailable');
        // This extension is fetched separately from the unchanged large startup
        // packs, whose old cached manifest does not contain the new recordings.
        const root=new URL('./audio/enemy/',import.meta.url),response=await fetch(new URL('manifest.json?v=2.26-local-voices1',root));if(!response.ok)throw new Error('Enemy voices unavailable');const manifest=await response.json();
        const results=await Promise.allSettled(Object.entries(manifest.clips).map(async([key,clip])=>{const response=await fetch(new URL(clip.file,root));if(!response.ok)throw new Error(clip.file);this.buffers[key]=[await this.ctx.decodeAudioData(await response.arrayBuffer())];}));
        const failed=results.filter(r=>r.status==='rejected').length;if(failed)throw new Error(`${failed} enemy voice clips failed to load`);this.voicesReady=true;return true;
      }catch(error){console.warn('Enemy voice load can be retried',error);this.voiceLoadPromise=null;return false;}
    })();return this.voiceLoadPromise;
  }
  stopChatter(){for(const source of this.chatterSources)try{source.stop();}catch{}this.chatterSources.clear();}
  async loadReactions(){
    if(this.reactionLoadPromise)return this.reactionLoadPromise;
    this.reactionLoadPromise=(async()=>{
      try{
        this.init();if(!this.ctx)throw new Error('AudioContext unavailable');
        const root=new URL('./audio/reactions/',import.meta.url),response=await fetch(new URL('manifest.json?v=2.27-human-pain1',root));if(!response.ok)throw new Error('Vocal reactions unavailable');
        const manifest=await response.json(),results=await Promise.allSettled(Object.entries(manifest.clips).map(async([key,clip])=>{
          const response=await fetch(new URL(clip.file,root));if(!response.ok)throw new Error(clip.file);this.buffers[key]=[await this.ctx.decodeAudioData(await response.arrayBuffer())];
        }));
        if(results.some(r=>r.status==='rejected'))throw new Error('Some vocal reactions failed to load');this.reactionsReady=true;return true;
      }catch(error){console.warn('Vocal reaction load can be retried',error);this.reactionLoadPromise=null;return false;}
    })();return this.reactionLoadPromise;
  }
  stopReactions({keepTerminal=false}={}){
    for(const [id,entry] of this.reactionSources){if(keepTerminal&&entry.terminal)continue;try{entry.source.stop();}catch{}this.reactionSources.delete(id);}
  }
  vocalReaction(line){
    if(!this.active||!this.enabled||!this.ctx||!this.buffers[line.key]?.length)return false;
    const previous=this.reactionSources.get(line.actorId);
    if(previous){try{previous.source.stop();}catch{}this.reactionSources.delete(line.actorId);}
    // Two nearby reflex voices at most; higher urgency wins, then proximity.
    if(this.reactionSources.size>=2){
      const worst=[...this.reactionSources.values()].sort((a,b)=>a.priority-b.priority||b.distance-a.distance)[0];
      if(line.priority<worst.priority||line.priority===worst.priority&&line.distance>=worst.distance)return false;
      try{worst.source.stop();}catch{}this.reactionSources.delete(worst.actorId);
    }
    const volume=(line.actorId==='player'?(line.kind==='light'?.58:.78):(line.kind==='light'?.78:.92))*(line.blocked?.5:1);
    const source=this.play(line.key,{volume,position:line.position||undefined,refDistance:9,occluded:line.blocked,category:'reaction'});
    if(!source)return false;this.reactionSources.set(line.actorId,{...line,source});
    return source.buffer.duration+(line.distance||0)/343;
  }
  enemyVoice(line){
    if(!this.active||!this.enabled)return false;
    const source=this.play(line.key,{volume:line.blocked?.40:.86,position:line.position,refDistance:11,category:'chatter',occluded:line.blocked});
    return source?source.buffer.duration+Math.hypot(line.position.x-(this.position?.x||0),line.position.z-(this.position?.z||0))/343:false;
  }
  cactusImpact(position,speed=3){
    if(!this.active||!this.enabled)return;this.resume();if(!this.ctx)return;const c=this.ctx,source=c.createBufferSource(),length=Math.floor(c.sampleRate*.22),buffer=c.createBuffer(1,length,c.sampleRate),data=buffer.getChannelData(0);
    let seed=19;for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;const t=i/c.sampleRate;data[i]=((seed>>>0)/4294967295-.5)*Math.exp(-t*27)+Math.sin(t*650)*Math.exp(-t*45)*.55;}source.buffer=buffer;
    const gain=c.createGain(),filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1800;const d=this.position?Math.hypot(position.x-this.position.x,position.z-this.position.z):0;gain.gain.value=Math.min(.28,.10+speed*.012)/(1+d*.09);source.connect(filter).connect(gain).connect(this.master);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start();
  }
  setActive(active,{allowVocalTail=false}={}){
    this.active=active;if(this.ambientGain)this.ambientGain.gain.setTargetAtTime(active?.055:0,this.ctx.currentTime,.18);
    if(!active&&this.engineGain)this.engineGain.gain.setTargetAtTime(0,this.ctx.currentTime,.04);if(!active){this.stopChatter();this.stopReactions({keepTerminal:allowVocalTail});this.horn(false);this.clearLockAudio();for(const source of this.movementSources)try{source.stop();}catch{}this.movementSources.clear();}
  }
  horn(pressed){
    if(!this.enabled||!this.active){this.hornPressed=false;if(this.hornGain){this.hornGain.gain.cancelScheduledValues?.(this.ctx.currentTime);this.hornGain.gain.setTargetAtTime(0,this.ctx.currentTime,.025);}return;}
    if(!pressed){if(this.hornPressed){this.hornPressed=false;this.hornGain.gain.setTargetAtTime(0,Math.max(this.ctx.currentTime,this.hornUntil),.025);}return;}
    this.resume();if(!this.ctx)return;const c=this.ctx;
    if(!this.hornGain){
      this.hornGain=c.createGain();this.hornGain.gain.value=0;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=3200;this.hornGain.connect(filter).connect(this.master);
      const wave=c.createPeriodicWave(new Float32Array(6),Float32Array.from([0,1,.42,.21,.10,.04]));
      this.hornOscillators=[400,500].map(freq=>{const o=c.createOscillator();o.setPeriodicWave(wave);o.frequency.value=freq;o.connect(this.hornGain);o.start();return o;});
    }if(!this.hornPressed){this.hornPressed=true;this.hornUntil=c.currentTime+.14;this.hornGain.gain.cancelScheduledValues?.(c.currentTime);this.hornGain.gain.setTargetAtTime(.16,c.currentTime,.018);}
  }
  drive(car){
    if(!this.ctx)return;
    if(!car||car.stalled||!this.active){if(this.engineGain)this.engineGain.gain.setTargetAtTime(0,this.ctx.currentTime,.05);return;}
    const c=this.ctx;
    if(!this.engine){
      // A compact synthesized four-stroke exhaust bed; no extra startup download.
      const buffer=c.createBuffer(1,c.sampleRate,c.sampleRate),data=buffer.getChannelData(0);let seed=21;
      for(let i=0;i<data.length;i++){const t=i/c.sampleRate,phase=(t*28)%1;seed=(Math.imul(seed,1664525)+1013904223)|0;const noise=(seed>>>0)/4294967295-.5;data[i]=.38*Math.sin(t*Math.PI*112)+Math.exp(-phase*22)*(.5*Math.sin(phase*Math.PI*8)+noise*.42);}
      this.engine=c.createBufferSource();this.engine.buffer=buffer;this.engine.loop=true;this.engineFilter=c.createBiquadFilter();this.engineFilter.type='lowpass';this.engineGain=c.createGain();this.engineGain.gain.value=0;this.engine.connect(this.engineFilter).connect(this.engineGain).connect(this.master);this.engine.start();
    }
    const speed=Math.abs(car.speed);this.engine.playbackRate.setTargetAtTime(.88+speed/10,c.currentTime,.10);this.engineFilter.frequency.setTargetAtTime(550+speed*35,c.currentTime,.12);this.engineGain.gain.setTargetAtTime(.12+Math.min(.10,speed*.005),c.currentTime,.12);
  }
  startAmbience(){
    if(this.ambient||!this.ctx||!this.buffers.forest?.length)return;
    const c=this.ctx;this.ambient=c.createBufferSource();this.ambient.buffer=this.buffers.forest[0];this.ambient.loop=true;
    this.ambientGain=c.createGain();this.ambientGain.gain.value=this.active?.055:0;this.ambient.connect(this.ambientGain).connect(this.master);this.ambient.start();
  }
  listener(position,forward){
    if(!this.ctx)return;const l=this.ctx.listener,t=this.ctx.currentTime;
    if(l.positionX){
      for(const [key,value] of Object.entries({positionX:position.x,positionY:position.y,positionZ:position.z,forwardX:forward.x,forwardY:forward.y,forwardZ:forward.z,upX:0,upY:1,upZ:0}))l[key].setValueAtTime(value,t);
    }else{l.setPosition(position.x,position.y,position.z);l.setOrientation(forward.x,forward.y,forward.z,0,1,0);}
    this.position={x:position.x,y:position.y,z:position.z};
  }
  play(key,{volume=1,position,pitch=1,delay=0,echo=false,duration,pan=0,category='',refDistance=7,occluded=false}={}){
    if(!this.ctx||!this.enabled||!this.buffers[key]?.length)return;
    const c=this.ctx,source=c.createBufferSource(),choices=this.buffers[key];let index=Math.floor(Math.random()*choices.length);if(choices.length>1&&index===this.lastChoices.get(key))index=(index+1+Math.floor(Math.random()*(choices.length-1)))%choices.length;this.lastChoices.set(key,index);source.buffer=choices[index];source.playbackRate.value=pitch;
    const gain=c.createGain();gain.gain.value=volume;source.connect(gain);let output=gain,nodes=[source,gain];
    if(position&&this.position){
      const d=Math.hypot(position.x-this.position.x,position.y-this.position.y,position.z-this.position.z),low=c.createBiquadFilter();low.type='lowpass';low.frequency.value=occluded?1500:clamp(20000/(1+d/35),1100,20000);
      const p=c.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=refDistance;p.maxDistance=550;p.rolloffFactor=1.1;
      if(p.positionX){p.positionX.value=position.x;p.positionY.value=position.y;p.positionZ.value=position.z;}else p.setPosition(position.x,position.y,position.z);
      output.connect(low).connect(p);output=p;nodes.push(low,p);delay+=d/343;
    }
    if(!position&&pan&&c.createStereoPanner){const stereo=c.createStereoPanner();stereo.pan.value=pan;output.connect(stereo);output=stereo;nodes.push(stereo);}
    output.connect(this.master);if(echo)output.connect(this.echo);
    source.onended=()=>{this.sources.delete(source);this.movementSources.delete(source);this.chatterSources.delete(source);if(category==='reaction')for(const [id,e] of this.reactionSources)if(e.source===source)this.reactionSources.delete(id);nodes.forEach(n=>n.disconnect());};this.sources.add(source);if(category==='movement')this.movementSources.add(source);if(category==='chatter')this.chatterSources.add(source);
    const when=c.currentTime+delay;if(duration)source.start(when,0,Math.min(duration,source.buffer.duration));else source.start(when);
    return source;
  }
  shot(weapon){this.resume();this.play(weapon,{volume:weapon==='sniper'?.82:weapon==='grenade'?.8:.64,pitch:.985+Math.random()*.03,echo:true});}
  enemyShot(position){this.play('rifle',{volume:.7,position,echo:true});}
  explosion(position){this.play('explosion',{volume:1.25,position,echo:true});}
  reload(){this.play('reload',{volume:.25});}
  bolt(){this.play('bolt',{volume:.23});}
  casing(position){this.play('casing',{volume:.12,position,pitch:.96+Math.random()*.08});}
  glassBreak(position){this.play('glassBreak',{position,volume:.72,pitch:.98+Math.random()*.04});}

  vehicleImpact(position,speed){this.play('footstep',{volume:.26+Math.min(.20,speed*.01),position,pitch:.55,duration:.17});this.tone(72,.12,.045,'triangle');}
  waterImpact(position){this.play('waterStep',{volume:.85,position,pitch:.65});}
  clearLockAudio(){
    this.lockTargetId=null;this.lockBeepTimer=0;
    for(const voice of this.lockTones){
      const now=this.ctx.currentTime;voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(0,now,.005);try{voice.oscillator.stop(now+.02);}catch{}
    }this.lockTones.clear();
  }
  trackLock(dt,lock){
    if(!this.active||!this.enabled||!lock||lock.targetId===null){this.clearLockAudio();return;}
    if(lock.locked){this.lockTargetId=lock.targetId;this.lockBeepTimer=0;return;}
    if(this.lockTargetId!==lock.targetId){this.clearLockAudio();this.lockTargetId=lock.targetId;}
    if(dt<=0)return;this.lockBeepTimer-=dt;
    if(this.lockBeepTimer<=0){this.tone(760+lock.progress*340,.045,.075,'sine',0,'lock');this.lockBeepTimer=.13-lock.progress*.05;}
  }
  lockSuccess(){
    if(!this.active||!this.enabled)return;this.clearLockAudio();this.resume();
    this.tone(1120,.075,.11,'sine',0,'lock');this.tone(1580,.12,.13,'sine',.09,'lock');
  }
  footstep(surface,volume=.11,side=0){if(!this.active||!this.enabled)return;const key=surface===true||surface==='water'?'waterStep':({grass:'footstep',gravel:'footstepGravel',stone:'footstepStone',wood:'footstepWood'}[surface]||'footstep');this.play(key,{volume,pitch:.98+Math.random()*.04,pan:side*.07,category:'movement'});}
  swimStroke(side,moving=true){if(!this.active||!this.enabled)return;this.play('swimStroke',{volume:moving?.23:.14,pitch:.98+Math.random()*.04,pan:side==='L'?-.13:.13,category:'movement'});}

  tone(freq,duration,volume,type='sine',delay=0,category=''){
    if(!this.ctx||!this.enabled)return;const c=this.ctx,t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(volume,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g).connect(this.master);
    const voice={oscillator:o,gain:g};if(category==='lock')this.lockTones.add(voice);
    o.onended=()=>{this.lockTones.delete(voice);o.disconnect();g.disconnect();};o.start(t);o.stop(t+duration);
  }
}
