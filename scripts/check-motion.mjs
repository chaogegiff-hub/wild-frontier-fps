import {footSurface,FootstepContacts} from '../dist/foley-motion.js';
import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import * as THREE from '../dist/vendor/three.module.js';
import {localAssets} from './local-assets.mjs';import {SwimView,swimViewFov} from '../dist/swim-view.js';
import {VehicleFleet,VEHICLE_WHEELS,VEHICLE_EXHAUST,VEHICLE_EXHAUST_AXIS,vehicleWorld} from '../dist/vehicle-physics.js';
import {makeVehicleViews} from '../dist/vehicles.js';import {VehicleTrails} from '../dist/vehicle-trails.js';
import {Match,createWorldData,WATER_LEVEL,WEAPONS,GRENADE_LOCK_TIME,terrainSurfaceAt,clamp,zoomFov} from '../dist/core.js';
import {createViewModels,weaponViewFov,weaponViewPosition} from '../dist/weapons.js';import {WeaponRecoil} from '../dist/weapon-view.js';
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function flat(){const f=new VehicleFleet({terrain:()=>10,spawns:[{x:0,z:0,yaw:0}]});f.driverId=0;return f;}
check('all tire contact points roll forward and backward without sliding or spinning while blocked',()=>{
  for(const reverse of [false,true]){
    const f=flat(),c=f.current,p={};c.speed=reverse?-4:4;
    const before=VEHICLE_WHEELS.map(w=>vehicleWorld(c,w.x,w.z));f.update(1/120,{},p,[]);
    for(const [i,w] of VEHICLE_WHEELS.entries()){const after=vehicleWorld(c,w.x,w.z),travel=before[i].z-after.z,spin=c.wheels[w.name].spin;assert.ok(Math.abs(spin*.415+travel)<1e-8);assert.equal(Math.sign(spin),reverse?1:-1);}
    c.speed=0;const still=JSON.stringify(c.wheels);f.update(.1,{},p,[]);assert.equal(JSON.stringify(c.wheels),still);
  }
  const f=flat(),c=f.current;const wall={type:'box',x:0,z:-2.01,y:0,w:10,d:.02,h:30};c.speed=14;f.update(1/120,{throttle:1},{},[wall]);assert.ok(c.collision);assert.ok(Object.values(c.wheels).every(w=>w.spin===0));
});
check('both turn directions give the inside front tire a tighter angle and outside tires a longer rolling path',()=>{
  for(const sign of [-1,1]){
    const f=flat(),c=f.current;c.speed=7;for(let i=0;i<90;i++)f.update(1/120,{throttle:1,steer:sign},{},[]);
    const inside=sign>0?'right':'left',outside=sign>0?'left':'right';
    assert.ok(Math.abs(c.wheels['front-'+inside].steer)>Math.abs(c.wheels['front-'+outside].steer));
    for(const axle of ['front','rear'])assert.ok(Math.abs(c.wheels[axle+'-'+outside].spin)>Math.abs(c.wheels[axle+'-'+inside].spin));
    assert.equal(c.wheels['rear-left'].steer,0);assert.equal(c.wheels['rear-right'].steer,0);
    const reverseYaw=c.yaw;c.speed=-4;f.update(.1,{throttle:-1,steer:sign},{},[]);assert.equal(Math.sign(c.yaw-reverseYaw),sign);
  }
});
const {assets,surfaces}=await localAssets(),data=createWorldData();
check('actual wheel meshes use independent local axles under the pitched, rolled vehicle body',()=>{
  const f=flat(),c=f.current,views=makeVehicleViews(assets,f);for(let i=0;i<60;i++)f.update(1/120,{throttle:1,steer:.7},{},[]);c.pitch=.15;c.roll=-.08;views.update(0);
  for(const w of views.items[0].wheels){assert.equal(w.node.rotation.order,'YXZ');assert.ok(Math.abs(w.node.rotation.x-c.wheels[w.name].spin)<1e-9);assert.ok(Math.abs(w.node.rotation.y-c.wheels[w.name].steer)<1e-9);const axle=new THREE.Vector3(1,0,0).applyQuaternion(w.node.quaternion),expected=new THREE.Vector3(Math.cos(w.node.rotation.y),0,-Math.sin(w.node.rotation.y));assert.ok(axle.distanceTo(expected)<1e-8);}
});
check('visible exhaust begins at the actual outlet, disperses behind the car, rises, and continues lightly at idle',()=>{
  const f=flat(),c=f.current;c.yaw=.6;c.pitch=.12;c.roll=-.08;const scene=new THREE.Scene(),fx=new VehicleTrails(scene,null,{terrain:()=>10,capacity:8});fx.reset(f);fx.emit(c);
  const first=fx.puffs.find(p=>p.sprite.visible),expected=new THREE.Vector3(VEHICLE_EXHAUST.x,VEHICLE_EXHAUST.y,VEHICLE_EXHAUST.z).applyEuler(new THREE.Euler(c.pitch,c.yaw,c.roll,'YXZ')).add(new THREE.Vector3(c.x,c.y,c.z));
  assert.ok(first.sprite.position.distanceTo(expected)<1e-8);assert.ok(first.sprite.material.opacity>.25);const start=first.sprite.position.clone(),size=first.sprite.scale.x;
  for(let i=0;i<60;i++)fx.update(1/60,f);assert.ok(first.sprite.position.y>start.y+.2);assert.ok(first.sprite.scale.x>size+.3);assert.ok(fx.puffs.filter(p=>p.sprite.visible).length>=10);
  f.driverId=null;for(let i=0;i<150;i++)fx.update(1/60,f);assert.ok(fx.puffs.every(p=>!p.sprite.visible));
  f.driverId=0;c.stalled=true;for(let i=0;i<60;i++)fx.update(1/60,f);assert.ok(fx.puffs.every(p=>!p.sprite.visible));c.stalled=false;c.inWater=true;c.y=0;for(let i=0;i<60;i++)fx.update(1/60,f);assert.ok(fx.puffs.every(p=>!p.sprite.visible));assert.equal(fx.puffs.length,64);
});
check('exhaust follows the rendered pipe through suspension smoothing and stops when its actual tip is submerged',()=>{
  const f=flat(),c=f.current,views=makeVehicleViews(assets,f),scene=new THREE.Scene(),fx=new VehicleTrails(scene,null,{terrain:()=>10,capacity:8,outletFor:car=>views.exhaust(car)});fx.reset(f);
  c.yaw=.8;c.pitch=.45;c.roll=-.3;views.update(1/240);const item=views.items[0],out=views.exhaust(c);assert.ok(Math.abs(item.root.rotation.x-c.pitch)>.1);fx.emit(c);const puff=fx.puffs.find(p=>p.sprite.visible);assert.ok(puff.sprite.position.distanceTo(item.emitter.getWorldPosition(new THREE.Vector3()))<1e-9);assert.ok(puff.sprite.position.distanceTo(out.position)<1e-9);
  const p=item.model.getObjectByName('body_jeep_0').geometry.attributes.position,center=new THREE.Vector3(VEHICLE_EXHAUST.x,VEHICLE_EXHAUST.y,VEHICLE_EXHAUST.z),axis=new THREE.Vector3(VEHICLE_EXHAUST_AXIS.x,VEHICLE_EXHAUST_AXIS.y,VEHICLE_EXHAUST_AXIS.z).normalize();let rimVertices=0;
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).sub(center),radius=v.length();if(Math.abs(v.dot(axis))<.002&&radius>.030&&radius<.046)rimVertices++;}assert.ok(rimVertices>=24,'Emitter must be at the actual authored hollow rim');assert.equal(item.emitter.parent,item.pipe);assert.ok(item.pipe.children.every(o=>!o.isMesh),'No duplicate floating pipe geometry');
  fx.reset(f);c.y=-1;c.inWater=true;views.update(0);fx.emit(c);assert.ok(fx.puffs.every(p=>!p.sprite.visible));c.y=10;c.inWater=false;c.speed=8;c.throttle=1;views.update(0);fx.emit(c);const moving=fx.puffs.find(p=>p.sprite.visible);assert.ok(moving.velocity.dot(new THREE.Vector3(-Math.sin(c.yaw),0,-Math.cos(c.yaw)))>6);
});
function swimmer(){const m=new Match(data);m.reset('training');m.running=true;Object.assign(m.player,{x:26,z:-22,ground:terrainSurfaceAt(26,-22),jump:0,vy:0,y:WATER_LEVEL+.38});return m;}
check('swimming settles the eye at the water surface, preserves supplies, and prevents shooting, aiming, reloading or healing',()=>{
  const m=swimmer();assert.ok(m.swimming);m.weapon=1;m.player.hp=70;m.healTime=2;m.reloadTime=1;const inventory=JSON.stringify({ammo:m.ammo,kits:m.medkits,armour:m.player.armour});m.update(.1,{crouch:true});assert.ok(m.swimming);assert.equal(m.player.crouch,false);assert.equal(m.healTime,0);assert.equal(m.reloadTime,0);assert.ok(Math.abs(m.player.y-WATER_LEVEL-.38)<1e-8);
  assert.equal(m.shoot({x:0,y:0,z:-1},m.player),false);assert.equal(m.reload(),false);assert.equal(m.heal(),false);m.switchWeapon(0);assert.equal(m.weapon,1);assert.equal(m.updateGrenadeLock(.1,m.player,{x:0,y:0,z:-1},true).targetId,null);assert.equal(m.nearestLoot(),null);assert.equal(JSON.stringify({ammo:m.ammo,kits:m.medkits,armour:m.player.armour}),inventory);
  const x=m.player.x,z=m.player.z;m.update(.1,{forward:1});assert.ok(Math.hypot(m.player.x-x,m.player.z-z)>.15);m.running=false;const stopped=JSON.stringify(m.player);m.update(.1,{forward:1});assert.equal(JSON.stringify(m.player),stopped);
});
check('bank shallows, dry floors and bridges keep a standing weapon pose; deep water uses swimming and exiting restores the selected weapon',()=>{
  const m=swimmer();for(const ground of [WATER_LEVEL-.2,WATER_LEVEL+1,10]){m.player.ground=ground;assert.equal(m.swimming,false);}m.player.ground=0;assert.ok(m.swimming);m.fleet.driverId=0;assert.equal(m.swimming,false);m.fleet.driverId=null;assert.ok(m.swimming);m.reset('training');assert.equal(m.swimming,false);
});
const swim=new SwimView(assets.hands,assets.swimArms),sourceQuaternions=[];assets.hands.scene.traverse(o=>{if(o.isBone)sourceQuaternions.push(o.quaternion.toArray());});
check('two articulated textured gloves stay finite, in front of the camera and visible throughout portrait and landscape strokes',()=>{
  let meshCount=0,textured=0;swim.body.traverse(o=>{if(o.isMesh){meshCount++;if(o.material.map)textured++;if(!o.userData.swimArm)assert.ok(!/skin/i.test(o.material.name));}});assert.equal(meshCount,4);assert.ok(textured>=3);
  for(const aspect of [.6,16/9])for(let i=0;i<40;i++){
    swim.pose(i/40,aspect,1);swim.group.updateMatrixWorld(true);const camera=new THREE.PerspectiveCamera(swimViewFov(aspect),aspect,.02,5);camera.updateMatrixWorld(true);const count={L:0,R:0},visible={L:0,R:0};
    for(const h of swim.hands){const actual=h.control.getWorldPosition(new THREE.Vector3());assert.ok(actual.distanceTo(h.wrist)<.003);const tip=swim.body.getObjectByName('f_middle03'+h.side+'_end').getWorldPosition(new THREE.Vector3());assert.ok(tip.distanceTo(actual)>.16&&tip.distanceTo(actual)<.23,'Anatomical finger reach is preserved');}
    swim.body.traverse(o=>{if(!o.isSkinnedMesh||o.userData.swimArm)return;for(let n=0;n<o.geometry.attributes.position.count;n+=7){const p=o.getVertexPosition(n,new THREE.Vector3()).applyMatrix4(o.matrixWorld);assert.ok(Number.isFinite(p.x+p.y+p.z));assert.ok(p.z<-.20);const side=p.x<0?'L':'R';count[side]++;p.project(camera);if(Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z<1)visible[side]++;}});
    assert.ok((visible.L+visible.R)/(count.L+count.R)>.18,`Alternating dog-paddle gloves disappear at aspect ${aspect}, phase ${i/40}`);
  }
  const after=[];assets.hands.scene.traverse(o=>{if(o.isBone)after.push(o.quaternion.toArray());});assert.deepEqual(after,sourceQuaternions);
});
check('stroke speed differs between swimming and treading; pause freezes bones, and restart does not accumulate deformations',()=>{
  swim.reset();swim.update(.5,{active:true,moving:true});const fast=swim.phase,posed=swim.hands.map(h=>h.hand.quaternion.toArray());swim.update(0,{active:true,moving:true});assert.equal(swim.phase,fast);assert.deepEqual(swim.hands.map(h=>h.hand.quaternion.toArray()),posed);swim.update(.2,{active:false});assert.equal(swim.group.visible,false);swim.reset();swim.update(.5,{active:true,moving:false});assert.ok(swim.phase<fast);swim.pose(.25,.6);const pose=swim.hands.map(h=>h.hand.quaternion.toArray());for(let i=0;i<100;i++)swim.pose(.25,.6);assert.deepEqual(swim.hands.map(h=>h.hand.quaternion.toArray()),pose);
});
check('the shipped camera swaps guns for gloves immediately, clears stale firing/scope effects, and restores the original gun on land',()=>{
  const source=fs.readFileSync(new URL('../dist/game.js',import.meta.url),'utf8'),begin=source.indexOf('function updateCamera('),end=source.indexOf('\nfunction updateEnemies(',begin),m=swimmer(),nodes=new Map(),models=createViewModels(assets,surfaces),effects=[],viewCamera=new THREE.PerspectiveCamera(weaponViewFov(.6),.6,.02,5),camera=new THREE.PerspectiveCamera(75,.6,.08,1000),context=vm.createContext({footSurface,footstepContacts:new FootstepContacts(),
    THREE,match:m,swimView:swim,swimWasActive:false,viewCamera,camera,models,WEAPONS,GRENADE_LOCK_TIME,WATER_LEVEL,clamp,zoomFov,weaponViewPosition,weaponViewFov,swimViewFov,weaponRecoil:new WeaponRecoil(),state:'playing',joy:{forward:1,strafe:0},keys:{},aim:true,adsBlend:1,stepTime:0,lastStep:0,elapsed:0,breath:6,recoil:0,recoilSide:0,flashTime:1,fireHeld:true,fireLatched:true,touchCrouch:true,shellTimers:[{time:.2}],touch:true,graphicsRatio:1,innerWidth:390,innerHeight:844,
    $:id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',style:{},classList:{toggle(){}}});return nodes.get(id);},setAim(value){context.aim=!!value&&!m.swimming;},updateVehicleUI(){},updateDrivingCamera(){swim.group.visible=false;},aimOverlay:{update(){}},audio:{footstep(){},swimStroke(){},trackLock(){}},battleEffects:{impact(p){assert.equal(p.y,WATER_LEVEL);effects.push(p);}}
  });vm.runInContext(source.slice(begin,end),context);swim.reset();m.weapon=1;vm.runInContext('updateCamera(.016)',context);assert.equal(context.aim,false);assert.equal(context.adsBlend,0);assert.equal(context.shellTimers.length,0);assert.equal(context.fireHeld,false);assert.ok(models.roots.every(g=>!g.visible));assert.equal(models.flash.visible,false);assert.equal(swim.group.visible,true);assert.equal(nodes.get('scope').hidden,true);assert.equal(nodes.get('crosshair').hidden,true);
  for(let i=0;i<100;i++)vm.runInContext('updateCamera(.016)',context);assert.ok(effects.length>=2&&effects.length<=4);m.player.ground=10;vm.runInContext('updateCamera(.016)',context);assert.equal(swim.group.visible,false);assert.equal(m.weapon,1);assert.equal(models.roots[1].visible,true);assert.equal(models.roots.filter(g=>g.visible).length,1);assert.equal(nodes.get('crosshair').hidden,false);m.player.ground=0;m.player.hp=0;context.state='result';vm.runInContext('updateCamera(.016)',context);assert.equal(swim.group.visible,false);
});
console.log(`${passed} tire/exhaust/swimming integration and posed-mesh checks passed. Not a browser/device render.`);
