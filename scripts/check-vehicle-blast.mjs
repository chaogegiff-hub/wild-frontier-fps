import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {Match,createWorldData,colliderRay} from '../dist/core.js';import {VehicleFleet} from '../dist/vehicle-physics.js';
import {wreckBounds,wreckCorners,wreckBurnProfile,rotateVehiclePoint,VEHICLE_BLAST_TIMING} from '../dist/vehicle-blast.js';
import {BattleEffects} from '../dist/effects.js';import {makeVehicleViews} from '../dist/vehicles.js';import {localAssets} from './local-assets.mjs';
const colorDistance=(a,b)=>Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b);
const world=createWorldData(),P=()=>new THREE.Vector3();let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function fixture({dt=1/60,terrain=()=>10,waterLevel=3,colliders=[],spawns=[{x:0,z:0,yaw:0}],point={x:-1.1,y:11,z:0}}={}){
 const events=[],m=new Match({...world,colliders,enemies:[]},e=>events.push({...e,at:e.vehicle?.wreckMotion?.age??0}));m.reset('training');m.running=true;m.fleet=new VehicleFleet({terrain,waterLevel,colliders,spawns});const car=m.fleet.cars[0];
 return {m,car,events,terrain,dt,explode(){m.explode({...point,directVehicleId:car.id});},advance(t){for(let time=0;time<t-1e-9;time+=dt)m.updateAftermath(dt);}};
}
check('a finite-speed direct grenade destroys the car once and records its real impact',()=>{
 const f=fixture();f.m.grenades=[{x:0,y:10.9,z:-7,vx:0,vy:0,vz:76,age:0,targetId:null}];f.m.updateGrenades(.12);assert.equal(f.m.grenades.length,0);assert.ok(f.car.destroyed&&f.car.wreckMotion);assert.equal(f.events.filter(e=>e.type==='vehicledestroyed').length,1);assert.ok(f.car.wreckMotion.impact.point.z<-1.8);assert.equal(f.car.wreckMotion.phase,'blast');assert.ok(f.events.some(e=>e.type==='explosion'&&e.vehicleImpact));const state=f.car.wreckMotion;f.m.explode({x:0,y:11,z:0,directVehicleId:0});assert.equal(f.car.wreckMotion,state);assert.equal(f.events.filter(e=>e.type==='vehicledestroyed').length,1);
});
check('the flash precedes lift; the chassis rises and turns before landing and ignition',()=>{
 const f=fixture();f.explode();const y=f.car.y;f.advance(1/60);assert.equal(f.car.wreckMotion.phase,'blast');assert.equal(f.car.y,y);assert.equal(wreckBurnProfile(f.car),null);f.advance(.25);assert.equal(f.car.wreckMotion.phase,'airborne');assert.ok(f.car.y>y+.7);assert.ok(Math.abs(f.car.roll)>.15);assert.equal(wreckBurnProfile(f.car),null);f.advance(2);const land=f.events.find(e=>e.type==='vehiclelanding'),fire=f.events.find(e=>e.type==='vehicleignited');assert.ok(land&&fire);assert.ok(fire.at>land.at+VEHICLE_BLAST_TIMING.ignition);assert.ok(f.car.wreckMotion.grounded);assert.equal(f.events.filter(e=>e.type==='vehicleignited').length,1);
});
check('persistent fire starts after landing and heavy smoke follows the fire',()=>{
 const f=fixture();f.explode();let firstFire=null,firstSmoke=null;for(let i=0;i<240;i++){f.advance(1/60);const p=wreckBurnProfile(f.car);if(p?.fire>0&&firstFire===null)firstFire=f.car.wreckMotion.age;if(p?.smoke>0&&firstSmoke===null)firstSmoke=f.car.wreckMotion.age;if(!f.car.wreckMotion.grounded)assert.equal(p,null);}
 assert.ok(firstFire>1);assert.ok(firstSmoke-firstFire>=VEHICLE_BLAST_TIMING.smoke-.02);f.advance(30);const profile=wreckBurnProfile(f.car);assert.ok(profile.fire>.4&&profile.smoke>.7,'Fire/smoke ended at the former 18-second cutoff');
});
check('the blast direction changes travel and tilt without lifting cars damaged only by bullets',()=>{
 const a=fixture(),b=fixture({point:{x:1.1,y:11,z:0}}),c=fixture({point:{x:0,y:11,z:-2}});for(const f of [a,b,c]){f.explode();f.advance(.6);}assert.ok(a.car.x>.5&&b.car.x<-.5);assert.ok(a.car.roll<0&&b.car.roll>0);assert.ok(c.car.z>.5&&c.car.pitch>.2);const ordinary=fixture();ordinary.m.damageVehicle(ordinary.car,200);assert.equal(ordinary.car.wreckMotion,undefined);ordinary.advance(.6);assert.equal(ordinary.car.x,0);
});
check('fixed substeps agree at 30, 60 and 120 fps',()=>{
 const list=[1/30,1/60,1/120].map(dt=>{const f=fixture({dt});f.explode();f.advance(2.5);return f;});for(const f of list.slice(1))for(const key of ['x','y','z','pitch','yaw','roll'])assert.ok(Math.abs(list[0].car[key]-f.car[key])<.005,key);
});
check('terrain and a solid wall constrain the complete moving chassis, and it settles without jitter',()=>{
 const terrain=(x,z)=>10+.08*x-.05*z,wall={type:'box',x:4.7,y:5,z:0,w:.25,h:14,d:20},f=fixture({terrain,colliders:[wall]});f.explode();for(let i=0;i<300;i++){f.advance(1/60);for(const p of wreckCorners(f.car))assert.ok(p.y>=terrain(p.x,p.z)-.02);assert.ok(wreckBounds(f.car).maxX<=wall.x-wall.w/2+.03);}
 assert.ok(f.car.wreckMotion.sleeping);const before=JSON.stringify([f.car.x,f.car.y,f.car.z,f.car.pitch,f.car.roll]);f.advance(1);assert.equal(JSON.stringify([f.car.x,f.car.y,f.car.z,f.car.pitch,f.car.roll]),before);
});
check('collision bounds follow the airborne car and the rotation matches the real YXZ model transform',()=>{
 const f=fixture();f.explode();f.advance(.8);const c=f.car,b=wreckBounds(c);assert.ok(c.collider.y>10.7);assert.ok(Math.abs(c.collider.y-b.minY)<1e-8);const q=new THREE.Euler(c.pitch,c.yaw,c.roll,'YXZ');for(const v of [{x:1,y:2,z:3},{x:-1,y:.9,z:-2}]){const actual=new THREE.Vector3(v.x,v.y,v.z).applyEuler(q),p=rotateVehiclePoint(v,c.pitch,c.yaw,c.roll);assert.ok(actual.distanceTo(new THREE.Vector3(p.x,p.y,p.z))<1e-9);}assert.ok(Number.isFinite(colliderRay({x:c.collider.x-10,y:c.collider.y+c.collider.h/2,z:c.collider.z},{x:1,y:0,z:0},c.collider)));
});
check('an occupied car releases its driver before launch and remains impossible to drive',()=>{
 const f=fixture();f.m.mode='survival';f.m.fleet.driverId=0;f.m.fleet.syncPlayer(f.m.player);f.explode();assert.equal(f.m.vehicle,null);assert.ok(f.events.some(e=>e.type==='vehicleexit'));assert.ok(f.car.stalled&&f.car.destroyed);assert.notEqual(f.m.fleet.nearest(f.m.player,[]),f.car);f.advance(.5);assert.equal(f.m.vehicle,null);
});
check('nearby car explosions chain once without recursive re-destruction',()=>{
 const f=fixture({spawns:[{x:0,z:0,yaw:0},{x:3,z:0,yaw:0}]});f.explode();assert.ok(f.m.fleet.cars.every(c=>c.destroyed));assert.equal(f.events.filter(e=>e.type==='vehicledestroyed').length,2);f.advance(4);assert.equal(f.events.filter(e=>e.type==='vehicleignited').length,2);
});
check('pause freezes the launch, while the result aftermath finishes the sequence and reset restores all cars',()=>{
 const f=fixture();f.explode();f.advance(.4);f.m.running=false;const before=JSON.stringify(f.car);f.m.update(.2,{});assert.equal(JSON.stringify(f.car),before);f.m.over=true;f.advance(4);assert.equal(f.car.wreckMotion.phase,'burning');f.m.reset('training');assert.ok(f.m.fleet.cars.every(c=>!c.destroyed&&!c.wreckMotion));
});
check('a wreck that falls fully underwater cannot ignite or produce a surface fire',()=>{
 const f=fixture();f.explode();f.m.fleet.terrain=()=>-5;f.advance(5);assert.ok(f.car.inWater&&f.car.wreckMotion.extinguished);assert.equal(f.car.wreckMotion.phase,'submerged');assert.equal(wreckBurnProfile(f.car),null);assert.ok(!f.events.some(e=>e.type==='vehicleignited'));
});
const {assets,surfaces}=await localAssets();
check('real vehicle meshes use the flight pose exactly and keep their body panels until after the fire develops',()=>{
 const f=fixture({spawns:[{x:0,z:0,yaw:0},{x:8,z:0,yaw:0},{x:-8,z:0,yaw:0}]}),views=makeVehicleViews(assets,f.m.fleet),item=views.items[0];f.explode();f.advance(.8);views.update(1/60);assert.equal(item.root.rotation.x,f.car.pitch);assert.equal(item.root.rotation.z,f.car.roll);assert.ok(item.model.visible&&!item.wreck.visible);f.advance(4);views.update(1/60);assert.ok(item.model.visible);assert.ok(views.items[1].finishes.every(v=>colorDistance(v.material.color,v.color)<1e-8));assert.ok(item.finishes.some(v=>colorDistance(v.material.color,v.color)>.1));f.advance(15);views.update(1/60);assert.ok(item.wreck.visible&&!item.model.visible);f.m.reset('training');views.update(0,f.m.fleet);assert.ok(item.model.visible&&!item.wreck.visible);assert.ok(item.finishes.every(v=>colorDistance(v.material.color,v.color)<1e-8));
});
check('persistent flame and billows emit only after landing, rise and remain dense for all three cars within the mobile budget',()=>{
 const scene=new THREE.Scene(),fx=new BattleEffects(scene,{explosion(){},casing(){}},{mobile:true,floorAt:()=>10}),f=fixture();f.explode();f.advance(.7);fx.vehicleWrecks(.2,[f.car]);assert.ok(!fx.effects.some(e=>e.wreckId!==undefined));f.advance(4);
 const cars=[0,1,2].map(id=>({...f.car,id,x:id*8}));for(let i=0;i<600;i++){fx.vehicleWrecks(1/60,cars);fx.update(1/60);assert.ok(fx.effects.length<=160);}
 const smoke=fx.effects.filter(e=>e.billow),flames=fx.effects.filter(e=>e.type==='flame');assert.ok(smoke.length>45&&flames.length>6);assert.ok(Math.max(...smoke.map(e=>e.mesh.position.y))>f.car.y+6);assert.ok(smoke.some(e=>e.mesh.material.opacity>.5));assert.equal(fx.wreckLights.size,3);assert.ok([...fx.wreckLights.values()].every(l=>l.intensity>0));for(let i=0;i<600;i++)fx.update(1/60);assert.equal(fx.effects.length,0);fx.clear();assert.equal(fx.wreckLights.size,0);assert.equal(fx.burnTimers.size,0);
});
check('initial blast dust clears quickly and never becomes a premature persistent black column',()=>{
 const fx=new BattleEffects(new THREE.Scene(),{explosion(){}},{mobile:true,floorAt:()=>10});fx.explosion({x:0,y:11,z:0},{vehicle:true});const smoke=fx.effects.filter(e=>e.type==='smoke');assert.ok(smoke.length<=9);assert.ok(smoke.every(e=>e.life<1.5&&!e.billow&&e.wreckId===undefined));for(let i=0;i<100;i++)fx.update(1/60);assert.ok(fx.effects.every(e=>e.type!=='smoke'&&e.type!=='flame'));fx.clear();
});
console.log(`${passed} staged vehicle explosion, flight, landing, fire, smoke and lifecycle checks passed. Not device-render footage.`);
