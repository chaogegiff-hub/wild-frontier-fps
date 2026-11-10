import assert from 'node:assert/strict';
import {Match,createWorldData,moveGround,heightAt,colliderRay,lineClear} from '../dist/core.js';
import {housePlan} from '../dist/building-layout.js';
import {VehicleFleet} from '../dist/vehicle-physics.js';
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);},data=createWorldData();
const setup=()=>{const events=[],m=new Match(data,e=>events.push(e));m.reset('training');m.running=true;return {m,events};};
check('every house has an accessible doorway, a solid exterior wall and an interior floor',()=>{
  const {m}=setup();for(const b of data.buildings){const p={x:b.x,z:b.z+b.d/2+2,ground:heightAt(b.x,b.z+b.d/2+2)};for(let i=0;i<75;i++)moveGround(p,0,-.08,m.colliders);assert.ok(p.z<b.z+b.d/2-2,`Door blocked at house ${b.id}`);assert.ok(Math.abs(p.ground-b.y-.28)<1e-6);
    const wall={x:b.x+b.w*.44,z:b.z+b.d/2+2,ground:heightAt(b.x+b.w*.44,b.z+b.d/2+2)};for(let i=0;i<60;i++)moveGround(wall,0,-.08,m.colliders);assert.ok(wall.z>b.z+b.d/2+.05);
  }
});
check('stairs reach the upper room and can be descended without teleporting to overhead floors',()=>{
  const {m}=setup();for(const b of data.buildings){const q=housePlan(b),s=q.stair;if(!s)continue;const p={x:b.x+s.x,z:b.z+s.start+.4,ground:b.y+q.base};let old=p.ground;
    for(let i=0;i<Math.ceil((s.run+.65)/.06);i++){moveGround(p,0,-.06,m.colliders);assert.ok(Math.abs(p.ground-old)<.22);old=p.ground;}assert.ok(p.ground>b.y+q.upper-.02,`Stairs stop at house ${b.id}`);
    for(let i=0;i<Math.ceil((s.run+.9)/.06);i++){moveGround(p,0,.06,m.colliders);assert.ok(Math.abs(p.ground-old)<.22);old=p.ground;}assert.ok(Math.abs(p.ground-b.y-q.base)<.02);
  }
});
check('one fast bullet shatters aligned front and back panes, while an opaque wall still stops the bullet',()=>{
  const {m,events}=setup(),b=data.buildings[1],w=m.windows.find(w=>w.houseId===b.id),origin={x:w.x,y:w.y+w.h/2,z:b.z+b.d/2+1};m.enemies=[];m.shoot({x:0,y:0,z:-1},origin);m.updateBullets(.04);assert.ok(w.broken);assert.ok(events.filter(e=>e.type==='windowbreak').length>=2);const n=events.length;m.breakWindow(w);assert.equal(events.length,n);
  const other=setup();other.m.enemies=[];other.m.shoot({x:0,y:0,z:-1},{...origin,x:b.x+b.w*.44});other.m.updateBullets(.02);assert.equal(other.m.bullets.length,0);assert.ok(other.m.windows.every(w=>!w.broken));assert.ok(other.events.some(e=>e.type==='impact'&&e.surface==='plaster'));
});
check('a grenade hits a real car, triggers its explosion once, and leaves it permanently undriveable until reset',()=>{
  const {m,events}=setup(),car=m.fleet.cars[0];m.grenades=[{x:car.x,y:car.y+.8,z:car.z-7,vx:0,vy:0,vz:76,age:0,targetId:null}];m.updateGrenades(.15);assert.ok(car.destroyed&&car.stalled);assert.equal(car.speed,0);assert.equal(events.filter(e=>e.type==='vehicledestroyed').length,1);m.explode({x:car.x,y:car.y+.8,z:car.z,directVehicleId:car.id});assert.equal(events.filter(e=>e.type==='vehicledestroyed').length,1);
  for(let i=0;i<90;i++)m.fleet.updatePassive(1/60,m.player);assert.ok(car.wreckAge>1.4);m.player.x=car.x;m.player.z=car.z;assert.notEqual(m.nearbyVehicle()?.id,car.id);m.reset('training');assert.ok(m.fleet.cars.every(c=>!c.destroyed&&c.hp===100));
});
check('blast shielding protects a car behind a solid wall and an occupant can escape a destroyed car',()=>{
  const {m,events}=setup();m.fleet=new VehicleFleet({terrain:()=>100,spawns:[{x:0,z:0,yaw:0}]});const car=m.fleet.cars[0];m.world={...m.world,colliders:[{type:'box',x:0,y:99,z:-3,w:8,h:10,d:.25}]};m.explode({x:0,y:101,z:-5});assert.equal(car.hp,100);
  m.world={...m.world,colliders:[]};m.fleet.driverId=0;m.fleet.syncPlayer(m.player);m.damageVehicle(car,200);assert.equal(m.vehicle,null);assert.ok(events.some(e=>e.type==='vehicleexit'));assert.ok(m.player.hp>0);
});
check('indoor ammunition, medicine and armour are picked once and change the correct inventory',()=>{
  const {m,events}=setup();for(const kind of ['ammo','medkit','armour']){const item=m.loot.find(i=>i.kind===kind),b=data.buildings[item.houseId],p=housePlan(b);Object.assign(m.player,{x:item.x-.60,z:item.z,ground:b.y+p.base,y:b.y+p.base+1.72,armour:25});const oldReserve=m.ammo[item.weapon??0].reserve,oldKits=m.medkits;assert.equal(m.nearestLoot()?.id,item.id);assert.ok(m.pickupLoot(item.id));assert.equal(m.pickupLoot(item.id),false);if(kind==='ammo')assert.equal(m.ammo[item.weapon].reserve,oldReserve+item.count);if(kind==='medkit')assert.equal(m.medkits,oldKits+1);if(kind==='armour')assert.equal(m.player.armour,100);}
  assert.equal(events.filter(e=>e.type==='lootpicked').length,3);m.reset('training');assert.ok(m.loot.every(i=>!i.taken)&&m.windows.every(w=>!w.broken));
});
check('pickups cannot pass through walls, reach between storeys, or run while paused or driving',()=>{
  const {m}=setup(),item=m.loot[0],b=data.buildings[0];Object.assign(m.player,{x:item.x-.5,z:item.z,y:item.y+1.72,ground:item.y});m.running=false;assert.equal(m.nearestLoot(),null);m.running=true;m.fleet.driverId=0;assert.equal(m.nearestLoot(),null);m.fleet.driverId=null;
  m.world={...m.world,colliders:[{type:'box',x:item.x-.25,y:item.y,z:item.z,w:.08,h:4,d:2}]};assert.notEqual(m.nearestLoot()?.id,item.id);Object.assign(m.player,{ground:item.y+3,y:item.y+4.72});assert.notEqual(m.nearestLoot()?.id,item.id);
});
check('enemy fire and grenade impacts shatter intact glass rather than ignoring the panes',()=>{
  const {m,events}=setup(),b=data.buildings[1],w=m.windows.find(w=>w.houseId===b.id);m.mode='survival';m.time=8;Object.assign(m.player,{x:w.x,z:w.z+5,ground:heightAt(w.x,w.z+5),y:heightAt(w.x,w.z+5)+1.72});const e=m.enemies[0];m.enemies=[e];Object.assign(e,{x:w.x,y:b.y+.28,z:w.z-1,homeX:w.x,homeZ:w.z-1,yaw:0,shoot:0,sees:true,losTimer:3,aimReady:1});m.enemyAI.confirm(e,m.player,m.time);Object.assign(e.ai,{visible:true,sample:{...m.player},sampleAt:m.time,nextSense:m.time+1,sightRate:2,reactionUntil:0});e.aimReady=1;e.shoot=0;m.update(.016,{});assert.ok(events.some(e=>e.type==='enemyfire'));assert.ok(w.broken);
  const n=setup(),pane=n.m.windows.find(w=>w.houseId===b.id);n.m.enemies=[];n.m.grenades=[{x:pane.x,y:pane.y+pane.h/2,z:pane.z+3,vx:0,vy:0,vz:-76,age:0,targetId:null}];n.m.updateGrenades(.06);assert.ok(pane.broken);assert.equal(n.m.grenades.length,0);assert.ok(n.events.some(e=>e.type==='explosion'));
});
check('a wreck has a solid lower frame, an open upper cabin and a safe escape if both doors are blocked',()=>{
  const {m}=setup(),car=m.fleet.cars[0];m.fleet.driverId=0;m.fleet.syncPlayer(m.player);const original=m.fleet.tryExit;m.fleet.tryExit=()=>({type:'vehicleexitblocked',vehicle:car});m.damageVehicle(car,200);m.fleet.tryExit=original;assert.equal(m.vehicle,null);assert.ok(Math.abs(m.player.ground-car.collider.y-car.collider.h)<1e-6);const x=car.x-4,dir={x:1,y:0,z:0};assert.ok(Number.isFinite(colliderRay({x,y:car.y+.45,z:car.z},dir,car.collider)));assert.equal(colliderRay({x,y:car.y+1.2,z:car.z},dir,car.collider),Infinity);const age=car.wreckAge;m.running=false;m.update(.2,{});assert.equal(car.wreckAge,age);
});
console.log(`${passed} destruction, glass, building-entry and supply checks passed. Not a browser/device render.`);
