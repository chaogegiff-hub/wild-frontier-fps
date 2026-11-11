import {launchVehicleWreck,advanceVehicleWreck} from './vehicle-blast.js?v=2.31-car-blast1';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const VEHICLE_SIZE=Object.freeze({width:2.12,length:3.98,height:1.84,wheelBase:2.42,wheelRadius:.415});
export const VEHICLE_TERRAIN_LIMITS=Object.freeze({pitch:.68,roll:.49,warp:.72,belly:.56});
// Center and outward normal of the hollow outlet in the licensed Jeep mesh.
export const VEHICLE_EXHAUST=Object.freeze({x:.286212,y:.550418,z:1.868465});
export const VEHICLE_EXHAUST_AXIS=Object.freeze({x:0,y:.409,z:.912});
export const VEHICLE_WHEELS=Object.freeze([
  {name:'front-left',x:-.806674,z:-1.341497,front:true},
  {name:'front-right',x:.806674,z:-1.341497,front:true},
  {name:'rear-left',x:-.899963,z:1.078096,front:false},
  {name:'rear-right',x:.899963,z:1.078096,front:false}
].map(Object.freeze));
export function wheelSteer(steer,wheel){
  if(!wheel.front||Math.abs(steer)<1e-6)return 0;
  // The inside front tire follows a tighter circle; the rear tires stay straight.
  return -Math.atan(VEHICLE_SIZE.wheelBase/(VEHICLE_SIZE.wheelBase/Math.tan(steer)-wheel.x));
}
export const VEHICLE_SPAWNS=Object.freeze([{x:-69,z:145,yaw:0},{x:-116,z:100,yaw:Math.PI*.12},{x:119,z:117,yaw:-Math.PI*.45}]);
export function vehicleLocal(c,x,z){const dx=x-c.x,dz=z-c.z,s=Math.sin(c.yaw||0),co=Math.cos(c.yaw||0);return {x:co*dx-s*dz,z:s*dx+co*dz};}
export function vehicleWorld(c,x,z){const s=Math.sin(c.yaw||0),co=Math.cos(c.yaw||0);return {x:c.x+co*x+s*z,z:c.z-s*x+co*z};}
export function circleTouchesBox(x,z,r,c){const p=vehicleLocal(c,x,z);return Math.hypot(p.x-clamp(p.x,-c.w/2,c.w/2),p.z-clamp(p.z,-c.d/2,c.d/2))<r;}
function boxesTouch(a,b){
  const axes=[a.yaw||0,(a.yaw||0)+Math.PI/2,b.yaw||0,(b.yaw||0)+Math.PI/2],dx=b.x-a.x,dz=b.z-a.z;
  for(const angle of axes){const x=Math.cos(angle),z=-Math.sin(angle),radius=c=>c.w/2*Math.abs(x*Math.cos(c.yaw||0)-z*Math.sin(c.yaw||0))+c.d/2*Math.abs(x*Math.sin(c.yaw||0)+z*Math.cos(c.yaw||0));if(Math.abs(dx*x+dz*z)>=radius(a)+radius(b))return false;}return true;
}
const CONTACTS=VEHICLE_WHEELS.map(w=>[w.x,w.z]);
export function vehicleSupport(c,terrain){
  const heights=CONTACTS.map(([x,z])=>{const p=vehicleWorld(c,x,z);return terrain(p.x,p.z);}),front=(heights[0]+heights[1])*.5,rear=(heights[2]+heights[3])*.5,support=heights.reduce((n,y)=>n+y,0)/4;
  return {heights,support,center:terrain(c.x,c.z),pitch:Math.atan2(front-rear,VEHICLE_SIZE.wheelBase),roll:Math.atan2((heights[1]+heights[3]-heights[0]-heights[2])*.5,1.706637),warp:Math.abs(heights[0]+heights[3]-heights[1]-heights[2])*.5};
}

export class VehicleFleet{
  constructor({terrain,waterLevel=3,colliders=[],spawns=VEHICLE_SPAWNS}){
    this.terrain=terrain;this.colliders=colliders;this.waterLevel=waterLevel;this.driverId=null;this.exitPending=false;this.cars=[];this.events=[];
    for(const [id,spawn] of spawns.entries()){
      let car;
      for(const radius of [0,3,6,9,12]){
        for(let i=0;i<(radius?12:1);i++){
          const x=spawn.x+Math.cos(i*Math.PI/6)*radius,z=spawn.z+Math.sin(i*Math.PI/6)*radius,candidate={id,name:`野外 4×4 · ${String(id+1).padStart(2,'0')}`,x,z,y:this.terrain(x,z),yaw:spawn.yaw,speed:0,steer:0,wheelAngle:0,pitch:0,roll:0,braking:false,collision:false,flood:0,inWater:false,waterDepth:0,stalled:false,sinking:false,sunk:false,sinkAge:0,sinkVelocity:0,driverDead:false,hp:100,destroyed:false,wreckAge:0};
          if(this.canPlace(candidate,colliders,{parking:true})){car=candidate;break;}
        }if(car)break;
      }
      if(!car)throw new Error('越野车泊位没有安全空间');
      car.wheels=Object.fromEntries(VEHICLE_WHEELS.map(w=>[w.name,{spin:0,steer:0}]));
      this.pose(car);car.collider={type:'obox',vehicle:true,x:car.x,z:car.z,y:car.y+.25,w:2.08,d:3.9,h:1.0,yaw:car.yaw,surface:'metal'};this.cars.push(car);
    }
  }
  destroy(car,impact){if(car.destroyed)return false;if(impact?.point)launchVehicleWreck(car,impact);Object.assign(car,{hp:0,destroyed:true,wreckAge:0,speed:0,steer:0,stalled:true,braking:false});Object.assign(car.collider,{h:.40,support:true});return true;}
  get current(){return this.driverId===null?null:this.cars.find(c=>c.id===this.driverId)||null;}
  body(c){return {x:c.x,z:c.z,yaw:c.yaw,w:VEHICLE_SIZE.width,d:VEHICLE_SIZE.length};}
  canPlace(c,colliders,{parking=false}={}){
    if(Math.abs(c.x)>262||Math.abs(c.z)>262)return false;
    const {heights,center,support,pitch,roll,warp}=vehicleSupport(c,this.terrain);
    const low=Math.min(...heights,center);
    if(parking&&low<this.waterLevel+.12)return false;
    const steep=(Math.abs(pitch)>VEHICLE_TERRAIN_LIMITS.pitch||Math.abs(roll)>VEHICLE_TERRAIN_LIMITS.roll||warp>VEHICLE_TERRAIN_LIMITS.warp)&&low>this.waterLevel-.2,belly=center>this.waterLevel+.25&&center-support>VEHICLE_TERRAIN_LIMITS.belly;
    if(steep||belly){
      // Descending lake banks allow water entry; dry uphill and obstacle limits remain.
      const sign=c.speed<-.01?-1:1,front=(heights[0]+heights[1])*.5,rear=(heights[2]+heights[3])*.5,descending=(front-rear)*sign<-.25;
      const shore=!parking&&descending&&[6,12,18].some(d=>{const p=vehicleWorld(c,0,-d*sign);return this.terrain(p.x,p.z)<this.waterLevel+.2;});if(!shore)return false;
    }
    // Compare the belly to the current support plane. The old center-vs-body
    // test and four-wheel height range mistook an ordinary tilted plane for a
    // wall, trapping cars even when moving downhill or reversing out.
    const body=this.body(c);
    for(const obstacle of colliders){
      if(obstacle.bridge||obstacle.y>c.y+VEHICLE_SIZE.height||obstacle.y+obstacle.h<c.y+.15)continue;
      if(obstacle.type==='circle'?circleTouchesBox(obstacle.x,obstacle.z,obstacle.r+.035,body):boxesTouch(body,obstacle))return false;
    }
    return !this.cars.some(other=>other.id!==c.id&&(other.wreckMotion?other.collider.y<c.y+VEHICLE_SIZE.height&&other.collider.y+other.collider.h>c.y&&boxesTouch(body,other.collider):Math.abs(other.y-c.y)<VEHICLE_SIZE.height&&boxesTouch(body,this.body(other))));
  }
  pose(c,dt=0){
    const ground=vehicleSupport(c,this.terrain),support=ground.support+.025,floor=support-(c.sinking?.12:0),pitch=clamp(ground.pitch,-.70,.70),roll=clamp(ground.roll,-.52,.52);
    c.waterDepth=Math.max(0,this.waterLevel-support);const wet=c.waterDepth>.35;
    if(wet&&!c.inWater&&dt>0)this.events.push({type:'vehiclewater',vehicle:c,point:{x:c.x,y:this.waterLevel,z:c.z},speed:Math.abs(c.speed)});
    c.inWater=wet;
    if(!c.sinking)c.flood=clamp(c.flood+dt*(c.waterDepth>.85?.65:-.4),0,1);
    if(c.flood>=1&&!c.sinking){c.sinking=true;c.speed*=.3;this.events.push({type:'vehiclesinking',vehicle:c});}
    c.stalled=!!c.destroyed||c.flood>.72||c.sinking;
    if(c.sinking){
      c.sinkAge+=dt;c.sinkVelocity=Math.max(-1.9,c.sinkVelocity-.65*dt);c.y=Math.max(floor,c.y+c.sinkVelocity*dt);c.sunk=c.y<=floor+.008;
      const blend=1-Math.exp(-3*dt);c.pitch+=((c.sunk?pitch:-.20)-c.pitch)*blend;c.roll+=((c.sunk?roll:.055*Math.sin(c.sinkAge*.8))-c.roll)*blend;
    }else if(c.waterDepth>.55){
      const surface=Math.max(floor,this.waterLevel-.46);c.y+=clamp(surface-c.y,-1.5*dt,.8*dt);const blend=1-Math.exp(-4*dt);c.pitch+=(-.06-c.pitch)*blend;c.roll+=(roll*.2-c.roll)*blend;
    }else{c.y=floor;c.pitch=pitch;c.roll=roll;}
    if(c.collider)Object.assign(c.collider,{x:c.x,z:c.z,y:c.y+.25,yaw:c.yaw});
  }
  takeEvents(){const events=this.events;this.events=[];return events;}
  updateParked(car,dt,colliders=this.colliders){
    if(car.destroyed&&car.wreckMotion){advanceVehicleWreck(car,dt,{terrain:this.terrain,waterLevel:this.waterLevel,colliders:[...colliders,...this.cars.filter(c=>c!==car).map(c=>c.collider)],emit:e=>this.events.push(e)});return;}
    if(car.destroyed)car.wreckAge+=dt;if(car.inWater||car.sinking)this.pose(car,dt);
  }
  updatePassive(dt,player,colliders=this.colliders){
    const count=Math.max(1,Math.ceil(Math.min(dt,.25)*120)),s=Math.min(dt,.25)/count;
    for(let i=0;i<count;i++)for(const car of this.cars)this.updateParked(car,s,colliders);
    this.syncPlayer(player);
  }
  pathClear(a,b,colliders){
    const length=Math.hypot(a.x-b.x,a.z-b.z),steps=Math.ceil(length/.2);
    for(let i=0;i<=steps;i++){const t=steps?i/steps:0,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
      for(const o of colliders){if(o.bridge||y<o.y||y>o.y+o.h)continue;const p=vehicleLocal(o,x,z);if(o.type==='circle'?Math.hypot(p.x,p.z)<o.r:Math.abs(p.x)<o.w/2&&Math.abs(p.z)<o.d/2)return false;}
    }return true;
  }
  nearest(player,colliders){
    let found=null,distance=4.6;
    for(const c of this.cars){const d=Math.hypot(c.x-player.x,c.z-player.z);if(c.stalled||c.sinking||d>=distance||Math.abs(player.ground-c.y)>2||!this.pathClear(player,{x:c.x,y:c.y+1.45,z:c.z},colliders))continue;found=c;distance=d;}return found;
  }
  enter(player,colliders){
    if(this.current)return null;const car=this.nearest(player,colliders);if(!car)return null;
    this.driverId=car.id;this.exitPending=false;car.speed=0;this.syncPlayer(player);return {type:'vehicleenter',vehicle:car};
  }
  requestExit(player,colliders){
    const car=this.current;if(!car)return null;this.exitPending=true;
    return Math.abs(car.speed)<.8?this.tryExit(player,colliders):{type:'vehiclestopping',vehicle:car};
  }
  tryExit(player,colliders){
    const car=this.current;if(!car)return null;
    for(const [x,z] of [[-1.85,0],[1.85,0],[-1.85,1],[1.85,1],[0,2.65],[0,-2.65],[-2.3,-1.9],[2.3,-1.9]]){
      const p=vehicleWorld(car,x,z),ground=this.terrain(p.x,p.z);
      const swimming=ground<this.waterLevel-.55,standing=Math.max(ground,swimming?this.waterLevel-.55:ground);
      if(Math.abs(p.x)>264||Math.abs(p.z)>264||!swimming&&Math.abs(ground-car.y)>1.2)continue;
      const all=[...colliders,...this.cars.map(c=>c.collider)];
      if(all.some(o=>!o.bridge&&(o.type==='circle'?Math.hypot(o.x-p.x,o.z-p.z)<o.r+.42:circleTouchesBox(p.x,p.z,.42,o))))continue;
      if(!this.pathClear({x:car.x,y:car.y+1.45,z:car.z},{...p,y:standing+1.45},colliders))continue;
      car.speed=0;car.braking=false;this.driverId=null;this.exitPending=false;Object.assign(player,p,{ground,y:swimming?this.waterLevel+.38:standing+1.72,yaw:car.yaw,pitch:-.045,jump:0,vy:0,crouch:false});return {type:'vehicleexit',vehicle:car};
    }
    this.exitPending=false;return {type:'vehicleexitblocked',vehicle:car};
  }
  syncPlayer(player){const c=this.current;if(c)Object.assign(player,{x:c.x,y:c.y+1.5,z:c.z,ground:c.y,yaw:c.yaw,jump:0,vy:0,crouch:false});}
  update(dt,input,player,colliders,onTravel){
    this.colliders=colliders;const car=this.current;if(!car||car.destroyed&&car.wreckMotion){this.updatePassive(dt,player,colliders);return null;}
    const count=Math.max(1,Math.ceil(Math.min(dt,.25)*120)),s=Math.min(dt,.25)/count;
    car.collision=false;
    for(let i=0;i<count;i++){
      const throttle=this.exitPending||car.stalled?0:clamp(input.throttle||0,-1,1),brake=!!input.brake||this.exitPending||car.sunk;
      car.throttle=throttle;car.steer+=(clamp(input.steer||0,-1,1)*.48-car.steer)*(1-Math.exp(-8*s));car.braking=brake||throttle*car.speed<-.1;
      for(const wheel of VEHICLE_WHEELS)car.wheels[wheel.name].steer=wheelSteer(car.steer,wheel);
      if(car.braking){const amount=(brake?22:15)*s;car.speed=Math.abs(car.speed)<=amount?0:car.speed-Math.sign(car.speed)*amount;}
      else car.speed+=throttle*(Math.abs(car.speed)<12?7.4:4.8)*s;
      car.speed*=Math.exp(-(car.waterDepth>.5?1.05:throttle?.16:1.1)*s);car.speed=clamp(car.speed,-6.5,21.5);
      // A short high-refresh frame still adds real acceleration. Snapping each
      // tiny powered step to zero prevented cars from starting above 211 Hz.
      if(Math.abs(car.speed)<.035&&!throttle)car.speed=0;
      const requestedYaw=car.yaw-car.speed/VEHICLE_SIZE.wheelBase*Math.tan(car.steer)*s,rear=vehicleWorld(car,0,1.078096);
      const advance=factor=>{const yaw=car.yaw+(requestedYaw-car.yaw)*factor,mid=(yaw+car.yaw)*.5;return {yaw,x:rear.x-Math.sin(mid)*car.speed*s-Math.sin(yaw)*1.078096,z:rear.z-Math.cos(mid)*car.speed*s-Math.cos(yaw)*1.078096};};
      let next=advance(1),clear=this.canPlace({...car,...next},colliders);
      // A bumper beside a wall can prevent the requested turn while leaving
      // space to move straight out. Limit rotation; never disable collision.
      if(!clear&&Math.abs(requestedYaw-car.yaw)>1e-8)for(const factor of [.5,0]){const candidate=advance(factor);if(this.canPlace({...car,...candidate},colliders)){next=candidate;clear=true;car.collision=true;break;}}
      const {x,z,yaw}=next,midYaw=(yaw+car.yaw)*.5;
      if(clear){
        for(const wheel of VEHICLE_WHEELS){
          const before=vehicleWorld(car,wheel.x,wheel.z),after=vehicleWorld(next,wheel.x,wheel.z),state=car.wheels[wheel.name],heading=midYaw+state.steer;
          const travel=(after.x-before.x)*-Math.sin(heading)+(after.z-before.z)*-Math.cos(heading);
          state.spin-=travel/VEHICLE_SIZE.wheelRadius;
        }
        const previous=onTravel?{x:car.x,z:car.z,yaw:car.yaw}:null;
        Object.assign(car,{x,z,yaw});car.wheelAngle-=car.speed*s/VEHICLE_SIZE.wheelRadius;
        if(onTravel&&Math.hypot(x-previous.x,z-previous.z)>1e-7)onTravel(car,previous,s);
      }
      else{car.collision=true;car.speed*=.12;}
      if(car.destroyed)car.wreckAge+=s;this.pose(car,s);for(const other of this.cars)if(other!==car)this.updateParked(other,s,colliders);
    }
    this.syncPlayer(player);
    if(this.exitPending&&Math.abs(car.speed)<.8)return this.tryExit(player,colliders);
    return null;
  }
}
