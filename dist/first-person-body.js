import * as THREE from './vendor/three.module.js';
import {clone} from './vendor/SkeletonUtils.js';
export function createFirstPersonBody(gloves,arms,{wet=false,swimming=false}={}){
 if(!arms?.scene)throw new Error('手臂资源读取失败');const body=clone(gloves.scene),remove=[];
 body.traverse(o=>{if(!o.isMesh)return;if(o.material.name==='cotton_weapon_sleeve')remove.push(o);else{o.material=o.material.clone();if(wet){o.material.color.multiplyScalar(.91);o.material.roughness=.94;}}});remove.forEach(o=>o.removeFromParent());
 arms.scene.updateMatrixWorld(true);arms.scene.traverse(source=>{if(!source.isSkinnedMesh)return;const arm=source.clone(false),bones=source.skeleton.bones.map(b=>body.getObjectByName(b.name));if(bones.some(b=>!b))throw new Error('手臂骨骼匹配失败');arm.bind(new THREE.Skeleton(bones,source.skeleton.boneInverses.map(m=>m.clone())),source.bindMatrix.clone());arm.material=source.material.clone();arm.material.roughness=wet?.56:.68;arm.userData.firstPersonArm=true;if(swimming)arm.userData.swimArm=true;arm.name='anatomical-muscular-arms';body.add(arm);});body.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.castShadow=false;o.receiveShadow=true;}});body.updateMatrixWorld(true);return body;
}
