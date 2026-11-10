import * as THREE from './vendor/three.module.js';
import {clone as cloneSkeleton} from './vendor/SkeletonUtils.js';
import {clamp,smooth,ENEMY_SCALE} from './core.js?v=2.25-drive-grass1';
import {poseChain} from './rig-ik.js?v=2.25-drive-grass1';
import {CombatantMotion} from './character-motion.js?v=2.25-drive-grass1';
import {ImpactMotion} from './impact-motion.js?v=2.25-drive-grass1';

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
  mixer.setTime(id*.217);const motion=new CombatantMotion(actor,rig,body,mixer,actions,id),impactMotion=new ImpactMotion(actor,rig,body,id);let accumulated=0,fireAge=10,pendingFlash=false,raise=0,lookYaw=0,lookPitch=0,clock=id*.731,deathPose=null,fallenGun=null,reloadReach=0;
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
  }
  function dropGun(dt,groundAt,recovery=0){
    const f=fallenGun;if(!f?.world)return;
    if(!f.landed){f.velocity.y-=12.5*dt;f.world.addScaledVector(f.velocity,dt);f.orientation.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(.8,.2,.3).normalize(),dt*3));const floor=groundAt(f.world.x,f.world.z)+.055;
      if(f.world.y<=floor){f.world.y=floor;f.landed=true;f.orientation.setFromEuler(new THREE.Euler(0,id*.73,Math.PI/2,'YXZ'));gun.position.copy(actor.worldToLocal(f.world.clone()));gun.quaternion.copy(actor.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(f.orientation));actor.updateMatrixWorld(true);f.world.y+=Math.max(0,floor-.04-new THREE.Box3().setFromObject(gun).min.y);}
    }
    if(recovery>.45&&f.landed){f.grab??=f.world.clone();f.grabQ??=f.orientation.clone();const targetQ=rig.getWorldQuaternion(new THREE.Quaternion()).multiply(f.hold),grip=trigger.clone().add(new THREE.Vector3(-.027,-.063,-.075)).applyQuaternion(targetQ),target=hands[0].getWorldPosition(v()).sub(grip),p=smooth(.45,.98,recovery);f.world.lerpVectors(f.grab,target,p);f.orientation.slerpQuaternions(f.grabQ,targetQ,p);}
    gun.position.copy(actor.worldToLocal(f.world.clone()));gun.quaternion.copy(actor.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(f.orientation));
  }
  actor.userData={body,gun,rig,mixer,motion,impactMotion,deathTime:0,
    fire(){fireAge=0;pendingFlash=true;},
    muzzleWorld(target=v()){actor.updateMatrixWorld(true);return muzzle.getWorldPosition(target);},
    reset(){impactMotion.reset();actor.userData.deathTime=0;rig.position.set(0,.95,0);rig.rotation.set(0,0,0);rig.add(gun);motion.reset();accumulated=0;raise=lookYaw=lookPitch=reloadReach=0;fireAge=10;pendingFlash=false;flash.visible=false;deathPose=null;fallenGun=null;if(magazine){magazine.position.copy(magazineBase);magazine.quaternion.copy(magazineRotation);}},
    stagger(dt,blast,groundAt=()=>actor.position.y,colliders=[]){
      motion.clearContacts();motion.speed=0;releaseGun(blast);const recovery=blast.grounded?smooth(blast.downTime??.7,(blast.downTime??.7)+(blast.recoverTime??.9),blast.landedAge):0;
      impactMotion.update(dt,blast,groundAt,{recovery,colliders});dropGun(dt,groundAt,recovery);flash.visible=false;
    },
    fall(dt,groundAt=()=>actor.position.y,blast,colliders=[]){
      motion.clearContacts();
      if(!deathPose){deathPose=new Map();body.traverse(o=>{if(o.isBone)deathPose.set(o,o.quaternion.clone());});releaseGun(blast);}
      actor.userData.deathTime+=dt;const t=actor.userData.deathTime,p=smooth(.12,.95,t),relax=smooth(0,.32,t);
      if(blast){impactMotion.update(dt,blast,groundAt,{colliders});dropGun(dt,groundAt);flash.visible=false;return;}
      for(const [name,a] of Object.entries(actions))a.setEffectiveWeight(name==='Idle'?1:0);mixer.update(dt);for(const [bone,start] of deathPose)bone.quaternion.slerpQuaternions(start,bone.quaternion.clone(),relax);
      const forward=new THREE.Vector3(0,0,1).applyQuaternion(actor.quaternion),slope=(groundAt(actor.position.x+forward.x*.8,actor.position.z+forward.z*.8)-groundAt(actor.position.x-forward.x*.8,actor.position.z-forward.z*.8))/1.6;
      rig.position.y=.95-.71*p;rig.rotation.x=p*(1.51-Math.atan(slope)*.8);rig.rotation.z=Math.sin(id*2.71)*.07*p;flash.visible=false;
      if(blast){const settle=blast.grounded?smooth(0,.35,blast.landedAge):0;rig.position.y=THREE.MathUtils.lerp(.95,rig.position.y,settle);rig.rotation.x=THREE.MathUtils.lerp(blast.flightTime*blast.spinX,rig.rotation.x,settle);rig.rotation.z=THREE.MathUtils.lerp(blast.flightTime*blast.spinZ,rig.rotation.z,settle);}
      const drop=Math.max(0,t-.07),landing=clamp(drop/.58,0,1);gun.position.copy(fallenGun.position);gun.position.x=THREE.MathUtils.lerp(gun.position.x,-.43,smooth(0,.58,drop));const floor=actor.localToWorld(new THREE.Vector3(gun.position.x,0,gun.position.z));gun.position.y=Math.max(groundAt(floor.x,floor.z)-actor.position.y+.032,gun.position.y-4.905*drop*drop);gun.quaternion.slerpQuaternions(fallenGun.rotation,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2),landing);
      actor.updateMatrixWorld(true);body.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
    },
    animate(dt,e,{distance=0,groundAt}={}){
      if(impactMotion.active){impactMotion.reset();rig.position.set(0,.95,0);rig.rotation.set(0,0,0);rig.add(gun);fallenGun=null;motion.reset(e.walk||0);}
      fireAge+=dt;flash.visible=pendingFlash||fireAge<.025;pendingFlash=false;accumulated+=dt;const interval=distance>90?1/30:0;if(accumulated<interval)return;dt=accumulated;accumulated=0;
      motion.advance(dt,e,groundAt);clock+=dt;lookYaw=THREE.MathUtils.damp(lookYaw,e.lookYaw||0,8,dt);lookPitch=THREE.MathUtils.damp(lookPitch,e.aimPitch||0,9,dt);
      const reload=e.reloadRemaining>0,phase=reload?clamp(1-e.reloadRemaining/(e.reloadDuration||2.6),0,1):0,reach=reload?smooth(.04,.20,phase)*(1-smooth(.78,.98,phase)):0;
      reloadReach=THREE.MathUtils.damp(reloadReach,reach,18,dt);raise=THREE.MathUtils.damp(raise,reload?0:Number.isFinite(e.weaponReady)?e.weaponReady:e.sees?1:0,8,dt);
      const kick=fireAge<.22?Math.sin(Math.min(1,fireAge/.055)*Math.PI/2)*Math.exp(-fireAge*20)*.055:0,hit=e.hitReact||0,breathing=Math.sin(clock*1.7)*.006,scan=!e.sees?Math.sin(clock*(e.aiState==='search'?1.15:.47))*(e.aiState==='search'?.22:.12):0;
      // Use actor/world axes; authored bone-local yaw can roll and twist the torso.
      turnBone(spine1,axes.up,lookYaw*.22);turnBone(spine2,axes.up,lookYaw*.43);turnBone(head,axes.up,lookYaw*.33+scan);
      turnBone(spine1,axes.right,-lookPitch*.22+breathing+hit*.065);turnBone(spine2,axes.right,-lookPitch*.43-kick*.5-hit*.10);turnBone(head,axes.right,-lookPitch*.30-hit*.055);
      turnBone(spine2,axes.forward,hit*(id%2?1:-1)*.085);actor.updateMatrixWorld(true);
      const chest=body.worldToLocal(spine2.getWorldPosition(v()));
      gun.rotation.set(-lookPitch+kick*.8+(1-raise)*.32,lookYaw,reach*-.16);gun.position.set(chest.x-.11,chest.y-.95-.14+raise*.26+breathing*.5,chest.z+.15-kick).sub(trigger.clone().applyQuaternion(gun.quaternion));
      if(magazine){magazine.position.copy(magazineBase);magazine.quaternion.copy(magazineRotation);magazine.position.y-=reach*.085;magazine.rotateX(-reach*.35);}actor.updateMatrixWorld(true);
      holdWeapon();
    }
  };actor.userData.animate(0,{walk:0});return actor;
}
