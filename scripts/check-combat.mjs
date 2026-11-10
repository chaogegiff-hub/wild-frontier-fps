import assert from 'node:assert/strict';
import {Match,heightAt} from '../dist/core.js';

export function checkCombat(check,world){
  const origin={x:0,y:101,z:0},unit=(a,b)=>{const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z,l=Math.hypot(x,y,z);return {x:x/l,y:y/l,z:z/l};};
  const setup=(events=[])=>{
    const enemy={...world.enemies[0],id:0,x:0,y:100,z:-55,homeX:0,homeZ:-55};
    const m=new Match({...world,colliders:[],enemies:[enemy,{...enemy,id:1,x:80,z:-70}]},e=>events.push(e));m.running=true;m.weapon=1;return m;
  };
  const aim=m=>unit(origin,{x:m.enemies[0].x,y:m.enemies[0].y+.98,z:m.enemies[0].z});
  check('enemy hits deal 2 to 4 points and consume armour before health',()=>{
    const events=[],m=new Match(world,e=>events.push(e)),random=Math.random;m.running=true;m.time=8;
    // This damage-accounting fixture starts in established combat; arrival timing has its own AI tests.
    for(const e of m.enemies){e.x=m.player.x;e.z=m.player.z-10;e.y=m.player.ground;e.yaw=0;m.enemyAI.confirm(e,m.player,m.time);Object.assign(e.ai,{visible:true,sample:{...m.player},sampleAt:m.time,nextSense:m.time+1,sightRate:2,reactionUntil:0});e.shoot=0;e.aimReady=1;e.sees=true;}
    try{Math.random=()=>0;m.update(1/60,{forward:0,strafe:0});}finally{Math.random=random;}
    const hits=events.filter(e=>e.type==='hurt');assert.equal(hits.length,12);assert.deepEqual([...new Set(hits.map(e=>e.amount))].sort(),[2,3,4]);assert.equal(m.player.hp,100);assert.equal(m.player.armour,64);
    m.player.armour=2;m.hurt(4,'敌方射击');assert.equal(m.player.armour,0);assert.equal(m.player.hp,98);
  });
  check('grenade lock needs steady aim and clears on cover, switching or closing aim',()=>{
    const events=[],m=setup(events),dir=aim(m);assert.equal(m.updateGrenadeLock(.14,origin,dir,true).locked,false);assert.ok(m.grenadeLock.progress>0);
    assert.equal(m.updateGrenadeLock(.17,origin,dir,true).locked,true);m.updateGrenadeLock(.1,origin,dir,true);assert.equal(events.filter(e=>e.type==='targetlocked').length,1);
    m.world.colliders.push({type:'box',x:0,y:95,z:-25,w:8,d:1,h:15});assert.equal(m.updateGrenadeLock(.1,origin,dir,true).targetId,null);m.world.colliders=[];
    m.updateGrenadeLock(.7,origin,dir,true);m.updateGrenadeLock(.1,origin,dir,false);assert.equal(m.grenadeLock.locked,false);
    m.updateGrenadeLock(.7,origin,dir,true);m.switchWeapon(2);assert.equal(m.grenadeLock.targetId,null);
    m.weapon=1;m.cooldown=0;m.updateGrenadeLock(.7,origin,dir,true);m.ammo[1].mag=1;m.reload();assert.equal(m.grenadeLock.targetId,null);
  });
  check('a locked grenade follows a moving enemy and explodes once on contact',()=>{
    const events=[],m=setup(events),dir=aim(m);m.updateGrenadeLock(.7,origin,dir,true);assert.ok(m.shoot(dir,origin));assert.equal(m.grenades[0].targetId,0);
    for(let i=0;i<150&&m.grenades.length;i++){m.enemies[0].x+=.045;m.updateGrenades(1/60);}
    assert.equal(m.grenades.length,0);assert.equal(m.enemies[0].alive,false);assert.ok(m.enemies[0].blast.vy>5);assert.equal(events.filter(e=>e.type==='explosion').length,1);assert.equal(events.find(e=>e.type==='explosion').hits,1);
  });
  check('cover stops a homing grenade and a dead target cannot be followed',()=>{
    const events=[],m=setup(events),dir=aim(m);m.updateGrenadeLock(.7,origin,dir,true);m.shoot(dir,origin);m.world.colliders.push({type:'box',x:0,y:95,z:-25,w:10,d:2,h:15});m.updateGrenades(.5);
    assert.equal(m.grenades.length,0);assert.equal(m.enemies[0].hp,100);assert.ok(events.find(e=>e.type==='explosion').point.z>-25);
    const n=setup();n.updateGrenadeLock(.7,origin,aim(n),true);n.shoot(aim(n),origin);n.enemies[0].alive=false;n.updateGrenades(.05);assert.equal(n.grenades[0].targetId,null);assert.ok(Number.isFinite(n.grenades[0].vy));
  });
  check('unlocked grenades hit enemy bodies between frames instead of passing through',()=>{
    const events=[],m=setup(events);m.enemies[0].z=-15;m.shoot(aim(m),origin);assert.equal(m.grenades[0].targetId,null);m.updateGrenades(.3);
    assert.equal(m.grenades.length,0);assert.equal(m.enemies[0].alive,false);assert.equal(events.filter(e=>e.type==='explosion').length,1);
  });
  check('blasts launch bodies, stop at terrain, preserve pause and let survivors recover',()=>{
    const m=setup(),e=m.enemies[0];e.x=-64;e.z=120;e.y=heightAt(e.x,e.z);const start={x:e.x,y:e.y,z:e.z};m.explode({x:e.x-1,y:e.y+.98,z:e.z});assert.ok(e.blast);assert.equal(e.alive,false);
    m.updateBlasts(.3);assert.ok(e.y>start.y+1);assert.ok(e.x>start.x+1);
    m.running=false;const before=JSON.stringify(e);m.update(.5,{});assert.equal(JSON.stringify(e),before);
    for(let i=0;i<400;i++)m.updateBlasts(1/60);assert.equal(e.blast.grounded,true);assert.ok(Math.abs(e.y-heightAt(e.x,e.z))<.01);
    const n=setup(),survivor=n.enemies[0];survivor.x=-64;survivor.z=120;survivor.y=heightAt(-64,120);n.explode({x:-74,y:survivor.y+.98,z:120});assert.ok(survivor.alive&&survivor.blast);for(let i=0;i<400;i++)n.updateBlasts(1/60);assert.equal(survivor.blast,undefined);
  });
}
