import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {localAssets} from './local-assets.mjs';
import {createViewModels,weaponViewFov,weaponViewPosition,WEAPON_VIEW_SCALE} from '../dist/weapons.js';

const {assets,surfaces}=await localAssets(),{roots}=createViewModels(assets,surfaces);
const vector=()=>new THREE.Vector3(),degrees=180/Math.PI;
let checks=0,maxWrist=0;
function check(label,fn){fn();checks++;console.log('PASS '+label);}

check('all three weapons keep neutral wrists and bent elbows without stretching arm bones',()=>{
  for(const root of roots){
    root.position.set(0,0,0);root.quaternion.identity();root.scale.setScalar(1);root.updateMatrixWorld(true);
    for(const side of ['L','R']){
      const shoulder=root.getObjectByName('upper_arm'+side),lower=root.getObjectByName('forearm'+side),control=root.getObjectByName('hand'+side+'control');
      const s=shoulder.getWorldPosition(vector()),e=lower.getWorldPosition(vector()),w=control.getWorldPosition(vector()),palm=root.getObjectByName('f_middle01'+side).getWorldPosition(vector()).sub(w);
      const bend=palm.angleTo(w.clone().sub(e))*degrees;maxWrist=Math.max(maxWrist,bend);
      assert.ok(bend<25,`${side} wrist folds ${bend.toFixed(1)} degrees`);
      const elbow=s.clone().sub(e).angleTo(w.clone().sub(e))*degrees;
      assert.ok(elbow>65&&elbow<135,`${side} elbow is overfolded or locked: ${elbow}`);
      assert.ok(Math.abs(s.distanceTo(e)-.25919)<.00001);
      assert.ok(Math.abs(e.distanceTo(w)-.26717)<.00001);
      assert.ok(shoulder.scale.distanceTo(new THREE.Vector3(1,1,1))<.00001);
      assert.ok(lower.scale.distanceTo(new THREE.Vector3(1,1,1))<.00001);
    }
  }
});

check('portrait and landscape hip poses keep shoulder cutoffs outside the picture',()=>{
  for(const aspect of [.46,.6,.75,1,16/9,2.17]){
    const camera=new THREE.PerspectiveCamera(weaponViewFov(aspect),aspect,.02,5);
    for(const root of roots){
      root.scale.setScalar(WEAPON_VIEW_SCALE);root.position.copy(weaponViewPosition(aspect));root.rotation.set(0,-.035,0);root.updateMatrixWorld(true);
      for(const side of ['L','R']){
        const shoulder=root.getObjectByName('upper_arm'+side).getWorldPosition(vector());
        if(shoulder.z<-.02)assert.ok(shoulder.project(camera).y< -1.10,'A shoulder cut enters the weapon view');
      }
      const muzzle=root.userData.muzzle.clone().applyMatrix4(root.matrixWorld).project(camera);
      assert.ok(Math.abs(muzzle.x)<.85&&Math.abs(muzzle.y)<.85,'Gun muzzle leaves the usable picture');
    }
  }
});

check('iron-sight eye relief is usable and the camera-to-front-sight path stays clear',()=>{
  for(const root of roots.slice(1)){
    root.position.copy(root.userData.aimPose.position);root.quaternion.copy(root.userData.aimPose.quaternion);root.updateMatrixWorld(true);
    const rear=root.userData.sightRear.clone().applyMatrix4(root.matrixWorld),front=root.userData.sightFront.clone().applyMatrix4(root.matrixWorld);
    assert.ok(-rear.z>.20&&-rear.z<.35,'Gun is too distant or the eye sits inside its rear');
    assert.ok(Math.hypot(rear.x,rear.y)<1e-6&&Math.hypot(front.x,front.y)<1e-6);
    const ray=new THREE.Raycaster(new THREE.Vector3(0,0,-.025),new THREE.Vector3(0,0,-1),0,-front.z-.05);
    assert.equal(ray.intersectObject(root,true).length,0,'Weapon or gloves cover the central sight ray');
  }
});
console.log(`${checks} weapon-posture checks passed; largest wrist bend ${maxWrist.toFixed(1)} degrees. Actual model geometry; not an iPhone screenshot.`);
