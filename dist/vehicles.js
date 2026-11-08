import {makeVehicleWreck,VEHICLE_WRECK_DELAY} from './vehicle-wreck.js?v=2.21';
import * as THREE from './vendor/three.module.js';
import {clone as cloneSkeleton} from './vendor/SkeletonUtils.js';
import {poseChain} from './rig-ik.js?v=2.21';
import {vehicleWorld,VEHICLE_EXHAUST,VEHICLE_EXHAUST_AXIS} from './vehicle-physics.js?v=2.21';

function seatedDriver(assets,root){
  const driver=cloneSkeleton(assets.soldier.scene);driver.name='player-driver';driver.position.set(-.39,-.18,.46);driver.rotation.y=Math.PI;root.add(driver);
  const mixer=new THREE.AnimationMixer(driver),idle=assets.soldier.animations.find(clip=>clip.name==='Idle');if(idle){mixer.clipAction(idle).play();mixer.setTime(0);}
  driver.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}if(o.isSkinnedMesh)o.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1,0),1.5);});
  root.updateMatrixWorld(true);const feetRest={};
  const upperRest=['Bip01_Spine2','Bip01_Head'].map(name=>{const bone=driver.getObjectByName(name);return {bone,q:bone.quaternion.clone()};});
  for(const side of ['L','R'])feetRest[side]=root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(driver.getObjectByName(`Bip01_${side}_Foot`).getWorldQuaternion(new THREE.Quaternion()));
  const target=(x,y,z)=>driver.worldToLocal(root.localToWorld(new THREE.Vector3(x,y,z))).toArray();
  function pose(steer=0,slump=0){
    for(const {bone,q} of upperRest)bone.quaternion.copy(q);
    root.updateMatrixWorld(true);
    for(const [i,{bone}] of upperRest.entries()){
      const axis=new THREE.Vector3(1,0,0).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())),tilt=new THREE.Quaternion().setFromAxisAngle(axis,-slump*(i?.45:.20)),world=bone.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(tilt).multiply(world));root.updateMatrixWorld(true);
    }
    for(const side of ['L','R']){
      const x=side==='L'?-.53:-.25;
      const foot=driver.getObjectByName(`Bip01_${side}_Foot`);
      poseChain(driver,driver.getObjectByName(`Bip01_${side}_Thigh`),driver.getObjectByName(`Bip01_${side}_Calf`),foot,target(x,.56,-.14),target(x,1.0,-.20));
      foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(root.getWorldQuaternion(new THREE.Quaternion())).multiply(feetRest[side]));root.updateMatrixWorld(true);
      const angle=steer*1.4,dx=(side==='L'?-.16:.16)*Math.cos(angle),dy=(side==='L'?-.16:.16)*Math.sin(angle);
      poseChain(driver,driver.getObjectByName(`Bip01_${side}_UpperArm`),driver.getObjectByName(`Bip01_${side}_Forearm`),driver.getObjectByName(`Bip01_${side}_Hand`),target(-.39+dx,1.22+dy,-.27),target(side==='L'?-.84:.10,1.05,.12));
    }
    driver.updateMatrixWorld(true);driver.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
  }
  pose();driver.visible=false;return {driver,pose};
}

export function makeVehicleViews(assets,fleet){
  const group=new THREE.Group();group.name='permanent-offroad-vehicles';
  const items=fleet.cars.map(car=>{
    const root=new THREE.Group();root.name='drivable-jeep-'+car.id;root.rotation.order='YXZ';root.position.set(car.x,car.y,car.z);root.rotation.set(car.pitch,car.yaw,car.roll,'YXZ');group.add(root);
    const model=assets.vehicle.scene.clone(true);root.add(model);const wheels=[];
    // The authored underbody already contains the complete exhaust and hollow
    // rim. Attach the emitter there instead of adding a second, floating pipe.
    const pipe=new THREE.Group();pipe.name='authored-tailpipe-emitter';root.add(pipe);
    const emitter=new THREE.Object3D();emitter.name='tailpipe-emitter';emitter.position.set(VEHICLE_EXHAUST.x,VEHICLE_EXHAUST.y,VEHICLE_EXHAUST.z);emitter.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(VEHICLE_EXHAUST_AXIS.x,VEHICLE_EXHAUST_AXIS.y,VEHICLE_EXHAUST_AXIS.z).normalize());pipe.add(emitter);
    model.traverse(o=>{
      if(o.name.startsWith('wheel-'))wheels.push({node:o,name:o.name.slice(6),base:o.position.clone(),front:o.name.includes('front')});
      if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
      if(o.material.name==='jeep'){o.material=o.material.clone();o.material.color.multiply(new THREE.Color(['#ffffff','#e4ecdd','#ede2d3'][car.id%3]));o.material.emissiveIntensity=.25;}
    });
    const driver=seatedDriver(assets,root),wreck=makeVehicleWreck(model);root.add(wreck);return {root,model,wheels,wreck,pipe,emitter,deathSlump:0,...driver};
  });
  function update(dt,nextFleet=fleet){
    for(const [i,car] of nextFleet.cars.entries()){
      const item=items[i],root=item.root,blend=dt>0?1-Math.exp(-12*dt):1;
      root.position.set(car.x,car.y,car.z);root.rotation.y=car.yaw;root.rotation.x=THREE.MathUtils.lerp(root.rotation.x,car.pitch,blend);root.rotation.z=THREE.MathUtils.lerp(root.rotation.z,car.roll,blend);
      for(const wheel of item.wheels){
        const p=vehicleWorld(car,wheel.base.x,wheel.base.z),suspension=THREE.MathUtils.clamp(nextFleet.terrain(p.x,p.z)-car.y+Math.sin(car.pitch)*wheel.base.z-Math.sin(car.roll)*wheel.base.x,-.14,.14);
        const motion=car.wheels?.[wheel.name];
        wheel.node.position.y=wheel.base.y+suspension;wheel.node.rotation.set(motion?.spin??car.wheelAngle,motion?.steer??(wheel.front?-car.steer:0),0,'YXZ');
      }
      item.deathSlump=dt>0?THREE.MathUtils.damp(item.deathSlump,car.driverDead?1:0,2.5,dt):car.driverDead?1:0;
      const stripped=!!car.destroyed&&car.wreckAge>=VEHICLE_WRECK_DELAY;item.model.visible=!stripped;item.wreck.visible=stripped;item.pipe.visible=!stripped;item.driver.visible=nextFleet.driverId===car.id&&!stripped;if(item.driver.visible)item.pose(car.steer,item.deathSlump);
    }
  }
  function exhaust(car){const item=items.find(v=>v.root.name==='drivable-jeep-'+car.id);if(!item)return null;item.emitter.updateWorldMatrix(true,false);return {position:item.emitter.getWorldPosition(new THREE.Vector3()),direction:new THREE.Vector3(0,0,1).transformDirection(item.emitter.matrixWorld)};}
  update(0);return {group,items,update,exhaust};
}
