import * as THREE from './vendor/three.module.js';
const vector=()=>new THREE.Vector3();
export function aimBone(root,bone,child,target){
  const p=bone.getWorldPosition(vector()),from=child.getWorldPosition(vector()).sub(p).normalize(),to=target.clone().sub(p).normalize();
  const change=new THREE.Quaternion().setFromUnitVectors(from,to),parent=bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const world=bone.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parent.invert().multiply(change).multiply(world));root.updateMatrixWorld(true);
}
export function poseChain(root,upper,lower,hand,wrist,pole){
  root.updateMatrixWorld(true);
  const shoulder=upper.getWorldPosition(vector()),elbow=lower.getWorldPosition(vector()),current=hand.getWorldPosition(vector());
  const l1=shoulder.distanceTo(elbow),l2=elbow.distanceTo(current),target=root.localToWorld(new THREE.Vector3(...wrist));
  const axis=target.clone().sub(shoulder),d=THREE.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.001,l1+l2-.001);axis.normalize();
  const bend=root.localToWorld(new THREE.Vector3(...pole)).sub(shoulder);bend.addScaledVector(axis,-bend.dot(axis)).normalize();
  const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
  const joint=shoulder.clone().addScaledVector(axis,along).addScaledVector(bend,height);
  aimBone(root,upper,lower,joint);aimBone(root,lower,hand,target);
}

// Share pronation along the forearm instead of twisting only a narrow wrist.
export function forearmTwist(root,lower,control,hand,orientation,share=.72){
  const axis=control.getWorldPosition(vector()).sub(lower.getWorldPosition(vector())).normalize();
  const current=hand.getWorldQuaternion(new THREE.Quaternion()),delta=orientation.clone().multiply(current.invert());
  const projection=delta.x*axis.x+delta.y*axis.y+delta.z*axis.z;
  const twist=new THREE.Quaternion(axis.x*projection,axis.y*projection,axis.z*projection,delta.w);
  if(twist.lengthSq()<1e-10)return;twist.normalize().slerp(new THREE.Quaternion(),1-share);
  const world=lower.getWorldQuaternion(new THREE.Quaternion()),parent=lower.parent.getWorldQuaternion(new THREE.Quaternion());
  lower.quaternion.copy(parent.invert().multiply(twist).multiply(world));root.updateMatrixWorld(true);
}

// Flexion at finger hinges, with limited MCP abduction for a real grip contact.
export function curlFingerTo(root,chain,tip,target,angles){
  const limits=[1.20,1.70,1.35];let spread=0;
  for(let pass=0;pass<12;pass++){
    for(let i=chain.length-1;i>=0;i--){
      const joint=chain[i],origin=joint.getWorldPosition(vector()),axis=new THREE.Vector3(1,0,0).applyQuaternion(joint.getWorldQuaternion(new THREE.Quaternion()));
      const from=tip.getWorldPosition(vector()).sub(origin),to=target.clone().sub(origin);
      from.addScaledVector(axis,-from.dot(axis)).normalize();to.addScaledVector(axis,-to.dot(axis)).normalize();
      const delta=Math.atan2(axis.dot(from.clone().cross(to)),from.dot(to));
      const next=THREE.MathUtils.clamp(angles[i]+delta,0,limits[i]);joint.rotateX(next-angles[i]);angles[i]=next;root.updateMatrixWorld(true);
    }
    const joint=chain[0],origin=joint.getWorldPosition(vector()),axis=new THREE.Vector3(0,0,1).applyQuaternion(joint.getWorldQuaternion(new THREE.Quaternion()));
    const from=tip.getWorldPosition(vector()).sub(origin),to=target.clone().sub(origin);
    from.addScaledVector(axis,-from.dot(axis)).normalize();to.addScaledVector(axis,-to.dot(axis)).normalize();
    const next=THREE.MathUtils.clamp(spread+Math.atan2(axis.dot(from.clone().cross(to)),from.dot(to)),-.18,.18);
    joint.rotateZ(next-spread);spread=next;root.updateMatrixWorld(true);
  }
}
