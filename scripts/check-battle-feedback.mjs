import assert from 'node:assert/strict';
import './local-assets.mjs';
import * as THREE from '../dist/vendor/three.module.js';
import {BattleFeedback} from '../dist/battle-feedback.js';
import {DrivingControls} from '../dist/vehicle-controls.js';
import {BattleEffects} from '../dist/effects.js';
import {GameAudio} from '../dist/audio.js';
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
class Element{
  constructor(){this.hidden=false;this.disabled=false;this.style={};this.dataset={};this.events={};const set=new Set();this.classList={add:k=>set.add(k),remove:k=>set.delete(k),contains:k=>set.has(k),toggle(k,on){on?set.add(k):set.delete(k);}};}
  addEventListener(type,fn){this.events[type]=fn;}setPointerCapture(){}
}
function dom(){const nodes=new Map(),buttons=['left','right','forward','reverse'].map(action=>{const b=new Element();b.dataset.drive=action;return b;});return {nodes,buttons,body:new Element(),getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},querySelectorAll:()=>buttons};}
check('lock success has its own confirmation, stays visible briefly, and clears when the lock or weapon changes',()=>{
  const root=dom(),feedback=new BattleFeedback(root),match={weapon:1,grenadeLock:{locked:true},drownTime:0,player:{hp:80}};feedback.locked({id:3},124.4);feedback.update(.1,{state:'playing',match});assert.equal(root.getElementById('lockConfirm').hidden,false);assert.match(root.getElementById('lockConfirmText').textContent,/04 · 124 m/);
  match.grenadeLock.locked=false;feedback.update(.1,{state:'playing',match});assert.equal(root.getElementById('lockConfirm').hidden,true);feedback.locked({id:0},80);match.grenadeLock.locked=true;feedback.update(2.3,{state:'playing',match});assert.equal(root.getElementById('lockConfirm').hidden,true);feedback.clearLock();assert.equal(feedback.lockTime,0);
});
check('underwater feedback freezes during pause, reveals death before the result card, and resets for the lobby',()=>{
  const root=dom(),feedback=new BattleFeedback(root),match={weapon:0,grenadeLock:{locked:false},drownTime:2,player:{hp:80},vehicle:{sinking:true}};feedback.update(.1,{state:'playing',match});assert.ok(root.getElementById('waterScreen').style.opacity>.4);feedback.update(.1,{state:'paused',match});assert.equal(match.drownTime,2);
  match.resultCause='drowned';feedback.drowned();feedback.update(.8,{state:'result',match});assert.equal(root.getElementById('result').hidden,true);assert.ok(root.getElementById('waterScreen').classList.contains('fatal'));feedback.update(1,{state:'result',match});assert.equal(root.getElementById('result').hidden,false);assert.ok(!root.getElementById('waterScreen').classList.contains('fatal'));feedback.reset();feedback.update(.1,{state:'lobby',match});assert.equal(root.getElementById('waterScreen').hidden,true);
});
check('flooded driving controls show escape and health loss without a countdown while disabled pedals cannot retain input',()=>{
  const root=dom(),controls=new DrivingControls(root,()=>{}),vehicle={speed:0,name:'4×4',inWater:true,sinking:true,stalled:true};controls.render({playing:true,active:true,vehicle,drownTime:3,player:{hp:80}});assert.match(root.getElementById('vehicleWaterTitle').textContent,/生命值下降/);assert.equal(root.getElementById('vehicleExit').textContent,'下车逃生');assert.equal(root.getElementById('vehicleExit').disabled,false);assert.doesNotMatch(root.getElementById('vehicleWaterTitle').textContent,/秒|倒计时|剩余/);
  root.buttons[2].events.pointerdown({pointerId:1,preventDefault(){}});assert.equal(controls.sample().throttle,0);controls.render({playing:true,active:true,vehicle:null});assert.equal(root.getElementById('drivingControls').hidden,true);assert.equal(root.getElementById('vehicleWaterAlert').hidden,true);
});
check('grenade explosions have a bright fire phase followed by larger dense smoke that dissipates completely',()=>{
  const fx=new BattleEffects(new THREE.Scene(),{explosion(){},casing(){}},{mobile:true});fx.explosion({x:0,y:12,z:0});fx.update(.12);assert.ok(fx.blastLight.intensity>0);const flames=fx.effects.filter(e=>e.type==='flame'),smoke=fx.effects.filter(e=>e.type==='smoke');assert.ok(flames.length>=6&&smoke.length>=14);assert.ok(flames.every(e=>e.mesh.material.blending===THREE.AdditiveBlending));fx.update(.4);assert.ok(smoke.every(e=>e.mesh.material.opacity>.5));const size=smoke[0].mesh.scale.x,y=smoke[0].mesh.position.y;
  for(let i=0;i<120;i++)fx.update(1/60);assert.ok(!fx.effects.some(e=>e.type==='flame'));assert.ok(smoke[0].mesh.scale.x>size+1&&smoke[0].mesh.position.y>y+1);assert.ok(fx.effects.some(e=>e.type==='smoke'));for(let i=0;i<480;i++)fx.update(1/60);assert.equal(fx.effects.length,0);fx.clear();
});
check('vehicle splashes, surface wakes and rising bubbles respect the particle budget and clear on restart',()=>{
  const fx=new BattleEffects(new THREE.Scene(),{explosion(){},casing(){}},{mobile:true});fx.waterEntry({x:0,y:3,z:0},12);assert.ok(fx.effects.some(e=>e.type==='wake'));assert.ok(fx.effects.filter(e=>e.type==='droplet').length>=12);for(let i=0;i<120;i++){fx.waterVehicles(1/60,[{id:0,sinking:true,sinkAge:3,y:0,x:0,z:0}]);fx.update(1/60);}assert.ok(fx.effects.some(e=>e.type==='bubble'));assert.ok(fx.effects.length<160);fx.clear();assert.equal(fx.effects.length,0);assert.equal(fx.waterTimers.size,0);
});
check('lock audio has two separated notes and a flooded engine mutes its loop',()=>{
  const a=new GameAudio(),calls=[];a.active=true;a.tone=(...args)=>calls.push(args);a.lockSuccess();assert.equal(calls.length,2);assert.equal(calls[1][4],.09);let gain;a.ctx={currentTime:2};a.active=true;a.engineGain={gain:{setTargetAtTime(value){gain=value;}}};a.drive({stalled:true,speed:0});assert.equal(gain,0);
});
console.log(`${passed} battle-feedback/effects checks passed. Browser 3D/audio output not verified.`);
