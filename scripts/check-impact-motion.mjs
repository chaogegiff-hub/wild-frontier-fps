import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {localAssets} from './local-assets.mjs';import {createEnemyModel} from '../dist/weapons.js';
import {Match,createWorldData,terrainSurfaceAt} from '../dist/core.js';
const {assets,surfaces}=await localAssets();let passed=0;const check=(label,fn)=>{fn();passed++;console.log('PASS '+label);},point=b=>b.getWorldPosition(new THREE.Vector3());
function fixture({kind='explosion',dt=1/60,distance=1,id=0}={}){
  const m=new Match({...createWorldData(),colliders:[]});m.reset('training');m.running=true;const e=m.enemies[id];m.enemies=[e];
  if(kind==='vehicle'){const car=m.fleet.cars[0];Object.assign(e,{x:car.x,z:car.z-1.8,y:terrainSurfaceAt(car.x,car.z-1.8)});car.speed=18;m.vehicleContacts(car,{x:car.x,z:car.z+.30});}
  const actor=createEnemyModel(id,assets,surfaces);actor.position.set(e.x,e.y,e.z);actor.rotation.y=e.yaw;actor.userData.animate(.1,{walk:0,sees:true});
  if(kind!=='vehicle')m.explode({x:e.x-distance,y:e.y+.7,z:e.z});assert.ok(e.blast);const initial=e.blast;let time=0;
  const advance=seconds=>{for(let i=0;i<Math.round(seconds/dt);i++){m.updateAftermath(dt);actor.position.set(e.x,e.y,e.z);if(!e.alive)actor.userData.fall(dt,terrainSurfaceAt,e.blast,m.colliders);else if(e.blast)actor.userData.stagger(dt,e.blast,terrainSurfaceAt,m.colliders);else actor.userData.animate(dt,{walk:0,sees:true},{groundAt:terrainSurfaceAt});time+=dt;}};
  return {m,e,actor,initial,advance,get time(){return time;}};
}
check('both real bumper contact and grenade damage drive independent hips, spine, head, knees and elbows',()=>{
  for(const kind of ['vehicle','explosion']){const f=fixture({kind});f.advance(.3);const r=f.actor.userData.impactMotion;assert.ok(r.active&&r.nodes.size>=20);assert.equal(f.actor.userData.gun.parent,f.actor);const head=r.nodes.get('head'),hip=r.nodes.get('pelvis');assert.ok(head.v.distanceTo(hip.v)>.3);for(const l of r.limbs){assert.ok(Math.abs(point(l.a.bone).distanceTo(point(l.b.bone))-l.l1)<.001);assert.ok(Math.abs(point(l.b.bone).distanceTo(point(l.c.bone))-l.l2)<.001);}assert.ok(new THREE.Box3().setFromObject(f.actor.userData.body).getSize(new THREE.Vector3()).length()>1);}
});
check('launch direction follows the impact and flight is bounded rather than floating for several seconds',()=>{
  for(const distance of [-1,1]){const f=fixture({distance}),sign=Math.sign(f.initial.vx),start={...f.e};assert.equal(sign,Math.sign(distance));let height=0;for(let i=0;i<90;i++){f.advance(1/60);height=Math.max(height,f.e.y-start.y);}assert.ok(f.e.blast.grounded);assert.ok(f.e.x*sign>start.x*sign);assert.ok(height>.5&&height<1.8);assert.ok(Math.hypot(f.initial.spinX,f.initial.spinZ)<4);}
});
check('the articulated body lands on terrain, keeps real bone lengths, and the rifle rests on its side',()=>{
  for(const kind of ['vehicle','explosion']){const f=fixture({kind});f.advance(4);const r=f.actor.userData.impactMotion;for(const key of ['Lfoot','Rfoot','Ltoe','Rtoe']){const p=point(r.nodes.get(key).bone);assert.ok(p.y>=terrainSurfaceAt(p.x,p.z)-.055,kind+' '+key+' is below terrain');}const size=new THREE.Box3().setFromObject(f.actor.userData.gun).getSize(new THREE.Vector3());assert.ok(size.y<.2);assert.ok(r.nodes.get('head').p.y<terrainSurfaceAt(f.e.x,f.e.z)+1.1);for(const n of r.nodes.values())assert.ok(n.p.toArray().every(Number.isFinite));}
});
check('fixed physics steps agree at 30 and 120 fps, pause freezes the whole body, and reset restores the rifle rig',()=>{
  const a=fixture({dt:1/30}),b=fixture({dt:1/120});a.advance(.7);b.advance(.7);for(const key of ['head','pelvis','Lhand','Rfoot'])assert.ok(a.actor.userData.impactMotion.nodes.get(key).p.distanceTo(b.actor.userData.impactMotion.nodes.get(key).p)<.23,key+' disagrees between frame rates');const before=a.actor.userData.impactMotion.nodes.get('head').p.clone();a.actor.userData.fall(0,terrainSurfaceAt,a.e.blast);assert.ok(before.distanceTo(a.actor.userData.impactMotion.nodes.get('head').p)<1e-9);a.actor.userData.reset();assert.equal(a.actor.userData.impactMotion.active,false);assert.equal(a.actor.userData.gun.parent,a.actor.userData.rig);assert.deepEqual(a.actor.userData.rig.position.toArray(),[0,.95,0]);
});
check('a surviving blast waits on the ground, rises, and resumes authored motion with both hands on the weapon',()=>{
  const f=fixture({distance:9});assert.ok(f.e.alive);f.advance(3.5);assert.equal(f.e.blast,undefined);assert.equal(f.actor.userData.impactMotion.active,false);assert.equal(f.actor.userData.gun.parent,f.actor.userData.rig);const hand=point(f.actor.userData.body.getObjectByName('Bip01_R_Hand')),trigger=f.actor.userData.gun.localToWorld(f.actor.userData.gun.getObjectByName('TRIGGER').position.clone().add(new THREE.Vector3(-.027,-.063,-.075)));assert.ok(hand.distanceTo(trigger)<.04);
});
console.log(`${passed} actual whole-body impact, trajectory, contact and recovery checks passed. Not a browser/device render.`);
