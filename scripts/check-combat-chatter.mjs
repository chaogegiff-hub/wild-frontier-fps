import assert from 'node:assert/strict';
import {EnemyChatter} from '../dist/enemy-chatter.js';

let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function fixture(speak){
  const enemy={id:0,x:0,y:200,z:-20,hp:100,hitReact:0,alive:true,sees:true,reloadRemaining:0},match={time:8,enemies:[enemy],grenades:[],player:{x:0,y:201.7,z:0},colliders:[],vehicle:null,over:false},lines=[],stops=[];
  const chatter=new EnemyChatter({speak:line=>{lines.push(line);return speak?speak(line):2;},stop:()=>stops.push(true),random:()=>0});
  return {enemy,match,lines,stops,chatter,step(time=.1){match.time+=time;chatter.update(time,match);}};
}
check('a surviving bullet hit interrupts a routine report with one pain bark and does not repeat every frame',()=>{
  const f=fixture();f.step();assert.equal(f.lines.at(-1).kind,'spot');const stops=f.stops.length;f.enemy.hp=66;f.enemy.hitReact=.8;f.step(.6);assert.equal(f.lines.at(-1).kind,'wounded');assert.ok(f.stops.length>stops);const count=f.lines.length;f.enemy.hitReact=0;for(let i=0;i<120;i++)f.step(1/60);assert.equal(f.lines.length,count);f.match.time+=10;f.enemy.hp=32;f.step();assert.equal(f.lines.at(-1).kind,'wounded');assert.equal(f.lines.length,count+1);
});
check('a visible incoming grenade can interrupt routine speech during the ordinary per-enemy cooldown',()=>{
  const f=fixture();f.step();f.match.grenades=[{x:0,y:201,z:-22}];f.step(.6);assert.equal(f.lines.at(-1).kind,'grenade');f.match.enemies.push({...f.enemy,id:1,x:1});for(let i=0;i<50;i++)f.step(1/60);assert.equal(f.lines.length,2,'Several enemies spoke over the urgent warning');
});
check('a wall hides the grenade and calm hidden enemies do not invent a warning',()=>{
  const f=fixture();f.enemy.sees=false;f.match.colliders=[{type:'box',x:0,z:-21,y:198,w:10,d:.5,h:8}];f.match.grenades=[{x:0,y:201,z:-22}];f.step();assert.equal(f.lines.length,0);
});
check('unloaded urgent clips retry at a bounded rate and become playable after loading',()=>{
  let ready=false;const f=fixture(()=>ready?2:false);f.match.grenades=[{x:0,y:201,z:-22}];f.step();for(let i=0;i<20;i++)f.step(.01);assert.equal(f.lines.length,1);ready=true;f.step(.5);assert.equal(f.lines.length,2);assert.ok(f.chatter.current);
});
check('dead, muted and paused speakers cannot leave a voice playing or start a new one',()=>{
  const f=fixture();f.step();const count=f.stops.length;f.enemy.alive=false;f.step();assert.equal(f.chatter.current,null);assert.ok(f.stops.length>count);f.enemy.alive=true;f.chatter.reset();f.step();f.chatter.update(.1,f.match,{active:false});assert.equal(f.chatter.current,null);const lines=f.lines.length;f.chatter.update(.1,f.match,{enabled:false});assert.equal(f.lines.length,lines);
});
check('role assignment stays fixed for a given enemy through alert, injury and reset',()=>{
  for(const id of [0,1,2,5]){const f=fixture();f.enemy.id=id;f.step();const profile=f.lines.at(-1).profile;f.enemy.hp=50;f.step(.6);assert.equal(f.lines.at(-1).profile,profile);f.chatter.reset();f.step();assert.equal(f.lines.at(-1).profile,profile);}
});
console.log(`${passed} combat voice scheduling checks passed.`);
