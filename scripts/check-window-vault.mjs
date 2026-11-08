import assert from 'node:assert/strict';
import {Match,createWorldData,walkHeight,pointBlocked} from '../dist/core.js';
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function fixture(){
  const events=[],m=new Match(createWorldData(),e=>events.push(e));m.reset('training');m.running=true;const w=m.windows.find(w=>w.id==='0:0:0:0'),p=m.player;
  Object.assign(p,{x:w.x+w.normal.x*1.10,z:w.z+w.normal.z*1.10,yaw:Math.atan2(w.normal.x,w.normal.z)});p.ground=walkHeight(p.x,p.z,m.colliders,w.floorY);p.y=p.ground+1.72;return {m,w,p,events};
}
check('only an opened, nearby, faced window offers a vault; intact glass and wrong IDs remain blocked',()=>{
  const {m,w,p}=fixture();assert.equal(m.nearestVault(),null);m.breakWindow(w);assert.equal(m.nearestVault().window.id,w.id);assert.equal(m.vaultWindow('wrong'),false);p.yaw+=Math.PI;assert.ok(m.nearestVault());assert.equal(m.nearestVault({facing:true}),null);p.x+=4;assert.equal(m.nearestVault(),null);
});
check('actual movement lifts, tucks through the window, lands inside, and never puts the eye through a wall',()=>{
  const {m,w,p,events}=fixture();m.breakWindow(w);const plan=m.nearestVault();assert.ok(m.vaultWindow(w.id));let elevated=false,tucked=false;
  for(let i=0;i<65;i++){m.update(1/60,{forward:0,strafe:0});if(m.vault){elevated||=p.ground>plan.start.feet+.4;tucked||=p.crouch;assert.equal(pointBlocked(p.x,p.y,p.z,m.colliders),false,'Eye crossed a solid window frame');}}
  assert.equal(m.vault,null);assert.ok(elevated&&tucked);assert.ok(Math.hypot(p.x-plan.end.x,p.z-plan.end.z)<1e-7);assert.ok(Math.abs(p.ground-w.floorY)<.001);assert.equal(p.crouch,false);assert.equal(events.filter(e=>e.type==='vaultstart').length,1);assert.equal(events.filter(e=>e.type==='vaultend').length,1);
});
check('vault pause freezes movement; shooting, weapon changes, healing, pickup and entering a car are prevented',()=>{
  const {m,w,p}=fixture();m.breakWindow(w);m.vaultWindow(w.id);m.update(.2,{});const before=JSON.stringify(p),time=m.vault.age;m.running=false;m.update(.5,{forward:1});assert.equal(JSON.stringify(p),before);assert.equal(m.vault.age,time);m.running=true;
  const inventory=JSON.stringify(m.ammo),weapon=m.weapon;m.switchWeapon(1);assert.equal(m.weapon,weapon);assert.equal(m.shoot({x:0,y:0,z:-1},p),false);assert.equal(m.reload(),false);assert.equal(m.heal(),false);assert.equal(m.nearestLoot(),null);assert.equal(m.interactVehicle(),false);assert.equal(JSON.stringify(m.ammo),inventory);m.reset('training');assert.equal(m.vault,null);
});
check('blocked landing, upper-floor drops, distance and moving obstacles cannot turn the vault into teleportation',()=>{
  const {m,w,p,events}=fixture();m.breakWindow(w);const plan=m.nearestVault(),box={type:'box',x:plan.end.x,z:plan.end.z,y:plan.end.feet,w:.8,d:.8,h:2};m.world.colliders.push(box);assert.equal(m.nearestVault(),null);m.world.colliders.pop();assert.ok(m.vaultWindow(w.id));m.update(.15,{});m.world.colliders.push(box);m.update(.5,{});assert.equal(m.vault,null);assert.ok(events.some(e=>e.type==='vaultcancel'));assert.ok(Math.hypot(p.x-plan.start.x,p.z-plan.start.z)<.01);
  const upper=m.windows.find(w=>w.level===1);upper.broken=true;Object.assign(p,{x:upper.x+upper.normal.x,z:upper.z+upper.normal.z,yaw:Math.atan2(upper.normal.x,upper.normal.z)});p.ground=walkHeight(p.x,p.z,m.colliders,0);assert.equal(m.nearestVault(),null);
});
check('space triggers the same action; frame rates agree and a safe opened window also permits an exit',()=>{
  const a=fixture(),b=fixture();a.m.breakWindow(a.w);b.m.breakWindow(b.w);a.m.update(1/30,{jump:true});b.m.update(1/120,{jump:true});assert.ok(a.m.vault&&b.m.vault);for(let i=0;i<36;i++)a.m.update(1/30,{});for(let i=0;i<144;i++)b.m.update(1/120,{});assert.ok(Math.hypot(a.p.x-b.p.x,a.p.z-b.p.z)<1e-8);a.p.yaw+=Math.PI;const exit=a.m.nearestVault();assert.ok(exit?.inside);assert.ok(a.m.vaultWindow(a.w.id));for(let i=0;i<70;i++)a.m.update(1/60,{});assert.ok(Math.hypot(a.p.x-exit.end.x,a.p.z-exit.end.z)<1e-7);
});
console.log(`${passed} actual broken-window entry, collision, pause, exit and inventory checks passed.`);
