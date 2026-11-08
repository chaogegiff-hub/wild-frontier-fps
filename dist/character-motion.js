import * as THREE from './vendor/three.module.js';
import {poseChain} from './rig-ik.js?v=2.21';

const clamp=THREE.MathUtils.clamp,smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const point=()=>new THREE.Vector3(),rotation=()=>new THREE.Quaternion();

// Authored skeleton clips supply the gait. Distance drives their shared phase;
// terrain IK and stance anchors keep planted boots from sliding through slopes.
export class CombatantMotion{
  constructor(actor,rig,body,mixer,actions,id){
    Object.assign(this,{actor,rig,body,mixer,actions});this.phase=(id*.217)%1;this.lastWalk=0;this.speed=0;this.pelvis=0;this.accelLean=0;this.turning=0;
    actor.updateMatrixWorld(true);
    this.feet=['L','R'].map((side,i)=>{
      const foot=body.getObjectByName(`Bip01_${side}_Foot`),q=body.getWorldQuaternion(rotation()).invert().multiply(foot.getWorldQuaternion(rotation()));
      return {side,i,foot,thigh:body.getObjectByName(`Bip01_${side}_Thigh`),calf:body.getObjectByName(`Bip01_${side}_Calf`),rest:q,sole:.11*actor.scale.y,localSole:.11,plant:null,contact:0};
    });
  }
  clearContacts(){for(const foot of this.feet){foot.plant=null;foot.contact=0;}this.pelvis=0;}
  reset(walk=0){this.lastWalk=walk;this.speed=0;this.accelLean=0;this.turning=0;this.clearContacts();for(const [name,a] of Object.entries(this.actions))a.setEffectiveWeight(name==='Idle'?1:0);}
  advance(dt,e,groundAt){
    const {actor,rig,body,mixer,actions}=this;
    let distance=Number.isFinite(e.walk)?(e.walk-this.lastWalk)/2.8:(e.moveSpeed||0)*dt;this.lastWalk=e.walk||0;
    if(distance<0||distance>dt*8+.05)distance=0;
    const speed=dt>0?distance/dt:0,previousSpeed=this.speed;this.speed=THREE.MathUtils.damp(this.speed,speed,10,dt);
    this.accelLean=THREE.MathUtils.damp(this.accelLean,clamp(dt>0?(this.speed-previousSpeed)/dt*.012:0,-.06,.06),9,dt);
    const moving=smooth(.04,.42,this.speed),running=smooth(1.9,2.8,this.speed);this.turning=smooth(.15,1.3,Math.abs(e.turnRate||0))*(1-moving);
    const gait=Math.max(moving,this.turning*.65),weights={Idle:1-gait,Walk:gait*(1-running),Run:gait*running};
    this.phase=(this.phase+(distance+this.turning*Math.abs(e.turnRate||0)*dt*.22)/(THREE.MathUtils.lerp(1.44,2.10,running)*actor.scale.y))%1;
    let total=0;for(const [name,a] of Object.entries(actions)){const w=THREE.MathUtils.damp(a.getEffectiveWeight(),weights[name],12,dt);a.setEffectiveWeight(w);total+=w;}
    for(const [name,a] of Object.entries(actions)){
      a.setEffectiveWeight(a.getEffectiveWeight()/(total||1));a.setEffectiveTimeScale(name==='Idle'?1:0);
      if(name!=='Idle')a.time=this.phase*a.getClip().duration;
    }
    mixer.update(dt);rig.position.y=.95+this.pelvis;rig.rotation.set(this.speed*.012+this.accelLean,0,clamp(-(e.turnRate||0)*.022*Math.min(1,this.speed/.8),-.055,.055));actor.updateMatrixWorld(true);
    if(!groundAt){this.clearContacts();return;}
    const terrain=groundAt(actor.position.x,actor.position.z),samples=this.feet.map(f=>{const p=f.foot.getWorldPosition(point());return groundAt(p.x,p.z)-terrain;});
    this.pelvis=THREE.MathUtils.damp(this.pelvis,clamp(Math.min(0,...samples)/actor.scale.y,-.24,0),14,dt);rig.position.y=.95+this.pelvis;actor.updateMatrixWorld(true);
    const targets=this.feet.map(f=>{
      const animated=f.foot.getWorldPosition(point()),local=body.worldToLocal(animated.clone()),animatedRotation=f.foot.getWorldQuaternion(rotation()),phase=(this.phase+f.i*.5)%1;
      const start=THREE.MathUtils.lerp(.20,.29,running),end=THREE.MathUtils.lerp(.69,.57,running),stance=smooth(start,start+.065,phase)*(1-smooth(end-.065,end,phase));
      const contact=THREE.MathUtils.lerp(1,stance,smooth(.05,.45,gait));
      if(contact<.015)f.plant=null;
      else if(!f.plant||Math.hypot(f.plant.x-animated.x,f.plant.z-animated.z)>.42*actor.scale.y)f.plant=animated.clone();
      const target=animated.clone();if(f.plant){target.x=THREE.MathUtils.lerp(target.x,f.plant.x,contact);target.z=THREE.MathUtils.lerp(target.z,f.plant.z,contact);}
      const ground=groundAt(target.x,target.z),lift=Math.max(0,local.y-f.localSole)*actor.scale.y*(1-contact);target.y=ground+f.sole+lift;
      return {f,target,contact,animatedRotation};
    });
    let lower=0;
    for(const {f,target,contact} of targets){
      if(contact<.7)continue;const hip=f.thigh.getWorldPosition(point()),knee=f.calf.getWorldPosition(point()),ankle=f.foot.getWorldPosition(point()),reach=hip.distanceTo(knee)+knee.distanceTo(ankle)-.012,horizontal=Math.hypot(hip.x-target.x,hip.z-target.z);
      lower=Math.max(lower,hip.y-target.y-Math.sqrt(Math.max(.001,reach*reach-horizontal*horizontal)));
    }
    if(lower>0){this.pelvis=clamp(this.pelvis-lower/actor.scale.y,-.32,0);rig.position.y=.95+this.pelvis;actor.updateMatrixWorld(true);}
    for(const {f,target,contact,animatedRotation} of targets){
      const pole=f.calf.getWorldPosition(point()).add(new THREE.Vector3(0,.08,.38).applyQuaternion(actor.quaternion));
      poseChain(body,f.thigh,f.calf,f.foot,body.worldToLocal(target.clone()).toArray(),body.worldToLocal(pole).toArray());
      const normal=new THREE.Vector3(groundAt(target.x-.12,target.z)-groundAt(target.x+.12,target.z),.24,groundAt(target.x,target.z-.12)-groundAt(target.x,target.z+.12)).normalize();
      const flat=rotation().setFromUnitVectors(new THREE.Vector3(0,1,0),normal).multiply(body.getWorldQuaternion(rotation())).multiply(f.rest);
      const desired=animatedRotation.slerp(flat,contact);f.foot.quaternion.copy(f.foot.parent.getWorldQuaternion(rotation()).invert().multiply(desired));actor.updateMatrixWorld(true);f.contact=contact;
    }
  }
}
