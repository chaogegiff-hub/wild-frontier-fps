import * as THREE from './vendor/three.module.js';
import {VEHICLE_SIZE,vehicleLocal} from './vehicle-physics.js?v=2.21';

const TILE=8,clamp=THREE.MathUtils.clamp;
// The original resident instances remain in their tiles. Only impacted plants
// acquire animation state; a car queries a small grid rather than the island.
export class CactusImpacts{
  constructor(plants,{sample,onImpact=()=>{}}={}){
    this.plants=plants;this.sample=sample;this.onImpact=onImpact;this.grid=new Map();this.fallen=new Set();this.animating=new Set();this.previous=new Map();this.dirty=new Map();
    for(const p of plants){const key=this.key(p.x,p.z);if(!this.grid.has(key))this.grid.set(key,[]);this.grid.get(key).push(p);}
  }
  key(x,z){return Math.floor(x/TILE)+','+Math.floor(z/TILE);}
  write(p,angle,lift){
    const attr=p.mesh.geometry.attributes.aFall;attr.setXYZW(p.index,p.axis.x,p.axis.z,angle,lift);
    const range=this.dirty.get(attr)||[p.index,p.index];range[0]=Math.min(range[0],p.index);range[1]=Math.max(range[1],p.index);this.dirty.set(attr,range);p.angle=angle;p.lift=lift;
  }
  flush(){for(const [a,[lo,hi]] of this.dirty){a.clearUpdateRanges();a.addUpdateRange(lo*4,(hi-lo+1)*4);a.needsUpdate=true;}this.dirty.clear();}
  supportLift(p,angle){
    const c=Math.cos(angle),s=Math.sin(angle),ax=p.axis.x,az=p.axis.z,surface={};let lift=0;
    for(const v of p.probes){
      const dot=ax*v.x+az*v.z,x=v.x*c-az*v.y*s+ax*dot*(1-c),y=v.y*c+(az*v.x-ax*v.z)*s,z=v.z*c+ax*v.y*s+az*dot*(1-c);
      this.sample(p.x+x,p.z+z,surface);lift=Math.max(lift,surface.height-p.y-y+.012);
    }return lift;
  }
  topple(p,dx,dz,speed){
    if(this.fallen.has(p))return false;const len=Math.hypot(dx,dz);if(len<1e-6)return false;
    // Prepare support points only for the few plants that have actually been
    // hit, not for every cactus on the island. Include every surface vertex.
    const a=p.mesh.geometry.attributes.position,c=Math.cos(p.yaw),s=Math.sin(p.yaw);p.probes=[];
    for(let i=0;i<a.count;i++){const x=a.getX(i)*p.sx,z=a.getZ(i)*p.sz;p.probes.push({x:c*x+s*z,y:a.getY(i)*p.sy,z:-s*x+c*z});}
    p.axis={x:dz/len,z:-dx/len};p.age=0;p.duration=.50+Math.min(.20,p.height*.09)-Math.min(.07,speed*.003);p.landed=false;
    const surface={},span=Math.max(.35,p.height*.8);this.sample(p.x+dx/len*span,p.z+dz/len*span,surface);p.target=Math.PI/2-Math.atan2(surface.height-p.y,span)-.025;
    this.fallen.add(p);this.animating.add(p);this.onImpact({point:{x:p.x,y:p.y+.12,z:p.z},speed,landing:false,plant:p});return true;
  }
  sweep(car,from){
    const dx=car.x-from.x,dz=car.z-from.z,travel=Math.hypot(dx,dz),turn=Math.atan2(Math.sin(car.yaw-from.yaw),Math.cos(car.yaw-from.yaw));
    if(travel<.001||travel>8||Math.abs(car.speed)<.75||car.sunk||car.sinking||car.destroyed)return 0;
    const radius=Math.hypot(VEHICLE_SIZE.width,VEHICLE_SIZE.length)/2+.5,steps=Math.max(1,Math.ceil((travel+Math.abs(turn)*radius)/.18));let hits=0;
    const minX=Math.floor((Math.min(from.x,car.x)-radius)/TILE),maxX=Math.floor((Math.max(from.x,car.x)+radius)/TILE),minZ=Math.floor((Math.min(from.z,car.z)-radius)/TILE),maxZ=Math.floor((Math.max(from.z,car.z)+radius)/TILE);
    for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++)for(const p of this.grid.get(x+','+z)||[]){
      if(this.fallen.has(p)||p.y>Math.max(car.y,from.y)+1.7||p.y+p.height<Math.min(car.y,from.y)+.16)continue;
      for(let i=0;i<=steps;i++){
        const t=i/steps,pose={x:from.x+dx*t,z:from.z+dz*t,yaw:from.yaw+turn*t},local=vehicleLocal(pose,p.x,p.z),ex=Math.max(0,Math.abs(local.x)-VEHICLE_SIZE.width/2),ez=Math.max(0,Math.abs(local.z)-VEHICLE_SIZE.length/2);
        if(ex*ex+ez*ez<=p.radius*p.radius){if(this.topple(p,dx,dz,Math.abs(car.speed)))hits++;break;}
      }
    }return hits;
  }
  update(dt,fleet,{active=true}={}){
    if(this.fleet!==fleet)this.reset(fleet);if(!(dt>0)||!active)return;
    for(const car of fleet?.cars||[]){const old=this.previous.get(car.id);if(old)this.sweep(car,old);this.previous.set(car.id,{x:car.x,y:car.y,z:car.z,yaw:car.yaw});}
    for(const p of this.animating){
      p.age+=Math.min(dt,.06);const t=p.age/p.duration,angle=t<1?p.target*(.10*t+.90*t*t):p.target-.12*Math.exp(-5.5*(t-1))*Math.abs(Math.sin((t-1)*10));
      this.write(p,angle,this.supportLift(p,angle));
      if(t>=1&&!p.landed){p.landed=true;this.onImpact({point:{x:p.x-p.axis.z*p.height*.5,y:p.y+p.lift+.05,z:p.z+p.axis.x*p.height*.5},speed:2,landing:true,plant:p});}
      if(t>2.5){this.write(p,p.target,this.supportLift(p,p.target));this.animating.delete(p);}
    }this.flush();
  }
  reset(fleet){
    for(const p of this.fallen){p.axis={x:0,z:1};p.probes=null;this.write(p,0,0);}this.flush();this.fallen.clear();this.animating.clear();this.previous.clear();this.fleet=fleet;
    for(const c of fleet?.cars||[])this.previous.set(c.id,{x:c.x,y:c.y,z:c.z,yaw:c.yaw});
  }
}
