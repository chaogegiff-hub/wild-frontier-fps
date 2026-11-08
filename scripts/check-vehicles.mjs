import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../dist/vendor/three.module.js';
import {Match,createWorldData,heightAt,terrainSurfaceAt,colliderRay,colliderNormal,circleBlocked,direction,terrainRay,WEAPONS} from '../dist/core.js';
import {VehicleFleet,vehicleWorld} from '../dist/vehicle-physics.js';
import {DrivingControls} from '../dist/vehicle-controls.js';
import {makeVehicleViews} from '../dist/vehicles.js';

let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);},data=createWorldData();
const flat=()=>new VehicleFleet({terrain:()=>10,spawns:[{x:0,z:0,yaw:0}]}),person=()=>({x:-1.9,y:11.72,z:0,ground:10}),drive=(fleet,player,seconds,input,colliders=[])=>{for(let i=0;i<seconds*120;i++)fleet.update(1/120,input,player,colliders);};
check('three permanent vehicles spawn on dry, unblocked terrain with one near deployment',()=>{
  const m=new Match(data);assert.equal(m.fleet.cars.length,3);assert.ok(Math.hypot(m.fleet.cars[0].x-m.player.x,m.fleet.cars[0].z-m.player.z)<6);
  for(const car of m.fleet.cars){assert.ok(car.y>3);assert.ok(m.fleet.canPlace(car,data.colliders));assert.ok(Number.isFinite(car.pitch+car.roll));}
});
check('entering cancels infantry actions, preserves equipment and exiting restores a safe standing pose',()=>{
  const events=[],m=new Match(data,e=>events.push(e)),car=m.fleet.cars[0];m.running=true;m.player.hp=74;m.player.armour=53;m.healTime=2;m.reloadTime=1;
  Object.assign(m.player,{x:car.x-1.85,z:car.z,ground:car.y,y:car.y+1.72});const ammo=JSON.stringify(m.ammo),slot=m.weapon;
  assert.ok(m.interactVehicle());assert.equal(m.vehicle.id,0);assert.equal(m.healTime,0);assert.equal(m.reloadTime,0);assert.equal(m.shoot(direction(0,0),m.player),false);assert.equal(m.reload(),false);assert.equal(m.heal(),false);m.switchWeapon(2);assert.equal(m.weapon,slot);
  assert.ok(m.interactVehicle());assert.equal(m.vehicle,null);assert.equal(m.player.hp,74);assert.equal(m.player.armour,53);assert.equal(JSON.stringify(m.ammo),ammo);assert.equal(m.player.jump,0);assert.ok(!circleBlocked(m.player.x,m.player.z,.38,m.colliders));assert.ok(Math.abs(m.player.y-terrainSurfaceAt(m.player.x,m.player.z)-1.72)<1e-9);assert.deepEqual(events.map(e=>e.type),['vehicleenter','vehicleexit']);
});
check('forward, reverse, steering, wheel rotation and brakes use a stable vehicle simulation',()=>{
  const fleet=flat(),p=person();fleet.enter(p,[]);const car=fleet.current;drive(fleet,p,2,{throttle:1});assert.ok(car.speed>10&&car.speed<15);assert.ok(car.z<-10);assert.ok(car.wheelAngle<-20);
  drive(fleet,p,1,{throttle:1,steer:1});assert.ok(car.x>1&&car.yaw<-.1);drive(fleet,p,1,{brake:true});assert.equal(car.speed,0);const previous={x:car.x,z:car.z,angle:car.wheelAngle,yaw:car.yaw};
  drive(fleet,p,1,{throttle:-1});assert.ok(car.speed<0);assert.ok((car.x-previous.x)*-Math.sin(previous.yaw)+(car.z-previous.z)*-Math.cos(previous.yaw)<0);assert.ok(car.wheelAngle>previous.angle);assert.equal(p.x,car.x);assert.equal(p.y,car.y+1.5);
  const a=flat(),b=flat(),pa=person(),pb=person();a.enter(pa,[]);b.enter(pb,[]);for(let i=0;i<60;i++)a.update(1/30,{throttle:1,steer:.4},pa,[]);for(let i=0;i<240;i++)b.update(1/120,{throttle:1,steer:.4},pb,[]);assert.ok(Math.hypot(a.current.x-b.current.x,a.current.z-b.current.z)<.001);
});
check('240 and 360 Hz frames can start, stop and reverse instead of rounding powered acceleration to zero',()=>{
  for(const hz of [60,144,240,360]){const f=flat(),p=person();f.enter(p,[]);for(let i=0;i<hz;i++)f.update(1/hz,{throttle:1},p,[]);assert.ok(f.current.z< -3&&f.current.speed>6.7);for(let i=0;i<hz*2;i++)f.update(1/hz,{throttle:-1},p,[]);assert.ok(f.current.speed< -5);}
});
check('a car can reverse along a wall when its requested corner rotation is blocked, without entering that wall',()=>{
  for(const side of [-1,1]){const f=flat(),p=person();f.enter(p,[]);const c=f.current;c.steer=-side*.48;c.speed=-2;const wall={type:'box',x:side*1.112,z:0,y:8,w:.1,d:50,h:8};for(let i=0;i<180;i++){f.update(1/120,{throttle:-1,steer:-side},p,[wall]);assert.ok(f.canPlace(c,[wall]));}assert.ok(c.z>5&&c.speed< -5);assert.ok(Math.abs(c.x)<.02);}
});
check('a fast vehicle cannot pass through walls, tree trunks, other cars or steep dry banks',()=>{
  for(const obstacle of [{type:'box',x:0,z:-12,y:10,w:8,d:.3,h:10},{type:'circle',x:0,z:-12,y:10,r:.4,h:10}]){const fleet=flat(),p=person();fleet.enter(p,[]);drive(fleet,p,6,{throttle:1},[obstacle]);assert.ok(fleet.current.z>-10);assert.ok(fleet.current.speed<1);}
  const fleet=new VehicleFleet({terrain:()=>10,spawns:[{x:0,z:0,yaw:0},{x:0,z:-12,yaw:.6}]}),p=person();fleet.enter(p,[]);drive(fleet,p,6,{throttle:1});assert.ok(fleet.current.z>-8);
  for(const terrain of [(x,z)=>10+Math.max(0,-z-8)*.9]){const f=new VehicleFleet({terrain,spawns:[{x:0,z:0,yaw:0}]}),p=person();f.enter(p,[]);drive(f,p,6,{throttle:1});assert.ok(f.current.z>-11);}
});
check('exit while moving brakes first, finds the free side, and refuses a fully blocked exit',()=>{
  const fleet=flat(),p=person();fleet.enter(p,[]);fleet.current.speed=14;const left={type:'box',x:-1.8,z:0,y:8,w:.5,d:200,h:8};assert.equal(fleet.requestExit(p,[left]).type,'vehiclestopping');assert.ok(fleet.current&&fleet.exitPending);
  let event;for(let i=0;i<240&&fleet.current;i++)event=fleet.update(1/120,{throttle:1},p,[left]);assert.equal(fleet.current,null);assert.equal(event.type,'vehicleexit');assert.ok(p.x>1.5);assert.equal(fleet.cars[0].speed,0);
  const blocked=flat(),q=person();blocked.enter(q,[]);const before={x:q.x,y:q.y,z:q.z};const result=blocked.requestExit(q,[{type:'box',x:0,z:0,y:0,w:20,d:20,h:30}]);assert.equal(result.type,'vehicleexitblocked');assert.ok(blocked.current);assert.deepEqual({x:q.x,y:q.y,z:q.z},before);
});
check('vehicle collision hulls rotate with the car and also block walking and projectiles',()=>{
  const m=new Match(data),car=m.fleet.cars[0],c=car.collider;c.yaw=Math.PI/4;
  const a=vehicleWorld(c,-5,0),dir={x:Math.cos(c.yaw),y:0,z:-Math.sin(c.yaw)},d=colliderRay({...a,y:c.y+.5},dir,c);assert.ok(Math.abs(d-(5-c.w/2))<1e-9);assert.ok(circleBlocked(c.x,c.z,.38,m.colliders));
  const p=vehicleWorld(c,-c.w/2,0),normal=colliderNormal(c,{...p,y:c.y+.5});assert.ok(Math.abs(normal.x+Math.cos(c.yaw))<1e-9);assert.ok(Math.abs(normal.z-Math.sin(c.yaw))<1e-9);
});
check('pause freezes a driven vehicle and restarting resets every parked car and driver state',()=>{
  const m=new Match(data);m.running=true;const c=m.fleet.cars[0];Object.assign(m.player,{x:c.x-1.85,z:c.z,ground:c.y,y:c.y+1.72});m.interactVehicle();m.update(.2,{vehicleThrottle:1});m.running=false;const state=JSON.stringify(m.fleet);m.update(.5,{vehicleThrottle:1});assert.equal(JSON.stringify(m.fleet),state);m.reset('training');assert.equal(m.vehicle,null);assert.ok(m.fleet.cars.every(v=>v.speed===0&&v.wheelAngle===0));assert.equal(m.fleet.cars[0].z,145);
});

function ramSetup(speed=9,{side=0,behind=false,mode='training'}={}){
  const events=[],m=new Match({...data,colliders:[]},e=>events.push(e));m.reset(mode);m.running=true;
  m.fleet=new VehicleFleet({terrain:terrainSurfaceAt,spawns:[{x:-64,z:146,yaw:0}]});m.fleet.driverId=0;
  const car=m.vehicle;car.speed=speed;m.fleet.syncPlayer(m.player);const x=car.x+side,z=car.z+(behind?3.2:-3.2);
  const enemy={...data.enemies[0],id:0,x,z,y:heightAt(x,z),hp:100,alive:true,homeX:x,homeZ:z,walk:0,phase:0,shoot:Infinity,alert:0};m.enemies=[enemy];return {m,car,enemy,events};
}
function stepRam(m,seconds,input={},dt=1/60){for(let t=0;t<seconds-1e-8;t+=dt)m.update(dt,input);}
check('forward and reverse bumper hits knock down one enemy once without changing bullet accuracy',()=>{
  for(const speed of [9,-6]){
    const {m,enemy,events}=ramSetup(speed,{behind:speed<0});stepRam(m,.6);assert.ok(enemy.blast?.kind==='vehicle');assert.ok(enemy.hp<100&&enemy.alive);assert.equal(events.filter(e=>e.type==='vehiclehit').length,1);assert.equal(m.hits,0);assert.equal(m.bulletShots,0);assert.equal(m.headshots,0);
  }
});
check('120 Hz contact checks catch a fast pass even inside a long frame and register a vehicle kill once',()=>{
  for(const dt of [1/120,1/30,.25]){
    const {m,enemy,events}=ramSetup(21,{mode:'survival'});stepRam(m,.5,{},dt);assert.equal(enemy.alive,false);assert.equal(m.kills,1);assert.equal(events.filter(e=>e.type==='vehiclehit').length,1);assert.equal(events.filter(e=>e.type==='kill'&&e.cause==='vehicle').length,1);assert.ok(m.over);assert.equal(m.headshots,0);
  }
});
check('a parked car, a slow nudge, a clear miss and a wall between car and target do not knock enemies down',()=>{
  for(const speed of [0,1.2]){const {m,events}=ramSetup(speed);stepRam(m,.8);assert.equal(events.filter(e=>e.type==='vehiclehit').length,0);}
  const miss=ramSetup(15,{side:2});stepRam(miss.m,.6);assert.equal(miss.events.filter(e=>e.type==='vehiclehit').length,0);
  const wall=ramSetup(18);wall.m.world.colliders.push({type:'box',x:wall.car.x,z:wall.car.z-2.55,y:wall.car.y-1,w:6,d:.3,h:8});stepRam(wall.m,.8,{vehicleThrottle:1});assert.equal(wall.events.filter(e=>e.type==='vehiclehit').length,0);assert.equal(wall.enemy.hp,100);
  const upper=ramSetup(12);upper.enemy.y=upper.car.y+6;upper.enemy.x=upper.car.x;upper.enemy.z=upper.car.z-2;upper.m.vehicleContacts(upper.car,{x:upper.car.x,z:upper.car.z+.1},1/120);assert.equal(upper.enemy.hp,100);
});
check('a surviving impact slides, stays down, recovers, and cannot be damaged repeatedly by the same overlap',()=>{
  const {m,car,enemy,events}=ramSetup(8);while(!enemy.blast&&m.time<1)m.update(1/60,{});assert.ok(enemy.blast);const hp=enemy.hp,hitZ=enemy.z;
  stepRam(m,.6,{vehicleBrake:true});assert.ok(enemy.z<hitZ-.8);assert.equal(enemy.hp,hp);assert.equal(events.filter(e=>e.type==='vehiclehit').length,1);
  while(!enemy.blast.grounded&&m.time<3)m.update(1/60,{vehicleBrake:true});assert.ok(enemy.blast.grounded);stepRam(m,.4,{vehicleBrake:true});assert.ok(enemy.blast&&enemy.alive,'Survivor must remain down before getting up');
  stepRam(m,2.5,{vehicleBrake:true});assert.equal(enemy.blast,undefined);assert.ok(enemy.alive&&enemy.hp===hp);assert.equal(car.speed,0);assert.ok(Math.abs(enemy.y-heightAt(enemy.x,enemy.z))<.01);
});
check('pause and restart also freeze and clear vehicle knockdowns',()=>{
  const {m,enemy}=ramSetup(8);while(!enemy.blast&&m.time<1)m.update(1/60,{});assert.ok(enemy.blast);m.running=false;const before=JSON.stringify({enemy,fleet:m.fleet,time:m.time});m.update(.5,{vehicleThrottle:1});assert.equal(JSON.stringify({enemy,fleet:m.fleet,time:m.time}),before);m.reset('training');assert.ok(m.enemies.every(e=>!e.blast&&!e.ramImmuneUntil&&e.hp===100));
});
check('a knocked-down body cannot slide or fly through a solid wall',()=>{
  const {m,enemy}=ramSetup(9),wall={type:'box',x:enemy.x,z:enemy.z-2,y:enemy.y-1,w:8,d:.4,h:8};m.world.colliders.push(wall);
  while(!enemy.blast&&m.time<1)m.update(1/60,{});assert.ok(enemy.blast);stepRam(m,2,{vehicleBrake:true});assert.ok(enemy.z>wall.z+.42,'Body crossed the wall during flight or ground sliding');assert.ok(enemy.alive);
});

class Element{
  constructor(id){this.id=id;this.hidden=false;this.dataset={};this.listeners=new Map();this.style={};const values=new Set();this.classList={add:n=>values.add(n),remove:n=>values.delete(n),contains:n=>values.has(n),toggle(n,on){on?values.add(n):values.delete(n);}};}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
  setPointerCapture(){}fire(type,fields={}){for(const fn of this.listeners.get(type)||[])fn({preventDefault(){},...fields});}
}
check('actual touch controls support two fingers and disappear immediately after exiting or pausing',()=>{
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);},buttons=['forward','reverse','left','right'].map(action=>{const e=get(action);e.dataset.drive=action;return e;}),root={body:new Element('body'),getElementById:get,querySelectorAll:()=>buttons};
  const m=new Match(data);m.reset('training');m.running=true;const c=m.fleet.cars[0];Object.assign(m.player,{x:c.x-1.85,z:c.z,ground:c.y,y:c.y+1.72});let ui;
  const render=(playing=true)=>ui.render({playing,active:true,vehicle:m.vehicle,nearby:m.nearbyVehicle(),exitPending:m.fleet.exitPending});ui=new DrivingControls(root,()=>{m.interactVehicle();render();});render();assert.equal(get('vehicleEnter').hidden,false);assert.equal(get('drivingControls').hidden,true);
  get('vehicleEnter').fire('click');assert.ok(m.vehicle);assert.equal(get('drivingControls').hidden,false);assert.ok(root.body.classList.contains('driving'));
  get('forward').fire('pointerdown',{pointerId:1});get('right').fire('pointerdown',{pointerId:2});assert.deepEqual(ui.sample(),{throttle:1,steer:1});get('right').fire('pointercancel',{pointerId:2});assert.equal(ui.sample().steer,0);
  render(false);assert.equal(get('drivingControls').hidden,true);assert.deepEqual(ui.sample(),{throttle:0,steer:0});render();get('vehicleExit').fire('click');assert.equal(m.vehicle,null);assert.equal(get('drivingControls').hidden,true);assert.ok(!root.body.classList.contains('driving'));assert.equal(get('vehicleEnter').hidden,false);
});
check('only four driving keys are exposed and each thumb can slide between its two directions',()=>{
  const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');assert.deepEqual([...html.matchAll(/data-drive="([^"]+)"/g)].map(m=>m[1]).sort(),['forward','left','reverse','right']);
  const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);},buttons=['forward','reverse','left','right'].map(action=>{const b=get(action);b.dataset.drive=action;b.closest=()=>b;return b;}),root={body:new Element('body'),getElementById:get,querySelectorAll:()=>buttons,elementFromPoint:()=>get('right')},ui=new DrivingControls(root,()=>{});ui.render({playing:true,active:true,vehicle:{speed:0,name:'4×4'}});
  get('forward').fire('pointerdown',{pointerId:1});get('left').fire('pointerdown',{pointerId:2});get('left').fire('pointermove',{pointerId:2,clientX:1,clientY:1});assert.deepEqual(ui.sample(),{throttle:1,steer:1});root.elementFromPoint=()=>get('reverse');get('forward').fire('pointermove',{pointerId:1,clientX:1,clientY:1});assert.deepEqual(ui.sample(),{throttle:-1,steer:1});get('forward').fire('pointerup',{pointerId:1});get('left').fire('lostpointercapture',{pointerId:2});assert.deepEqual(ui.sample(),{throttle:0,steer:0});
});
check('a separate horn can be held with steering and always releases on cancel, exit or flooding',()=>{
  const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);},buttons=['forward','reverse','left','right'].map(action=>{const b=get(action);b.dataset.drive=action;return b;}),root={body:new Element('body'),getElementById:get,querySelectorAll:()=>buttons},ui=new DrivingControls(root,()=>{}),v={speed:0,name:'4×4'};
  ui.render({playing:true,active:true,vehicle:v});get('forward').fire('pointerdown',{pointerId:1});get('vehicleHorn').fire('pointerdown',{pointerId:3});assert.ok(ui.honking);assert.equal(ui.sample().throttle,1);get('vehicleHorn').fire('pointercancel',{pointerId:3});assert.ok(!ui.honking);assert.equal(ui.sample().throttle,1);
  get('vehicleHorn').fire('pointerdown',{pointerId:3});ui.render({playing:true,active:true,vehicle:null});assert.ok(!ui.honking);assert.equal(get('drivingControls').hidden,true);ui.render({playing:true,active:true,vehicle:{...v,stalled:true}});get('vehicleHorn').fire('pointerdown',{pointerId:4});assert.ok(!ui.honking);assert.ok(get('vehicleHorn').disabled);
});

const {localModel}=await import('./local-assets.mjs'),[vehicle,soldier]=await Promise.all([localModel('models/jeep/model.gltf'),localModel('models/rocketbox-soldier/model.gltf')]),assets={vehicle,soldier},m=new Match(data),views=makeVehicleViews(assets,m.fleet);
check('licensed vehicle geometry preserves full detail, transparent glass, real dimensions and four wheel pivots',()=>{
  let triangles=0;vehicle.scene.traverse(o=>{if(o.isMesh)triangles+=o.geometry.index.count/3;});assert.ok(triangles>18000&&triangles<20000);const box=new THREE.Box3().setFromObject(vehicle.scene),size=box.getSize(new THREE.Vector3());assert.ok(Math.abs(size.z-3.98)<.02);assert.ok(Math.abs(size.x-2.12)<.02);assert.ok(Math.abs(box.min.y)<.001);
  assert.equal(views.items.length,3);for(const item of views.items){assert.equal(item.wheels.length,4);assert.equal(item.wheels.filter(w=>w.front).length,2);}assert.equal(views.items[0].model.getObjectByName('body_jeep_0').geometry,views.items[1].model.getObjectByName('body_jeep_0').geometry);
  const glass=views.items[0].model.getObjectByName('glass_jeepwindows_0').material;assert.ok(glass.transparent&&glass.opacity<1);assert.equal(glass.alphaTest,0);
});
check('rolling and steering animate actual tires; only the occupied car shows a seated, independent driver',()=>{
  const c=m.fleet.cars[0];m.fleet.driverId=0;m.fleet.update(.2,{throttle:1,steer:.7},m.player,m.worldColliders);views.update(.016,m.fleet);assert.equal(views.items.filter(v=>v.driver.visible).length,1);const item=views.items[0];assert.ok(item.wheels.every(w=>w.node.rotation.x===c.wheels[w.name].spin));assert.ok(item.wheels.every(w=>Math.abs(w.node.rotation.y-c.wheels[w.name].steer)<1e-10));assert.ok(Math.abs(c.wheels['front-right'].steer)>Math.abs(c.wheels['front-left'].steer));
  assert.notEqual(item.driver.getObjectByName('Bip01_R_Hand'),views.items[1].driver.getObjectByName('Bip01_R_Hand'));item.root.updateMatrixWorld(true);const inverse=item.root.matrixWorld.clone().invert();let vertices=0;
  for(const side of ['L','R']){const ankle=item.driver.getObjectByName(`Bip01_${side}_Foot`).getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse),knee=item.driver.getObjectByName(`Bip01_${side}_Calf`).getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);assert.ok(ankle.y>.51&&ankle.y<.61&&ankle.z>-.20&&ankle.z<-.08,'Ankle stays inside the footwell, above the floor');assert.ok(knee.y>.78&&knee.z<.25,'Seated knees bend forward instead of hanging below the car');}
  item.driver.traverse(o=>{if(o.isSkinnedMesh){for(let i=0;i<o.geometry.attributes.position.count;i+=37){const p=new THREE.Vector3();o.getVertexPosition(i,p);p.applyMatrix4(o.matrixWorld).applyMatrix4(inverse);assert.ok(Number.isFinite(p.x+p.y+p.z));assert.ok(Math.abs(p.x)<1.4&&p.y>-.2&&p.y<2.2&&Math.abs(p.z)<1.7);vertices++;}}});assert.ok(vertices>50);
  m.fleet.driverId=null;views.update(.016,m.fleet);assert.equal(views.items.filter(v=>v.driver.visible).length,0);assert.ok(views.items.every(v=>v.root.visible));
});
check('the shipped chase camera follows the car, clears weapon sights and stays above terrain',()=>{
  const source=fs.readFileSync(new URL('../dist/game.js',import.meta.url),'utf8'),start=source.indexOf('function updateDrivingCamera('),end=source.indexOf('\nfunction updateCamera(',start),camera=new THREE.PerspectiveCamera(74,.6,.08,1000),elements=new Map();m.fleet.driverId=0;
  const models={roots:[{visible:true},{visible:true},{visible:true}],flash:{visible:true}},context=vm.createContext({THREE,match:m,terrainSurfaceAt,terrainRay,camera,models,swimView:null,driveCameraReady:false,driveLookYaw:0,driveLookPitch:0,lookControls:null,adsBlend:1,aimOverlay:{update({active}){assert.equal(active,false);}},$:id=>{if(!elements.has(id))elements.set(id,{hidden:false});return elements.get(id);}});vm.runInContext(source.slice(start,end),context);vm.runInContext('updateDrivingCamera(1/60)',context);
  assert.ok(camera.position.y>terrainSurfaceAt(camera.position.x,camera.position.z)+.4);assert.ok(models.roots.every(v=>!v.visible));assert.equal(elements.get('scope').hidden,true);assert.equal(elements.get('crosshair').hidden,true);assert.equal(camera.fov,74);const target=new THREE.Vector3(m.vehicle.x,m.vehicle.y+1.15,m.vehicle.z).project(camera);assert.ok(Math.hypot(target.x,target.y)<1e-6);
});
check('the seated driver slumps after drowning without accumulating bone rotations and recovers on reset',()=>{
  m.fleet.driverId=0;const car=m.fleet.cars[0],item=views.items[0],head=item.driver.getObjectByName('Bip01_Head');car.driverDead=false;views.update(0,m.fleet);const rest=head.quaternion.clone();car.driverDead=true;for(let i=0;i<120;i++)views.update(1/60,m.fleet);const angle=head.quaternion.angleTo(rest);assert.ok(angle>.2&&angle<.8);for(let i=0;i<120;i++)views.update(1/60,m.fleet);assert.ok(Math.abs(head.quaternion.angleTo(rest)-angle)<.02);car.driverDead=false;views.update(0,m.fleet);assert.ok(head.quaternion.angleTo(rest)<1e-6);
});
console.log(`${passed} vehicle checks passed. Browser 3D and iPhone driving have not been tested.`);
