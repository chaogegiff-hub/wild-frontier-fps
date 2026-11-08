import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import {cactusGeometries,makeCactusField} from '../dist/cactus-field.js';
import {CactusImpacts} from '../dist/cactus-impact.js';
import {makeWildGrass} from '../dist/wild-grass.js';
import {createWorldData,terrainSurfaceAt,SPAWN,roadX,onTrail} from '../dist/core.js';
import {GrassCompression} from '../dist/vehicle-trails.js';
import {EnemyChatter,ENEMY_LINES,ENEMY_VOICE_PROFILES,enemyVoiceKey} from '../dist/enemy-chatter.js';
import {GameAudio} from '../dist/audio.js';

let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const bases=cactusGeometries();
function fixture({variant=2,x=0,z=0,slope=.0,dx=0,dz=-1}={}){
  const g=bases[variant].clone();g.setAttribute('aFall',new THREE.InstancedBufferAttribute(new Float32Array(4),4));
  const mesh=new THREE.Mesh(g),sample=(x,z,out)=>{out.height=20+slope*z;},plant={x,z,y:20+slope*z,sx:1,sy:1,sz:1,yaw:.4,height:g.boundingBox.max.y,radius:.35,mesh,index:0};
  const events=[],fx=new CactusImpacts([plant],{sample,onImpact:e=>events.push(e)}),car={id:0,x:x-dx*3,z:z-dz*3,y:plant.y,speed:12,yaw:Math.atan2(-dx,-dz)},fleet={cars:[car]};fx.reset(fleet);
  return {fx,plant,car,fleet,events,sample,dx,dz};
}
function tick(f,n=120){for(let i=0;i<n;i++)f.fx.update(1/60,f.fleet);}
check('all three cactus forms topple once, settle above the ground and persist until a new round',()=>{
  for(let variant=0;variant<3;variant++){
    const f=fixture({variant});f.car.z=-2;f.fx.update(1/60,f.fleet);assert.equal(f.fx.fallen.size,1);assert.equal(f.events.length,1);f.car.speed=0;
    for(let frame=0;frame<120;frame++){
      f.fx.update(1/60,f.fleet);const p=f.plant,q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(p.axis.x,0,p.axis.z),p.angle);
      for(const v of p.probes){const w=new THREE.Vector3(v.x,v.y,v.z).applyQuaternion(q);assert.ok(w.y+p.y+p.lift>=20-.00001,'Plant penetrates ground during fall');}
    }
    assert.equal(f.fx.animating.size,0);assert.equal(f.events.length,2);assert.ok(f.events[1].landing);assert.ok(f.plant.angle>1.4);const final=[...f.plant.mesh.geometry.attributes.aFall.array];tick(f);assert.deepEqual([...f.plant.mesh.geometry.attributes.aFall.array],final);
    f.car.z=3;f.car.speed=-5;f.fx.update(1/60,f.fleet);assert.equal(f.events.length,2,'Same cactus breaks twice');f.fx.reset(f.fleet);assert.equal(f.fx.fallen.size,0);assert.equal(f.plant.angle,0);assert.equal(f.plant.probes,null);
  }
});
check('continuous vehicle contact handles fast travel, reverse and negative grid boundaries, while misses and teleports do not hit',()=>{
  for(const [dx,dz,x,z] of [[0,-1,0,0],[0,1,0,0],[1,0,-8.01,-8.02],[-1,0,-8.01,-8.02]]){
    const f=fixture({dx,dz,x,z});f.car.x=x+dx*3;f.car.z=z+dz*3;f.car.speed=dz===1?-12:12;f.fx.update(.06,f.fleet);assert.equal(f.fx.fallen.size,1);
  }
  const miss=fixture();miss.car.x=4;miss.car.z=3;miss.fx.reset(miss.fleet);miss.car.z=-3;miss.fx.update(.06,miss.fleet);assert.equal(miss.fx.fallen.size,0);
  const teleport=fixture();teleport.car.z=-20;teleport.fx.update(.06,teleport.fleet);assert.equal(teleport.fx.fallen.size,0);
  const parked=fixture();parked.car.z=0;parked.car.speed=0;parked.fx.update(.06,parked.fleet);assert.equal(parked.fx.fallen.size,0);
});
check('cactus fall follows the impact direction, rests along slopes and freezes while paused',()=>{
  for(const slope of [-.4,.4]){const f=fixture({slope});f.car.z=-2;f.fx.update(.06,f.fleet);f.car.speed=0;const before=f.plant.angle;f.fx.update(1,f.fleet,{active:false});assert.equal(f.plant.angle,before);tick(f);const p=f.plant,tip=new THREE.Vector3(0,1,0).applyAxisAngle(new THREE.Vector3(p.axis.x,0,p.axis.z),p.angle);assert.ok(tip.z<-.8);assert.ok(Math.abs(tip.y/tip.z-slope)<.04);for(const v of p.probes){const w=new THREE.Vector3(v.x,v.y,v.z).applyAxisAngle(new THREE.Vector3(p.axis.x,0,p.axis.z),p.angle),ground=20+slope*(p.z+w.z);assert.ok(p.y+p.lift+w.y>=ground-.00001);}}
});
const data=createWorldData(),field=makeCactusField(data,{value:0}),grass=makeWildGrass(data,{value:0});
check('sparse grass is grounded, deterministic and outside water, roads and houses across the island',()=>{
  assert.ok(grass.userData.coverage.count>33000&&grass.userData.coverage.count<41000);const second=makeWildGrass(data,{value:0}),a=grass.userData.meshes,b=second.userData.meshes;assert.equal(a.length,b.length);let near=0,maxHeight=0;
  for(let m=0;m<a.length;m++){assert.deepEqual(a[m].geometry.attributes.aOffset.array,b[m].geometry.attributes.aOffset.array);const p=a[m].geometry.attributes.aOffset;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),y=p.getY(i);assert.ok(Math.abs(y-terrainSurfaceAt(x,z)-.003)<.00002);assert.ok(y>3.85&&y<86.01);assert.ok(Math.abs(x-roadX(z))>3.89);assert.equal(onTrail(x,z,.44),false);assert.ok(!data.buildings.some(h=>Math.abs(x-h.x)<h.w*.565&&Math.abs(z-h.z)<h.d*.565));if(Math.hypot(x-SPAWN.x,z-SPAWN.z)<20)near++;}}
  for(const m of a){const g=m.geometry,scale=g.attributes.aScale,h=g.attributes.position.array.reduce((v,y,index)=>index%3===1?Math.max(v,y):v,0);for(let i=0;i<g.instanceCount;i++){assert.ok(scale.getY(i)>=1.09&&scale.getX(i)>scale.getY(i));maxHeight=Math.max(maxHeight,h*scale.getY(i));assert.ok(g.boundingBox.max.y>=g.attributes.aOffset.getY(i)+h*scale.getY(i));}}
  assert.ok(near>100&&near<360);assert.ok(maxHeight>.85&&maxHeight<1.2);assert.equal(field.userData.coverage.count,14898);
});
check('vehicle tires compress the new grass while cactus roots and original instance buffers stay fixed',()=>{
  const mesh=grass.userData.meshes[0],a=mesh.geometry.attributes.aOffset,roots=[...a.array],x=a.getX(0),z=a.getZ(0),compression=new GrassCompression(grass.userData.meshes);compression.press({x:x-.5,z},{x:x+.5,z});compression.flush();assert.ok(mesh.geometry.attributes.aPress.getX(0)>.5);assert.deepEqual([...a.array],roots);compression.reset();assert.equal(mesh.geometry.attributes.aPress.getX(0),0);assert.equal(field.userData.compressible,false);
});
check('all dialogue variants have distinct local MP3 assets and three fixed character voices',()=>{
  const root=new URL('../dist/audio/enemy/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root))),hashes=new Set();let bytes=0;
  assert.equal(manifest.profiles.length,3);
  for(const profile of ENEMY_VOICE_PROFILES)for(const [kind,lines] of Object.entries(ENEMY_LINES))for(const [i,text] of lines.entries()){
    const c=manifest.clips[enemyVoiceKey(profile.id,kind,i)];assert.equal(c.text,text);assert.ok(c.duration>.4&&c.duration<7.6);assert.ok(c.file.startsWith('combat-'));assert.ok(c.instruction.length>20);const b=fs.readFileSync(new URL(c.file,root));assert.ok(b.length>2000);assert.ok(b.subarray(0,3).toString()==='ID3'||b[0]===255);const hash=createHash('sha256').update(b).digest('hex');assert.equal(hash,c.sha256);hashes.add(hash);bytes+=b.length;
  }assert.equal(hashes.size,30);assert.ok(bytes<1500000);assert.equal(manifest.generatedLocally,true);assert.match(manifest.generator.model,/1\.7B-CustomVoice/);
});
function chatterFixture(){
  const e={id:0,x:0,y:200,z:-20,alive:true,sees:false,reloadRemaining:0},match={time:8,enemies:[e],grenades:[],player:{x:0,y:201.7,z:0},colliders:[],vehicle:null,over:false},lines=[],stops=[];
  const chatter=new EnemyChatter({speak:line=>{lines.push(line);return 2;},stop:()=>stops.push(true),random:()=>0});return {e,match,lines,stops,chatter};
}
check('enemy speech follows true detection, has no overlap and never repeats every frame',()=>{
  const f=chatterFixture();f.chatter.update(.016,f.match);assert.equal(f.lines.length,0);f.e.sees=true;f.chatter.update(.016,f.match);assert.equal(f.lines[0].kind,'spot');assert.equal(f.lines[0].text,'发现他了！');
  f.match.enemies.push({...f.e,id:1,x:2});for(let i=0;i<120;i++){f.match.time+=1/60;f.chatter.update(1/60,f.match);}assert.equal(f.lines.length,1);f.match.time+=2;f.chatter.update(.016,f.match);assert.equal(f.lines.length,2);assert.equal(f.lines[1].profile,'veteran');assert.notEqual(f.lines[1].text,f.lines[0].text);
});
check('speech reacts to vehicles, nearby grenades, reloading and losing the target, and cancels on death, pause and mute',()=>{
  for(const kind of ['vehicle','grenade','reload','lost']){
    const f=chatterFixture();f.e.sees=true;if(kind==='vehicle')f.match.vehicle={};if(kind==='grenade')f.match.grenades=[{x:0,y:201,z:-22}];
    if(kind==='reload'||kind==='lost'){f.chatter.update(.016,f.match);f.match.time+=20;f.chatter.update(.016,f.match,{active:false});if(kind==='reload'){f.e.reloadRemaining=2;f.chatter.states.get(0).lastSeen=f.match.time;}else{f.e.sees=false;f.chatter.states.get(0).lastSeen=f.match.time-4;}}
    f.chatter.update(.016,f.match);assert.equal(f.lines.at(-1).kind,kind);
  }
  const f=chatterFixture();f.e.sees=true;f.chatter.update(.016,f.match);const count=f.stops.length;f.e.alive=false;f.chatter.update(.016,f.match);assert.ok(f.stops.length>count);assert.equal(f.chatter.current,null);f.e.alive=true;f.chatter.reset();f.chatter.update(.016,f.match);f.chatter.update(.016,f.match,{active:false});assert.equal(f.chatter.current,null);const total=f.lines.length;f.chatter.update(.016,f.match,{enabled:false});assert.equal(f.lines.length,total);
});
check('the actual audio path spatializes recorded speech and stops it immediately on pause and mute',()=>{
  const sources=[],param=()=>({value:0,setTargetAtTime(v){this.value=v;}}),node=()=>({connect(n){return n;},disconnect(){}}),audio=new GameAudio();audio.ctx={state:'running',currentTime:1,createBufferSource(){const s={...node(),playbackRate:param(),start(){this.started=true;},stop(){this.stopped=true;}};sources.push(s);return s;},createGain:()=>({...node(),gain:param()}),createBiquadFilter:()=>({...node(),frequency:param()}),createPanner:()=>({...node(),positionX:param(),positionY:param(),positionZ:param()})};audio.master={...node(),gain:param()};audio.active=true;audio.position={x:0,y:201.7,z:0};audio.buffers.example=[{duration:2}];
  assert.ok(audio.enemyVoice({key:'example',position:{x:5,y:201.7,z:0}})>2);assert.equal(audio.chatterSources.size,1);assert.ok(sources[0].started);audio.setActive(false);assert.ok(sources[0].stopped);assert.equal(audio.chatterSources.size,0);audio.active=true;audio.enemyVoice({key:'example',position:{x:0,y:200,z:2}});audio.enabled=false;assert.ok(sources[1].stopped);assert.equal(audio.enemyVoice({key:'example',position:{x:0,y:200,z:2}}),false);
});
console.log(`${passed} field interaction and character-voice checks passed. iPhone hardware not tested.`);
