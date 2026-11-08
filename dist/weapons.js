import * as THREE from './vendor/three.module.js';
import {createFirstPersonBody} from './first-person-body.js?v=2.21';
import {WEAPONS,clamp,smooth} from './core.js?v=2.21';
import {poseChain,forearmTwist,curlFingerTo} from './rig-ik.js?v=2.21';
import {makeAimPose} from './weapon-view.js?v=2.23-arms1';
import {createCombatant} from './character.js?v=2.21';

const vector=()=>new THREE.Vector3();
export function weaponViewFov(aspect){return aspect<1?2*Math.atan(Math.tan(58*Math.PI/360)/aspect)*180/Math.PI:58;}
export function weaponViewOffset(aspect){return aspect<1?.11:.22;}
export const WEAPON_VIEW_SCALE=.76;
export function weaponViewPosition(aspect){return new THREE.Vector3(weaponViewOffset(aspect),-.27-.26*Math.max(0,1/aspect-1),-.42);}
function weaponSurface(model,surfaces){
  const materials=new Map();
  model.traverse(o=>{
    if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
    if(!materials.has(o.material)){
      const m=o.material.clone();
      if(m.name.includes('glass')){m.color.set('#364c48');m.roughness=.035;m.metalness=.28;}
      else if(!m.map){
        const colors={gunmetal:'#252b29',alloyDark:'#343a36',steelBright:'#626963',polymerBlack:'#272924',paintOlive:'#464b36',rubber:'#141610',emberGreen:'#424c39',emberRed:'#674335',scope_emberRed:'#674335'};
        if(colors[m.name])m.color.set(colors[m.name]);if(m.emissive)m.emissive.set(0);
        m.roughness=Math.max(.34,m.roughness);
        m.onBeforeCompile=s=>{
          s.uniforms.wearRough={value:surfaces.metalRough};s.uniforms.wearNormal={value:surfaces.metalNormal};
          s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWearP;varying vec3 vWearN;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWearP=position;vWearN=normal;');
          s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWearP;varying vec3 vWearN;uniform sampler2D wearRough;uniform sampler2D wearNormal;').replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
            vec3 blend=abs(normalize(vWearN));blend/=max(.001,blend.x+blend.y+blend.z);
            float wear=dot(vec3(texture2D(wearRough,vWearP.yz*8.0).r,texture2D(wearRough,vWearP.xz*8.0).r,texture2D(wearRough,vWearP.xy*8.0).r),blend);
            roughnessFactor=clamp(roughnessFactor*(.7+wear*.65),.28,.98);
          `).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
            vec3 grain=texture2D(wearNormal,vWearP.zy*18.0).xyz*2.0-1.0;
            normal=normalize(normal+vec3(grain.xy*.035,0.0));
          `);
        };m.customProgramCacheKey=()=> 'photographic-weapon-wear-v2';
      }materials.set(o.material,m);
    }o.material=materials.get(o.material);
  });
}
function makeHands(asset,right=[.025,-.09,-.04],left=[-.02,-.11,-.27],contacts={},arms){
  const body=createFirstPersonBody(asset,arms);body.position.set(0,-.14,.10);body.updateMatrixWorld(true);
  // A viewmodel shoulder sits behind and below the grip, not beside the wrist.
  // Translate the shoulder anchor; upper-arm and forearm bone lengths stay intact.
  const shoulder=body.getObjectByName('upper_armR');
  shoulder.position.copy(shoulder.parent.worldToLocal(new THREE.Vector3(.25,-.22,.19)));body.updateMatrixWorld(true);
  for(const [side,wrist] of [['R',right],['L',left]]){
    const hand=body.getObjectByName('hand'+side);
    const x=side==='R'?new THREE.Vector3(0,1,0):new THREE.Vector3(.76,0,.65).normalize(),y=side==='R'?new THREE.Vector3(0,0,-1):new THREE.Vector3(.65,0,-.76).normalize(),z=side==='R'?new THREE.Vector3(-1,0,0):new THREE.Vector3(0,1,0);
    const oldRotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
    const rotation=oldRotation.clone(),tilt=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),(side==='R'?24:28)*Math.PI/180);
    if(side==='R')rotation.premultiply(tilt);else rotation.multiply(tilt);
    // Keep the metacarpal contact beside the weapon while relaxing the wrist.
    const palm=hand.worldToLocal(body.getObjectByName('f_middle01'+side).getWorldPosition(vector()));
    const target=new THREE.Vector3(...wrist).add(palm.clone().applyQuaternion(oldRotation)).sub(palm.clone().applyQuaternion(rotation));
    const lower=body.getObjectByName('forearm'+side),control=body.getObjectByName('hand'+side+'control');
    const forearmLength=lower.getWorldPosition(vector()).distanceTo(control.getWorldPosition(vector()));
    const pole=target.clone().addScaledVector(palm.clone().applyQuaternion(rotation).normalize(),-forearmLength);
    pole.x+=side==='R'?.04:-.025;pole.y-=.02;pole.z+=.015;
    poseChain(body,body.getObjectByName('upper_arm'+side),lower,control,body.worldToLocal(target.clone()).toArray(),body.worldToLocal(pole).toArray());
    forearmTwist(body,body.getObjectByName('forearm'+side),body.getObjectByName('hand'+side+'control'),hand,rotation);
    hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
    for(const finger of ['index','middle','ring','pinky']){
      const chain=[1,2,3].map(n=>body.getObjectByName(`f_${finger}0${n}${side}`)),tip=body.getObjectByName(`f_${finger}03${side}_end`),angles=side==='R'?[finger==='index'?.24:.48,.82,.58]:[.40,.86,.65];
      chain.forEach((bone,n)=>bone.rotateX(angles[n]));body.updateMatrixWorld(true);
      if(side==='R'&&finger==='index'&&contacts.trigger)curlFingerTo(body,chain,tip,contacts.trigger.clone().add(new THREE.Vector3(.009,-.002,.006)),angles);
      if(side==='L'&&contacts.support){const z=chain[0].getWorldPosition(vector()).z;curlFingerTo(body,chain,tip,new THREE.Vector3(contacts.support.x+.028,contacts.support.y+.018,z),angles);}
    }
    const thumb=body.getObjectByName('thumb01'+side);if(thumb)thumb.rotateZ(side==='R'?-.28:.28);
    body.updateMatrixWorld(true);
    // Oppose each thumb around the grip, with limited joint rotation.
    if(side==='L'||contacts.trigger){
      const chain=[1,2,3].map(n=>body.getObjectByName(`thumb0${n}${side}`)),tip=body.getObjectByName('thumb03'+side+'_end'),goal=side==='L'?contacts.support.clone().add(new THREE.Vector3(-.018,.024,.025)):contacts.trigger.clone().add(new THREE.Vector3(-.022,.014,.005));
      const rest=chain.map(b=>b?.quaternion.clone());
      if(tip&&chain.every(Boolean))for(let pass=0;pass<10;pass++)for(const joint of [...chain].reverse()){
        const origin=joint.getWorldPosition(vector()),from=tip.getWorldPosition(vector()).sub(origin).normalize(),to=goal.clone().sub(origin).normalize(),rotation=new THREE.Quaternion().setFromUnitVectors(from,to),angle=rotation.angleTo(new THREE.Quaternion());
        if(angle>.4)rotation.slerp(new THREE.Quaternion(),1-.4/angle);
        joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation.multiply(joint.getWorldQuaternion(new THREE.Quaternion()))));const i=chain.indexOf(joint),limit=[1,1.1,.8][i],deviation=joint.quaternion.angleTo(rest[i]);if(deviation>limit)joint.quaternion.slerp(rest[i],1-limit/deviation);body.updateMatrixWorld(true);
      }
    }
  }
  body.traverse(o=>{if(o.isSkinnedMesh){o.frustumCulled=false;o.skeleton.update();o.material=o.material.clone();if(!o.userData.firstPersonArm)o.material.color.multiply(new THREE.Color().setRGB(.43,.36,.44));}});
  return body;
}
function muzzleOf(model){
  const marker=model.getObjectByName('FX_FIRE')||model.getObjectByName('Muzzle');
  if(marker){model.updateMatrixWorld(true);return marker.getWorldPosition(vector());}
  model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),m=vector();let y=0,count=0;
  model.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){m.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);if(m.z>box.max.z-.008){y+=m.y;count++;}}});
  return new THREE.Vector3(0,count?y/count:box.max.y*.65,box.max.z);
}
export function createViewModels(assets,surfaces){
  const offsets=[[-.17,-.26],[-.12,-.20],[-.14,-.36]],names=['sniper','grenade','rifle'];
  const roots=names.map((name,i)=>{
    const g=new THREE.Group(),model=assets[name].scene.clone(true),muzzle=muzzleOf(model),[y,initialZ]=offsets[i];let z=initialZ;
    if(i===0){const scope=assets.scope.scene.clone(true),mount=model.getObjectByName('ATTACH_SCOPE');if(mount)scope.position.copy(mount.position);model.add(scope);}
    weaponSurface(model,surfaces);model.rotation.y=Math.PI;model.position.set(0,y,z);model.updateMatrixWorld(true);
    const trigger=model.getObjectByName('TRIGGER')||model.getObjectByName('Trigger');
    if(trigger){z+=-.115-trigger.getWorldPosition(vector()).z;model.position.z=z;model.updateMatrixWorld(true);}
    let hands;if(trigger){const grip=trigger.getWorldPosition(vector()),support=model.getObjectByName('SUPPORT')?.getWorldPosition(vector())||grip.clone().add(new THREE.Vector3(0,.018,-.22));hands=makeHands(assets.hands,[grip.x+.030,grip.y-.014,grip.z+.095],[support.x-.050,support.y-.046,support.z+.055],{trigger:grip,support},assets.swimArms);}else hands=makeHands(assets.hands,undefined,undefined,{},assets.swimArms);
    g.add(model,hands);
    const mixer=new THREE.AnimationMixer(model),clips=assets[name].animations;
    const play=(name,duration)=>{const clip=clips.find(c=>c.name===name);if(!clip)return;const a=mixer.clipAction(clip);a.reset().setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;if(duration)a.setDuration(duration);a.play();};
    const bolt=model.getObjectByName(i===0?'BOLT':'Ejector_2'),magazine=model.getObjectByName(i===0?'MAGAZINE':'MagazinePivot')||model.getObjectByName('Magazine'),charging=model.getObjectByName('Charging_Handle'),drum=model.getObjectByName('DRUM');
    const ejectMarker=model.getObjectByName('FX_CASING')||model.getObjectByName('Ejector_Lid');
    const eject=ejectMarker?ejectMarker.getWorldPosition(vector()):new THREE.Vector3(.07,-.08,-.20);
    const ejector=model.getObjectByName('Ejector_Lid');if(ejector)ejector.rotateZ(-1.2);
    const rear=model.getObjectByName(i===0?'OpticalAxis':'SIGHT_REAR_RIM')||model.getObjectByName('SIGHT_REAR'),front=model.getObjectByName('SIGHT_FRONT');
    if(!rear||i!==0&&!front)throw new Error(`Missing sight markers for ${name}`);
    const sightRear=rear.getWorldPosition(vector()),sightFront=i===0?rear.localToWorld(new THREE.Vector3(0,0,.1)):front.getWorldPosition(vector()),aimPose=makeAimPose(sightRear.clone().multiplyScalar(WEAPON_VIEW_SCALE),sightFront.clone().multiplyScalar(WEAPON_VIEW_SCALE),i===0?.12:.28);
    g.userData={aimPose,sightRear,sightFront,drum,drumAngle:0,drumTarget:0,muzzle:new THREE.Vector3(-muzzle.x,muzzle.y+y,-muzzle.z+z),eject,mixer,play,model,fireAge:10,reloadActive:false,closed:false,bolt,magazine,charging,chargingBase:charging?.position.clone(),boltBase:bolt?.position.clone(),boltRotation:bolt?.quaternion.clone(),magazineBase:magazine?.position.clone()};
    g.scale.setScalar(WEAPON_VIEW_SCALE);g.position.copy(weaponViewPosition(16/9));g.rotation.y=-.035;return g;
  });
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),grad=ctx.createRadialGradient(64,64,1,64,64,62);grad.addColorStop(0,'rgba(255,250,223,1)');grad.addColorStop(.25,'rgba(255,193,73,.9)');grad.addColorStop(1,'rgba(255,130,28,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));flash.scale.set(.11,.11,1);flash.visible=false;
  return {
    roots,flash,
    fire(i){const u=roots[i].userData;u.fireAge=0;if(i===1){u.drumTarget-=Math.PI/3;u.play('spin',.34);}},
    update(dt,match){
      roots.forEach((g,i)=>{
        const u=g.userData,old=u.fireAge;u.fireAge+=dt;if(u.drum){u.drumAngle=THREE.MathUtils.damp(u.drumAngle,u.drumTarget,18,dt);u.drum.rotation.z=u.drumAngle;}
        if(u.bolt){
          u.bolt.position.copy(u.boltBase);u.bolt.quaternion.copy(u.boltRotation);
          if(i===0){
            const t=u.fireAge,lift=smooth(.25,.35,t)*(1-smooth(.85,.99,t)),slide=smooth(.36,.55,t)*(1-smooth(.69,.85,t));
            u.bolt.position.z-=slide*.075;u.bolt.rotateZ(lift*.9);
          }else if(i===2&&u.fireAge<.08)u.bolt.position.z-=Math.sin(u.fireAge/.08*Math.PI)*.012;
        }
        const reload=match.weapon===i&&match.reloadTime>0;
        if(reload&&!u.reloadActive){u.mixer.stopAllAction();u.play(i===1?'open':'magazine-open',.65);u.closed=false;}
        if(reload&&!u.closed&&match.reloadTime<.75){u.mixer.stopAllAction();u.play(i===1?'close':'magazine-close',.55);u.closed=true;}
        if(!reload&&u.reloadActive)u.mixer.stopAllAction();u.reloadActive=reload;u.mixer.update(dt);
        if(u.magazine){u.magazine.position.copy(u.magazineBase);u.magazine.rotation.x=0;if(reload){const p=clamp(1-match.reloadTime/WEAPONS[i].reload,0,1),pull=smooth(.1,.3,p)*(1-smooth(.72,.88,p));u.magazine.position.y-=pull*(i===0?.065:.085);if(i===2)u.magazine.rotation.x=-pull*.35;}}
        if(u.charging){u.charging.position.copy(u.chargingBase);if(reload){const p=clamp(1-match.reloadTime/WEAPONS[i].reload,0,1);u.charging.position.z-=smooth(.83,.9,p)*(1-smooth(.94,1,p))*.035;}}
      });
    }
  };
}
export function createEnemyModel(id,assets,surfaces){return createCombatant(id,assets,surfaces,weaponSurface);}
