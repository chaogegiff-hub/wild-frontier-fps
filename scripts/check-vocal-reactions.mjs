import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {VocalReactions,VOCAL_TAKES,vocalKey} from '../dist/vocal-reactions.js';
import {GameAudio} from '../dist/audio.js';
import {Match,createWorldData} from '../dist/core.js';

let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function fixture(){
  const e={id:0,hp:100,alive:true,sees:false,x:0,y:200,z:-10},match={time:1,enemies:[e],player:{x:0,y:201.7,z:0,hp:100},colliders:[]},lines=[],stops=[];
  const vocals=new VocalReactions({play:l=>{lines.push(l);return .7;},stop:()=>stops.push(true),random:()=>0});
  return {e,match,lines,stops,vocals,hit(hp,extra={}){e.hp=hp;e.alive=hp>0;return vocals.handle({type:hp>0?'hit':'kill',enemy:e,...extra},match);}};
}
function audioFixture(){
  const nodes=[],panners=[],param=()=>({value:0,setTargetAtTime(v){this.value=v;}}),node=()=>({connect(n){return n;},disconnect(){}}),audio=new GameAudio();
  audio.ctx={state:'running',currentTime:1,createBufferSource(){const n={...node(),playbackRate:param(),start(t){this.started=t;},stop(){this.stopped=true;}};nodes.push(n);return n;},createGain:()=>({...node(),gain:param()}),createBiquadFilter:()=>({...node(),frequency:param()}),createPanner(){const n={...node(),positionX:param(),positionY:param(),positionZ:param()};panners.push(n);return n;}};
  audio.master={...node(),gain:param()};audio.active=true;audio.position={x:0,y:200,z:0};audio.buffers.sample=[{duration:.8}];
  return {audio,nodes,panners,line(id,distance=5,priority=1){return {actorId:id,enemyId:id,key:'sample',kind:priority===3?'death':'light',priority,terminal:priority===3,distance,position:{x:distance,y:201.5,z:0}};}};
}

check('all 32 human takes have verified provenance, fixed performers and distinct bounded MP3s',()=>{
  const root=new URL('../dist/audio/reactions/',import.meta.url),m=JSON.parse(fs.readFileSync(new URL('manifest.json',root))),hashes=new Set(),performers=new Set();let bytes=0;
  assert.equal(m.humanRecorded,true);assert.equal(m.synthetic,false);assert.equal(m.source.license,'CC0-1.0');assert.equal(m.processing.pitchShift,false);assert.equal(m.processing.speedChange,false);
  for(const role of ['scout','veteran','leader','player']){
    const ids=new Set();for(const [kind,count] of Object.entries(VOCAL_TAKES))for(let i=0;i<count;i++){
      const c=m.clips[vocalKey(role,kind,i)];assert.ok(c);const b=fs.readFileSync(new URL(c.file,root));assert.equal(createHash('sha256').update(b).digest('hex'),c.sha256);assert.equal(b.length,c.bytes);assert.match(c.sourceSha256,/^[0-9a-f]{64}$/);
      assert.ok(c.duration>.16&&c.duration<2.6);assert.ok(c.peakDbfs<-.5&&c.rmsDbfs>-35);assert.ok(c.sourceExcerpt[1]>c.sourceExcerpt[0]);hashes.add(c.sha256);ids.add(c.performer);bytes+=b.length;
    }assert.equal(ids.size,1);performers.add([...ids][0]);
  }assert.equal(performers.size,4);assert.equal(hashes.size,32);assert.ok(bytes<400000);
});
check('real Match hit/kill events play unseen light, heavy and fatal reflexes immediately',()=>{
  const f=fixture(),m=new Match(createWorldData());m.reset('training');const e=m.enemies[0];m.player.x=e.x;m.player.z=e.z+8;
  m.onEvent=event=>f.vocals.handle(event,m);m.damageEnemy(e,10);assert.equal(f.lines.at(-1).kind,'light');m.time+=.1;m.damageEnemy(e,65);assert.equal(f.lines.at(-1).kind,'heavy');m.time+=.1;m.damageEnemy(e,30);assert.equal(f.lines.at(-1).kind,'death');assert.equal(f.lines.length,3);assert.equal(e.alive,false);
});
check('automatic fire is bounded, a worse injury can escalate and each death fires once',()=>{
  const f=fixture();f.hit(95);f.match.time+=.05;f.hit(90);assert.equal(f.lines.length,1);f.hit(20);assert.equal(f.lines.at(-1).kind,'heavy');f.hit(0);assert.equal(f.lines.at(-1).terminal,true);const n=f.lines.length;f.hit(0);assert.equal(f.lines.length,n);
});
check('a lethal head hit is a brief terminal grunt instead of a sustained death yell',()=>{
  const f=fixture();f.hit(0,{headshot:true});assert.equal(f.lines.length,1);assert.equal(f.lines[0].kind,'light');assert.equal(f.lines[0].terminal,true);
});
check('repeat hits vary the take without changing the actor or synthesizing pitch variation',()=>{
  const f=fixture();f.e.id=5;f.hit(92);f.match.time+=1;f.hit(84);assert.equal(f.lines[0].profile,'leader');assert.equal(f.lines[1].profile,'leader');assert.notEqual(f.lines[0].key,f.lines[1].key);
  f.match.colliders=[{type:'box',x:0,z:-5,y:198,w:10,d:.5,h:8}];f.match.time+=1;f.hit(76);assert.equal(f.lines.at(-1).blocked,true);
});
check('player armour hits are silent vocally while flesh damage and death use their own performer',()=>{
  const f=fixture();f.vocals.handle({type:'hurt',healthDamage:0,armourDamage:8,source:'敌方射击'},f.match);assert.equal(f.lines.length,0);
  f.match.player.hp=97;f.vocals.handle({type:'hurt',healthDamage:3,source:'敌方射击'},f.match);assert.equal(f.lines[0].profile,'player');assert.equal(f.lines[0].position,null);
  f.match.player.hp=0;f.vocals.handle({type:'hurt',healthDamage:97,source:'敌方射击'},f.match);assert.equal(f.lines.at(-1).kind,'death');
  const g=fixture();for(const source of ['安全区外','溺水'])g.vocals.handle({type:'hurt',healthDamage:5,source},g.match);assert.equal(g.lines.length,0);
});
check('muted damage is tracked without queuing old pain; pause and new rounds stop voices',()=>{
  const f=fixture();f.e.hp=55;f.vocals.handle({type:'hit',enemy:f.e},f.match,{enabled:false});assert.equal(f.lines.length,0);
  f.hit(53);assert.equal(f.lines[0].kind,'light','Muted damage was incorrectly accumulated into a new heavy injury');const stops=f.stops.length;f.vocals.update(.01,f.match,{active:false});assert.ok(f.stops.length>stops);
  f.match.enemies=[{...f.e,hp:100}];f.vocals.update(.01,f.match);assert.equal(f.vocals.states.size,0);f.vocals.handle({type:'kill',enemy:f.e},f.match);assert.equal(f.lines.length,1,'A stale previous-round actor cried out');
});
check('the actual audio path limits simultaneous reflexes and prioritizes terminal reactions',()=>{
  const f=audioFixture();assert.ok(f.audio.vocalReaction(f.line(0,5)));assert.ok(f.audio.vocalReaction(f.line(1,15)));assert.equal(f.audio.vocalReaction(f.line(2,25)),false);assert.equal(f.audio.reactionSources.size,2);
  assert.ok(f.audio.vocalReaction(f.line(2,25,3)));assert.ok(f.nodes[1].stopped);assert.ok(!f.audio.reactionSources.has(1));assert.equal(f.audio.reactionSources.size,2);
  assert.equal(f.nodes[0].playbackRate.value,1);assert.equal(f.panners[0].refDistance,9);f.audio.enabled=false;assert.equal(f.audio.reactionSources.size,0);assert.equal(f.audio.vocalReaction(f.line(3)),false);
});
check('one actor cannot talk over its own new reflex and expired nodes cannot remove a replacement',()=>{
  const f=audioFixture();f.audio.vocalReaction(f.line(0));const first=f.nodes[0];f.audio.vocalReaction(f.line(0,4,2));assert.ok(first.stopped);assert.equal(f.audio.reactionSources.size,1);first.onended();assert.equal(f.audio.reactionSources.size,1);f.nodes[1].onended();assert.equal(f.audio.reactionSources.size,0);
});
check('terminal tails survive the results transition but pause/mute stop them and new voices cannot start there',()=>{
  const f=audioFixture();f.audio.vocalReaction(f.line(0,5,3));f.audio.vocalReaction(f.line(1,6,1));f.audio.setActive(false,{allowVocalTail:true});assert.equal(f.audio.reactionSources.size,1);assert.ok(f.nodes[1].stopped);assert.equal(f.audio.vocalReaction(f.line(2,5,3)),false);f.audio.setActive(false);assert.ok(f.nodes[0].stopped);assert.equal(f.audio.reactionSources.size,0);
});
check('the shipped event handler routes a real hit directly into the human reaction controller',()=>{
  const source=fs.readFileSync(new URL('../dist/game.js',import.meta.url),'utf8'),start=source.indexOf('function handleEvent(e){'),end=source.indexOf('\nfunction updateHUD()',start),f=fixture();
  const context=vm.createContext({vocalReactions:f.vocals,match:f.match,state:'playing',config:{sound:true},event:{type:'hit',enemy:f.e},renderer:null});vm.runInContext(source.slice(start,end),context);f.e.hp=90;vm.runInContext('handleEvent(event)',context);assert.equal(f.lines.length,1);assert.equal(f.lines[0].kind,'light');
});
console.log(`${passed} human vocal reaction checks passed. Perceptual realism and real iPhone listening are not measured by these checks.`);
