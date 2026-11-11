const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const pivot=.90;
export const VEHICLE_BLAST_TIMING=Object.freeze({launch:.055,ignition:.24,smoke:.38});
export function rotateVehiclePoint(v,pitch=0,yaw=0,roll=0){
  const cr=Math.cos(roll),sr=Math.sin(roll),cp=Math.cos(pitch),sp=Math.sin(pitch),cy=Math.cos(yaw),sy=Math.sin(yaw),x=v.x*cr-v.y*sr,y=v.x*sr+v.y*cr,z=v.z;
  const yy=y*cp-z*sp,zz=y*sp+z*cp;return {x:x*cy+zz*sy,y:yy,z:-x*sy+zz*cy};
}
export function wreckCorners(car){
  const a=[];for(const x of [-1.06,1.06])for(const y of [0,1.84])for(const z of [-1.99,1.99]){const p=rotateVehiclePoint({x,y,z},car.pitch,car.yaw,car.roll);a.push({x:car.x+p.x,y:car.y+p.y,z:car.z+p.z});}return a;
}
export function wreckBounds(car){
  const p=wreckCorners(car);return {minX:Math.min(...p.map(v=>v.x)),maxX:Math.max(...p.map(v=>v.x)),minY:Math.min(...p.map(v=>v.y)),maxY:Math.max(...p.map(v=>v.y)),minZ:Math.min(...p.map(v=>v.z)),maxZ:Math.max(...p.map(v=>v.z))};
}
function rootFromCenter(car,m){const p=rotateVehiclePoint({x:0,y:pivot,z:0},car.pitch,car.yaw,car.roll);car.x=m.center.x-p.x;car.y=m.center.y-p.y;car.z=m.center.z-p.z;}
function syncCollider(car){const b=wreckBounds(car);Object.assign(car.collider,{type:'box',x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2,y:b.minY,w:b.maxX-b.minX,d:b.maxZ-b.minZ,h:b.maxY-b.minY,yaw:0,support:false});}
export function launchVehicleWreck(car,impact){
  const p=impact.point,dx=car.x-p.x,dz=car.z-p.z,d=Math.hypot(dx,dz),fallback=impact.direction||{x:-Math.sin(car.yaw),z:-Math.cos(car.yaw)},length=Math.hypot(fallback.x||0,fallback.z||0)||1;
  const x=d>.18?dx/d:(fallback.x||0)/length,z=d>.18?dz/d:(fallback.z||0)/length,power=clamp(impact.power??1,.35,1),co=Math.cos(car.yaw),si=Math.sin(car.yaw),localX=x*co-z*si,localZ=x*si+z*co;
  const offset=rotateVehiclePoint({x:0,y:pivot,z:0},car.pitch,car.yaw,car.roll),speed=car.speed||0;
  car.wreckMotion={phase:'blast',age:0,accumulator:0,center:{x:car.x+offset.x,y:car.y+offset.y,z:car.z+offset.z},velocity:{x:x*(1.45+power*1.55)-Math.sin(car.yaw)*speed*.28,y:5.3+power*1.35,z:z*(1.45+power*1.55)-Math.cos(car.yaw)*speed*.28},spin:{pitch:localZ*.86,yaw:(localX||.3)*.35,roll:-localX*1.48+(car.id%2?-.22:.22)},grounded:false,bounces:0,landedAge:0,burnAge:null,ignitedAt:null,impact:{point:{x:p.x,y:p.y,z:p.z},direction:{x,z}},sleeping:false};
}
function obstacleBounds(c){const s=Math.abs(Math.sin(c.yaw||0)),co=Math.abs(Math.cos(c.yaw||0)),w=(c.w||0)*co+(c.d||0)*s,d=(c.w||0)*s+(c.d||0)*co;return {minX:c.x-w/2,maxX:c.x+w/2,minZ:c.z-d/2,maxZ:c.z+d/2};}
function collide(car,m,old,colliders){
  let landed=false;
  for(const c of colliders){
    if(c===car.collider||c.walkThrough)continue;const b=wreckBounds(car),top=c.y+c.h;
    if(b.maxY<=c.y||b.minY>=top)continue;
    if(c.type==='circle'){
      const qx=clamp(c.x,b.minX,b.maxX),qz=clamp(c.z,b.minZ,b.maxZ),dx=qx-c.x,dz=qz-c.z,len=Math.hypot(dx,dz);if(len>=c.r)continue;
      if(old.minY>=top-.06&&m.velocity.y<=0){m.center.y+=top-b.minY+.018;landed=true;}
      else if(len>.001){m.center.x+=dx/len*(c.r-len+.02);m.center.z+=dz/len*(c.r-len+.02);m.velocity.x*=-.1;m.velocity.z*=-.1;}
      else{const left=b.maxX-(c.x-c.r),right=c.x+c.r-b.minX;if(left<right)m.center.x-=left+.02;else m.center.x+=right+.02;m.velocity.x=0;}
    }else{
      const o=obstacleBounds(c);if(b.maxX<=o.minX||b.minX>=o.maxX||b.maxZ<=o.minZ||b.minZ>=o.maxZ)continue;
      if(old.minY>=top-.06&&m.velocity.y<=0){m.center.y+=top-b.minY+.018;landed=true;}
      else if(old.maxY<=c.y+.06&&m.velocity.y>0){m.center.y-=b.maxY-c.y+.018;m.velocity.y=-Math.abs(m.velocity.y)*.15;}
      else{const xs=[o.maxX-b.minX,b.maxX-o.minX],zs=[o.maxZ-b.minZ,b.maxZ-o.minZ],px=Math.min(...xs),pz=Math.min(...zs);if(px<pz){m.center.x+=(xs[0]<xs[1]?1:-1)*(px+.018);m.velocity.x*=-.12;}else{m.center.z+=(zs[0]<zs[1]?1:-1)*(pz+.018);m.velocity.z*=-.12;}}
    }rootFromCenter(car,m);
  }return landed;
}
export function advanceVehicleWreck(car,dt,{terrain,waterLevel=3,colliders=[],emit=()=>{}}){
  const m=car.wreckMotion;if(!m||!(dt>0))return;
  m.accumulator+=Math.min(dt,.25);m.waterLevel=waterLevel;const nearby=colliders.filter(c=>c!==car.collider&&!c.walkThrough&&Math.abs(c.x-m.center.x)<(c.r||((c.w||0)+(c.d||0))*.6)+6&&Math.abs(c.z-m.center.z)<(c.r||((c.w||0)+(c.d||0))*.6)+6),h=1/120;
  while(m.accumulator+1e-9>=h){
    m.accumulator-=h;m.age+=h;car.wreckAge+=h;
    if(m.age<VEHICLE_BLAST_TIMING.launch)continue;
    if(m.phase==='blast')m.phase='airborne';
    if(!m.sleeping){
      const old=wreckBounds(car);m.velocity.y-=9.81*h;
      m.center.x+=m.velocity.x*h;m.center.y+=m.velocity.y*h;m.center.z+=m.velocity.z*h;
      if(m.grounded){const blend=1-Math.exp(-9*h);car.pitch+=(m.restPitch-car.pitch)*blend;car.roll+=(m.restRoll-car.roll)*blend;m.velocity.x*=Math.exp(-7*h);m.velocity.z*=Math.exp(-7*h);}
      else{car.pitch+=m.spin.pitch*h;car.roll+=m.spin.roll*h;car.yaw+=m.spin.yaw*h;if(Math.abs(car.roll)>2.05){car.roll=Math.sign(car.roll)*2.05;m.spin.roll=0;}}
      m.center.x=clamp(m.center.x,-296,296);m.center.z=clamp(m.center.z,-296,296);rootFromCenter(car,m);
      let groundLift=-Infinity;for(const p of wreckCorners(car))groundLift=Math.max(groundLift,terrain(p.x,p.z)+.025-p.y);
      let contact=m.grounded||groundLift>0;if(contact){m.center.y+=groundLift;rootFromCenter(car,m);}
      contact=collide(car,m,old,nearby)||contact;
      if(contact&&m.velocity.y<=0){
        const speed=-m.velocity.y;
        if(speed>.7&&!m.grounded){emit({type:'vehiclelanding',vehicle:car,point:{x:car.x,y:Math.max(terrain(car.x,car.z),wreckBounds(car).minY)+.025,z:car.z},speed});m.impactSpeed=speed;m.phase='impact';}
        if(speed>2&&m.bounces===0){m.bounces++;m.velocity.y=speed*.15;m.velocity.x*=.58;m.velocity.z*=.58;}
        else{m.velocity.y=0;if(!m.grounded){m.grounded=true;m.landedAt=m.age;m.restPitch=0;m.restRoll=Math.round(car.roll/(Math.PI/2))*Math.PI/2;}m.landedAge+=h;}
      }
      if(m.grounded&&m.landedAge>.7&&Math.abs(car.pitch-m.restPitch)<.008&&Math.abs(car.roll-m.restRoll)<.008&&Math.hypot(m.velocity.x,m.velocity.z)<.025){m.sleeping=true;m.velocity={x:0,y:0,z:0};}
      syncCollider(car);
    }
    const b=wreckBounds(car),wet=terrain(car.x,car.z)<waterLevel-.2&&b.minY<waterLevel-.15;
    if(wet&&!car.inWater)emit({type:'vehiclewater',vehicle:car,point:{x:car.x,y:waterLevel,z:car.z},speed:Math.hypot(m.velocity.x,m.velocity.y,m.velocity.z)});
    car.inWater=wet;if(wet&&b.maxY<waterLevel-.05){m.phase='submerged';m.extinguished=true;}
    if(m.grounded&&!m.extinguished&&m.landedAge>=VEHICLE_BLAST_TIMING.ignition){if(m.ignitedAt===null){m.ignitedAt=m.age;m.phase='burning';emit({type:'vehicleignited',vehicle:car});}m.burnAge=m.age-m.ignitedAt;}
  }
}
export function wreckBurnProfile(car){
  if(!car.destroyed||car.inWater&&car.y+1<(car.wreckMotion?.waterLevel??3))return null;const m=car.wreckMotion;
  if(m&&(m.burnAge===null||m.extinguished))return null;
  const age=m?m.burnAge:car.wreckAge;if(!(age>=0))return null;
  return {age,fire:clamp(age/.22,0,1)*Math.max(.18,1-age/110),smoke:age<VEHICLE_BLAST_TIMING.smoke?0:Math.min(1,(age-VEHICLE_BLAST_TIMING.smoke)/.65)*Math.max(.58,1-age/360)};
}
