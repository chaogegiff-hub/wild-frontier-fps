import * as THREE from './vendor/three.module.js';
import {poseChain,aimBone} from './rig-ik.js?v=2.25-drive-grass1';
const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),clamp=THREE.MathUtils.clamp;
const joints=[['pelvis','Pelvis',14,.16],['spine','Spine',8,.17],['waist','Spine1',8,.18],['chest','Spine2',12,.19],['neck','Neck',3,.12],['head','Head',5,.17]];
for(const side of ['L','R'])for(const [key,bone,mass,radius]of [['hip','Thigh',5,.12],['knee','Calf',3,.10],['foot','Foot',1,.11],['toe','Toe0',.5,.055],['shoulder','UpperArm',3,.10],['elbow','Forearm',1.5,.075],['hand','Hand',.65,.065]])joints.push([side+key,side+'_'+bone,mass,radius]);

// A small positional body solver. Hips, spine, head and limbs have independent
// inertia and contact; there is no preselected prone pose or rotating card.
export class ImpactMotion{
  constructor(actor,rig,body,id){Object.assign(this,{actor,rig,body,id});this.active=false;this.nodes=new Map();for(const [key,name,mass,radius]of joints){const bone=body.getObjectByName('Bip01_'+name);if(bone)this.nodes.set(key,{bone,inv:1/mass,mass,radius:radius*actor.scale.y});}}
  reset(){if(this.rest)for(const [bone,q]of this.rest)bone.quaternion.copy(q);this.active=false;this.sleeping=false;this.rest=null;this.source=null;this.accumulator=0;}
  center(){const c=V();let mass=0;for(const n of this.nodes.values()){c.addScaledVector(n.p,n.mass);mass+=n.mass;}return c.divideScalar(mass);}
  frame(){const a=this.nodes,x=a.get('Lhip').p.clone().sub(a.get('Rhip').p).normalize(),y=a.get('chest').p.clone().sub(a.get('pelvis').p);y.addScaledVector(x,-y.dot(x)).normalize();const z=x.clone().cross(y).normalize();return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));}
  begin(blast){
    const {actor,rig,body}=this;this.nodes.delete('front');actor.updateMatrixWorld(true);this.active=true;this.source=blast;this.sleeping=false;this.elapsed=0;this.requestedAge=0;this.accumulator=0;this.restTime=0;this.rest=new Map();body.traverse(b=>{if(b.isBone)this.rest.set(b,b.quaternion.clone());});
    const origin=blast.origin?new THREE.Vector3(blast.origin.x,blast.origin.y,blast.origin.z):actor.position.clone(),shift=origin.clone().sub(actor.position);this.lastRoot=origin.clone();
    for(const n of this.nodes.values()){n.p=n.bone.getWorldPosition(V()).add(shift);n.standing=actor.worldToLocal(n.bone.getWorldPosition(V()));}
    const chest=this.nodes.get('chest'),front=V().set(0,0,.14*actor.scale.y).applyQuaternion(rig.getWorldQuaternion(Q())).add(chest.p);this.nodes.set('front',{p:front,inv:.25,mass:4,radius:.10*actor.scale.y,standing:actor.worldToLocal(front.clone().sub(shift))});
    this.offset=this.center().sub(origin);this.initialFrame=this.frame();this.initialRig=rig.getWorldQuaternion(Q());this.pelvisLocal=rig.worldToLocal(this.nodes.get('pelvis').bone.getWorldPosition(V()));
    const impulse=blast.initialVelocity||blast,linear=new THREE.Vector3(impulse.vx||0,impulse.vy||0,impulse.vz||0),angular=new THREE.Vector3(blast.spinX??1.8,blast.spinY??Math.sin(this.id*2.1)*.3,blast.spinZ??1.2).applyQuaternion(actor.quaternion),center=this.center();
    for(const [key,n]of this.nodes){n.v=linear.clone().add(angular.clone().cross(n.p.clone().sub(center)));if(/hand|foot|elbow|knee/.test(key))n.v.add(new THREE.Vector3(Math.sin(this.id*3.1+key.length)*.22,.12,Math.cos(this.id*2.7+key.length)*.18));}
    this.links=[];const link=(a,b,stiff=1)=>{const x=this.nodes.get(a),y=this.nodes.get(b);if(x&&y)this.links.push({a:x,b:y,length:x.p.distanceTo(y.p),stiff});};
    for(const [a,b]of [['pelvis','spine'],['spine','waist'],['waist','chest'],['chest','neck'],['neck','head']])link(a,b);
    for(const [a,b]of [['pelvis','chest'],['spine','neck'],['waist','neck'],['Lhip','Rhip'],['Lshoulder','Rshoulder']])link(a,b,.8);
    for(const side of ['L','R']){
      for(const [a,b]of [['pelvis',side+'hip'],['spine',side+'hip'],['chest',side+'hip'],['neck',side+'shoulder'],['chest',side+'shoulder'],['front',side+'shoulder'],['front',side+'hip']])link(a,b,.95);
      link(side+'hip',side+'knee');link(side+'knee',side+'foot');link(side+'foot',side+'toe');link(side+'knee',side+'toe',.9);link(side+'shoulder',side+'elbow');link(side+'elbow',side+'hand');
    }
    for(const key of ['pelvis','waist','chest','neck'])link('front',key,.9);
    this.limbs=['L','R'].flatMap(side=>[{a:side+'hip',b:side+'knee',c:side+'foot',leg:true},{a:side+'shoulder',b:side+'elbow',c:side+'hand',leg:false}]).map(l=>{const a=this.nodes.get(l.a),b=this.nodes.get(l.b),c=this.nodes.get(l.c);return {...l,a,b,c,l1:a.p.distanceTo(b.p),l2:b.p.distanceTo(c.p)};});
  }
  constrain(a,b,length,stiff=1){const d=b.p.clone().sub(a.p),n=d.length();if(n<1e-7)return;d.multiplyScalar((n-length)/n*stiff/(a.inv+b.inv));a.p.addScaledVector(d,a.inv);b.p.addScaledVector(d,-b.inv);}
  project(n,groundAt,colliders){
    const floor=groundAt(n.p.x,n.p.z)+n.radius;if(n.p.y<floor){n.p.y=floor;n.contact=true;}
    for(const c of colliders){
      if(n.p.y<c.y-n.radius||n.p.y>c.y+c.h+n.radius)continue;
      if(c.type==='circle'){const dx=n.p.x-c.x,dz=n.p.z-c.z,d=Math.hypot(dx,dz),r=c.r+n.radius;if(d<r){n.p.x=c.x+(d>1e-5?dx/d:1)*r;n.p.z=c.z+(d>1e-5?dz/d:0)*r;}continue;}
      const angle=c.type==='obox'?(c.yaw||0):0,co=Math.cos(angle),si=Math.sin(angle),dx=n.p.x-c.x,dz=n.p.z-c.z,x=dx*co-dz*si,z=dx*si+dz*co,y=n.p.y;
      const qx=clamp(x,-c.w/2,c.w/2),qz=clamp(z,-c.d/2,c.d/2),qy=clamp(y,c.y,c.y+c.h),delta=new THREE.Vector3(x-qx,y-qy,z-qz),distance=delta.length();
      if(distance>=n.radius)continue;
      if(distance>1e-5)delta.multiplyScalar((n.radius-distance)/distance);
      else{const faces=[[c.w/2-x,new THREE.Vector3(1,0,0)],[c.w/2+x,new THREE.Vector3(-1,0,0)],[c.d/2-z,new THREE.Vector3(0,0,1)],[c.d/2+z,new THREE.Vector3(0,0,-1)],[c.y+c.h-y,new THREE.Vector3(0,1,0)],[y-c.y,new THREE.Vector3(0,-1,0)]].sort((a,b)=>a[0]-b[0]);delta.copy(faces[0][1]).multiplyScalar(faces[0][0]+n.radius);}
      n.p.x+=delta.x*co+delta.z*si;n.p.z+=-delta.x*si+delta.z*co;n.p.y+=delta.y;
    }
  }
  update(dt,blast,groundAt,{recovery=0,colliders=[]}={}){
    if(!this.active||this.source!==blast){if(this.active)this.reset();this.begin(blast);}if(!(dt>0))return;
    if(this.sleeping&&recovery===0)return;
    const actor=this.actor,targetRoot=actor.position.clone(),startRoot=this.lastRoot.clone(),age=blast.origin?blast.age:this.requestedAge+dt,span=clamp(age-this.requestedAge,0,.12);this.requestedAge=age;this.accumulator+=span;
    const h=1/120,steps=Math.floor((this.accumulator+1e-9)/h);if(!steps)return;
    const nearby=colliders.filter(c=>!c.bridge&&!c.support&&(blast.vehicleId===undefined||c.vehicleId!==blast.vehicleId)&&(c.type==='circle'?Math.hypot(c.x-targetRoot.x,c.z-targetRoot.z)<c.r+2.3:Math.abs(c.x-targetRoot.x)<c.w/2+2.5&&Math.abs(c.z-targetRoot.z)<c.d/2+2.5));
    let energy=0,contacts=0;
    for(let step=0;step<steps;step++){
      const expected=startRoot.clone().lerp(targetRoot,(step+1)/steps).add(this.offset);energy=contacts=0;
      for(const n of this.nodes.values()){n.old=n.p.clone();n.contact=false;n.v.y-=12.5*h;n.v.multiplyScalar(Math.exp(-(blast.grounded?1.8:.16)*h));n.p.addScaledVector(n.v,h);}
      for(let iteration=0;iteration<9;iteration++){
        for(const l of this.links)this.constrain(l.a,l.b,l.length,l.stiff);
        const forward=this.nodes.get('front').p.clone().sub(this.nodes.get('chest').p).normalize();
        for(const l of this.limbs){
          const d=l.a.p.distanceTo(l.c.p),min=l.leg?.30:.14,max=(l.l1+l.l2)*.985;if(d>max||d<min)this.constrain(l.a,l.c,clamp(d,min,max));
          if(l.leg){const axis=l.c.p.clone().sub(l.a.p).normalize(),pole=forward.clone().addScaledVector(axis,-forward.dot(axis)).normalize(),offset=l.b.p.clone().sub(l.a.p);offset.addScaledVector(axis,-offset.dot(axis));if(offset.dot(pole)<.018)l.b.p.addScaledVector(pole,(.018-offset.dot(pole))*.8);}
        }
        for(const side of ['L','R'])for(const key of ['head','chest','pelvis']){const a=this.nodes.get(side+'hand'),b=this.nodes.get(key),d=a.p.distanceTo(b.p),minimum=a.radius+b.radius;if(d<minimum)this.constrain(a,b,minimum,.65);}
        for(const n of this.nodes.values())this.project(n,groundAt,nearby);
      }
      const correction=expected.sub(this.center());if(blast.grounded||[...this.nodes.values()].some(n=>n.contact))correction.y=0;
      for(const n of this.nodes.values()){
        n.p.add(correction);if(recovery>0&&n.standing){const target=actor.localToWorld(n.standing.clone());if(n.bone&&/Foot|Toe/.test(n.bone.name))target.y=groundAt(target.x,target.z)+n.radius;n.p.lerp(target,recovery);}
        this.project(n,groundAt,nearby);n.v.copy(n.p).sub(n.old).divideScalar(h).clampLength(0,25);
        if(n.contact){contacts++;const tangent=Math.hypot(n.v.x,n.v.z),friction=Math.min(tangent,.72*12.5*h+Math.max(0,-n.v.y)*.45),factor=tangent>1e-5?1-friction/tangent:0;n.v.x*=factor;n.v.z*=factor;n.v.y=Math.max(0,n.v.y)*.08;}
        energy+=n.v.lengthSq();
      }
      this.elapsed+=h;this.accumulator-=h;
    }
    this.lastRoot.copy(targetRoot);this.applyPose();this.restTime=blast.grounded&&contacts>3&&energy/this.nodes.size<.03?this.restTime+dt:0;if(this.restTime>.35&&recovery===0)this.sleeping=true;
  }
  applyPose(){
    const {actor,rig,body}=this;for(const [bone,q]of this.rest)bone.quaternion.copy(q);
    const world=this.frame().multiply(this.initialFrame.clone().invert()).multiply(this.initialRig);rig.quaternion.copy(actor.getWorldQuaternion(Q()).invert().multiply(world));rig.position.copy(actor.worldToLocal(this.nodes.get('pelvis').p.clone())).sub(this.pelvisLocal.clone().applyQuaternion(rig.quaternion));actor.updateMatrixWorld(true);
    for(const [a,b]of [['pelvis','spine'],['spine','waist'],['waist','chest'],['chest','neck'],['neck','head']])aimBone(body,this.nodes.get(a).bone,this.nodes.get(b).bone,this.nodes.get(b).p);
    for(const side of ['L','R']){
      const clavicle=body.getObjectByName('Bip01_'+side+'_Clavicle');if(clavicle)aimBone(body,clavicle,this.nodes.get(side+'shoulder').bone,this.nodes.get(side+'shoulder').p);
      for(const [a,b,c]of [[side+'hip',side+'knee',side+'foot'],[side+'shoulder',side+'elbow',side+'hand']])poseChain(body,this.nodes.get(a).bone,this.nodes.get(b).bone,this.nodes.get(c).bone,body.worldToLocal(this.nodes.get(c).p.clone()).toArray(),body.worldToLocal(this.nodes.get(b).p.clone()).toArray());
      if(this.nodes.has(side+'toe'))aimBone(body,this.nodes.get(side+'foot').bone,this.nodes.get(side+'toe').bone,this.nodes.get(side+'toe').p);
    }
    actor.updateMatrixWorld(true);body.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();const inverse=o.matrixWorld.clone().invert(),bounds=new THREE.Box3();for(const n of this.nodes.values())bounds.expandByPoint(n.p.clone().applyMatrix4(inverse));bounds.expandByScalar(.25);o.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());}});
  }
}
