import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {localAssets} from './local-assets.mjs';
import {createEnemyModel} from '../dist/weapons.js';
import {Match,createWorldData,heightAt} from '../dist/core.js';

const {assets,surfaces}=await localAssets();let passed=0;
const check=(label,fn)=>{fn();passed++;console.log('PASS '+label);};
function exercise({speed=1.25,dt=1/60,seconds=3,ground=()=>0,yaw=0,id=1}={}){
  const actor=createEnemyModel(id,assets,surfaces),e={walk:0,sees:true,lookYaw:.3,aimPitch:0,turnRate:0};actor.rotation.y=yaw;const stats={maxSlide:0,maxHeightError:0,contacts:0},previous=new Map();
  for(let time=0;time<seconds-1e-8;time+=dt){
    actor.position.x+=Math.sin(yaw)*speed*dt;actor.position.z+=Math.cos(yaw)*speed*dt;actor.position.y=ground(actor.position.x,actor.position.z);e.walk+=speed*dt*2.8;actor.userData.animate(dt,e,{groundAt:ground});actor.updateMatrixWorld(true);
    for(const f of actor.userData.motion.feet){
      const p=f.foot.getWorldPosition(new THREE.Vector3()),old=previous.get(f.side);assert.ok(Number.isFinite(p.x+p.y+p.z));
      if(f.contact>.98){stats.contacts++;stats.maxHeightError=Math.max(stats.maxHeightError,Math.abs(p.y-ground(p.x,p.z)-f.sole));if(old?.contact>.98&&old.plant===f.plant)stats.maxSlide=Math.max(stats.maxSlide,Math.hypot(p.x-old.point.x,p.z-old.point.z));}
      previous.set(f.side,{point:p,contact:f.contact,plant:f.plant});
    }
  }return {actor,e,stats};
}
check('authored walking and running clips share a distance-driven cycle and planted feet stay still on flat ground',()=>{
  for(const speed of [1.25,2.8]){const {actor,stats}=exercise({speed});assert.ok(stats.contacts>50);assert.ok(stats.maxSlide<.025,JSON.stringify(stats));assert.ok(stats.maxHeightError<.025,JSON.stringify(stats));const actions=actor.userData.mixer._actions;assert.ok(Math.abs(actions.reduce((n,a)=>n+a.getEffectiveWeight(),0)-1)<1e-8);}
});
check('both boots follow an uneven slope instead of floating at the centre terrain height',()=>{
  const ground=(x,z)=>x*.2+z*.15+Math.sin(z*1.1)*.025;const {stats}=exercise({ground,yaw:.7});assert.ok(stats.contacts>70);assert.ok(stats.maxHeightError<.035,JSON.stringify(stats));assert.ok(stats.maxSlide<.035,JSON.stringify(stats));
});
check('an idle actor has planted boots and stopping does not keep cycling the legs',()=>{
  const {actor,e,stats}=exercise({speed:0});assert.ok(stats.maxSlide<.001);assert.ok(stats.maxHeightError<.01);
  const walked=exercise({seconds:1}),phase=walked.actor.userData.motion.phase;for(let i=0;i<120;i++)walked.actor.userData.animate(1/60,walked.e,{groundAt:()=>0});assert.equal(walked.actor.userData.motion.phase,phase);assert.ok(walked.actor.userData.motion.speed<1e-7);assert.ok(walked.actor.userData.mixer._actions.find(a=>a.getClip().name==='Idle').getEffectiveWeight()>.999);
});
check('stride distance is stable across 30 and 120 fps and an actor reset does not produce a phantom step',()=>{
  const a=exercise({dt:1/30}),b=exercise({dt:1/120});assert.ok(Math.abs(a.actor.userData.motion.phase-b.actor.userData.motion.phase)<.01);a.actor.userData.reset();a.actor.userData.animate(0,{walk:0});assert.equal(a.actor.userData.motion.speed,0);assert.equal(a.actor.userData.rig.position.y,.95);assert.ok(a.actor.userData.motion.feet.every(f=>f.plant===null));
});
check('actual vehicle contact drives an articulated fall, grounded recovery and a clean rig reset',()=>{
  const m=new Match({...createWorldData(),colliders:[]});m.reset('training');m.running=true;const e=m.enemies[0],car=m.fleet.cars[0];m.enemies=[e];Object.assign(e,{x:car.x,z:car.z-1.8,y:heightAt(car.x,car.z-1.8)});car.speed=9;m.vehicleContacts(car,{x:car.x,z:car.z+.3});assert.ok(e.blast&&e.alive);const actor=createEnemyModel(2,assets,surfaces);let down=false;
  for(let i=0;i<220;i++){m.updateAftermath(1/60);actor.position.set(e.x,e.y,e.z);if(e.blast){actor.userData.stagger(1/60,e.blast,(x,z)=>heightAt(x,z),m.colliders);down||=e.blast.grounded&&actor.userData.rig.quaternion.angleTo(new THREE.Quaternion())>.6;}else actor.userData.animate(1/60,{walk:0,sees:true},{groundAt:heightAt});}
  assert.ok(down);assert.equal(e.blast,undefined);assert.equal(actor.userData.impactMotion.active,false);assert.equal(actor.userData.gun.parent,actor.userData.rig);actor.userData.reset();assert.deepEqual(actor.userData.rig.position.toArray(),[0,.95,0]);assert.ok(actor.userData.motion.feet.every(f=>!f.plant));
});
check('enemy acceleration and turns are bounded and walking into cover cannot keep reporting foot travel',()=>{
  const data=createWorldData(),m=new Match(data);m.reset('training');m.running=true;const enemy=m.enemies[0];enemy.shoot=Infinity;
  for(let i=0;i<120;i++){const speed=enemy.moveSpeed||0,yaw=enemy.yaw;m.update(1/60,{});assert.ok(enemy.moveSpeed<=1.25+1e-6);assert.ok(enemy.moveSpeed-speed<.044);assert.ok(Math.abs(enemy.yaw-yaw)<=2.1/60+1e-9);}
  const old={x:enemy.x,z:enemy.z};data.colliders.push({type:'box',x:enemy.x,z:enemy.z,y:0,w:4,d:4,h:100});m.update(1/60,{});assert.equal(enemy.moveSpeed,0);assert.equal(enemy.x,old.x);assert.equal(enemy.z,old.z);
  const turn=new Match(createWorldData());turn.reset('training');turn.running=true;const pivot=turn.enemies[0];pivot.homeX=pivot.x;pivot.homeZ=pivot.z-9;pivot.phase=0;pivot.yaw=0;for(let i=0;i<20;i++){turn.update(1/60,{});assert.ok(pivot.moveSpeed<.055,'Turn toward a goal behind the actor before walking forward');}
});
check('stationary turns take alternating steps rather than rotating with both feet stuck',()=>{
  const actor=createEnemyModel(3,assets,surfaces),e={walk:0,turnRate:1.1,sees:true},phase=actor.userData.motion.phase;let releases=0;for(let i=0;i<180;i++){actor.rotation.y+=1.1/60;actor.userData.animate(1/60,e,{groundAt:()=>0});for(const f of actor.userData.motion.feet){if(f.contact<.2)releases++;const p=f.foot.getWorldPosition(new THREE.Vector3());assert.ok(Number.isFinite(p.x+p.y+p.z)&&p.y>-.01&&p.y<.5);}}assert.ok(releases>20);assert.notEqual(actor.userData.motion.phase,phase);assert.equal(actor.position.length(),0);assert.ok(Math.abs(actor.userData.rig.rotation.z)<.001);
});
check('head aim follows world yaw instead of rolling around the authored local bone axis',()=>{
  const a=createEnemyModel(2,assets,surfaces),b=createEnemyModel(2,assets,surfaces);for(let i=0;i<90;i++){a.userData.animate(1/60,{walk:0,sees:true,lookYaw:0},{groundAt:()=>0});b.userData.animate(1/60,{walk:0,sees:true,lookYaw:.65},{groundAt:()=>0});}const q=a.userData.body.getObjectByName('Bip01_Head').getWorldQuaternion(new THREE.Quaternion()),delta=b.userData.body.getObjectByName('Bip01_Head').getWorldQuaternion(new THREE.Quaternion()).multiply(q.invert());assert.ok(delta.angleTo(new THREE.Quaternion())>.55);assert.ok(Math.abs(delta.y)>Math.hypot(delta.x,delta.z)*5);
});
check('reload reaches the magazine while the trigger hand holds the rifle, then restores the original grip',()=>{
  const actor=createEnemyModel(0,assets,surfaces),e={walk:0,sees:true,reloadRemaining:0,reloadDuration:2.6},body=actor.userData.body,gun=actor.userData.gun,hand=body.getObjectByName('Bip01_L_Hand'),right=body.getObjectByName('Bip01_R_Hand'),mag=gun.getObjectByName('MagazinePivot')||gun.getObjectByName('Magazine');for(let i=0;i<90;i++)actor.userData.animate(1/60,e,{groundAt:()=>0});const support=gun.worldToLocal(hand.getWorldPosition(new THREE.Vector3())),base=mag.position.clone();e.reloadRemaining=1.2;for(let i=0;i<60;i++)actor.userData.animate(1/60,e,{groundAt:()=>0});assert.ok(gun.worldToLocal(hand.getWorldPosition(new THREE.Vector3())).distanceTo(support)>.12);assert.ok(right.getWorldPosition(new THREE.Vector3()).distanceTo(gun.getObjectByName('TRIGGER').getWorldPosition(new THREE.Vector3()))<.15);assert.ok(mag.position.y<base.y-.06);e.reloadRemaining=0;for(let i=0;i<90;i++)actor.userData.animate(1/60,e,{groundAt:()=>0});assert.ok(gun.worldToLocal(hand.getWorldPosition(new THREE.Vector3())).distanceTo(support)<.02);assert.ok(mag.position.distanceTo(base)<1e-7);
});
check('AI turns and settles before firing and stops firing throughout a magazine reload',()=>{
  const events=[],m=new Match({...createWorldData(),colliders:[]},e=>events.push(e));m.running=true;m.time=8;const e=m.enemies[0];m.enemies=[e];Object.assign(e,{x:m.player.x,z:m.player.z-20,y:m.player.ground,yaw:Math.PI,sees:true,losTimer:5,shoot:0,rounds:1});m.enemyAI.confirm(e,m.player,m.time);for(let i=0;i<10;i++)m.update(1/60,{});assert.equal(events.filter(e=>e.type==='enemyfire').length,0);for(let i=0;i<240&&e.rounds>0;i++)m.update(1/60,{});assert.equal(e.rounds,0);assert.ok(e.reloadRemaining>0);const count=events.filter(e=>e.type==='enemyfire').length;for(let i=0;i<120;i++)m.update(1/60,{});assert.equal(events.filter(e=>e.type==='enemyfire').length,count);for(let i=0;i<60;i++)m.update(1/60,{});assert.ok(e.rounds>0);m.damageEnemy(e,5);assert.equal(e.hitReact,1);for(let i=0;i<30;i++)m.update(1/60,{});assert.equal(e.hitReact,0);
});
console.log(`${passed} authored character-motion checks passed. Not a browser/device render.`);
