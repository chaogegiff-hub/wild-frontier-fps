import * as THREE from './vendor/three.module.js';
import {clone as cloneSkeleton} from './vendor/SkeletonUtils.js';
import {clamp,smooth,ENEMY_SCALE} from './core.js?v=2.25-drive-grass1';
import {poseChain} from './rig-ik.js?v=2.25-drive-grass1';
import {CombatantMotion} from './character-motion.js?v=2.25-drive-grass1';
import {ImpactMotion} from './impact-motion.js?v=2.30-hit-collapse1';
import {bulletHit,hitFlinch} from './bullet-hit.js?v=2.30-hit-collapse1';

const v=()=>new THREE.Vector3();
let flashMap;
function muzzleMap(){
  if(flashMap)return flashMap;const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,1,32,32,31);g.addColorStop(0,'#fff3d9');g.addColorStop(.2,'#ffce8e80');g.addColorStop(1,'#ffbb5500');x.fillStyle=g;x.fillRect(0,0,64,64);flashMap=new THREE.CanvasTexture(c);return flashMap;
}
export function createCombatant(id,assets,surfaces,finishWeapon){
  const actor=new THREE.Group(),rig=new THREE.Group(),body=cloneSkeleton(assets.soldier.scene);actor.scale.setScalar(ENEMY_SCALE);rig.position.y=.95;body.position.y=-.95;rig.add(body);actor.add(rig);
  body.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=true;o.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.95,0),1.4);}});
  const gun=assets.rifle.scene.clone(true);finishWeapon(gun,surfaces);rig.add(gun);
  const trigger=gun.getObjectByName('TRIGGER').position.clone(),support=gun.getObjectByName('SUPPORT').position.clone(),muzzle=gun.getObjectByName('FX_FIRE');
  const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:muzzleMap(),transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false}));flash.scale.set(.045,.018,1);flash.position.copy(muzzle.position);flash.visible=false;gun.add(flash);
  const mixer=new THREE.AnimationMixer(body),actions={};for(const name of ['Idle','Walk','Run']){const clip=assets.soldier.animations.find(c=>c.name===name);if(!clip)throw new Error(`Character is missing ${name}`);actions[name]=mixer.clipAction(clip).play().setEffectiveWeight(name==='Idle'?1:0);}
  mixer.setTime(id*.217);const motion=new CombatantMotion(actor,rig,body,mixer,actions,id),impactMotion=new ImpactMotion(actor,rig,body,id);let accumulated=0,fireAge=10,pendingFlash=false,raise=0,lookYaw=0,lookPitch=0,clock=id*.731,deathPose=null,fallenGun=null,deathSource=null,reloadReach=0;
  const spine1=body.getObjectByName('Bip01_Spine1'),spine2=body.getObjectByName('Bip01_Spine2'),head=body.getObjectByName('Bip01_Head'),magazine=gun.getObjectByName('MagazinePivot')||gun.getObjectByName('Magazine'),magazineBase=magazine?.position.clone(),magazineRotation=magazine?.quaternion.clone();
  const axes={up:new THREE.Vector3(0,1,0),right:new THREE.Vector3(1,0,0),forward:new THREE.Vector3(0,0,1)};
  function turnBone(bone,axis,angle){if(!bone||Math.abs(angle)<1e-8)return;const worldAxis=axis.clone().applyQuaternion(actor.getWorldQuaternion(new THREE.Quaternion())),q=new THREE.Quaternion().setFromAxisAngle(worldAxis,angle).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));}
  const hands=['R','L'].map(side=>body.getObjectByName(`Bip01_${side}_Hand`));
  const handRotations=[new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,-1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(-1,0,0))),new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,-1),new THREE.Vector3(0,-1,0)))];
  function holdWeapon(){
    actor.updateMatrixWorld(true);
    for(const [side,point,offset,pole] of [['R',trigger,[-.027,-.063,-.075],[-.45,1.1,-.12]],['L',support,[.035,-.045,-.02],[.42,1.1,.10]]]){
      const grip=point.clone().add(new THREE.Vector3(...offset));if(side==='L'&&reloadReach>0)grip.lerp(trigger.clone().add(new THREE.Vector3(.06,-.18,.14)),reloadReach);
      const target=body.worldToLocal(gun.localToWorld(grip));poseChain(body,body.getObjectByName(`Bip01_${side}_UpperArm`),body.getObjectByName(`Bip01_${side}_Forearm`),body.getObjectByName(`Bip01_${side}_Hand`),target.toArray(),pole);
    }
    hands.forEach((hand,i)=>{hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(body.getWorldQuaternion(new THREE.Quaternion()).multiply(handRotations[i])));});
    for(const side of ['R','L'])for(let finger=0;finger<5;finger++)for(const suffix of ['', '1','2']){const bone=body.getObjectByName(`Bip01_${side}_Finger${finger}${suffix}`);if(!bone)continue;bone.userData.restFinger??=bone.quaternion.clone();bone.quaternion.copy(bone.userData.restFinger);bone.rotateZ(finger===0?-.22:finger===1?.32:.74);}
    body.updateMatrixWorld(true);
  }
  function releaseGun(blast){
    if(fallenGun)return;const hold=gun.quaternion.clone();actor.attach(gun);fallenGun={position:gun.position.clone(),rotation:gun.quaternion.clone(),hold};
    if(blast)Object.assign(fallenGun,{world:gun.getWorldPosition(v()),orientation:gun.getWorldQuaternion(new THREE.Quaternion()),velocity:new THREE.Vector3(blast.vx||0,(blast.vy||0)+.25,blast.vz||0),landed:false});
    if(blast?.kind==='bullet'){
      const f=fallenGun;f.kind='bullet';f.scale=gun.getWorldScale(v());f.velocity.copy(impactMotion.liveVelocity?.get('Rhand')||new THREE.Vector3(blast.velocity?.x||0,0,blast.velocity?.z||0)).clampLength(0,3.5);f.velocity.y=clamp(f.velocity.y,-.5,.2);f.angular=new THREE.Vector3(.8+(id%3)*.23,.3,.55+(id%2)*.3);
      const bounds=new THREE.Box3(),inverse=gun.matrixWorld.clone().invert();gun.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();bounds.union(o.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld)));}});f.corners=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])f.corners.push(new THREE.Vector3(x,y,z));
    }
  }
  function dropShotGun(f,dt,groundAt,colliders){
    if(f.sleeping)return;f.settleTime=(f.settleTime||0)+(f.landed?dt:0);
    const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps,nearby=colliders.filter(c=>!c.bridge&&!c.support&&Math.hypot(c.x-f.world.x,c.z-f.world.z)<(c.r||Math.hypot(c.w||0,c.d||0)/2)+2);
    for(let i=0;i<steps;i++){
      f.velocity.y-=9.81*h;f.world.addScaledVector(f.velocity,h);if(f.restQ)f.orientation.slerp(f.restQ,1-Math.exp(-13*h));else f.orientation.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(f.angular.x*h,f.angular.y*h,f.angular.z*h)));
      for(const corner of f.corners){const p=corner.clone().multiply(f.scale).applyQuaternion(f.orientation).add(f.world),probe={p:p.clone(),radius:.012,contact:false};impactMotion.project(probe,()=>-Infinity,nearby);f.world.add(probe.p.sub(p));}
      let lift=-Infinity;for(const corner of f.corners){const p=corner.clone().multiply(f.scale).applyQuaternion(f.orientation).add(f.world);lift=Math.max(lift,groundAt(p.x,p.z)+.012-p.y);}
      if(lift>0){f.world.y+=lift;f.velocity.y=0;f.velocity.x*=Math.exp(-10*h);f.velocity.z*=Math.exp(-10*h);
        if(!f.restQ){f.landed=true;const normal=new THREE.Vector3(groundAt(f.world.x-.1,f.world.z)-groundAt(f.world.x+.1,f.world.z),.2,groundAt(f.world.x,f.world.z-.1)-groundAt(f.world.x,f.world.z+.1)).normalize(),z=new THREE.Vector3(0,0,1).applyQuaternion(f.orientation);z.addScaledVector(normal,-z.dot(normal));if(z.lengthSq()<.001)z.set(0,0,1);z.normalize();const x=normal.multiplyScalar(new THREE.Vector3(1,0,0).applyQuaternion(f.orientation).dot(normal)<0?-1:1),y=z.clone().cross(x).normalize();f.restQ=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));}
      }
    }
    gun.position.copy(actor.worldToLocal(f.world.clone()));gun.quaternion.copy(actor.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(f.orientation));
    if(f.settleTime>.8&&f.velocity.lengthSq()<.002&&f.orientation.angleTo(f.restQ)<.008)f.sleeping=true;
  }
  function dropGun(dt,groundAt,recovery=0,colliders=[]){
    const f=fallenGun;if(!f?.world)return;if(f.kind==='bullet'){dropShotGun(f,dt,groundAt,colliders);return;}
    if(!f.landed){f.velocity.y-=12.5*dt;f.world.addScaledVector(f.velocity,dt);f.orientation.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(.8,.2,.3).normalize(),dt*3));const floor=groundAt(f.world.x,f.world.z)+.055;
      if(f.world.y<=floor){f.world.y=floor;f.landed=true;f.orientation.setFromEuler(new THREE.Euler(0,id*.73,Math.PI/2,'YXZ'));gun.position.copy(actor.worldToLocal(f.world.clone()));gun.quaternion.copy(actor.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(f.orientation));actor.updateMatrixWorld(true);f.world.y+=Math.max(0,floor-.04-new THREE.Box3().setFromObject(gun).min.y);}
    }
    if(recovery>.45&&f.landed){f.grab??=f.world.clone();f.grabQ??=f.orientation.clone();const targetQ=rig.getWorldQuaternion(new THREE.Quaternion()).multiply(f.hold),grip=trigger.clone().add(new THREE.Vector3(-.027,-.063,-.075)).applyQuaternion(targetQ),target=hands[0].getWorldPosition(v()).sub(grip),p=smooth(.45,.98,recovery);f.world.lerpVectors(f.grab,target,p);f.orientation.slerpQuaternions(f.grabQ,targetQ,p);}
    gun.position.copy(actor.worldToLocal(f.world.clone()));gun.quaternion.copy(actor.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(f.orientation));
  }
  actor.userData={body,gun,rig,mixer,motion,impactMotion,deathTime:0,
    fire(){fireAge=0;pendingFlash=true;},
    muzzleWorld(target=v()){actor.updateMatrixWorld(true);return muzzle.getWorldPosition(target);},
    reset(){impactMotion.reset();actor.userData.deathTime=0;rig.position.set(0,.95,0);rig.rotation.set(0,0,0);rig.add(gun);motion.reset();accumulated=0;raise=lookYaw=lookPitch=reloadReach=0;fireAge=10;pendingFlash=false;flash.visible=false;deathPose=null;fallenGun=null;deathSource=null;if(magazine){magazine.position.copy(magazineBase);magazine.quaternion.copy(magazineRotation);}},
    stagger(dt,blast,groundAt=()=>actor.position.y,colliders=[]){
      motion.clearContacts();motion.speed=0;releaseGun(blast);const recovery=blast.grounded?smooth(blast.downTime??.7,(blast.downTime??.7)+(blast.recoverTime??.9),blast.landedAge):0;
      impactMotion.update(dt,blast,groundAt,{recovery,colliders});dropGun(dt,groundAt,recovery);flash.visible=false;
    },
    fall(dt,groundAt=()=>actor.position.y,blast,colliders=[],impact){
      if(!(dt>0))return;motion.clearContacts();
      if(!deathPose){deathPose=new Map();body.traverse(o=>{if(o.isBone)deathPose.set(o,o.quaternion.clone());});deathSource=blast||impact||bulletHit({x:actor.position.x,y:actor.position.y,z:actor.position.z,yaw:actor.rotation.y},{serial:id+1});releaseGun(deathSource);}
      actor.userData.deathTime+=dt;impactMotion.update(dt,blast||deathSource,groundAt,{colliders});dropGun(dt,groundAt,0,colliders);flash.visible=false;
      if(deathSource.kind==='bullet'){const relax=smooth(.08,.52,actor.userData.deathTime);for(const [bone,q]of deathPose)if(bone.userData.restFinger)bone.quaternion.slerpQuaternions(q,bone.userData.restFinger,relax*.85);actor.updateMatrixWorld(true);body.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});}
    },
    animate(dt,e,{distance=0,groundAt}={}){
      if(impactMotion.active){impactMotion.reset();rig.position.set(0,.95,0);rig.rotation.set(0,0,0);rig.add(gun);fallenGun=null;motion.reset(e.walk||0);}
      fireAge+=dt;flash.visible=pendingFlash||fireAge<.025;pendingFlash=false;accumulated+=dt;const interval=distance>90?1/30:0;if(accumulated<interval)return;dt=accumulated;accumulated=0;
      motion.advance(dt,e,groundAt);clock+=dt;lookYaw=THREE.MathUtils.damp(lookYaw,e.lookYaw||0,8,dt);lookPitch=THREE.MathUtils.damp(lookPitch,e.aimPitch||0,9,dt);
      const reload=e.reloadRemaining>0,phase=reload?clamp(1-e.reloadRemaining/(e.reloadDuration||2.6),0,1):0,reach=reload?smooth(.04,.20,phase)*(1-smooth(.78,.98,phase)):0;
      reloadReach=THREE.MathUtils.damp(reloadReach,reach,18,dt);raise=THREE.MathUtils.damp(raise,reload?0:Number.isFinite(e.weaponReady)?e.weaponReady:e.sees?1:0,8,dt);
      const flinch=hitFlinch(e.hitImpact,e.hitReact||0,e.yaw||actor.rotation.y);
      const kick=fireAge<.22?Math.sin(Math.min(1,fireAge/.055)*Math.PI/2)*Math.exp(-fireAge*20)*.055:0,hit=e.hitImpact?0:e.hitReact||0,breathing=Math.sin(clock*1.7)*.006,scan=!e.sees?Math.sin(clock*(e.aiState==='search'?1.15:.47))*(e.aiState==='search'?.22:.12):0;
      // Use actor/world axes; authored bone-local yaw can roll and twist the torso.
      turnBone(spine1,axes.up,lookYaw*.22);turnBone(spine2,axes.up,lookYaw*.43+(flinch?.twist||0));turnBone(head,axes.up,lookYaw*.33+scan);
      turnBone(spine1,axes.right,-lookPitch*.22+breathing+hit*.065+(flinch?.pitch||0)*.35);turnBone(spine2,axes.right,-lookPitch*.43-kick*.5-hit*.10+(flinch?.pitch||0)*.65);turnBone(head,axes.right,-lookPitch*.30-hit*.055+(flinch?.head||0));
      turnBone(spine2,axes.forward,hit*(id%2?1:-1)*.085+(flinch?.roll||0));actor.updateMatrixWorld(true);
      const chest=body.worldToLocal(spine2.getWorldPosition(v()));
      gun.rotation.set(-lookPitch+kick*.8+(1-raise)*.32,lookYaw,reach*-.16);gun.position.set(chest.x-.11,chest.y-.95-.14+raise*.26+breathing*.5,chest.z+.15-kick).sub(trigger.clone().applyQuaternion(gun.quaternion));
      if(magazine){magazine.position.copy(magazineBase);magazine.quaternion.copy(magazineRotation);magazine.position.y-=reach*.085;magazine.rotateX(-reach*.35);}actor.updateMatrixWorld(true);
      holdWeapon();impactMotion.capture(dt);
    }
  };actor.userData.animate(0,{walk:0});return actor;
}
