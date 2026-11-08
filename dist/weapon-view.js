import * as THREE from './vendor/three.module.js';

// Aim through the rear and front sights. Centring the muzzle instead puts
// the eye inside the receiver or barrel and produces an obstructed picture.
export function makeAimPose(rear,front,depth=-.30){
  const direction=front.clone().sub(rear).normalize();
  if(direction.lengthSq()<.99)throw new Error('Sight axis has no length');
  const quaternion=new THREE.Quaternion().setFromUnitVectors(direction,new THREE.Vector3(0,0,-1));
  const aligned=rear.clone().applyQuaternion(quaternion);
  return {quaternion,position:new THREE.Vector3(-aligned.x,-aligned.y,Math.min(depth,-.10-aligned.z))};
}

export function reticleLayout(width,height,fov){
  const focal=height/(2*Math.tan(fov*Math.PI/360));
  return {x:width/2,y:height/2,radius:Math.min(width*.44,height*.44,380),pixelsPerMil:focal*Math.tan(.001),focal};
}

export function grenadeSightMarks(width,height,fov,velocity=76){
  const {x,y,focal}=reticleLayout(width,height,fov);
  return [50,100,150].map(distance=>({distance,x,y:y+focal*Math.tan(.5*Math.asin(9.81*distance/(velocity*velocity)))}));
}

// Separate weapon projection is a presentation choice. Convert its points
// back to world-camera space before emitting casings, smoke and projectiles.
export function viewPointToWorld(point,viewCamera,camera,target=new THREE.Vector3()){
  target.copy(point);
  target.x*=viewCamera.projectionMatrix.elements[0]/camera.projectionMatrix.elements[0];
  target.y*=viewCamera.projectionMatrix.elements[5]/camera.projectionMatrix.elements[5];
  return target.applyMatrix4(camera.matrixWorld);
}

export class WeaponRecoil{
  constructor(){this.reset();}
  reset(){this.pitch=0;this.yaw=0;this.slide=0;this.lift=0;this.vPitch=0;this.vYaw=0;this.vSlide=0;this.vLift=0;}
  kick(slot,side=0){
    const strength=slot===0?1:slot===1?1.18:.48;
    this.vPitch+=strength*.92;this.vYaw+=side*strength*.13;this.vSlide+=strength*1.25;this.vLift+=strength*.78;
  }
  update(dt){
    const steps=Math.max(1,Math.ceil(dt*120)),s=Math.min(dt,.1)/steps;
    for(let i=0;i<steps;i++)for(const [position,velocity,k,d] of [['pitch','vPitch',155,21],['yaw','vYaw',175,23],['slide','vSlide',260,27],['lift','vLift',220,25]]){
      this[velocity]+=(-k*this[position]-d*this[velocity])*s;this[position]+=this[velocity]*s;
    }
    return this;
  }
}

const inverse=new THREE.Quaternion(),rotation=new THREE.Euler();
export function syncWeaponLighting(camera,world,viewScene,keyLight){
  inverse.copy(camera.quaternion).invert();
  keyLight.position.copy(world.sunLight.position).sub(world.sunLight.target.position).normalize().applyQuaternion(inverse).multiplyScalar(4);
  keyLight.color.copy(world.sunLight.color);keyLight.intensity=world.sunLight.intensity*.82;
  // Vendored r164 negates these Euler components for PMREM sampling.
  // The resulting shader rotation must map a view-space reflection into world space.
  rotation.setFromQuaternion(camera.quaternion,'XYZ');
  viewScene.environmentRotation.set(-rotation.x,-rotation.y,-rotation.z,'XYZ');
}
