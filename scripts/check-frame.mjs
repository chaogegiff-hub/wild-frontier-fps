import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../dist/vendor/three.module.js';
import {Match,WEAPONS,heightAt,clamp} from '../dist/core.js';
import {BattleEffects} from '../dist/effects.js';
import {syncWeaponLighting} from '../dist/weapon-view.js';

// Execute the shipped frame function with the real world and match objects.
// Only platform I/O and the GPU renderer are stubs: this is a JavaScript
// integration check, not a browser/device rendering test.
export function checkFrame(check,{world,data,scene,view,source=fs.readFileSync(new URL('../dist/game.js',import.meta.url),'utf8')}){
  const begin=source.indexOf('function renderFrame(now){'),end=source.indexOf('\nfunction startupFailed(',begin);
  assert.ok(begin>=0&&end>begin,'Actual shipped renderFrame function is missing');
  const elements=new Map(),draws=[],match=new Match(data),camera=new THREE.PerspectiveCamera(66,.6,.08,1000),viewCamera=new THREE.PerspectiveCamera(58,.6,.02,5),viewScene=new THREE.Scene();
  const context=vm.createContext({
    THREE,WEAPONS,heightAt,syncWeaponLighting,swimView:null,hdTextures:null,vehicleViews:null,vehicleTrails:null,battleFeedback:{update(){}},drivingControls:{sample:()=>({throttle:0,steer:0})},gunLight:new THREE.DirectionalLight(),state:'lobby',last:1000,elapsed:0,match,camera,world,scene,viewScene,viewCamera,models:view,
    keys:{},joy:{forward:0,strafe:0},touchCrouch:false,touchJump:false,touch:false,aim:false,
    fireHeld:false,fireLatched:false,uiTimer:0,mapTimer:0,shellTimers:[],damageFlash:0,hitTime:0,messageTime:0,
    frameTime:0,frameCount:0,rayDir:new THREE.Vector3(),
    battleEffects:new BattleEffects(scene,{casing(){},explosion(){}},{mobile:true}),
    audio:{listener(){},bolt(){}},
    $:id=>{if(!elements.has(id))elements.set(id,{style:{},hidden:false,textContent:''});return elements.get(id);},
    updateCamera(){},updateDrivingCamera(){},updateEnemies(){},updateProjectiles(){},updateHUD(){},updateCompass(){},drawMap(){},fire(){},ejectCasing(){},
    renderer:{clear(){draws.push('clear');},clearDepth(){draws.push('clear-depth');},render(s,c){assert.ok(s.isScene&&c.isCamera);draws.push(s===scene?'world':'view');}}
  });
  vm.runInContext(source.slice(begin,end),context,{filename:'shipped-game-renderFrame.js'});
  check('shipped first-frame path supports the fixed cactus field and shared world time',()=>{
    assert.equal(world.grass.isGroup,true);assert.equal(world.grass.material,undefined);
    vm.runInContext('renderFrame(1000)',context);
    assert.deepEqual(draws,['clear','world']);assert.equal(world.timeUniform.value,0);
    assert.ok(world.grass.userData.meshes.every(m=>m.material.uniforms.time===world.timeUniform));
    vm.runInContext('renderFrame(1016)',context);assert.equal(world.timeUniform.value,.016);
  });
  check('shipped playing and paused frame paths reach both scene draws',()=>{
    context.state='playing';match.reset('training');match.running=true;draws.length=0;
    vm.runInContext('renderFrame(1032)',context);assert.deepEqual(draws,['clear','world','clear-depth','view']);assert.ok(match.time>0);
    const pausedTime=match.time;context.state='paused';match.running=false;draws.length=0;
    vm.runInContext('renderFrame(1048)',context);assert.deepEqual(draws,['clear','world','clear-depth','view']);assert.equal(match.time,pausedTime);
  });
  check('shipped HUD shows armour loss, broken armour and reset beside health',()=>{
    const begin=source.indexOf('function updateHUD(){'),end=source.indexOf('\nfunction drawMap()',begin),nodes=new Map(),m=new Match(data);
    const node=id=>{if(!nodes.has(id)){const classes=new Set(),attributes={};nodes.set(id,{style:{},textContent:'',hidden:false,classes,attributes,classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}},setAttribute(name,value){attributes[name]=String(value);}});}return nodes.get(id);};
    const hud=vm.createContext({updateVehicleUI(){},match:m,WEAPONS,clamp,aim:false,currentActionTotal:1,$:node,document:{querySelectorAll:()=>[]}});assert.ok(begin>=0&&end>begin);vm.runInContext(source.slice(begin,end),hud);
    vm.runInContext('updateHUD()',hud);assert.equal(node('armourNumber').textContent,100);assert.equal(node('armourBar').style.width,'100%');assert.equal(node('armourState').textContent,'完好');
    m.hurt(40,'敌方射击');vm.runInContext('updateHUD()',hud);assert.equal(node('hpNumber').textContent,100);assert.equal(node('armourNumber').textContent,60);assert.equal(node('armourBar').style.width,'60%');assert.equal(node('armourTrack').attributes['aria-valuenow'],'60');
    m.player.armour=10;m.hurt(20,'敌方射击');vm.runInContext('updateHUD()',hud);assert.equal(node('armourNumber').textContent,0);assert.equal(node('armourState').textContent,'已破损');assert.ok(node('armourStatus').classes.has('broken'));
    m.reset('training');vm.runInContext('updateHUD()',hud);assert.equal(node('hpNumber').textContent,100);assert.equal(node('armourNumber').textContent,100);assert.ok(!node('armourStatus').classes.has('broken'));
  });
  check('the shipped driving frame applies accelerator input and omits the infantry weapon draw',()=>{
    match.reset('training');match.running=true;const car=match.fleet.cars[0];Object.assign(match.player,{x:car.x-1.85,z:car.z,ground:car.y,y:car.y+1.72});assert.ok(match.interactVehicle());context.state='playing';context.keys={KeyW:true};const z=car.z;draws.length=0;
    vm.runInContext('renderFrame(1100)',context);assert.ok(car.z<z);assert.deepEqual(draws,['clear','world']);
    context.keys={KeyS:true};car.speed=6;vm.runInContext('renderFrame(1116)',context);const brakingSpeed=car.speed;assert.equal(context.keys.KeyS,true,'Holding reverse must keep slowing a forward-moving vehicle');vm.runInContext('renderFrame(1132)',context);assert.ok(car.speed<brakingSpeed&&brakingSpeed<6);
    match.running=false;context.state='paused';const before=JSON.stringify(match.fleet);vm.runInContext('renderFrame(1148)',context);assert.equal(JSON.stringify(match.fleet),before);
    match.reset('training');context.keys={};context.state='paused';
  });
  check('the result frame keeps a launched body moving while pause still freezes it',()=>{
    const e=match.enemies[0];match.mode='survival';match.explode({x:e.x-1,y:e.y+.98,z:e.z});assert.ok(e.blast&&!e.alive);const y=e.y;
    match.running=false;match.over=true;context.state='result';draws.length=0;vm.runInContext('renderFrame(1164)',context);assert.ok(e.y>y);assert.deepEqual(draws,['clear','world','clear-depth','view']);
    const airborne=JSON.stringify(e);context.state='paused';vm.runInContext('renderFrame(1180)',context);assert.equal(JSON.stringify(e),airborne);
  });
  check('the drowned result frame keeps a vehicle sinking without drawing infantry weapons and pause freezes it',()=>{
    match.reset('training');const car=match.fleet.cars[0];match.fleet.terrain=()=>-20;match.fleet.driverId=0;Object.assign(car,{y:2.2,inWater:true,sinking:true,flood:1,stalled:true,driverDead:true});match.player.hp=0;match.finish(false,'drowned');context.state='result';draws.length=0;const y=car.y;
    vm.runInContext('renderFrame(1196)',context);assert.ok(car.y<y);assert.deepEqual(draws,['clear','world']);const stopped=car.y;context.state='paused';vm.runInContext('renderFrame(1212)',context);assert.equal(car.y,stopped);
  });
  check('the shipped frame runs vehicle trails during play, freezes them on pause and only dissipates exhaust in results',()=>{
    match.reset('training');match.running=true;context.state='playing';const calls=[];context.vehicleTrails={update(dt,fleet,{active}){calls.push({dt,fleet,active});}};vm.runInContext('renderFrame(1228)',context);assert.equal(calls.length,1);assert.equal(calls[0].active,true);assert.equal(calls[0].fleet,match.fleet);context.state='paused';vm.runInContext('renderFrame(1244)',context);assert.equal(calls.length,1);context.state='result';vm.runInContext('renderFrame(1260)',context);assert.equal(calls.length,2);assert.equal(calls[1].active,false);context.vehicleTrails=null;
  });
  check('the shipped horn responds to keyboard or touch and stops on pause, engine flooding or leaving the car',()=>{
    match.reset('training');match.running=true;match.fleet.driverId=0;context.state='playing';const signals=[];context.audio.horn=value=>signals.push(!!value);context.keys={KeyB:true};vm.runInContext('renderFrame(1276)',context);assert.equal(signals.at(-1),true);
    context.keys={};context.drivingControls.honking=true;vm.runInContext('renderFrame(1292)',context);assert.equal(signals.at(-1),true);context.state='paused';vm.runInContext('renderFrame(1308)',context);assert.equal(signals.at(-1),false);
    context.state='playing';Object.assign(match.vehicle,{flood:1,sinking:true,stalled:true});vm.runInContext('renderFrame(1324)',context);assert.equal(signals.at(-1),false);match.fleet.driverId=null;vm.runInContext('renderFrame(1340)',context);assert.equal(signals.at(-1),false);context.drivingControls.honking=false;
  });
}
