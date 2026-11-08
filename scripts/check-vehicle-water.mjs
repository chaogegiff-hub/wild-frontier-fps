import assert from 'node:assert/strict';
import {VehicleFleet} from '../dist/vehicle-physics.js';
import {Match,createWorldData,terrainSurfaceAt} from '../dist/core.js';
let passed=0;const check=(label,fn)=>{fn();passed++;console.log('PASS '+label);};
const person=()=>({x:-1.9,z:0,y:11.72,ground:10}),fleetFor=(floor=-6)=>new VehicleFleet({terrain:(x,z)=>z<-3?floor:10,spawns:[{x:0,z:0,yaw:0}]}),tick=(fleet,p,seconds,input={})=>{for(let i=0;i<seconds*120;i++)fleet.update(1/120,input,p,[]);};
check('driving can cross a shoreline, loses engine power, then settles on the underwater floor',()=>{
  const fleet=fleetFor(),p=person();fleet.enter(p,[]);const car=fleet.current;car.speed=14;let previousY=car.y,wet=false,deep=false;const events=[];
  for(let i=0;i<25*120;i++){fleet.update(1/120,{throttle:1},p,[]);events.push(...fleet.takeEvents());wet||=car.inWater;deep||=car.sinking;assert.ok(previousY-car.y<.04,'Car snapped to the seabed');previousY=car.y;}
  assert.ok(car.z<-3&&wet&&deep&&car.stalled&&car.sunk);assert.ok(Math.abs(car.y+6.095)<.01);assert.equal(events.filter(e=>e.type==='vehiclewater').length,1);assert.equal(events.filter(e=>e.type==='vehiclesinking').length,1);assert.ok(Math.abs(car.speed)<.1);
});
check('a shallow ford can be crossed without flooding and a drowned car cannot be boarded again',()=>{
  const shallow=new VehicleFleet({terrain:(x,z)=>4.4-Math.max(0,Math.min(1.9,(-z-2)*.25)),spawns:[{x:0,z:0,yaw:0}]}),p={x:-1.9,z:0,ground:4.4,y:6.12};shallow.enter(p,[]);shallow.current.speed=14;tick(shallow,p,7,{throttle:1});assert.ok(shallow.current.z<-10);assert.equal(shallow.current.sinking,false);assert.equal(shallow.current.flood,0);
  const deep=fleetFor(),q=person();deep.enter(q,[]);deep.current.speed=14;tick(deep,q,20,{throttle:1});const car=deep.current;const exit=deep.requestExit(q,[]);assert.equal(exit.type,'vehicleexit');assert.equal(deep.nearest(q,[]),null);assert.equal(car.stalled,true);
});
function waterMatch(mode='survival'){
  const events=[],m=new Match({...createWorldData(),colliders:[]},e=>events.push(e));m.reset(mode);m.running=true;m.fleet=fleetFor(-20);m.fleet.driverId=0;Object.assign(m.vehicle,{z:-8,y:2.54});m.fleet.pose(m.vehicle);m.fleet.syncPlayer(m.player);m.enemies=[{...m.world.enemies[0],alive:false}];return {m,events,car:m.vehicle};
}
check('submerged occupants immediately lose health gradually without a countdown, bypassing armour in both modes',()=>{
  for(const mode of ['survival','training']){const {m,car,events}=waterMatch(mode);while(m.drownTime===0)m.update(1/120,{});assert.ok(m.player.hp<100&&m.player.hp>99);const start=m.player.hp;for(let i=0;i<120;i++)m.update(1/120,{});assert.ok(Math.abs(start-m.player.hp-12)<1e-7);assert.equal(m.over,false);while(!m.over)m.update(1/120,{});assert.equal(m.player.hp,0);assert.equal(m.player.armour,100);assert.ok(car.driverDead);assert.equal(m.resultCause,'drowned');assert.equal(events.filter(e=>e.type==='drowned').length,1);assert.equal(events.filter(e=>e.type==='finish').length,1);assert.ok(m.drownTime>8.3&&m.drownTime<8.36);}
});
check('the actual lake shore allows forward and reverse entry on all four banks and complete submersion',()=>{
  for(const [x,z,yaw] of [[26,70,0],[26,-112,Math.PI],[-48,-22,-Math.PI/2],[98,-22,Math.PI/2]])for(const reverse of [false,true]){
    const f=new VehicleFleet({terrain:terrainSurfaceAt,spawns:[{x,z,yaw:yaw+(reverse?Math.PI:0)}]}),c=f.cars[0],p={};f.driverId=0;c.speed=reverse?-6:12;
    for(let i=0;i<35*120;i++)f.update(1/120,{throttle:reverse?-1:1},p,[]);assert.ok(c.inWater&&c.sinking&&c.sunk);assert.ok(c.y<3-1.84);
  }
});
check('escaping after health loss restores the player at the water surface and the abandoned car keeps sinking',()=>{
  const {m,car}=waterMatch();while(m.drownTime<.8&&!m.over)m.update(1/120,{});assert.ok(m.drownTime>0);assert.ok(m.interactVehicle());assert.equal(m.vehicle,null);assert.equal(m.drownTime,0);assert.ok(m.player.y>3);const y=car.y;for(let i=0;i<120;i++)m.update(1/120,{});assert.ok(car.y<y-.5);assert.ok(m.player.hp<100&&m.player.hp>80);const hp=m.player.hp;for(let i=0;i<240;i++)m.update(1/120,{});assert.equal(m.player.hp,hp);assert.equal(m.over,false);
});
check('pause freezes health loss and sinking; result aftermath continues to the bottom; restart clears it all',()=>{
  const {m,car}=waterMatch();for(let i=0;i<6*120;i++)m.update(1/120,{});m.running=false;const before=JSON.stringify({car,p:m.player,time:m.drownTime});m.update(.2,{});assert.equal(JSON.stringify({car,p:m.player,time:m.drownTime}),before);m.running=true;while(!m.over)m.update(1/120,{});const y=car.y;for(let i=0;i<30*120;i++)m.updateAftermath(1/120);assert.ok(car.y<=y&&car.sunk);m.reset('survival');assert.equal(m.drownTime,0);assert.equal(m.resultCause,'');assert.ok(m.fleet.cars.every(c=>!c.inWater&&!c.sinking&&!c.driverDead));
});
console.log(`${passed} water/vehicle checks passed. Browser/device effects not tested.`);
