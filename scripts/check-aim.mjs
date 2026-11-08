import {footSurface,FootstepContacts} from '../dist/foley-motion.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../dist/vendor/three.module.js';
import {Match,WEAPONS,ENEMY_BODY,GRENADE_LOCK_TIME,zoomFov,lerp,clamp} from '../dist/core.js';
import {weaponViewPosition,weaponViewFov} from '../dist/weapons.js';
import {WeaponRecoil,reticleLayout,grenadeSightMarks} from '../dist/weapon-view.js';
import {swimViewFov} from '../dist/swim-view.js';
import {AimOverlay} from '../dist/aim-overlay.js';

export function checkAim(check,{view,data}){
  check('reticles preserve the camera centre, angular mil spacing and grenade elevation marks',()=>{
    for(const [width,height] of [[390,844],[844,390],[1440,900]]){
      const fov=zoomFov(75,8),layout=reticleLayout(width,height,fov);assert.equal(layout.x,width/2);assert.equal(layout.y,height/2);
      assert.ok(Math.abs(Math.atan(layout.pixelsPerMil/layout.focal)-.001)<1e-12);
      const marks=grenadeSightMarks(width,height,zoomFov(75,1.8));assert.deepEqual(marks.map(m=>m.distance),[50,100,150]);assert.ok(marks[0].y<marks[1].y&&marks[1].y<marks[2].y);
    }
    const canvas=document.createElement('canvas'),overlay=new AimOverlay(canvas),args={active:true,width:600,height:600,fov:zoomFov(75,8),pixelRatio:1};
    overlay.update({...args,mode:'sniper'});const ctx=canvas.getContext('2d');assert.ok(ctx.getImageData(300,300,1,1).data[3]>0);assert.equal(ctx.getImageData(320,320,1,1).data[3],0,'Mil dots must not connect into diagonal shapes');
    overlay.update({...args,mode:'grenade',fov:zoomFov(75,1.8)});assert.ok(ctx.getImageData(300,300,1,1).data[3]===0,'Grenade centre remains open');
    overlay.update({...args,mode:'rifle'});assert.ok(ctx.getImageData(0,0,600,600).data.every(n=>n===0),'Iron sights must not retain the sniper or grenade artwork');
    overlay.update({...args,mode:'sniper',active:false});assert.equal(canvas.hidden,true);
  });
  const source=fs.readFileSync(new URL('../dist/game.js',import.meta.url),'utf8'),start=source.indexOf('function updateCamera(dt){'),end=source.indexOf('\nfunction updateEnemies',start);
  assert.ok(start>=0&&end>start);const elements=new Map(),match=new Match(data),camera=new THREE.PerspectiveCamera(75,390/844,.08,1000),viewCamera=new THREE.PerspectiveCamera(weaponViewFov(390/844),390/844,.02,5);
  const canvas=document.createElement('canvas'),context=vm.createContext({footSurface,footstepContacts:new FootstepContacts(),THREE,WEAPONS,ENEMY_BODY,GRENADE_LOCK_TIME,zoomFov,lerp,clamp,weaponViewPosition,weaponViewFov,swimViewFov,weaponRecoil:new WeaponRecoil(),swimWasActive:false,swimView:null,match,camera,viewCamera,models:view,state:'playing',joy:{forward:0,strafe:0},keys:{},touch:true,aim:true,stepTime:0,elapsed:0,breath:6,recoil:0,recoilSide:0,flashTime:0,lastStep:0,adsBlend:0,graphicsRatio:1,innerWidth:390,innerHeight:844,devicePixelRatio:1,aimOverlay:new AimOverlay(canvas),audio:{footstep(){},swimStroke(){},trackLock(){}},$:id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',style:{},classList:{toggle(){}}});return elements.get(id);}});
  vm.runInContext(source.slice(start,end),context,{filename:'shipped-aim-camera.js'});
  check('shipped grenade and third-weapon aim look through both sights without barrel obstruction',()=>{
    for(const slot of [1,2]){
      match.weapon=slot;context.aim=true;for(let i=0;i<90;i++)vm.runInContext('updateCamera(1/60)',context);
      const gun=view.roots[slot];gun.updateMatrixWorld(true);assert.equal(gun.visible,true);assert.equal(elements.get('scope').hidden,true);assert.equal(elements.get('crosshair').hidden,true);
      for(const p of [gun.userData.sightRear,gun.userData.sightFront]){const ndc=p.clone().applyMatrix4(gun.matrixWorld).project(viewCamera);assert.ok(Math.hypot(ndc.x,ndc.y)<1e-6,'Rear and front sight must share the screen centre');}
      const rear=gun.userData.sightRear.clone().applyMatrix4(gun.matrixWorld),front=gun.userData.sightFront.clone().applyMatrix4(gun.matrixWorld),direction=front.clone().sub(rear).normalize(),ray=new THREE.Raycaster(rear.clone().addScaledVector(direction,.010),direction,0,rear.distanceTo(front)-.026);
      assert.equal(ray.intersectObject(gun.userData.model,true).length,0,'Receiver/barrel must not block the sight picture');
    }
  });
  check('switching away from 8x removes its pattern and closing aim restores the normal view',()=>{
    match.weapon=0;context.aim=true;for(let i=0;i<90;i++)vm.runInContext('updateCamera(1/60)',context);assert.equal(elements.get('scope').hidden,false);assert.equal(view.roots[0].visible,false);assert.ok(Math.abs(Math.tan(75*Math.PI/360)/Math.tan(camera.fov*Math.PI/360)-8)<1e-7);
    match.weapon=1;vm.runInContext('updateCamera(1/60)',context);assert.equal(elements.get('scope').hidden,true);assert.match(elements.get('aimReadout').textContent,/GL-6/);
    context.aim=false;for(let i=0;i<90;i++)vm.runInContext('updateCamera(1/60)',context);assert.equal(elements.get('scope').hidden,true);assert.equal(elements.get('crosshair').hidden,false);assert.equal(canvas.hidden,true);assert.ok(Math.abs(camera.fov-75)<1e-7);
  });
  check('the shipped camera displays lock progress on the enemy and clears it on weapon change',()=>{
    match.reset('training');match.running=true;match.weapon=1;const p=match.player,e=match.enemies[0],x=e.x-p.x,y=e.y+ENEMY_BODY.lock-p.y,z=e.z-p.z,d=Math.hypot(x,y,z);
    p.yaw=Math.atan2(-x,-z);p.pitch=Math.asin(y/d);context.aim=true;context.adsBlend=0;
    vm.runInContext('updateCamera(1/60)',context);assert.equal(elements.get('grenadeLock').hidden,false);assert.match(elements.get('lockLabel').textContent,/锁定中/);
    for(let i=0;i<50;i++)vm.runInContext('updateCamera(1/60)',context);assert.equal(match.grenadeLock.locked,true);assert.equal(elements.get('lockProgress').style.width,'100%');assert.match(elements.get('aimReadout').textContent,/开火追踪/);
    match.switchWeapon(2);vm.runInContext('updateCamera(1/60)',context);assert.equal(elements.get('grenadeLock').hidden,true);
  });
}
