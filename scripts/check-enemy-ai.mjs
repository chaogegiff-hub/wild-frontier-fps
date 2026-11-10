import assert from 'node:assert/strict';
import {EnemyDirector} from '../dist/enemy-ai.js';
import {Match,createWorldData,ENEMY_BODY,ENEMY_SCALE,colliderRay,circleBlocked} from '../dist/core.js';
import {EnemyChatter} from '../dist/enemy-chatter.js';

let passed=0;
const check=(label,fn)=>{fn();passed++;console.log('PASS '+label);};
const enemy=(id=0,x=0,z=0,yaw=0)=>({id,x,y:10,z,homeX:x,homeZ:z,phase:0,yaw,hp:100,alive:true,shoot:0,rounds:30,reloadRemaining:0,reloadDuration:2.6,aimReady:0,walk:0});
const rayClear=(a,b,colliders)=>{
  const len=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);if(!len)return true;
  const dir={x:(b.x-a.x)/len,y:(b.y-a.y)/len,z:(b.z-a.z)/len};
  return colliders.every(c=>colliderRay(a,dir,c)>=len-.05);
};
function fixture({enemies=[enemy()],player={x:0,y:11.72,z:30,crouch:false},colliders=[]}={}){
  const events=[],hits=[],ai=new EnemyDirector({lineClear:rayClear,walkHeight:()=>10,circleBlocked,waterLevel:3,enemyScale:ENEMY_SCALE,body:ENEMY_BODY,
    moveGround(e,dx,dz,cs,r){if(!circleBlocked(e.x+dx,e.z,r,cs,e.y))e.x+=dx;if(!circleBlocked(e.x,e.z+dz,r,cs,e.y))e.z+=dz;}});
  const match={time:10,mode:'survival',player,colliders,enemies,vehicle:null,over:false,zoneCenter:{x:0,z:0},zoneRadius:278,
    onEvent(e){events.push({...e,at:match.time});},breakGlassAlong(){},hurt(amount,cause){hits.push({amount,cause});},damageVehicle(car,amount){car.hp-=amount;}};
  return {ai,match,events,hits,e:enemies[0],tick(seconds,dt=1/60,input={}){for(let t=0;t<seconds-1e-8;t+=dt){match.time+=dt;ai.update(match,dt,input);}}};
}
const prime=f=>{const {e,ai,match:m}=f;ai.confirm(e,m.player,m.time);const a=ai.state(e);a.reactionUntil=0;a.visible=true;a.sample={...m.player};a.sampleAt=m.time;a.sightRate=2;a.nextSense=m.time+1;e.aimReady=1;e.shoot=0;e.sees=true;return a;};

check('a quiet player behind a guard is not detected by distance alone',()=>{
  const f=fixture({player:{x:0,y:11.72,z:-20,crouch:true}});f.tick(.4);
  assert.equal(f.e.sees,false);assert.equal(f.e.ai.contact,false);assert.equal(f.events.length,0);assert.equal(f.e.ai.lastKnown,null);
});
check('visible arrival produces suspicion, then recognition, a turn/raise delay, and only then fire',()=>{
  const f=fixture();f.tick(.1);assert.equal(f.e.aiState,'suspicious');assert.equal(f.e.sees,false);assert.ok(f.e.awareness>0&&f.e.awareness<1);assert.equal(f.events.length,0);
  f.tick(.35);assert.equal(f.e.sees,true);assert.equal(f.e.aiState,'alert');assert.equal(f.events.length,0);
  f.tick(.8);assert.ok(f.events.some(e=>e.type==='enemyfire'));assert.ok(f.events[0].at>=10.75);assert.ok(f.e.weaponReady>.9);
});
check('crouching and peripheral exposure take longer to confirm than a central standing target',()=>{
  const recognize=(crouch,x=0)=>{const f=fixture({player:{x,y:11.72,z:40,crouch}});for(let i=0;i<240&&!f.e.sees;i++)f.tick(1/120,1/120);assert.ok(f.e.sees);return f.match.time-10;};
  assert.ok(recognize(true)>recognize(false)+.12);assert.ok(recognize(false,50)>recognize(false)+.1);
});
check('a solid wall prevents recognition, fire, and false discovery speech',()=>{
  const f=fixture({colliders:[{type:'box',x:0,y:10,z:15,w:40,d:1,h:8}]}),lines=[],chatter=new EnemyChatter({speak:l=>{lines.push(l);return 1;}});
  f.ai.noise(f.match.player,'shot',185,f.match.time);f.tick(.6);chatter.update(.1,f.match);
  assert.equal(f.e.sees,false);assert.equal(f.e.ai.contact,false);assert.equal(f.e.aiState,'investigate');assert.equal(lines.length,0);assert.equal(f.events.length,0);
});
check('a shot behind a guard creates an uncertain sound cue and a bounded turn, not instant sight',()=>{
  const f=fixture({player:{x:0,y:11.72,z:-30,crouch:false}}),yaw=f.e.yaw;
  f.ai.noise(f.match.player,'shot',185,f.match.time);f.tick(1/60);
  assert.equal(f.e.aiState,'investigate');assert.equal(f.e.sees,false);assert.ok(f.e.ai.heard);assert.notDeepEqual(f.e.ai.heard,f.match.player);
  assert.ok(Math.abs(f.e.yaw-yaw)<=2.65/60+1e-8);assert.equal(f.e.ai.lastKnown,null);assert.equal(f.events.length,0);
});
check('wall attenuation prevents a distant muffled sound from alerting every enemy',()=>{
  const f=fixture({player:{x:0,y:11.72,z:-80,crouch:true},colliders:[{type:'box',x:0,y:10,z:-40,w:40,d:1,h:8}]});
  f.ai.noise(f.match.player,'shot',185,f.match.time);f.tick(.2);assert.equal(f.e.ai.heard,null);
});
check('lost targets are searched at their last observed position without tracking hidden movement',()=>{
  const f=fixture(),a=prime(f);f.tick(.1);const known={...a.lastKnown};f.match.colliders.push({type:'box',x:0,y:10,z:8,w:200,d:1,h:8});
  f.match.player.x=70;f.match.player.z=50;f.tick(1.2);
  assert.equal(f.e.sees,false);assert.equal(f.e.aiState,'search');assert.deepEqual(a.lastKnown,known);assert.equal(a.heard,null);assert.equal(f.e.lookYaw,Math.max(-.85,Math.min(.85,Math.atan2(known.x-f.e.x,known.z-f.e.z)-f.e.yaw)));
  const fire=f.events.length;f.tick(1);assert.equal(f.events.length,fire);
});
check('search memory expires and the guard returns to patrol instead of pursuing forever',()=>{
  const f=fixture(),a=prime(f);f.match.player={x:0,y:11.72,z:500,crouch:true};a.visible=false;a.nextSense=0;f.tick(20);
  assert.equal(a.contact,false);assert.equal(a.lastKnown,null);assert.equal(f.e.aiState,'patrol');assert.equal(f.e.sees,false);
});
check('contact reports arrive after a delay and only give nearby allies an investigation cue',()=>{
  const f=fixture({enemies:[enemy(0),enemy(1,10,0,Math.PI),enemy(2,100,0,Math.PI)]});f.tick(.6);
  assert.ok(f.e.sees);assert.equal(f.match.enemies[1].ai.heard,null);f.tick(.65);
  const near=f.match.enemies[1],far=f.match.enemies[2];assert.ok(near.ai.heard);assert.equal(near.sees,false);assert.equal(near.ai.contact,false);assert.equal(near.ai.lastKnown,null);assert.equal(far.ai.heard,null);
});
check('fresh shot visibility blocks a cached visible target after a wall appears',()=>{
  const f=fixture();prime(f);f.match.colliders.push({type:'box',x:0,y:10,z:15,w:20,d:1,h:8});f.tick(1/60);
  assert.equal(f.events.length,0);assert.equal(f.hits.length,0);assert.equal(f.e.rounds,30);
});
check('enemies fire short bursts with a distinct recovery gap',()=>{
  const f=fixture();prime(f);f.tick(4);const times=f.events.filter(e=>e.type==='enemyfire').map(e=>e.at);
  assert.ok(times.length>=4&&times.length<=6,JSON.stringify(times));assert.ok(times[1]-times[0]<.3);assert.ok(times[2]-times[1]>=1.5);
});
check('an empty magazine and an injury both interrupt firing without consuming extra rounds',()=>{
  const f=fixture();prime(f);f.e.rounds=1;f.tick(1/60);assert.equal(f.e.rounds,0);assert.ok(f.e.reloadRemaining>2.5);const n=f.events.length;f.tick(2.4);assert.equal(f.events.length,n);
  f.tick(.3);assert.ok(f.e.rounds>0);const afterReload=f.events.length;f.e.shoot=0;f.e.aimReady=1;f.e.hitReact=1;f.ai.startle(f.e,f.match.time);f.tick(.15);assert.equal(f.events.length,afterReload);assert.ok(f.e.hitReact>0);
});
check('only a visible vehicle is attacked and the hull takes the damage',()=>{
  const f=fixture(),car={x:0,z:30,speed:0,hp:100,collider:{y:10,h:2}};f.match.vehicle=car;prime(f);const old=Math.random;
  try{Math.random=()=>0;f.tick(1/60);}finally{Math.random=old;}
  assert.equal(car.hp,98);assert.equal(f.hits.length,0);assert.equal(f.events[0].type,'enemyfire');
});
check('a reachable hiding point must block sight and cannot lie inside cover or water',()=>{
  const f=fixture({enemies:[enemy(0,3,0)],colliders:[{type:'box',x:0,y:10,z:5,w:3,d:2,h:4}]});
  const p=f.ai.coverPoint(f.e,{x:0,y:11.72,z:20},f.match.colliders);assert.ok(p);
  assert.equal(circleBlocked(p.x,p.z,.5,f.match.colliders,p.y),false);assert.equal(rayClear({...p,y:p.y+1.35},{x:0,y:11.72,z:20},f.match.colliders),false);
  f.ai.walkHeight=()=>1;assert.equal(f.ai.coverPoint(f.e,{x:0,y:11.72,z:20},f.match.colliders),null);
});
check('a hurt guard holds temporary cover, then peeks rather than immediately charging through it',()=>{
  const f=fixture(),a=prime(f);a.cover={x:0,y:10,z:-2};a.coverUntil=f.match.time+1;a.visible=false;a.nextSense=Infinity;
  f.tick(.5);assert.equal(f.e.aiState,'cover');f.tick(.6);assert.equal(f.e.aiState,'peek');f.tick(2);assert.equal(f.e.aiState,'search');
});
check('paired guards make one bounded flank rather than orbiting the current player forever',()=>{
  const f=fixture({enemies:[enemy(1),enemy(0,8,0)]});prime(f);f.ai.confirm(f.match.enemies[1],f.match.player,f.match.time);
  const goal={...f.ai.plan(f.e,f.match,f.match.time)};assert.equal(f.e.ai.flanks,1);assert.ok(Math.hypot(goal.x,goal.z)<9);
  f.match.player.x=100;f.match.time+=3;assert.deepEqual(f.ai.plan(f.e,f.match,f.match.time),goal);assert.equal(f.e.ai.flanks,1);
});
check('footstep ranges distinguish crouching, walking and sprinting and teleports emit no step',()=>{
  for(const [crouch,sprint,radius] of [[true,false,4.5],[false,false,12],[false,true,28]]){
    const f=fixture();f.match.player.crouch=crouch;f.tick(1/60);f.match.player.x+=.04;f.tick(1/60,1/60,{sprint});assert.equal(f.ai.noises.at(-1).radius,radius);
    f.ai.noises=[];f.match.time+=1;f.match.player.x+=80;f.tick(1/60);assert.equal(f.ai.noises.length,0);
  }
});
check('arrival confirmation and reaction remain close at 30 and 120 fps',()=>{
  const fire=dt=>{const f=fixture();f.tick(2,dt);return f.events[0].at;};assert.ok(Math.abs(fire(1/30)-fire(1/120))<.12);
});
check('training targets never acquire or attack even when a shot is nearby',()=>{
  const f=fixture();f.match.mode='training';f.ai.noise(f.match.player,'shot',185,f.match.time);f.tick(4);
  assert.equal(f.e.sees,false);assert.equal(f.e.ai.contact,false);assert.equal(f.e.weaponReady,0);assert.equal(f.events.length,0);
});
check('real Match shots and explosions store immutable source positions and pause freezes AI memory',()=>{
  const m=new Match(createWorldData());m.running=true;const origin={...m.player};assert.ok(m.shoot({x:0,y:0,z:-1},origin));const shot=m.enemyAI.noises.at(-1);origin.x+=100;
  assert.notEqual(shot.point.x,origin.x);assert.equal(shot.kind,'shot');assert.equal(shot.at,m.time);
  m.explode({x:0,y:200,z:0});assert.equal(m.enemyAI.noises.at(-1).kind,'explosion');m.update(.016,{});m.running=false;
  const before=JSON.stringify({enemies:m.enemies,noise:m.enemyAI.noises,time:m.time});m.update(.5,{});assert.equal(JSON.stringify({enemies:m.enemies,noise:m.enemyAI.noises,time:m.time}),before);
  m.reset('survival');assert.equal(m.enemyAI.noises.length,0);assert.ok(m.enemies.every(e=>!e.ai&&!e.sees&&e.aiState==='patrol'));
});
check('losing sight after a discovery triggers one search line without waiting twelve seconds',()=>{
  const lines=[],e={...enemy(),y:200,sees:true},m={time:10,enemies:[e],player:{x:0,y:201.72,z:30},colliders:[],grenades:[],over:false},chatter=new EnemyChatter({speak:l=>{lines.push(l);return 1;},random:()=>0});
  chatter.update(.1,m);assert.equal(lines.at(-1).kind,'spot');e.sees=false;m.time+=3.5;chatter.update(.1,m);assert.equal(lines.at(-1).kind,'lost');m.time+=1;chatter.update(.1,m);assert.equal(lines.length,2);
});
console.log(`${passed} enemy perception, hearing, search, tactics and combat checks passed. Not a device-render test.`);
