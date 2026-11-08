import assert from 'node:assert/strict';
import {VehicleFleet,vehicleSupport,VEHICLE_WHEELS,vehicleWorld} from '../dist/vehicle-physics.js';
import {terrainSurfaceAt} from '../dist/core.js';

let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function drive(fleet,throttle,seconds=1){fleet.driverId=0;const p={};for(let i=0;i<seconds*120;i++)fleet.update(1/120,{throttle},p,[]);return fleet.cars[0];}
check('ordinary diagonal slopes no longer act as an invisible wall in forward or reverse',()=>{
  for(const yaw of [0,.35,.79,1.57])for(const throttle of [-1,1]){
    const terrain=(x,z)=>100+x*.35+z*.50,f=new VehicleFleet({terrain,spawns:[{x:0,z:0,yaw}]}),c=f.cars[0],heights=VEHICLE_WHEELS.map(w=>{const p=vehicleWorld(c,w.x,w.z);return terrain(p.x,p.z);});
    assert.ok(f.canPlace(c,[]));const before={x:c.x,z:c.z};drive(f,throttle,1.25);assert.ok(Math.hypot(c.x-before.x,c.z-before.z)>4);assert.ok(Math.abs(c.speed)>5.5);assert.ok(Math.abs(c.y-vehicleSupport(c,terrain).support-.025)<1e-9);
    if(yaw===0)assert.ok(Math.max(...heights)-Math.min(...heights)>1.65,'Fixture must reproduce old rejection');
  }
});
check('five previously rejected real island sites allow a vehicle to start and reverse',()=>{
  for(const [x,z,yaw] of [[-215,195,0],[-165,225,0],[-135,-25,.79],[-125,-25,.79],[-115,25,0]])for(const throttle of [-1,1]){
    const f=new VehicleFleet({terrain:terrainSurfaceAt,spawns:[{x,z,yaw}]}),c=f.cars[0];assert.ok(Math.hypot(c.x-x,c.z-z)<.01);assert.ok(f.canPlace(c,[]));drive(f,throttle,.8);assert.ok(Math.hypot(c.x-x,c.z-z)>1.5,`Terrain site ${x},${z} remained stuck`);
  }
});
check('sharp dry banks, an underbody high spot, walls and tree trunks remain physical obstacles',()=>{
  const cliff=new VehicleFleet({terrain:(x,z)=>40+Math.max(0,-z-8)*.9,spawns:[{x:0,z:0,yaw:0}]}),c=drive(cliff,1,5);assert.ok(c.z>-11);
  const f=new VehicleFleet({terrain:()=>20,spawns:[{x:0,z:0,yaw:0}]}),car=f.cars[0];f.terrain=(x,z)=>20+(Math.hypot(x,z)<.25?.8:0);assert.equal(f.canPlace(car,[]),false);
  f.terrain=()=>20;for(const obstacle of [{type:'box',x:0,z:-1.5,y:19,h:5,w:3,d:.2},{type:'circle',x:0,z:-1.5,y:19,h:5,r:.4}])assert.equal(f.canPlace(car,[obstacle]),false);
});
check('tilted support poses stay finite and frame-rate independent without changing the collision hull',()=>{
  const terrain=(x,z)=>60+x*.25+z*.35,run=hz=>{const f=new VehicleFleet({terrain,spawns:[{x:0,z:0,yaw:.4}]});f.driverId=0;for(let i=0;i<hz;i++)f.update(1/hz,{throttle:1,steer:.2},{},[]);return f.current;},a=run(30),b=run(120);
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.001);assert.ok(Number.isFinite(a.y+a.pitch+a.roll));assert.ok(Math.abs(a.pitch)<.68&&Math.abs(a.roll)<.49);assert.equal(a.collider.w,2.08);assert.equal(a.collider.d,3.9);
});
console.log(`${passed} drivable-terrain regressions passed. Exact player-reported positions were not supplied.`);
