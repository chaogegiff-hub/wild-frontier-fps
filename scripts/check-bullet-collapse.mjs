import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {localAssets} from './local-assets.mjs';import {createEnemyModel} from '../dist/weapons.js';import {Match,createWorldData,ENEMY_BODY} from '../dist/core.js';import {bulletHit,hitFlinch} from '../dist/bullet-hit.js';
const {assets,surfaces}=await localAssets(),world=createWorldData(),P=()=>new THREE.Vector3();let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function fixture({id=0,direction={x:0,y:0,z:-1},headshot=false,speed=0,ground=()=>0,colliders=[],dt=1/60}={}){
 const m=new Match({...world,colliders:[],enemies:[{...world.enemies[id],x:0,y:ground(0,0),z:0,yaw:0}]});m.reset('training');m.running=true;const e=m.enemies[0],actor=createEnemyModel(id,assets,surfaces);Object.assign(e,{walk:0,vx:speed,vz:0});
 for(let i=0;i<60;i++){e.x+=speed/60;e.y=ground(e.x,e.z);e.walk+=speed/60*2.8;actor.position.set(e.x,e.y,e.z);actor.userData.animate(1/60,{...e,sees:true,weaponReady:1},{groundAt:ground});}
 const start=new Map();actor.userData.body.traverse(b=>{if(b.isBone)start.set(b.name,b.getWorldPosition(P()));});m.damageEnemy(e,200,headshot,'bullet',{point:{x:e.x+(id%2?.12:0),y:e.y+(headshot?ENEMY_BODY.head:1.35),z:e.z},direction});
 return {m,e,actor,start,ground,colliders,dt,advance(seconds){for(let t=0;t<seconds-1e-9;t+=dt)actor.userData.fall(dt,ground,e.blast,colliders,e.deathImpact);},get r(){return actor.userData.impactMotion;}};
}
function skinFloor(f){let minimum=Infinity;f.actor.userData.body.traverse(o=>{if(!o.isSkinnedMesh)return;o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i+=4){const p=o.getVertexPosition(i,P()).applyMatrix4(o.matrixWorld);minimum=Math.min(minimum,p.y-f.ground(p.x,p.z));}});return minimum;}
check('actual bullet intersections retain immutable contact and flight direction, including the fatal head hit',()=>{
 const events=[],m=new Match({...world,colliders:[],enemies:[{...world.enemies[0],x:0,y:100,z:0}]},e=>events.push(e));m.running=true;m.weapon=2;const origin={x:0,y:101.4,z:15};m.shoot({x:0,y:0,z:-1},origin);m.updateBullets(.03);const e=m.enemies[0],hit=e.hitImpact;assert.equal(e.hp,66);assert.ok(hit.point.z>0&&hit.point.z<1);assert.ok(hit.direction.z<-.999);assert.equal(hit.part,'chest');assert.equal(e.deathImpact,undefined);const before=JSON.stringify(hit);origin.x=30;m.player.x=40;assert.equal(JSON.stringify(hit),before);assert.equal(events.filter(e=>e.type==='hit').length,1);
 m.damageEnemy(e,100,true,'bullet',{point:{x:0,y:101.96,z:.1},direction:{x:1,y:0,z:0}});assert.equal(e.deathImpact,e.hitImpact);assert.equal(e.deathImpact.part,'head');const fatal=e.deathImpact;m.damageEnemy(e,40);assert.equal(e.deathImpact,fatal);
});
check('nonfatal recoil grows from zero then relaxes, with directional and head/body differences',()=>{
 const e={x:0,y:0,z:0,yaw:0},front=bulletHit(e,{direction:{x:0,y:0,z:-1}}),side=bulletHit(e,{direction:{x:1,y:0,z:0}}),head=bulletHit(e,{headshot:true});assert.ok(Math.abs(hitFlinch(front,1).pitch)===0);assert.ok(hitFlinch(front,.8).pitch<-.03);assert.ok(hitFlinch(side,.8).roll<-.02);assert.ok(hitFlinch(head,.8).head>hitFlinch(front,.8).head*3);assert.equal(hitFlinch(front,0),null);
});
check('death inherits the real aiming pose without a first-frame teleport or return to idle',()=>{
 const f=fixture({dt:1/120});f.advance(1/120);let largest=0;f.actor.userData.body.traverse(b=>{if(b.isBone)largest=Math.max(largest,b.getWorldPosition(P()).distanceTo(f.start.get(b.name)));});assert.ok(largest<.09,`First-frame movement ${largest}`);assert.ok(f.r.active);assert.equal(f.r.source,f.e.deathImpact);assert.equal(f.actor.userData.gun.parent,f.actor);assert.ok(f.r.nodes.size>=20);
});
check('support fails at the hips and knees while all limb bones preserve their lengths',()=>{
 const f=fixture();f.advance(.7);const a=f.r.nodes;assert.ok(a.get('pelvis').p.y<f.start.get('Bip01_Pelvis').y-.3,`Hip height ${a.get('pelvis').p.y}`);for(const l of f.r.limbs){assert.ok(Math.abs(l.a.bone.getWorldPosition(P()).distanceTo(l.b.bone.getWorldPosition(P()))-l.l1)<.001);assert.ok(Math.abs(l.b.bone.getWorldPosition(P()).distanceTo(l.c.bone.getWorldPosition(P()))-l.l2)<.001);}assert.ok(a.get('Lknee').p.distanceTo(a.get('Rknee').p)<.65);
});
check('opposing and lateral shots lead to distinct directions of lost balance',()=>{
 const front=fixture(),rear=fixture({direction:{x:0,y:0,z:1}}),side=fixture({direction:{x:1,y:0,z:0}});for(const f of [front,rear,side])f.advance(.3);assert.ok(rear.r.nodes.get('head').p.z-front.r.nodes.get('head').p.z>.09);assert.ok(side.r.nodes.get('head').p.x-front.r.nodes.get('head').p.x>.04);
});
check('running momentum continues but a bullet never launches the whole body into the air',()=>{
 const idle=fixture(),run=fixture({speed:2.8});for(const f of [idle,run]){f.advance(1);assert.ok(f.r.nodes.get('head').p.y<f.start.get('Bip01_Head').y+.1);}const shift=run.r.center().x-run.e.x;assert.ok(shift>idle.r.center().x-idle.e.x+.2);assert.ok(Math.abs(shift)<2.3);
});
check('settled bodies sleep near their original centre rather than regaining energy and crawling',()=>{
 for(const direction of [{x:0,y:0,z:-1},{x:0,y:0,z:1},{x:1,y:0,z:0}]){const f=fixture({direction});f.advance(4);assert.ok(Math.hypot(f.r.center().x-f.e.x,f.r.center().z-f.e.z)<1);assert.ok(f.r.nodes.get('head').p.y<.8);assert.equal(f.r.sleeping,true);const p=f.r.nodes.get('pelvis').p.clone();f.advance(1);assert.ok(f.r.nodes.get('pelvis').p.distanceTo(p)<.001);}
});
check('separate contacts support the actual skinned model on flat ground and a slope',()=>{
 for(const ground of [()=>0,(x,z)=>.13*x-.08*z]){const f=fixture({ground});f.advance(3.5);for(const n of f.r.nodes.values())assert.ok(n.p.y>=ground(n.p.x,n.p.z)+n.radius-.002);const min=skinFloor(f);assert.ok(min>-.075,`Skin penetrates terrain by ${min}`);}
});
check('solid walls stop both the falling body and the independently dropped rifle',()=>{
 const wall={type:'box',x:0,y:-1,z:-.8,w:8,d:.25,h:5},f=fixture({colliders:[wall]});f.advance(3.5);for(const n of f.r.nodes.values())assert.ok(n.p.z>=wall.z+wall.d/2+n.radius-.025,`Body crossed wall: ${n.bone?.name}`);assert.ok(new THREE.Box3().setFromObject(f.actor.userData.gun).min.z>=wall.z+wall.d/2-.025);
});
check('the rifle preserves its release pose and rotates continuously onto its real side geometry',()=>{
 const f=fixture(),gun=f.actor.userData.gun,before=gun.getWorldPosition(P());f.advance(1/60);assert.ok(gun.getWorldPosition(P()).distanceTo(before)<.08);let q=gun.getWorldQuaternion(new THREE.Quaternion());for(let i=0;i<120;i++){f.advance(1/60);const next=gun.getWorldQuaternion(new THREE.Quaternion());assert.ok(q.angleTo(next)<.3,'Rifle snapped flat');q=next;}const box=new THREE.Box3().setFromObject(gun);assert.ok(box.min.y>=.005&&box.min.y<.04);assert.ok(box.getSize(P()).y<.15);
});
check('fixed steps agree at 30 and 120 fps and pause freezes both joints and weapon',()=>{
 const a=fixture({dt:1/30}),b=fixture({dt:1/120});a.advance(1.2);b.advance(1.2);for(const key of ['head','pelvis','Lfoot','Rhand'])assert.ok(a.r.nodes.get(key).p.distanceTo(b.r.nodes.get(key).p)<.04,key);const state=JSON.stringify({p:[...a.r.nodes.values()].map(n=>n.p.toArray()),gun:a.actor.userData.gun.matrixWorld.toArray()});a.actor.userData.fall(0,a.ground,undefined,[],a.e.deathImpact);assert.equal(JSON.stringify({p:[...a.r.nodes.values()].map(n=>n.p.toArray()),gun:a.actor.userData.gun.matrixWorld.toArray()}),state);
});
check('reset restores the original skeleton/rifle rig and clears hit and death memory',()=>{
 const f=fixture();f.advance(1);f.actor.userData.reset();assert.equal(f.r.active,false);assert.equal(f.actor.userData.gun.parent,f.actor.userData.rig);assert.deepEqual(f.actor.userData.rig.position.toArray(),[0,.95,0]);assert.equal(f.actor.userData.deathTime,0);f.m.reset('training');assert.equal(f.m.enemies[0].deathImpact,undefined);assert.equal(f.m.enemies[0].hitImpact,undefined);
});
console.log(`${passed} bullet contact, collapse, skin contact, dropped weapon and lifecycle checks passed. Native model checks, not iPhone footage.`);
