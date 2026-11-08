import {checkResidentScene} from './check-resident-scene.mjs';
import {cactusGeometries} from '../dist/cactus-field.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import * as THREE from '../dist/vendor/three.module.js';
import {createWorldData,Match,WEAPONS,ENEMY_BODY,SPAWN,heightAt,slopeAt,terrainSurfaceAt,lineClear,direction,zoomFov,moveGround,clamp,shotFromMuzzle,colliderNormal} from '../dist/core.js';
import {makeWorld} from '../dist/world.js';
import {createViewModels,createEnemyModel,weaponViewFov,weaponViewPosition} from '../dist/weapons.js';
import {viewPointToWorld,WeaponRecoil,syncWeaponLighting} from '../dist/weapon-view.js';
import {buildCartridgeAssets,makeCasing,makeProjectile} from '../dist/ammunition.js';
import {BattleEffects} from '../dist/effects.js';
import {skyLighting} from '../dist/assets.js';
import {detailSurfaceLoader,DETAIL_SURFACES} from '../dist/terrain-material.js';
import {checkStartup} from './check-startup.mjs';
import {checkFrame} from './check-frame.mjs';
import {checkAim} from './check-aim.mjs';
import {checkCombat} from './check-combat.mjs';

let passed=0;
function check(name,fn){fn();passed++;console.log(`PASS ${name}`);}
checkStartup(check);
const world=createWorldData();
const unit=(a,b)=>{const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z,d=Math.hypot(x,y,z);return {x:x/d,y:y/d,z:z/d};};
const emptyInput={forward:0,strafe:0};
function tick(m,time){for(let i=0;i<Math.ceil(time*60);i++)m.update(1/60,emptyInput);}
check('reproducible terrain, forest and dry deployment',()=>{
  assert.deepEqual(createWorldData(),world);assert.ok(world.trees.length>150);assert.equal(world.buildings.length,14);assert.equal(world.enemies.length,12);
  assert.ok(heightAt(26,-22)<3);assert.ok(heightAt(SPAWN.x,SPAWN.z)>6);
  let max=0;for(let x=-300;x<=300;x+=20)for(let z=-300;z<=300;z+=20){const h=heightAt(x,z);assert.ok(Number.isFinite(h)&&h>=0);max=Math.max(max,h);}assert.ok(max>35&&max<70);
  const first=world.enemies[0];assert.ok(lineClear({...SPAWN,y:heightAt(SPAWN.x,SPAWN.z)+1.72},{x:first.x,y:first.y+1.66,z:first.z},world.colliders));
});
check('lake and river banks keep continuous walkable slopes',()=>{
  const slopes=[];for(let x=-260;x<=260;x+=5)for(let z=-260;z<=260;z+=5)slopes.push(slopeAt(x,z));slopes.sort((a,b)=>a-b);assert.ok(slopes[Math.floor(slopes.length*.99)]<1.2);
});
check('eightfold optical magnification and camera-ray alignment',()=>{
  const fov=zoomFov(75,8);assert.ok(Math.abs(Math.tan(75*Math.PI/360)/Math.tan(fov*Math.PI/360)-8)<1e-10);
  for(const [yaw,pitch] of [[0,0],[.9,.6],[-2,-.7]]){const c=new THREE.PerspectiveCamera();c.rotation.set(pitch,yaw,0,'YXZ');const v=new THREE.Vector3();c.getWorldDirection(v);const d=direction(yaw,pitch);assert.ok(v.distanceTo(new THREE.Vector3(d.x,d.y,d.z))<1e-10);}
});
check('weapon muzzle and casing markers share the world-camera screen position',()=>{
  for(const aspect of [.46,.6,16/9])for(const zoom of [1,2,8])for(const [yaw,pitch] of [[0,0],[1.2,-.6],[-2.1,.8]]){
    const c=new THREE.PerspectiveCamera(zoomFov(75,zoom),aspect,.08,1000),v=new THREE.PerspectiveCamera(weaponViewFov(aspect),aspect,.02,5);
    c.position.set(-64,40,146);c.rotation.set(pitch,yaw,0,'YXZ');c.updateMatrixWorld(true);v.updateMatrixWorld(true);
    for(const point of [new THREE.Vector3(.2,-.14,-1.1),new THREE.Vector3(.22,-.17,-.5)]){
      const expected=point.clone().project(v),actual=viewPointToWorld(point,v,c).project(c);
      assert.ok(Math.hypot(actual.x-expected.x,actual.y-expected.y)<1e-10);
    }
  }
});
check('physical muzzle starts at the barrel, converges on aim and cannot fire past near cover',()=>{
  const eye={x:0,y:200,z:0},muzzle={x:.24,y:199.8,z:-.9},dir={x:0,y:0,z:-1};
  const shot=shotFromMuzzle(eye,dir,muzzle,300,[]);assert.deepEqual(shot.origin,muzzle);
  const travel=(eye.z-300-muzzle.z)/shot.direction.z;assert.ok(Math.abs(muzzle.x+shot.direction.x*travel)<1e-10);assert.ok(Math.abs(muzzle.y+shot.direction.y*travel-eye.y)<1e-10);
  const box={type:'box',x:.12,z:-.45,y:199,w:.1,d:.04,h:2,surface:'plaster'},blocked=shotFromMuzzle(eye,dir,muzzle,300,[box]);
  assert.equal(blocked.blocked,true);assert.deepEqual(blocked.origin,eye);
  const events=[],data={...world,colliders:[box],enemies:[]},m=new Match(data,e=>events.push(e));m.running=true;m.shoot(blocked.direction,blocked.origin);m.updateBullets(.02);
  assert.equal(m.bullets.length,0);assert.ok(events.some(e=>e.type==='impact'&&e.point.z>-.5));
  const enemy={x:0,y:198.34,z:-.4,alive:true},close=shotFromMuzzle(eye,dir,muzzle,300,[],[enemy]);assert.deepEqual(close.origin,eye);
  assert.deepEqual(colliderNormal(box,{x:.17,y:200,z:-.45}),{x:1,y:0,z:0});
  assert.deepEqual(colliderNormal({type:'circle',x:2,z:3,y:0,h:8,r:2},{x:4,y:2,z:3}),{x:1,y:0,z:0});
});
check('recoil has bounded movement, frame-rate agreement and a settled rest pose',()=>{
  const slow=new WeaponRecoil(),fast=new WeaponRecoil();slow.kick(0,.5);fast.kick(0,.5);
  for(let i=0;i<6;i++)slow.update(1/30);for(let i=0;i<24;i++)fast.update(1/120);
  for(const k of ['pitch','yaw','slide','lift'])assert.ok(Math.abs(slow[k]-fast[k])<1e-10);
  const sustained=new WeaponRecoil();let maximum=0;
  for(let i=0;i<360;i++){if(i%6===0)sustained.kick(2,.5);sustained.update(1/60);maximum=Math.max(maximum,sustained.pitch,sustained.slide);}
  assert.ok(maximum>.01&&maximum<.08);for(let i=0;i<180;i++)sustained.update(1/60);
  for(const k of ['pitch','yaw','slide','lift'])assert.ok(Math.abs(sustained[k])<1e-7);
});
check('sniper body damage, bolt cooldown and exact headshot',()=>{
  const m=new Match(world);m.running=true;const e=m.enemies[0],origin={...m.player};
  assert.ok(m.shoot(unit(origin,{x:e.x,y:e.y+ENEMY_BODY.lock,z:e.z}),origin));assert.equal(e.hp,100);tick(m,.1);assert.equal(e.hp,12);assert.equal(m.ammo[0].mag,4);
  assert.equal(m.shoot(unit(origin,{x:e.x,y:e.y+ENEMY_BODY.head,z:e.z}),origin),false);assert.equal(m.ammo[0].mag,4);
  m.cooldown=0;assert.ok(m.shoot(unit(origin,{x:e.x,y:e.y+ENEMY_BODY.head,z:e.z}),origin));tick(m,.1);assert.equal(m.kills,1);assert.equal(m.headshots,1);assert.equal(m.hits,2);assert.equal(m.bulletShots,2);
});
check('solid cover stops bullets before an enemy',()=>{
  const data=createWorldData(),m=new Match(data);m.running=true;
  data.colliders.push({type:'box',x:-63,z:119,y:0,w:8,d:2,h:100});const e=m.enemies[0],origin={...m.player};
  m.shoot(unit(origin,{x:e.x,y:e.y+ENEMY_BODY.head,z:e.z}),origin);tick(m,.14);assert.equal(e.hp,100);assert.equal(m.hits,0);assert.equal(m.bullets.length,0);
});
check('bullets have finite flight speed, gravity, air drag and pause',()=>{
  const m=new Match(world);m.reset('training');m.running=true;const origin={x:SPAWN.x,y:200,z:SPAWN.z};
  m.shoot(direction(0,0),origin);assert.equal(m.bullets.length,1);const bullet=m.bullets[0];tick(m,.1);
  assert.ok(origin.z-bullet.z>80&&origin.z-bullet.z<83);assert.ok(origin.y-bullet.y>.04&&origin.y-bullet.y<.07);assert.ok(bullet.vz>-820);
  m.running=false;const before=JSON.stringify(m.bullets);m.update(.5,emptyInput);assert.equal(JSON.stringify(m.bullets),before);
});
check('reload accounting and weapon switch cancellation',()=>{
  const m=new Match(world);m.reset('training');m.running=true;m.ammo[0].mag=2;m.ammo[0].reserve=4;
  assert.ok(m.reload());tick(m,3);assert.equal(m.ammo[0].mag,5);assert.equal(m.ammo[0].reserve,1);
  m.ammo[0].mag=1;assert.ok(m.reload());m.switchWeapon(2);assert.equal(m.reloadTime,0);assert.equal(m.ammo[0].mag,1);assert.equal(m.weapon,2);
});
check('grenade trajectory has gravity and impacts terrain',()=>{
  const events=[],m=new Match(world,e=>events.push(e));m.reset('training');m.running=true;m.weapon=1;
  const o={...m.player},d=direction(0,.17);assert.ok(m.shoot(d,o));const vy=m.grenades[0].vy;
  tick(m,.15);assert.ok(m.grenades[0].vy<vy);assert.ok(m.grenades[0].z<o.z-5);
  tick(m,6);assert.equal(m.grenades.length,0);assert.ok(events.some(e=>e.type==='explosion'));
});
check('blast radius damages multiple enemies and respects cover',()=>{
  const d=createWorldData(),m=new Match(d);m.running=true;
  const first=m.enemies[0],x=first.x,z=first.z,y=first.y;
  m.enemies=[first,{...first,id:1,x:x+1.8,y:heightAt(x+1.8,z)},{...first,id:2,x:x+6,y:heightAt(x+6,z)}];
  d.colliders.push({type:'box',x:x+3.7,z,y:y-1,w:.6,d:4,h:8});m.explode({x,y:y+.8,z});
  assert.equal(m.enemies[0].alive,false);assert.equal(m.enemies[1].alive,false);assert.equal(m.enemies[2].hp,100);
});
check('pause freezes movement, timers and projectile state',()=>{
  const m=new Match(world);m.running=true;m.weapon=1;m.shoot(direction(0,.2),m.player);m.reload();m.running=false;
  const before=JSON.stringify({p:m.player,g:m.grenades,time:m.time,reload:m.reloadTime,ammo:m.ammo});m.update(.5,{forward:1,jump:true});
  assert.equal(JSON.stringify({p:m.player,g:m.grenades,time:m.time,reload:m.reloadTime,ammo:m.ammo}),before);
});
check('movement slides at solid walls and the world boundary',()=>{
  const p={x:-64,z:146,ground:heightAt(-64,146)},c=[{type:'box',x:-64,z:143,y:0,w:10,d:1,h:100}];
  moveGround(p,0,-12,c);assert.ok(p.z>143.7);const outside={x:264,z:130};moveGround(outside,20,0,[]);assert.ok(outside.x<265);
});
check('medical pack, safe-zone damage and training immunity',()=>{
  const m=new Match(world);m.reset('training');m.running=true;m.player.hp=28;assert.ok(m.heal());tick(m,3.2);assert.equal(m.player.hp,93);assert.equal(m.medkits,2);m.hurt(200,'test');assert.equal(m.over,false);
  m.reset('survival');m.running=true;m.time=420;m.player.x=250;m.player.z=200;m.enemies.forEach(e=>e.shoot=Infinity);m.update(1.05,emptyInput);assert.equal(m.player.hp,96);assert.equal(m.player.armour,100);assert.equal(m.zoneRadius,62);
});
check('win/lose events and full reset',()=>{
  const events=[],m=new Match(world,e=>events.push(e));m.running=true;for(const e of m.enemies)m.damageEnemy(e,250,true);
  assert.equal(m.kills,12);assert.equal(m.running,false);assert.equal(events.filter(e=>e.type==='finish').length,1);assert.equal(events.find(e=>e.type==='finish').win,true);
  m.reset('survival');m.running=true;m.hurt(201,'test');assert.equal(m.over,true);assert.equal(events.at(-1).win,false);
  m.reset('training');assert.equal(m.time,0);assert.equal(m.kills,0);assert.equal(m.player.hp,100);assert.equal(m.medkits,3);assert.equal(m.over,false);assert.equal(m.enemies.filter(e=>e.alive).length,12);assert.deepEqual(m.ammo.map(a=>a.mag),WEAPONS.map(w=>w.mag));
});

check('armour is consumed before health and emits the exact split losses',()=>{
  const events=[],m=new Match(world,e=>events.push(e));assert.equal(m.player.armour,100);m.hurt(40,'敌方射击');
  assert.equal(m.player.armour,60);assert.equal(m.player.hp,100);const e=events.at(-1);assert.equal(e.armourDamage,40);assert.equal(e.healthDamage,0);assert.equal(e.armourBroken,false);
});
check('broken armour passes overflow to health and cannot protect later hits',()=>{
  const events=[],m=new Match(world,e=>events.push(e));m.player.armour=10;m.healTime=2;m.hurt(50,'敌方射击');assert.equal(m.player.armour,0);assert.equal(m.player.hp,60);assert.equal(m.healTime,0);assert.equal(events.at(-1).armourBroken,true);
  m.hurt(10,'敌方射击');assert.equal(m.player.hp,50);assert.equal(events.at(-1).armourBroken,false);m.hurt(1000,'榴弹冲击');assert.equal(m.player.hp,0);assert.equal(m.over,true);const count=events.length;m.hurt(50,'敌方射击');assert.equal(events.length,count);
});
check('the actual player blast path consumes armour before its remaining damage',()=>{
  const m=new Match(world);m.enemies=[];const p=m.player;m.explode({x:p.x,y:p.y,z:p.z});assert.equal(p.armour,0);assert.equal(p.hp,100);
});
check('medical packs restore health without repairing armour and matches reset both',()=>{
  const m=new Match(world);m.running=true;m.player.hp=25;m.player.armour=23;assert.ok(m.heal());tick(m,3.2);assert.equal(m.player.hp,90);assert.equal(m.player.armour,23);m.reset('survival');assert.equal(m.player.hp,100);assert.equal(m.player.armour,100);
});
check('training and invalid damage cannot drain either health or armour',()=>{
  const m=new Match(world);for(const n of [0,-5,NaN,Infinity])m.hurt(n,'敌方射击');assert.equal(m.player.hp,100);assert.equal(m.player.armour,100);m.reset('training');m.player.hp=28;m.player.armour=17;m.hurt(1000,'榴弹冲击');assert.equal(m.player.hp,28);assert.equal(m.player.armour,17);
});
checkCombat(check,world);

const {localAssets}=await import('./local-assets.mjs');
const {assets,surfaces:textures}=await localAssets();
const scene=new THREE.Scene(),renderWorld=makeWorld(scene,world,textures,'high',assets),view=createViewModels(assets,textures);
view.roots.forEach(m=>scene.add(m));const npc=createEnemyModel(1,assets,textures);scene.add(npc);
const meadowCount=()=>renderWorld.grass.userData.meshes.reduce((n,m)=>n+m.geometry.instanceCount,0);
const cam=new THREE.PerspectiveCamera(75,16/9,.08,1000);cam.position.set(SPAWN.x,heightAt(SPAWN.x,SPAWN.z)+1.72,SPAWN.z);cam.rotation.order='YXZ';
renderWorld.update(1,cam);npc.userData.animate(.016,world.enemies[0]);
checkFrame(check,{world:renderWorld,data:world,scene,view});
checkAim(check,{view,data:world});
check('terrain, trees, soldiers and viewmodels have finite geometry',()=>{
  let meshes=0,vertices=0;scene.traverse(o=>{if(!o.isMesh)return;meshes++;const a=o.geometry.attributes.position;if(a){vertices+=a.count;for(const n of a.array)assert.ok(Number.isFinite(n));}if(o.isInstancedMesh)for(const n of o.instanceMatrix.array)assert.ok(Number.isFinite(n));});
  assert.ok(vertices>50625);assert.equal(view.roots.length,3);assert.equal(renderWorld.terrain.geometry.attributes.position.count,225*225);assert.ok(world.cliffs.length>8);assert.ok(renderWorld.nature.cliffBatches.length>0);
  assert.ok(renderWorld.nature.treeBatches.flat().some(m=>m.count>0)||renderWorld.nature.treeDistant.count>0);
  assert.ok(meadowCount()>14000);
  renderWorld.setQuality('low');renderWorld.update(1,cam);assert.ok(meadowCount()>800);assert.equal(renderWorld.sunLight.castShadow,false);
  renderWorld.setQuality('high');renderWorld.update(1.1,cam);assert.ok(meadowCount()>1000);assert.equal(renderWorld.sunLight.castShadow,true);
});
check('water height texture follows lake and river coordinates',()=>{
  const img=renderWorld.water.material.uniforms.bathymetry.value.image,ctx=img.getContext('2d');
  for(const [x,z] of [[26,-22],[30,-110],[-150,80],[160,-170]]){
    const ix=Math.round((x/640+.5)*511),iy=Math.round((z/640+.5)*511),pixel=ctx.getImageData(ix,iy,1,1).data,h=(pixel[0]*256+pixel[1])/65535*128;
    assert.ok(Math.abs(h-heightAt((ix/511-.5)*640,(iy/511-.5)*640))<.002);
  }
});
check('island coast, graded foundations and enterable rural architecture',()=>{
  for(let t=-320;t<=320;t+=16)for(const [x,z] of [[-320,t],[320,t],[t,-320],[t,320]])assert.ok(heightAt(x,z)<3,'The map boundary must end under the ocean');
  assert.ok(renderWorld.water.geometry.parameters.width>2000);
  let houseTriangles=0;
  for(const [i,b] of world.buildings.entries()){
    const house=renderWorld.buildings.children[i];assert.equal(house.userData.stories,b.stories);assert.ok(house.userData.features.windows>=8);houseTriangles+=house.userData.triangles;
    const y=b.y+.12;for(const dx of [-b.w/2,0,b.w/2])for(const dz of [-b.d/2,0,b.d/2])assert.ok(Math.abs(terrainSurfaceAt(b.x+dx,b.z+dz)-y)<.20,'A foundation floats above its graded plot');
    const plaster=house.getObjectByName('rural-house-plaster'),ray=new THREE.Raycaster();house.updateMatrixWorld(true);
    ray.set(new THREE.Vector3(b.x-b.w*.285,b.y+(b.stories===2?b.h/2:b.h)*.53,b.z+b.d/2+2),new THREE.Vector3(0,0,-1));ray.far=.8; // window is checked from just outside the wall below
    ray.ray.origin.z=b.z+b.d/2+.5;assert.equal(ray.intersectObject(plaster).length,0,'Window is painted over a solid plaster wall');
    ray.ray.origin.x=b.x+b.w*.44;assert.ok(ray.intersectObject(plaster).length>0,'Adjacent wall has no solid surface');
  }
  assert.ok(houseTriangles<36000);
});
check('fixed cacti follow visible terrain and remain present in low quality',()=>{
  const c=new THREE.PerspectiveCamera(75,.6,.08,1000);c.position.set(SPAWN.x,heightAt(SPAWN.x,SPAWN.z)+1.72,SPAWN.z);c.rotation.order='YXZ';c.rotation.x=-.045;
  for(const quality of ['low','medium']){
    renderWorld.setQuality(quality);renderWorld.update(10,c);const mesh=renderWorld.grass;
    assert.ok(meadowCount()>14000);
    let beyondThirty=0;for(const m of mesh.userData.meshes){const a=m.geometry.attributes.aOffset;for(let i=0;i<m.geometry.instanceCount;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i);assert.ok(Math.abs(y-terrainSurfaceAt(x,z))<.012);if(Math.hypot(x-SPAWN.x,z-SPAWN.z)>30)beyondThirty++;}}assert.ok(beyondThirty>150);
  }
  renderWorld.setQuality('medium');renderWorld.update(11,c);const portrait=meadowCount();c.aspect=16/9;c.updateProjectionMatrix();renderWorld.update(11.1,c);assert.equal(meadowCount(),portrait);
  const tree=world.trees.find(t=>t.species===1),u=new THREE.PerspectiveCamera(75,1,.08,1000);u.position.set(tree.x,tree.y+tree.h*.35,tree.z+40);u.lookAt(tree.x,tree.y+tree.h*.6,tree.z);renderWorld.update(12,u);assert.ok(renderWorld.nature.woodlandBatches[1][0].count>0);
});
check('photographic foliage has alpha cutouts and bounded LOD sizes',()=>{
  const counts=[];
  for(const key of ['treeHigh','treeMedium']){
    let triangles=0,leaves;
    assets[key].scene.traverse(o=>{if(o.isMesh){triangles+=o.geometry.index.count/3;if(o.material.name.includes('leaves'))leaves=o.material;}});
    assert.ok(leaves.map.image.width>=1024);assert.equal(leaves.transparent,false);assert.ok(leaves.alphaTest>.3);counts.push(triangles);
  }
  assert.ok(counts[0]<80000&&counts[0]>60000);assert.ok(counts[1]<counts[0]&&counts[1]>40000);assert.equal(assets.treeImpostor.image.width,2048);
  renderWorld.setQuality('low');renderWorld.update(2,cam);const low=meadowCount();
  renderWorld.setQuality('high');renderWorld.update(3,cam);const high=meadowCount();assert.equal(high,low);
  const tree=world.trees.find(t=>t.species===0);cam.position.set(tree.x,tree.y+tree.h*.45,tree.z+6);cam.lookAt(tree.x,tree.y+tree.h*.55,tree.z);renderWorld.update(4,cam);assert.ok(renderWorld.nature.treeBatches[0][0].count>0);
});
check('portrait weapon view preserves width and shows only compact gloved hands',()=>{
  for(const aspect of [.46,.6,1,16/9,2.17]){
    const c=new THREE.PerspectiveCamera(weaponViewFov(aspect),aspect,.02,5);
    if(aspect<1)assert.ok(Math.abs(Math.tan(c.fov*Math.PI/360)*aspect-Math.tan(58*Math.PI/360))<1e-10);
    for(const g of view.roots){
      g.position.copy(weaponViewPosition(aspect));g.updateMatrixWorld(true);
      const muzzle=g.userData.muzzle.clone().applyMatrix4(g.matrixWorld).project(c);assert.ok(Math.abs(muzzle.x)<.85&&Math.abs(muzzle.y)<.85);
      const wrists=['handR','handL'].map(name=>g.getObjectByName(name).getWorldPosition(new THREE.Vector3()));
      let found=false;g.traverse(o=>{if(!o.isSkinnedMesh)return;found=true;assert.ok(o.skeleton.bones.some(b=>b.name==='handR'));o.skeleton.update();
        const bounds=new THREE.Box3();for(const ix of new Set(o.geometry.index.array)){const p=new THREE.Vector3();o.getVertexPosition(ix,p);p.applyMatrix4(o.matrixWorld);assert.ok(Number.isFinite(p.x+p.y+p.z));assert.ok(Math.min(...wrists.map(w=>p.distanceTo(w)))<(o.userData.firstPersonArm?.62:.25),'Hand or short cotton wrist extends beyond anatomical bounds');bounds.expandByPoint(p);}
        assert.ok(bounds.max.z<(o.userData.firstPersonArm?.05:-.14),'Hands cross the near camera plane');assert.ok(bounds.max.y<.01,'Hands obscure the centre reticle');assert.ok(bounds.getSize(new THREE.Vector3()).x<.65);
      });assert.ok(found);
    }
  }
});
check('independent soldier skeletons, rifle grip and bolt animation',()=>{
  const second=createEnemyModel(2,assets,textures),bone=npc.userData.body.getObjectByName('Bip01_R_Hand');
  assert.notEqual(bone,second.userData.body.getObjectByName('Bip01_R_Hand'));
  for(let i=0;i<30;i++)npc.userData.animate(1/60,{walk:i*.1,sees:true});npc.updateMatrixWorld(true);
  const wrist=bone.getWorldPosition(new THREE.Vector3()),gun=npc.userData.gun,expected=gun.localToWorld(gun.getObjectByName('TRIGGER').position.clone().add(new THREE.Vector3(-.027,-.063,-.075)));assert.ok(wrist.distanceTo(expected)<.04);
  const support=gun.localToWorld(gun.getObjectByName('SUPPORT').position.clone().add(new THREE.Vector3(.035,-.045,-.02))),left=npc.userData.body.getObjectByName('Bip01_L_Hand').getWorldPosition(new THREE.Vector3());assert.ok(left.distanceTo(support)<.04,'Support hand must reach the handguard');
  assert.deepEqual(assets.soldier.animations.map(a=>a.name).sort(),['Idle','Run','Walk']);
  for(let i=0;i<90;i++)npc.userData.fall(1/60,()=>0);assert.equal(gun.parent,npc);assert.ok(gun.position.y<.08);npc.userData.reset();assert.equal(gun.parent,npc.userData.rig);assert.equal(npc.userData.deathTime,0);assert.equal(npc.userData.rig.rotation.x,0);
  const bolt=view.roots[0].userData.model.getObjectByName('BOLT'),before=bolt.position.clone(),beforeRotation=bolt.quaternion.clone();
  const m=new Match(world);view.fire(0);view.update(.36,m);view.update(.12,m);
  assert.ok(bolt.position.distanceTo(before)>1e-4||bolt.quaternion.angleTo(beforeRotation)>1e-4);
  view.roots.forEach(g=>{g.updateMatrixWorld(true);assert.ok(g.userData.muzzle.clone().applyMatrix4(g.matrixWorld).z<-.4);let indices=0;g.traverse(o=>{if(o.isSkinnedMesh)indices+=o.geometry.index.count;});assert.ok(indices>10000);});
});
check('grenade impact articulates the original skeleton and resets all rig offsets',()=>{
  npc.userData.reset();npc.position.set(-64,5,120);const blast={flightTime:0,spinX:2.4,spinZ:1.4,vx:3,vy:4,vz:1,grounded:false,landedAge:0};
  for(let i=0;i<30;i++)npc.userData.fall(1/60,()=>0,blast);assert.ok(npc.userData.impactMotion.active);assert.ok(npc.userData.impactMotion.nodes.size>=20);assert.equal(npc.userData.gun.parent,npc);
  npc.traverse(o=>{if(o.isBone)assert.ok(o.quaternion.toArray().every(Number.isFinite));});npc.userData.reset();assert.equal(npc.userData.impactMotion.active,false);assert.deepEqual(npc.userData.rig.position.toArray(),[0,.95,0]);
});
check('shots aimed at the enlarged animated head hit the visible head',()=>{
 const actor=createEnemyModel(4,assets,textures),target={...world.enemies[0],id:0,x:0,y:200,z:-20},m=new Match({...world,colliders:[],enemies:[target]});
 actor.position.set(target.x,target.y,target.z);actor.userData.animate(1/60,{walk:0,sees:true,lookYaw:.12});actor.updateMatrixWorld(true);
 const head=actor.getObjectByName('Bip01_Head').getWorldPosition(new THREE.Vector3()),center=new THREE.Vector3(target.x,target.y+ENEMY_BODY.head,target.z);
 assert.ok(head.distanceTo(center)<ENEMY_BODY.headRadius);m.running=true;const origin={x:0,y:201.72,z:0};assert.ok(m.shoot(unit(origin,head),origin));m.updateBullets(.1);assert.equal(m.headshots,1);assert.equal(m.enemies[0].alive,false);
});
check('cacti have outward solid volumes, stable normals, ribbing and visible spines',()=>{
 for(const g of cactusGeometries()){
  const p=g.attributes.position,n=g.attributes.normal;let volume=0;
  for(let i=0;i<g.index.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,g.index.getX(i)),b=new THREE.Vector3().fromBufferAttribute(p,g.index.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(p,g.index.getX(i+2));volume+=a.dot(b.cross(c))/6;}
  assert.ok(volume>.02,'Flat card or inside-out shell');for(let i=0;i<n.count;i++)assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(n,i).length()-1)<1e-5);
  assert.ok(g.userData.areoles>=30&&g.userData.spines>=90);assert.ok(g.boundingBox.getSize(new THREE.Vector3()).z>.1);
 }
});
check('sky sun, moving shadows and water highlights share one direction',()=>{
  const light=skyLighting(assets.sky);assert.ok(Number.isFinite(light.direction.x+light.direction.y+light.direction.z));assert.ok(light.direction.y>0&&Math.abs(light.direction.length()-1)<1e-8);
  const positions=[new THREE.Vector3(SPAWN.x,30,SPAWN.z),new THREE.Vector3(124,42,-126)];
  for(const p of positions){const c=new THREE.PerspectiveCamera(75,1,.08,1000);c.position.copy(p);renderWorld.update(20,c);const actual=renderWorld.sunLight.position.clone().sub(renderWorld.sunLight.target.position).normalize();assert.ok(actual.distanceTo(light.direction)<1e-8);assert.ok(renderWorld.water.material.uniforms.sunDirection.value.distanceTo(actual)<1e-8);}
  assert.equal(renderWorld.water.material.fog,true);assert.ok(renderWorld.nature.cliffBatches.every(m=>m.material.customProgramCacheKey()==='scanned-rock-ground-blend-v1'));
});
check('weapon metal illumination follows the world sun as the camera turns',()=>{
  const c=new THREE.PerspectiveCamera(),key=new THREE.DirectionalLight(),v=new THREE.Scene();
  for(const [yaw,pitch] of [[0,0],[1.7,.4],[-2,-.7]]){
    c.rotation.set(pitch,yaw,0,'YXZ');syncWeaponLighting(c,renderWorld,v,key);
    const actual=key.position.clone().normalize().applyQuaternion(c.quaternion),sun=renderWorld.sunLight.position.clone().sub(renderWorld.sunLight.target.position).normalize();
    assert.ok(actual.distanceTo(sun)<1e-10);assert.equal(key.color.getHex(),renderWorld.sunLight.color.getHex());
    const shaderRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(-v.environmentRotation.x,-v.environmentRotation.y,-v.environmentRotation.z,'XYZ'));
    assert.ok(shaderRotation.angleTo(c.quaternion)<1e-7);
  }
});
check('full-leaf canopy and three solid cactus forms keep physical vegetation detail',()=>{
  const counts=['woodlandHigh','woodlandMedium'].map(key=>{let tris=0,leaf;assets[key].scene.traverse(o=>{if(o.isMesh){tris+=o.geometry.index.count/3;if(o.material.name.includes('leaves'))leaf=o.material;}});assert.ok(leaf.alphaTest>=.38&&leaf.map.image.width===1024);return tris;});
  assert.ok(counts[0]>60000&&counts[0]<70000);assert.ok(counts[1]>40000&&counts[1]<50000);
  assert.ok(renderWorld.grass.userData.meshes.length>3);assert.ok(renderWorld.grass.userData.meshes.every(m=>m.geometry.instanceCount>0&&m.material.emissiveIntensity>=0&&m.material.emissive.getHex()===0));
  const types=renderWorld.grass.userData.meshes.map(m=>m.geometry.attributes.position.array);assert.equal(new Set(types).size,3);
  assert.ok(renderWorld.nature.woodlandBatches.flat().some(m=>m.material.userData.thinLeaf));
  assert.equal(renderWorld.terrain.material.customProgramCacheKey(),'coherent-dry-cactus-soil-v2');
  const sun=skyLighting(assets.sky);assert.ok(sun.direction.y>.65&&sun.direction.y<.85,'Midday sky must share a high sun with the scene');
});
const detailTargets=Object.fromEntries(Object.keys(DETAIL_SURFACES).map(k=>[k,new THREE.Texture({width:1024,height:1024})]));
let detailCalls=0,failDetail=true;const upgrade=detailSurfaceLoader(detailTargets,async url=>{detailCalls++;if(url.includes('rock-normal')&&failDetail)throw new Error('offline');return {image:{width:2048,height:2048}};});
const upgradeFirst=upgrade(),upgradeSecond=upgrade();assert.equal(upgradeFirst,upgradeSecond);const firstDetail=await upgradeFirst;failDetail=false;const retryDetail=await upgrade();
check('optional 2K photos share requests, survive failure and retry independently',()=>{
  assert.equal(firstDetail.loaded.length,3);assert.equal(firstDetail.failed,1);assert.equal(retryDetail.failed,0);assert.equal(detailCalls,5);assert.ok(Object.values(detailTargets).every(t=>t.image.width===2048));
  for(const file of Object.values(DETAIL_SURFACES))assert.ok(fs.statSync(new URL('../dist/textures/detail/'+file,import.meta.url)).size>100000);
});
check('original weapon textures, physical scope and independent AKM magazine',()=>{
  for(const key of ['sniper','rifle']){
    let textured=0;assets[key].scene.traverse(o=>{if(o.isMesh&&o.material.map&&o.material.normalMap&&o.material.roughnessMap&&o.material.metalnessMap)textured++;});assert.ok(textured>=(key==='sniper'?8:2));
  }
  assert.ok(view.roots[0].userData.model.getObjectByName('OpticalAxis'));
  const gun=view.roots[2],u=gun.userData,m=new Match(world);m.weapon=2;view.fire(2);view.update(.04,m);assert.equal(WEAPONS[2].short,'AKM');
  m.reloadTime=1.1;view.update(.02,m);assert.ok(u.magazine.position.y<u.magazineBase.y-.05);m.reloadTime=0;view.update(.02,m);assert.deepEqual(u.magazine.position.toArray(),u.magazineBase.toArray());
  const launcher=view.roots[1].userData;assert.ok(launcher.drum);const angle=launcher.drum.rotation.z;view.fire(1);view.update(.12,m);assert.ok(Math.abs(launcher.drum.rotation.z-angle)>.3);
});
check('cactus ground cover keeps existing roadside stones grounded',()=>{
  assert.ok(renderWorld.nature.looseStones.length>=25);assert.equal(renderWorld.nature.understorey.length,0);
  for(const stone of renderWorld.nature.looseStones)assert.ok(stone.r<.36&&Math.abs(stone.y-terrainSurfaceAt(stone.x,stone.z))<.03);
});
check('obsolete grass, ferns and flower resources are absent from the deployed model list',()=>{
  for(const key of ['grass','grassLow','fern','flowers'])assert.equal(assets[key],undefined);
  assert.equal(renderWorld.nature.fernBatches.length,0);assert.equal(renderWorld.nature.flowerBatches.length,0);assert.equal(renderWorld.nature.understoreyBatches.length,0);assert.equal(renderWorld.grass.userData.coverage.cactus,true);
});
check('casings, dust and explosion effects stay within the phone budget',()=>{
  const audio={explosion(){},casing(){}},fx=new BattleEffects(new THREE.Scene(),audio,{mobile:true});
  for(let i=0;i<45;i++)fx.impact({x:SPAWN.x,y:heightAt(SPAWN.x,SPAWN.z),z:SPAWN.z},{x:0,y:1,z:0},'earth',false);
  fx.casing(new THREE.Vector3(SPAWN.x,100,SPAWN.z),{x:1,y:2,z:0});fx.update(.02);assert.ok(fx.effects.length<=160);assert.ok(fx.effects.some(e=>e.mesh.isSprite));fx.clear();assert.equal(fx.effects.length,0);
});
check('grenade hits create a finite flash, expanding blast and fading debris',()=>{
  let sounds=0;const fx=new BattleEffects(new THREE.Scene(),{explosion(){sounds++;},casing(){}},{mobile:true});
  fx.explosion({x:SPAWN.x,y:heightAt(SPAWN.x,SPAWN.z)+1,z:SPAWN.z});assert.equal(sounds,1);fx.update(.02);assert.ok(fx.blastLight.intensity>0);
  const wave=fx.effects.find(e=>e.type==='blastwave');assert.ok(wave&&wave.mesh.scale.x>1);for(let i=0;i<480;i++)fx.update(1/60);assert.equal(fx.effects.length,0);assert.equal(fx.blastLight.intensity,0);fx.clear();
});
check('calibre-sized hollow cases and separate copper bullets use shared non-emissive meshes',()=>{
  const assets=buildCartridgeAssets();
  for(const [type,length] of [['5.56',.0447],['7.62',.05118],['40mm',.046]]){
    const a=makeCasing(type),b=makeCasing(type);assert.equal(a.geometry,b.geometry);assert.equal(a.material,b.material);
    const box=a.geometry.boundingBox;assert.ok(Math.abs(box.max.y-box.min.y-length)<1e-6);assert.equal(a.geometry.groups.length,3);
    for(const n of a.geometry.attributes.position.array)assert.ok(Number.isFinite(n));
  }
  assert.equal(makeProjectile('40mm'),null);assert.ok(makeProjectile('5.56').userData.length<.025);
  assert.ok(Object.values(assets.materials).every(m=>m.emissive.getHex()===0));
  const scene=new THREE.Scene(),fx=new BattleEffects(scene,{explosion(){},casing(){}},{mobile:true});
  fx.casing(new THREE.Vector3(0,200,0),{x:2,y:1,z:0},'7.62');assert.equal(fx.effects[0].mesh.userData.ammoType,'7.62');
  fx.update(.016,[{id:1,x:0,y:200,z:-10,vx:0,vy:0,vz:-820,weapon:0}]);assert.equal(fx.projectiles.size,1);assert.equal(fx.projectiles.get(1).userData.ammoType,'7.62');
  assert.ok(!scene.children.some(o=>o.isLine));fx.update(.016,[]);assert.equal(fx.projectiles.size,0);
  fx.impact({x:0,y:200,z:-1},{x:0,y:0,z:1},'plaster',false);const decal=fx.effects.find(e=>e.type==='decal');assert.ok(decal.mesh.material.map);assert.equal(decal.mesh.geometry.type,'PlaneGeometry');fx.clear();
});
checkResidentScene(check,{world:renderWorld,data:world});
const shaderDir=process.env.FPS_QA_DIR;
if(shaderDir){
  const {spawnSync}=await import('node:child_process');
  const result=spawnSync(process.execPath,[new URL('./export-webgl2-shaders.mjs',import.meta.url).pathname,shaderDir],{stdio:'inherit'});
  assert.equal(result.status,0,'Actual WebGL 2 shader export failed');
}
check('all local HTML/CSS/JS dependencies and deployment configuration exist',()=>{
  const root=new URL('../',import.meta.url).pathname,dist=path.join(root,'dist'),html=fs.readFileSync(path.join(dist,'index.html'),'utf8'),css=fs.readFileSync(path.join(dist,'style.css'),'utf8');
  for(const m of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g))assert.ok(fs.existsSync(path.join(dist,m[1].split('?')[0])),m[1]);
  for(const m of css.matchAll(/url\(['"]?(\.\/[^)'" ]+)/g))assert.ok(fs.existsSync(path.join(dist,m[1])),m[1]);
  for(const file of ['bootstrap.js','startup.js','game.js','weapons.js','weapon-view.js','graphics.js','aim-overlay.js','character.js','rig-ik.js','ammunition.js','world.js','resident-vegetation.js','vehicle-trails.js','core.js','assets.js','nature.js','audio.js','effects.js','terrain-material.js','rural-buildings.js','building-layout.js','loot-views.js','pickup-controls.js','vehicle-wreck.js','terrain-data.js','resource-pack.js','startup-pack-manifest.js','vendor/GLTFLoader.js','vendor/SkeletonUtils.js','vendor/RGBELoader.js'])for(const m of fs.readFileSync(path.join(dist,file),'utf8').matchAll(/(?:from\s*|import\s*\()['"](\.\/[^'"]+)/g))assert.ok(fs.existsSync(path.join(dist,path.dirname(file),m[1].split('?')[0])),m[1]);
  const hostingFile=path.join(root,'.openai/hosting.json');
  if(fs.existsSync(hostingFile)){const hosting=JSON.parse(fs.readFileSync(hostingFile,'utf8'));assert.match(hosting.project_id,/^appgprj_[a-z0-9]+$/);assert.equal(hosting.static.directory,'dist');}
  else assert.match(fs.readFileSync(path.join(root,'.github/workflows/pages.yml'),'utf8'),/path: dist/);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  for(const file of ['game.js','bootstrap.js'])for(const m of fs.readFileSync(path.join(dist,file),'utf8').matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(m[1]),`Missing UI element ${m[1]}`);
  assert.doesNotMatch(html,/<button\b[^>]*id="start"[^>]*\bdisabled\b/);
});
console.log(`\n${passed} checks passed. Browser / mobile rendering has not been tested.`);
