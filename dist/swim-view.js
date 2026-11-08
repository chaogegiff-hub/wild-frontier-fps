import * as THREE from './vendor/three.module.js';
import {createFirstPersonBody} from './first-person-body.js?v=2.25-drive-grass1';
import {poseChain,forearmTwist} from './rig-ik.js?v=2.25-drive-grass1';
const v=()=>new THREE.Vector3();
export function swimViewFov(aspect){return aspect<1?2*Math.atan(Math.tan(58*Math.PI/360)/aspect)*180/Math.PI:78;}
const path=new THREE.CatmullRomCurve3([
  new THREE.Vector3(.11,-.26,-.44),new THREE.Vector3(.14,-.31,-.43),
  new THREE.Vector3(.16,-.34,-.31),new THREE.Vector3(.13,-.30,-.27),
  new THREE.Vector3(.11,-.24,-.34)
],true,'catmullrom',.4);
function basis(forward,normal){
  const up=normal.clone().addScaledVector(forward,-normal.dot(forward)).normalize(),right=forward.clone().cross(up).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward.clone().negate()));
}
// One anatomical rig connects skin forearms, wrists and cloth gloves.
export class SwimView{
  constructor(asset,arms){
    this.group=new THREE.Group();this.group.name='first-person-dog-paddle';this.group.visible=false;
    this.body=createFirstPersonBody(asset,arms,{wet:true,swimming:true});this.group.add(this.body);this.body.position.set(0,-.235,.035);this.body.updateMatrixWorld(true);
    this.hands=['L','R'].map(side=>{
      const sign=side==='L'?-1:1,get=name=>this.body.getObjectByName(name+side),hand=get('hand');
      const control=this.body.getObjectByName('hand'+side+'control'),p=control.getWorldPosition(v());
      const forward=get('f_middle03').getObjectByName('f_middle03'+side+'_end').getWorldPosition(v()).sub(p).normalize();
      const normal=forward.clone().cross(get('f_index01').getWorldPosition(v()).sub(get('f_pinky01').getWorldPosition(v()))).normalize().multiplyScalar(sign);
      const alignment=basis(forward,normal).invert().multiply(hand.getWorldQuaternion(new THREE.Quaternion()));
      return {side,sign,upper:get('upper_arm'),lower:get('forearm'),control,hand,alignment,wrist:v(),offset:side==='L'?.5:0};
    });
    this.rest=[];this.body.traverse(o=>{if(o.isBone)this.rest.push({bone:o,q:o.quaternion.clone(),p:o.position.clone()});if(o.isMesh){o.frustumCulled=false;o.castShadow=false;o.receiveShadow=true;}});this.reset();
  }
  reset(){this.phase=0;this.strokeHand=null;this.group.visible=false;this.pose(0,16/9,1);}
  pose(phase,aspect=16/9,activity=1){
    for(const {bone,q,p} of this.rest){bone.quaternion.copy(q);bone.position.copy(p);}this.body.updateMatrixWorld(true);
    const width=aspect<1?.76:1;
    for(const h of this.hands){
      const t=((phase+h.offset)%1+1)%1,point=path.getPoint(t),power=THREE.MathUtils.smoothstep(t,.12,.32)*(1-THREE.MathUtils.smoothstep(t,.58,.78));h.strokePhase=t;
      h.wrist.set(h.sign*THREE.MathUtils.lerp(.12,point.x,activity)*width,THREE.MathUtils.lerp(-.28,point.y,activity),THREE.MathUtils.lerp(-.36,point.z,activity)-(aspect<1?.035:0));
      poseChain(this.body,h.upper,h.lower,h.control,this.body.worldToLocal(h.wrist.clone()).toArray(),[h.sign*(aspect<1?.23:.34),-.42,-.09]);
      const forward=new THREE.Vector3(h.sign*.04,-.08-power*.78,-1+power*.45).normalize(),normal=new THREE.Vector3(-h.sign*.035,1-power*.45,-.05-power*.8);
      const orientation=basis(forward,normal).multiply(h.alignment);forearmTwist(this.body,h.lower,h.control,h.hand,orientation);
      h.hand.quaternion.copy(h.hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(orientation));this.body.updateMatrixWorld(true);
      for(const finger of ['index','middle','ring','pinky'])for(let n=1;n<=3;n++){
        const bone=this.body.getObjectByName(`f_${finger}0${n}${h.side}`);bone.rotateX([.04,.07,.05][n-1]+power*(n===2?.14:.10));if(n===1)bone.rotateZ((finger==='index'?-.02:finger==='pinky'?.025:0)*h.sign);
      }
      this.body.getObjectByName('thumb01'+h.side).rotateZ(h.sign*.12);this.body.updateMatrixWorld(true);
    }
    this.body.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
  }
  update(dt,{active=false,moving=false,aspect=16/9}={}){
    if(!active){this.group.visible=false;return false;}
    if(!this.group.visible)this.phase=0;this.group.visible=true;
    const previous=this.phase;this.phase+=Math.max(0,dt)*(moving?1:.48);this.pose(this.phase,aspect,moving?1:.55);this.strokeHand=null;
    for(const h of this.hands)if(Math.floor(previous+h.offset-.20)!==Math.floor(this.phase+h.offset-.20))this.strokeHand=h.side;
    return this.strokeHand!==null;
  }
  vaultPose(phase,aspect=16/9){
    for(const {bone,q,p} of this.rest){bone.quaternion.copy(q);bone.position.copy(p);}this.body.updateMatrixWorld(true);this.group.visible=true;
    const t=THREE.MathUtils.clamp(phase,0,1),reach=THREE.MathUtils.smoothstep(t,0,.30)*(1-THREE.MathUtils.smoothstep(t,.70,1)),width=aspect<1?.78:1;
    for(const h of this.hands){
      h.wrist.set(h.sign*(.14+.035*reach)*width,-.34+.19*reach,-.32-.13*reach);poseChain(this.body,h.upper,h.lower,h.control,this.body.worldToLocal(h.wrist.clone()).toArray(),[h.sign*.46,-.30,.08]);
      const orientation=basis(new THREE.Vector3(0,-.25,-1).normalize(),new THREE.Vector3(0,1,-.15)).multiply(h.alignment);forearmTwist(this.body,h.lower,h.control,h.hand,orientation);h.hand.quaternion.copy(h.hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(orientation));this.body.updateMatrixWorld(true);
    }
    this.body.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
  }
}
