import {bulletHit} from './bullet-hit.js?v=2.30-hit-collapse1';
import {EnemyDirector} from './enemy-ai.js?v=2.29-enemy-awareness1';
import {houseColliders,houseWindows,houseLoot} from './building-layout.js?v=2.25-drive-grass1';
import {terrainRelief} from './terrain-data.js?v=2.25-drive-grass1';
import {VehicleFleet,vehicleLocal,circleTouchesBox} from './vehicle-physics.js?v=2.25-drive-grass1';
import {findWindowVault,vaultSample} from './window-vault.js?v=2.25-drive-grass1';
// Rendering, collision and targeting share one proportional enemy size.
export const ENEMY_SCALE=1.18;
export const ENEMY_BODY=Object.freeze({scale:ENEMY_SCALE,head:1.66*ENEMY_SCALE,headRadius:.245*ENEMY_SCALE,torso:.95*ENEMY_SCALE,torsoRadius:.53*ENEMY_SCALE,lock:.98*ENEMY_SCALE,fire:1.48*ENEMY_SCALE,grenadeRadius:.62*ENEMY_SCALE,height:1.86*ENEMY_SCALE});
export const WORLD_SIZE = 640;
export const WATER_LEVEL = 3;
export const SPAWN = { x: -64, z: 146 };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
export function randomSeed(seed=7317) { return () => { seed |= 0; seed = seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function hash(x,z) { return ((Math.imul(x,374761393)^Math.imul(z,668265263))>>>0)/4294967295; }
export function noise(x,z) { const a=Math.floor(x),b=Math.floor(z),u=smooth(0,1,x-a),v=smooth(0,1,z-b); return lerp(lerp(hash(a,b),hash(a+1,b),u),lerp(hash(a,b+1),hash(a+1,b+1),u),v); }
function baseHeightAt(x,z) {
  let h=6.3+terrainRelief(x,z)+noise(x*.042,z*.042)*1.3+noise(x*.18+4,z*.18)*.23;
  const shoreWarp=(noise(x*.025+4,z*.025+8)-.5)*.16;
  const lake=Math.hypot((x-26)/68,(z+22)/89)+shoreWarp;
  const shoreDistance=(lake-.74)*78,shoreLimit=4.8+Math.max(0,shoreDistance)*.50+noise(x*.031,z*.031)*.65;
  // A distance-limited shore avoids artificial cone-shaped walls produced by
  // multiplying a high ridge by a narrow radial lake mask.
  const delta=h-shoreLimit,shoreRelief=(h+shoreLimit-Math.sqrt(delta*delta+9))*.5;
  h=lerp(.6+noise(x*.026,z*.026)*.7,shoreRelief,smooth(-5,8,shoreDistance));
  if(z<-58){
    const d=Math.abs(x-riverX(z)),width=riverHalfWidth(z),bed=.45+noise(x*.07,z*.06)*.4;
    const bank=4.3+noise(x*.032+2,z*.034)*.65;
    const bankLimit=bank+Math.max(0,d-width)*.46,delta=h-bankLimit;
    const bankRelief=(h+bankLimit-Math.sqrt(delta*delta+4))*.5;
    const channel=lerp(bed,Math.max(bank,bankRelief),smooth(width*.55,width+7,d));
    h=lerp(h,channel,smooth(-58,-94,z));
  }
  // A dirt route winds along the western shore; it stays above the waterline.
  const road=roadX(z),roadFade=(1-smooth(3.8,9,Math.abs(x-road)))*(1-smooth(195,245,Math.abs(z)));
  h=lerp(h,Math.max(6.8,h*.88),roadFade*.55);
  // Wide, irregular beaches join the same continuous water surface as the lake.
  const coastDistance=292-Math.hypot(x*.97,z*1.015)+(noise(x*.012+14,z*.012-8)-.5)*20;
  const coastLimit=4.7+Math.max(0,coastDistance)*.47,coastDelta=h-coastLimit;
  const coastRelief=(h+coastLimit-Math.sqrt(coastDelta*coastDelta+4))*.5;
  return Math.max(.25,lerp(.4,coastRelief,smooth(-8,9,coastDistance)));
}
// Human-scale farmhouses sit on graded sites, with terrain blended back into
// the surrounding slopes. Indexing keeps vegetation sampling inexpensive.
export const BUILDING_SITES=[
  [-113,110,11,8.2,6.2,2,0],[-108,83,10,8,3.25,1,1],[-128,69,9,7,3.25,1,2],
  [-121,43,11.8,9,6.25,2,1],[-126,15,9.4,7.6,3.3,1,0],[-108,-16,10,8.6,3.35,1,2],
  [-132,-37,12.5,9.5,6.3,2,0],[-87,-98,10.8,8.4,3.25,1,1],
  [112,101,12,9,6.2,2,1],[133,78,9,7,3.3,1,0],[109,54,10,8,3.25,1,2],
  [138,32,11,8.4,6.3,2,0],[164,62,10,8,3.3,1,1],[163,104,9,7,3.3,1,2]
].map(([x,z,w,d,h,stories,style])=>Object.freeze({x,z,w,d,h,stories,style}));
const padCells=new Map();
for(const b of BUILDING_SITES){
  const pad={...b,ground:baseHeightAt(b.x,b.z)};
  for(let ix=Math.floor((b.x-b.w/2-9)/64);ix<=Math.floor((b.x+b.w/2+9)/64);ix++)for(let iz=Math.floor((b.z-b.d/2-9)/64);iz<=Math.floor((b.z+b.d/2+9)/64);iz++){
    const key=ix+','+iz;if(!padCells.has(key))padCells.set(key,[]);padCells.get(key).push(pad);
  }
}
export function heightAt(x,z){
  let h=baseHeightAt(x,z);
  for(const b of padCells.get(Math.floor(x/64)+','+Math.floor(z/64))??[]){
    const dx=Math.max(0,Math.abs(x-b.x)-b.w/2-1.2),dz=Math.max(0,Math.abs(z-b.z)-b.d/2-1.2);
    const amount=1-smooth(0,8,Math.hypot(dx,dz));h=lerp(h,b.ground,amount);
  }
  return h;
}
export const TRAIL_ROUTES=[
  {width:2.2,points:[[-95,124],[-110,116],[-115,89],[-127,75],[-122,49],[-126,21],[-108,-10],[-132,-31]]},
  {width:2.8,points:[[101,131],[112,107],[129,94],[139,84],[133,67],[110,60],[125,43],[138,38],[158,53],[164,68],[162,97],[163,110]]}
];
const trailSegments=TRAIL_ROUTES.flatMap(r=>r.points.slice(1).map((p,i)=>({ax:r.points[i][0],az:r.points[i][1],bx:p[0],bz:p[1],width:r.width})));
export function onTrail(x,z,margin=0){
  for(const s of trailSegments){const r=s.width+margin;if(x<Math.min(s.ax,s.bx)-r||x>Math.max(s.ax,s.bx)+r||z<Math.min(s.az,s.bz)-r||z>Math.max(s.az,s.bz)+r)continue;
    const dx=s.bx-s.ax,dz=s.bz-s.az,t=clamp(((x-s.ax)*dx+(z-s.az)*dz)/(dx*dx+dz*dz),0,1);
    if(Math.hypot(x-s.ax-t*dx,z-s.az-t*dz)<r)return true;
  }return false;
}
export function roadX(z) { return -89+Math.sin(z*.015)*18+Math.cos(z*.031)*6; }
export function riverX(z){return 26+Math.sin(z*.014)*11+Math.sin(z*.037+1.1)*4+(noise(z*.012,17)-.5)*7;}
export function riverHalfWidth(z){return 6.5+noise(z*.018,6)*5;}
export function slopeAt(x,z) { return Math.hypot(heightAt(x+1,z)-heightAt(x-1,z),heightAt(x,z+1)-heightAt(x,z-1))/2; }
// Match the actual triangular terrain surface, so short grass cannot be buried
// below a coarse terrain triangle even when the sampled relief is uneven.
export function terrainSurfaceAt(x,z){
  const step=WORLD_SIZE/224,ix=Math.floor((x+WORLD_SIZE/2)/step),iz=Math.floor((z+WORLD_SIZE/2)/step),x0=ix*step-WORLD_SIZE/2,z0=iz*step-WORLD_SIZE/2,tx=(x-x0)/step,tz=(z-z0)/step;
  const b=heightAt(x0,z0+step),d=heightAt(x0+step,z0);
  return tx+tz<=1?heightAt(x0,z0)*(1-tx-tz)+d*tx+b*tz:heightAt(x0+step,z0+step)*(tx+tz-1)+b*(1-tx)+d*(1-tz);
}
export const WEAPONS = [
  { id:'sniper',name:'M700 狙击枪',short:'M700',tag:'7.62 × 51 mm · 8×',ammo:'7.62',mag:5,reserve:35,damage:88,interval:1.18,reload:2.7,zoom:8,range:450,velocity:820 },
  { id:'grenade',name:'GL-6 榴弹炮',short:'GL-6',tag:'40 mm · 锁定追踪',mag:6,reserve:24,damage:140,interval:.72,reload:3.1,zoom:1.8,range:240 },
  { id:'rifle',name:'AKM 突击步枪',short:'AKM',tag:'7.62 × 39 mm · 全自动',ammo:'7.62x39',mag:30,reserve:180,damage:34,interval:.10,reload:2.1,zoom:1.35,range:300,velocity:715 }
];
export function zoomFov(base,magnification) { return 2*Math.atan(Math.tan(base*Math.PI/360)/magnification)*180/Math.PI; }
export function direction(yaw,pitch) { return {x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)}; }
export const GRENADE_LOCK_TIME=.30;

function impactState(e,state){
  const c=Math.cos(e.yaw),s=Math.sin(e.yaw),speed=Math.hypot(state.vx,state.vz)||1,x=(state.vx*c-state.vz*s)/speed,z=(state.vx*s+state.vz*c)/speed,turn=state.kind==='vehicle'?Math.min(2.8,1.4+(state.speed||0)*.06):1.6+(state.power||0)*1.8;
  return {...state,origin:{x:e.x,y:e.y,z:e.z},initialVelocity:{vx:state.vx,vy:state.vy,vz:state.vz},age:0,flightTime:0,landedAge:0,grounded:false,spinX:-z*turn,spinY:Math.sin(e.id*2.71)*.28,spinZ:x*turn};
}

export function circleBlocked(x,z,r,colliders,feetY,bodyHeight=1.5) {
  for(const c of colliders) {
    if(c.bridge||c.walkThrough||Number.isFinite(feetY)&&(c.y>=feetY+bodyHeight||c.y+c.h<=feetY+.32)) continue;
    if(c.type==='box'||c.type==='obox') { if(circleTouchesBox(x,z,r,c))return true; }
    else if(Math.hypot(x-c.x,z-c.z)<r+c.r) return true;
  }
  return false;
}
export function walkHeight(x,z,colliders,reference=Infinity) {
  let y=heightAt(x,z);
  for(const c of colliders)if((c.bridge||c.support)&&(!c.indoor||c.y+c.h<=reference+.55)&&Math.abs(x-c.x)<c.w/2&&Math.abs(z-c.z)<c.d/2)y=Math.max(y,c.y+c.h);
  return y;
}
export function moveGround(actor,dx,dz,colliders,r=.38) {
  const max=265;let reference=actor.ground??actor.y??heightAt(actor.x,actor.z);
  const tryAxis=(nx,nz)=>Math.abs(nx)<max&&Math.abs(nz)<max&&!circleBlocked(nx,nz,r,colliders,reference,actor.crouch?1.0:1.5)&&walkHeight(nx,nz,colliders,reference)-reference<.55;
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.3));
  for(let i=0;i<steps;i++) { const nx=actor.x+dx/steps; if(tryAxis(nx,actor.z)) actor.x=nx; const nz=actor.z+dz/steps; if(tryAxis(actor.x,nz)) actor.z=nz;reference=walkHeight(actor.x,actor.z,colliders,reference); }
  actor.ground=walkHeight(actor.x,actor.z,colliders,reference);
}
export function pointBlocked(x,y,z,colliders) {
  if(y<heightAt(x,z)) return true;
  for(const c of colliders) {
    if(y<c.y||y>c.y+c.h) continue;
    if(c.type==='box'||c.type==='obox'){const p=vehicleLocal(c,x,z);if(Math.abs(p.x)<c.w/2&&Math.abs(p.z)<c.d/2)return true;}
    if(c.type==='circle'&&Math.hypot(x-c.x,z-c.z)<c.r) return true;
  }
  return false;
}
export function colliderRay(origin,dir,c,padding=0) {
  if(c.type==='obox'){
    const p=vehicleLocal(c,origin.x,origin.z),v=vehicleLocal({...c,x:0,z:0},dir.x,dir.z);
    return colliderRay({x:p.x,y:origin.y,z:p.z},{x:v.x,y:dir.y,z:v.z},{...c,type:'box',x:0,z:0,yaw:0},padding);
  }
  let lo=-Infinity,hi=Infinity;
  const slab=(axis,a,b)=>{
    const v=dir[axis],p=origin[axis];
    if(Math.abs(v)<1e-9)return p>=a&&p<=b;
    const x=(a-p)/v,y=(b-p)/v;lo=Math.max(lo,Math.min(x,y));hi=Math.min(hi,Math.max(x,y));return hi>=lo;
  };
  if(c.type==='box'){
    if(!slab('x',c.x-c.w/2-padding,c.x+c.w/2+padding)||!slab('z',c.z-c.d/2-padding,c.z+c.d/2+padding)||!slab('y',c.y-padding,c.y+c.h+padding))return Infinity;
  }else{
    const x=origin.x-c.x,z=origin.z-c.z,a=dir.x*dir.x+dir.z*dir.z,b=2*(x*dir.x+z*dir.z),k=x*x+z*z-(c.r+padding)**2;
    if(a<1e-10){if(k>0)return Infinity;}
    else{const d=b*b-4*a*k;if(d<0)return Infinity;lo=(-b-Math.sqrt(d))/(2*a);hi=(-b+Math.sqrt(d))/(2*a);}
    if(!slab('y',c.y-padding,c.y+c.h+padding))return Infinity;
  }
  return hi>=Math.max(0,lo)?Math.max(0,lo):Infinity;
}
export function terrainRay(origin,dir,max,colliders,step=.9,padding=0) {
  let nearest=max;
  for(const c of colliders)if(!c.walkOnly)nearest=Math.min(nearest,colliderRay(origin,dir,c,padding));
  for(let d=Math.min(.25,step/2);d<nearest;d+=step) {
    const p={x:origin.x+dir.x*d,y:origin.y+dir.y*d,z:origin.z+dir.z*d};
    if(p.y<heightAt(p.x,p.z)) {
      let a=Math.max(0,d-step),b=d;
      for(let i=0;i<6;i++){const m=(a+b)/2;if(origin.y+dir.y*m<heightAt(origin.x+dir.x*m,origin.z+dir.z*m))b=m;else a=m;}
      return b;
    }
  }
  return nearest;
}
export function sphereRay(origin,dir,center,r) {
  const x=origin.x-center.x,y=origin.y-center.y,z=origin.z-center.z;
  const b=x*dir.x+y*dir.y+z*dir.z,c=x*x+y*y+z*z-r*r,d=b*b-c;
  if(d<0) return Infinity;
  const t=-b-Math.sqrt(d); return t>0?t:Infinity;
}
export function lineClear(a,b,colliders) {
  const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z,d=Math.hypot(x,y,z);
  return terrainRay(a,{x:x/d,y:y/d,z:z/d},d,colliders,1.8)>=d-.2;
}
export function aimDistance(eye,dir,max,colliders,enemies=[]){
  let distance=terrainRay(eye,dir,max,colliders,.7);
  for(const e of enemies)if(e.alive)distance=Math.min(distance,sphereRay(eye,dir,{x:e.x,y:e.y+ENEMY_BODY.head,z:e.z},ENEMY_BODY.headRadius),sphereRay(eye,dir,{x:e.x,y:e.y+ENEMY_BODY.torso,z:e.z},ENEMY_BODY.torsoRadius));
  return distance;
}
export function shotFromMuzzle(eye,dir,muzzle,max,colliders,enemies=[]){
  const dx=muzzle.x-eye.x,dy=muzzle.y-eye.y,dz=muzzle.z-eye.z,length=Math.hypot(dx,dy,dz);
  if(length>.001){
    const barrelDir={x:dx/length,y:dy/length,z:dz/length};
    if(terrainRay(eye,barrelDir,length,colliders,.12)<length-.005)return {origin:{...eye},direction:barrelDir,blocked:true};
  }
  const distance=aimDistance(eye,dir,max,colliders,enemies);
  if(distance<length+.05)return {origin:{...eye},direction:{...dir},blocked:false};
  const x=eye.x+dir.x*distance-muzzle.x,y=eye.y+dir.y*distance-muzzle.y,z=eye.z+dir.z*distance-muzzle.z,d=Math.hypot(x,y,z);
  return {origin:{x:muzzle.x,y:muzzle.y,z:muzzle.z},direction:{x:x/d,y:y/d,z:z/d},blocked:false};
}
export function colliderNormal(c,p){
  if(c.type==='obox'){
    const local=vehicleLocal(c,p.x,p.z),n=colliderNormal({...c,type:'box',x:0,z:0},{x:local.x,y:p.y,z:local.z}),s=Math.sin(c.yaw),co=Math.cos(c.yaw);
    return {x:co*n.x+s*n.z,y:n.y,z:-s*n.x+co*n.z};
  }
  if(c.type==='box'){
    const faces=[['x',c.x-c.w/2,-1],['x',c.x+c.w/2,1],['y',c.y,-1],['y',c.y+c.h,1],['z',c.z-c.d/2,-1],['z',c.z+c.d/2,1]].sort((a,b)=>Math.abs(p[a[0]]-a[1])-Math.abs(p[b[0]]-b[1]));
    return {x:0,y:0,z:0,[faces[0][0]]:faces[0][2]};
  }
  if(Math.abs(p.y-c.y)<.02)return {x:0,y:-1,z:0};
  if(Math.abs(p.y-c.y-c.h)<.02)return {x:0,y:1,z:0};
  const x=p.x-c.x,z=p.z-c.z,d=Math.hypot(x,z)||1;return {x:x/d,y:0,z:z/d};
}
export function createWorldData() {
  const rand=randomSeed(),trees=[],rocks=[],cliffs=[],buildings=[],colliders=[];
  for(const site of BUILDING_SITES) {
    const b={...site,id:buildings.length,y:heightAt(site.x,site.z)-.12,color:rand()};buildings.push(b);colliders.push({...b,building:true,type:'box',surface:'plaster'});
  }
  for(let i=0;i<850;i++) {
    const x=rand()*534-267,z=rand()*528-264,h=heightAt(x,z);
    const forestDensity=noise(x*.016+7,z*.016-3);
    if(rand()>smooth(.15,.70,forestDensity)||h<WATER_LEVEL+2||h>94||slopeAt(x,z)>1.15||Math.abs(x-roadX(z))<8||onTrail(x,z,3)||Math.hypot(x-SPAWN.x,z-SPAWN.z)<12||circleBlocked(x,z,6,colliders)) continue;
    // Keep a clear lane from the deployment ridge to the first patrol.
    if(x>-70&&x<-55&&z>62&&z<154) continue;
    const height=5.2+rand()*7.2,t={x,z,y:terrainSurfaceAt(x,z),h:height,r:height*.48,seed:rand()*100,species:rand()>.30?1:0,width:.80+rand()*.36}; trees.push(t);
    colliders.push({type:'circle',x,z,y:h,r:.18+height*.025,h:t.h*.55,surface:'wood'});
  }
  // A wooded edge frames the deployment clearing. Keep the central patrol
  // sightline open while showing real crowns from the first playable frame.
  for(const [x,z] of [[-76,125],[-80,111],[-84,96],[-91,124],[-96,109],[-107,137],[-53,122],[-47,112],[-42,97],[-35,126],[-32,106],[-43,145]]){
    if(heightAt(x,z)<5||slopeAt(x,z)>1.1||Math.abs(x-roadX(z))<5||circleBlocked(x,z,2.7,colliders))continue;
    const h=6.3+rand()*3.2,y=terrainSurfaceAt(x,z),t={x,z,y,h,r:h*.45,seed:rand()*100,species:1,width:.88+rand()*.16};trees.push(t);colliders.push({type:'circle',x,z,y,r:.18+h*.025,h:h*.55,surface:'wood'});
  }
  // Scanned river stones follow the banks rather than floating on the water.
  for(let i=0;i<34;i++){
    const z=-86-rand()*166,side=i%2?1:-1,x=riverX(z)+side*(riverHalfWidth(z)+5+rand()*7),y=heightAt(x,z),r=.45+rand()*1.2;
    if(y<WATER_LEVEL-.5||circleBlocked(x,z,r+1,colliders))continue;
    const rock={x,z,y:y-.2,r,h:r*(.6+rand()*.6),rotation:rand()*6.28};rocks.push(rock);colliders.push({...rock,type:'circle',surface:'stone'});
  }
  // Large scanned formations create real overhangs and fractured ridge faces.
  for(let i=0;i<280&&cliffs.length<22;i++){
    const x=rand()*500-250,z=rand()*500-250,y=heightAt(x,z),slope=slopeAt(x,z),h=7+rand()*11,r=h*.64;
    if(y<30||slope<.24||Math.abs(x-roadX(z))<r+9||Math.hypot(x-SPAWN.x,z-SPAWN.z)<70||circleBlocked(x,z,r+3,colliders))continue;
    const base=Math.min(y,heightAt(x-r*.45,z),heightAt(x+r*.45,z),heightAt(x,z-r*.45),heightAt(x,z+r*.45))-.8;
    const cliff={x,z,y:base,r,h,rotation:rand()*6.28,tiltX:(rand()-.5)*.16,tiltZ:(rand()-.5)*.16};cliffs.push(cliff);colliders.push({...cliff,type:'circle',surface:'stone'});
  }
  for(let i=0;i<70;i++) {
    const x=rand()*508-254,z=rand()*508-254,h=heightAt(x,z),r=1+rand()*2.7;
    if(h<4||Math.hypot(x-SPAWN.x,z-SPAWN.z)<15||Math.abs(x-roadX(z))<5||circleBlocked(x,z,r+2,colliders)) continue;
    const rock={x,z,y:h-.65,r,h:r*(.65+rand()*.75),rotation:rand()*6.28}; rocks.push(rock);
    colliders.push({...rock,type:'circle',surface:'stone'});
  }
  const enemies=[[-62,92],[-23,79],[-103,85],[-142,2],[-69,-74],[99,42],[145,-17],[-22,-136],[86,-150],[-158,134],[161,148],[-168,-150]].map(([x,z],i)=>{
    while(circleBlocked(x,z,.75,colliders)) x+=2;
    const phase=rand()*6.28;return {id:i,x,z,y:heightAt(x,z),homeX:x,homeZ:z,hp:100,alive:true,phase,shoot:3+rand()*5,alert:0,yaw:phase,walk:0};
  });
  return {trees,rocks,cliffs,buildings,colliders,enemies,windows:buildings.flatMap(houseWindows),loot:buildings.flatMap(houseLoot)};
}
export class Match {
  constructor(world,onEvent=()=>{}) { this.world=world; this.onEvent=onEvent; this.reset('survival'); }
  get vehicle(){return this.fleet?.current||null;}
  get swimming(){return !this.vehicle&&this.player.ground<WATER_LEVEL-.55&&(this.player.jump||0)<=.025;}
  get worldColliders(){
    const base=this.world.colliders;if(this._worldBase!==base||this._worldLength!==base.length){this._worldBase=base;this._worldLength=base.length;this._worldCollision=base.flatMap(c=>c.building?houseColliders(c):[c]);}return this._worldCollision;
  }
  get colliders(){
    const base=this.worldColliders;if(this._colliderBase!==base||this._colliderFleet!==this.fleet){this._colliderBase=base;this._colliderFleet=this.fleet;this._colliders=[...base,...(this.fleet?.cars.map(c=>c.collider)||[])];}return this._colliders;
  }
  nearestLoot(){
    if(this.vehicle||this.swimming||this.vault||!this.running||this.over)return null;let found=null,best=1.85;const p=this.player;
    for(const item of this.loot){if(item.taken||item.kind==='armour'&&p.armour>=100||item.kind==='medkit'&&this.medkits>=5||Math.abs((p.ground??p.y-1.72)-item.y)>.98)continue;const d=Math.hypot(item.x-p.x,item.z-p.z);if(d>=best)continue;
      const target={x:item.x,y:item.y+.16,z:item.z};if(!lineClear(p,target,this.colliders))continue;const length=Math.hypot(target.x-p.x,target.y-p.y,target.z-p.z),dir={x:(target.x-p.x)/length,y:(target.y-p.y)/length,z:(target.z-p.z)/length};if(this.windows.some(w=>!w.broken&&colliderRay(p,dir,w)<length-.05))continue;best=d;found=item;
    }return found;
  }
  pickupLoot(id){
    const item=this.nearestLoot();if(!item||item.id!==id)return false;item.taken=true;
    if(item.kind==='ammo')this.ammo[item.weapon].reserve+=item.count;else if(item.kind==='medkit')this.medkits++;else this.player.armour=100;
    this.onEvent({type:'lootpicked',item});return true;
  }
  breakWindow(window,point,direction){
    if(!window||window.broken)return false;window.broken=true;this.onEvent({type:'windowbreak',window,point:point||{x:window.x,y:window.y+window.h/2,z:window.z},direction:direction||window.normal});return true;
  }
  breakGlassAlong(origin,dir,distance){
    const hits=this.windows.filter(w=>!w.broken).map(w=>({w,d:colliderRay(origin,dir,w)})).filter(hit=>hit.d<distance).sort((a,b)=>a.d-b.d);
    for(const hit of hits)this.breakWindow(hit.w,{x:origin.x+dir.x*hit.d,y:origin.y+dir.y*hit.d,z:origin.z+dir.z*hit.d},dir);return hits.length;
  }
  nearbyVehicle(){return this.vehicle?null:this.fleet.nearest(this.player,this.worldColliders);}
  nearestVault({facing=false}={}){
    if(!this.running||this.over||this.vehicle||this.swimming||this.vault||(this.player.jump||0)>.10)return null;
    return findWindowVault(this.player,this.windows,this.colliders,{walkHeight,circleBlocked,requireFacing:facing});
  }
  vaultWindow(id){
    if(this.vault)return this.vault.blocked?this.cancelVault():false;
    const plan=this.nearestVault();if(!plan||id&&plan.window.id!==id)return false;
    this.vault={...plan,age:0,blocked:false};this.reloadTime=this.healTime=0;this.clearGrenadeLock();this.player.jump=this.player.vy=0;this.player.crouch=true;this.cooldown=Math.max(this.cooldown,.3);this.onEvent({type:'vaultstart',window:plan.window});return true;
  }
  cancelVault(){
    if(!this.vault)return false;const v=this.vault,p=this.player;
    for(const point of [v.age/v.duration<.5?v.start:v.end,v.age/v.duration<.5?v.end:v.start])if(!circleBlocked(point.x,point.z,.28,this.colliders,point.feet,1.76)){
      Object.assign(p,{x:point.x,z:point.z,ground:point.feet,y:point.feet+1.72,jump:0,vy:0,crouch:false});this.vault=null;this.onEvent({type:'vaultcancel'});return true;
    }return false;
  }
  updateVault(dt){
    const v=this.vault,p=this.player;if(!v)return;const count=Math.max(1,Math.ceil(dt*120)),h=dt/count;
    for(let i=0;i<count&&this.vault;i++){
      const age=Math.min(v.duration,v.age+h),next=vaultSample(v,age/v.duration);
      if(circleBlocked(next.x,next.z,.265,this.colliders,next.feet,next.height+.045)){v.blocked=true;if(!this.cancelVault())this.onEvent({type:'vaultblocked'});return;}
      v.age=age;v.blocked=false;p.yaw=v.startYaw+Math.atan2(Math.sin(v.yaw-v.startYaw),Math.cos(v.yaw-v.startYaw))*smooth(0,.28,age/v.duration);Object.assign(p,{x:next.x,z:next.z,ground:next.feet,y:next.eye,jump:0,vy:0,crouch:next.height<1.65});
      if(v.age>=v.duration-1e-9){Object.assign(p,{ground:v.end.feet,y:v.end.feet+1.72,crouch:false});this.vault=null;this.onEvent({type:'vaultend',window:v.window});}
    }
  }
  interactVehicle(){
    if(!this.running||this.over||this.vault)return false;
    const event=this.vehicle?this.fleet.requestExit(this.player,this.worldColliders):this.fleet.enter(this.player,this.worldColliders);
    if(!event)return false;if(event.type==='vehicleexit')this.drownTime=this.drownHurtTick=0;this.healTime=0;this.reloadTime=0;this.cooldown=Math.max(this.cooldown,.25);this.clearGrenadeLock();this.onEvent(event);return true;
  }
  reset(mode) {
    this.mode=mode; this.running=false; this.over=false; this.time=0; this.kills=0; this.shots=0; this.bulletShots=0; this.hits=0; this.headshots=0; this.reloadTime=0; this.cooldown=0; this.weapon=0; this.zoneCenter={x:-96,z:24}; this.zoneRadius=278; this.zoneTick=0; this.medkits=3; this.healTime=0;this.drownTime=this.drownHurtTick=0;this.resultCause='';
    this.vault=null;this.player={...SPAWN,y:heightAt(SPAWN.x,SPAWN.z)+1.72,ground:heightAt(SPAWN.x,SPAWN.z),hp:100,armour:100,yaw:0,pitch:-.045,vy:0,jump:0,crouch:false};
    this.fleet=new VehicleFleet({terrain:terrainSurfaceAt,waterLevel:WATER_LEVEL,colliders:this.worldColliders});
    this.windows=(this.world.windows||[]).map(w=>({...w,broken:false}));this.loot=(this.world.loot||[]).map(item=>({...item,taken:false}));
    this.ammo=WEAPONS.map(w=>({mag:w.mag,reserve:w.reserve}));this.grenades=[];this.bullets=[];this.nextBulletId=0;this.nextHitId=0;this.trainingResetTime=0;this.clearGrenadeLock();
    this.enemies=this.freshEnemies();
    this.enemyAI=new EnemyDirector({lineClear,moveGround,walkHeight,circleBlocked,waterLevel:WATER_LEVEL,enemyScale:ENEMY_SCALE,body:ENEMY_BODY});
  }
  freshEnemies(){return this.world.enemies.map(e=>({...e,hp:100,alive:true,alert:0,ai:undefined,hitImpact:undefined,deathImpact:undefined,sees:false,weaponReady:0,aiState:'patrol',awareness:0,rounds:30,reloadRemaining:0,reloadDuration:2.6,aimReady:0,hitReact:0}));}
  clearGrenadeLock(){this.grenadeLock={targetId:null,progress:0,locked:false,distance:0};}
  updateGrenadeLock(dt,origin,dir,active){
    if(this.vehicle||this.swimming||this.vault||!active||this.weapon!==1||this.reloadTime>0||this.healTime>0||!this.running||this.over){this.clearGrenadeLock();return this.grenadeLock;}
    const lock=this.grenadeLock;let target=null,best=-1,distance=0;
    for(const e of this.enemies){
      if(!e.alive)continue;const x=e.x-origin.x,y=e.y+ENEMY_BODY.lock-origin.y,z=e.z-origin.z,d=Math.hypot(x,y,z);
      if(d<3||d>WEAPONS[1].range)continue;
      const dot=(x*dir.x+y*dir.y+z*dir.z)/d,threshold=e.id===lock.targetId?.985:.992;
      if(dot<threshold||!lineClear(origin,{x:e.x,y:e.y+ENEMY_BODY.lock,z:e.z},this.colliders))continue;
      const score=dot+(e.id===lock.targetId?.02:0);if(score>best){best=score;target=e;distance=d;}
    }
    if(!target){this.clearGrenadeLock();return this.grenadeLock;}
    const progress=target.id===lock.targetId?clamp(lock.progress+dt/GRENADE_LOCK_TIME,0,1):clamp(dt/GRENADE_LOCK_TIME,0,1),locked=progress>=1-1e-8;
    this.grenadeLock={targetId:target.id,progress:locked?1:progress,locked,distance};
    if(locked&&(!lock.locked||lock.targetId!==target.id))this.onEvent({type:'targetlocked',enemy:target});
    return this.grenadeLock;
  }
  switchWeapon(i) { if(this.vehicle||this.swimming||this.vault||i===this.weapon) return; this.weapon=i; this.reloadTime=0;this.clearGrenadeLock();this.cooldown=Math.max(this.cooldown,.28); this.onEvent({type:'switch'}); }
  reload() {
    const w=WEAPONS[this.weapon],a=this.ammo[this.weapon];
    if(this.vehicle||this.swimming||this.vault||this.reloadTime||a.mag===w.mag||!a.reserve||this.over) return false;
    this.reloadTime=w.reload; this.healTime=0;this.clearGrenadeLock(); this.onEvent({type:'reload',duration:w.reload}); return true;
  }
  heal() { if(this.vehicle||this.swimming||this.vault||this.healTime||!this.medkits||this.player.hp>=100||this.over) return false; this.healTime=3; this.reloadTime=0; this.onEvent({type:'heal'}); return true; }
  shoot(dir,origin) {
    if(this.vehicle||this.swimming||this.vault||!this.running||this.over||this.cooldown>0||this.reloadTime>0||this.healTime>0) return false;
    const w=WEAPONS[this.weapon],a=this.ammo[this.weapon]; if(!a.mag){this.reload();return false;}
    a.mag--;this.shots++;this.cooldown=w.interval;this.enemyAI.noise(origin,'shot',185,this.time);
    if(this.mode==='training')a.reserve=Math.max(a.reserve,w.reserve);
    if(w.id==='grenade') {
      const target=this.grenadeLock.locked?this.enemies.find(e=>e.id===this.grenadeLock.targetId&&e.alive):null;
      const guided=!!target&&Math.hypot(target.x-origin.x,target.y+ENEMY_BODY.lock-origin.y,target.z-origin.z)<=w.range&&lineClear(origin,{x:target.x,y:target.y+ENEMY_BODY.lock,z:target.z},this.colliders);
      this.grenades.push({x:origin.x,y:origin.y,z:origin.z,vx:dir.x*76,vy:dir.y*76,vz:dir.z*76,age:0,targetId:guided?target.id:null});
      this.onEvent({type:'fire',weapon:w.id});return true;
    }
    this.bulletShots++;
    const bullet={id:this.nextBulletId++,x:origin.x,y:origin.y,z:origin.z,previous:{...origin},
      vx:dir.x*w.velocity,vy:dir.y*w.velocity,vz:dir.z*w.velocity,distance:0,age:0,weapon:this.weapon,ammo:w.ammo,tracer:false};
    this.bullets.push(bullet);this.onEvent({type:'fire',weapon:w.id,bullet});return true;
  }
  updateBullets(dt){
    for(let i=this.bullets.length-1;i>=0;i--){
      const b=this.bullets[i],w=WEAPONS[b.weapon];let finished=false;
      b.previous={x:b.x,y:b.y,z:b.z};
      const count=Math.max(1,Math.ceil(dt*120)),step=dt/count;
      for(let n=0;n<count&&!finished;n++){
        const dx=b.vx*step,dy=b.vy*step-4.905*step*step,dz=b.vz*step,len=Math.hypot(dx,dy,dz);
        if(!len)continue;const dir={x:dx/len,y:dy/len,z:dz/len};
        let distance=Math.min(len,terrainRay(b,dir,len,this.colliders,.65)),target=null,headshot=false,surface='earth';
        for(const e of this.enemies){
          if(!e.alive)continue;
          const head=sphereRay(b,dir,{x:e.x,y:e.y+ENEMY_BODY.head,z:e.z},ENEMY_BODY.headRadius),body=sphereRay(b,dir,{x:e.x,y:e.y+ENEMY_BODY.torso,z:e.z},ENEMY_BODY.torsoRadius);
          if(head<distance){distance=head;target=e;headshot=true;}
          if(body<distance){distance=body;target=e;headshot=false;}
        }
        const water=dir.y<0?(WATER_LEVEL-b.y)/dir.y:Infinity;
        if(water>0&&water<distance&&heightAt(b.x+dir.x*water,b.z+dir.z*water)<WATER_LEVEL){distance=water;target=null;surface='water';}
        this.breakGlassAlong(b,dir,distance);
        const point={x:b.x+dir.x*distance,y:b.y+dir.y*distance,z:b.z+dir.z*distance};
        if(distance<len-.0001){
          const normal={x:-dir.x,y:-dir.y,z:-dir.z};
          if(!target&&surface!=='water'){
            const collider=this.colliders.find(c=>Math.abs(colliderRay(b,dir,c)-distance)<.08);
            if(collider){surface=collider.surface||(collider.type==='box'?'plaster':'stone');Object.assign(normal,colliderNormal(collider,point));}
            else{const nx=heightAt(point.x-.15,point.z)-heightAt(point.x+.15,point.z),nz=heightAt(point.x,point.z-.15)-heightAt(point.x,point.z+.15),l=Math.hypot(nx,.3,nz);Object.assign(normal,{x:nx/l,y:.3/l,z:nz/l});}
          }
          if(target){this.hits++;this.damageEnemy(target,w.damage*(headshot?2.3:1),headshot,'bullet',{point,direction:dir});}
          this.onEvent({type:'impact',weapon:w.id,point,normal,surface,hit:!!target,headshot});finished=true;
        }
        Object.assign(b,point);b.vy-=9.81*step;const drag=Math.exp(-.035*step);b.vx*=drag;b.vy*=drag;b.vz*=drag;b.distance+=distance;b.age+=step;
        if(b.distance>=w.range||b.age>1.5)finished=true;
      }
      if(finished)this.bullets.splice(i,1);
    }
  }
  damageEnemy(e,amount,headshot=false,cause='bullet',impact) {
    if(!e.alive) return;
    e.hp-=amount;e.alert=1;this.enemyAI.startle(e,this.time);if(cause==='bullet'){e.hitReact=1;e.hitImpact=bulletHit(e,{...impact,headshot,damage:amount,serial:++this.nextHitId,at:this.time});if(e.hp<=0)e.deathImpact=e.hitImpact;}
    if(e.hp<=0){ e.alive=false;this.kills++;if(headshot)this.headshots++;this.onEvent({type:'kill',enemy:e,headshot,cause});
      if(this.kills===this.enemies.length&&this.mode==='survival') this.finish(true);
    } else this.onEvent({type:'hit',enemy:e,headshot,cause});
  }
  vehicleContacts(car,previous){
    if(this.over||!this.running)return;
    const speed=Math.abs(car.speed);if(speed<1.8)return;
    const dx=car.x-previous.x,dz=car.z-previous.z,distance=Math.hypot(dx,dz);if(distance<1e-7)return;
    const vx=dx/distance,vz=dz/distance,ground=this.fleet.terrain(car.x,car.z),body=this.fleet.body(car);
    for(const e of this.enemies){
      if(!e.alive||e.blast||(e.ramImmuneUntil||0)>this.time||e.y>ground+1.4||e.y+1.7<ground+.2)continue;
      if(!circleTouchesBox(e.x,e.z,.44,body))continue;
      const local=vehicleLocal(car,e.x,e.z),along=(e.x-car.x)*vx+(e.z-car.z)*vz;
      // A moving bumper/side can strike a person; driving away cannot pull them down.
      if(along<-.15&&Math.abs(local.x)<body.w/2+.1)continue;
      const amount=clamp((speed-1.5)*7.5,12,130),impulse=clamp(1.2+speed*.66,2.8,15);
      e.vx=e.vz=e.moveSpeed=0;e.sees=false;e.ramImmuneUntil=this.time+2.7;
      e.blast=impactState(e,{kind:'vehicle',vehicleId:car.id,speed,vx:vx*impulse,vy:1.2+speed*.12,vz:vz*impulse,downTime:1+speed*.015,recoverTime:.95});
      this.onEvent({type:'vehiclehit',enemy:e,point:{x:e.x,y:e.y+.7,z:e.z},direction:{x:vx,z:vz},speed,fatal:amount>=e.hp});
      this.damageEnemy(e,amount,false,'vehicle');car.speed*=.94;
    }
  }
  damageVehicle(car,amount){
    if(car.destroyed||amount<=0)return false;car.hp=Math.max(0,(car.hp??100)-amount);if(car.hp>0)return false;
    const occupied=this.vehicle===car;this.fleet.destroy(car);
    if(occupied){const event=this.fleet.tryExit(this.player,this.worldColliders);if(event?.type==='vehicleexit'){this.drownTime=0;this.onEvent(event);}else{this.fleet.driverId=null;this.fleet.exitPending=false;this.drownTime=0;const floor=car.collider.y+car.collider.h;Object.assign(this.player,{x:car.x,z:car.z,ground:floor,y:floor+1.72,jump:0,vy:0,crouch:false});this.onEvent({type:'vehicleexit',vehicle:car});}}
    this.onEvent({type:'vehicledestroyed',vehicle:car});this.explode({x:car.x,y:car.y+.82,z:car.z,sourceCarId:car.id});return true;
  }
  explode(g) {
    this.enemyAI.noise(g,'explosion',210,this.time);
    let hits=0;const source=this.fleet.cars.find(c=>c.id===g.sourceCarId),blastColliders=source?this.colliders.filter(c=>c!==source.collider):this.colliders;
    for(const e of this.enemies){
      const d=Math.hypot(e.x-g.x,e.y+1-g.y,e.z-g.z);
      if(e.alive&&d<11&&(e.id===g.directHitId||lineClear({x:g.x,y:g.y+.12,z:g.z},{x:e.x,y:e.y+1,z:e.z},blastColliders))){
        hits++;
        const x=e.x-g.x,z=e.z-g.z,len=Math.hypot(x,z),power=1-d/11,angle=e.id*2.4;
        e.blast=impactState(e,{kind:'explosion',power,vx:(len>.01?x/len:Math.cos(angle))*(1.8+5.8*power),vy:2.6+3*power,vz:(len>.01?z/len:Math.sin(angle))*(1.8+5.8*power),downTime:.65+power*.25,recoverTime:.95});
        this.damageEnemy(e,e.id===g.directHitId?180:180*(1-d/13),false,'explosion');
      }
    }
    const p=this.player,d=Math.hypot(p.x-g.x,p.y-g.y,p.z-g.z);
    if(d<9&&this.mode==='survival'&&lineClear({x:g.x,y:g.y+.4,z:g.z},p,blastColliders))this.hurt(100*(1-d/10),'榴弹冲击');
    this.onEvent({type:'explosion',point:{x:g.x,y:g.y,z:g.z},hits,vehicle:!!source});
    for(const w of this.windows)if(!w.broken&&Math.hypot(w.x-g.x,w.y+w.h/2-g.y,w.z-g.z)<6&&lineClear({x:g.x,y:g.y+.12,z:g.z},{x:w.x,y:w.y+w.h/2,z:w.z},blastColliders))this.breakWindow(w);
    for(const car of this.fleet.cars){
      if(car.destroyed)continue;const local=vehicleLocal(car,g.x,g.z),dx=Math.max(0,Math.abs(local.x)-1.06),dz=Math.max(0,Math.abs(local.z)-1.99),dy=Math.max(0,car.y+.25-g.y,g.y-car.y-1.84),distance=Math.hypot(dx,dy,dz),direct=g.directVehicleId===car.id;
      if(!direct&&(distance>=5||!lineClear({x:g.x,y:g.y+.12,z:g.z},{x:car.x,y:car.y+.9,z:car.z},blastColliders.filter(c=>c!==car.collider))))continue;
      this.damageVehicle(car,direct?200:165*(1-distance/5));
    }

  }
  hurt(amount,source,{bypassArmour=false}={}) {
    if(this.over||this.mode==='training'||!Number.isFinite(amount)||amount<=0)return;
    const p=this.player,previousArmour=clamp(p.armour??0,0,100),armourDamage=bypassArmour?0:Math.min(previousArmour,amount),healthDamage=Math.min(p.hp,amount-armourDamage);
    p.armour=previousArmour-armourDamage;p.hp=clamp(p.hp-healthDamage,0,100);this.healTime=0;
    this.onEvent({type:'hurt',source,amount,armourDamage,healthDamage,armourBroken:previousArmour>0&&p.armour===0});if(p.hp<=0)this.finish(false);
  }
  finish(win,cause='') { if(this.over)return;this.vault=null;this.over=true;this.running=false;this.resultCause=cause;this.onEvent({type:'finish',win,cause}); }
  updateAftermath(dt){this.updateBlasts(dt);this.fleet.updatePassive(dt,this.player);for(const event of this.fleet.takeEvents())this.onEvent(event);}
  updateBlasts(dt){
    for(const e of this.enemies){
      const b=e.blast;if(!b)continue;b.age+=dt;
      const colliders=b.kind==='vehicle'?this.colliders.filter(c=>c!==this.fleet.cars.find(car=>car.id===b.vehicleId)?.collider):this.colliders;
      if(b.grounded){
        b.landedAge+=dt;
        if(b.kind==='vehicle'||Math.hypot(b.vx,b.vz)>.015){
          moveGround(e,b.vx*dt,b.vz*dt,colliders,.38*ENEMY_SCALE);e.y=Math.max(e.ground,WATER_LEVEL-.62);const drag=Math.exp(-5*dt);b.vx*=drag;b.vz*=drag;
        }
        if(e.alive&&b.landedAge>(b.downTime??.7)+(b.recoverTime??.95)){delete e.blast;e.ramImmuneUntil=this.time+.5;e.vx=e.vz=e.moveSpeed=0;}
        continue;
      }
      const count=Math.max(1,Math.ceil(dt*120)),s=dt/count;
      for(let n=0;n<count&&!b.grounded;n++){
        b.flightTime+=s;b.vy-=12.5*s;const dx=b.vx*s,dy=b.vy*s,dz=b.vz*s,len=Math.hypot(dx,dy,dz);
        if(len>0){const direction={x:dx/len,y:dy/len,z:dz/len},origin={x:e.x,y:e.y+.8,z:e.z},cut=terrainRay(origin,direction,len,colliders,.15,b.kind==='vehicle'?.38:0),ratio=cut<len?Math.max(0,cut-.04)/len:1;
          e.x=clamp(e.x+dx*ratio,-300,300);e.y+=dy*ratio;e.z=clamp(e.z+dz*ratio,-300,300);if(ratio<1){b.vx*=.15;b.vz*=.15;if(dy>0)b.vy=0;}
        }
        const floor=Math.max(walkHeight(e.x,e.z,colliders,e.y+.12),WATER_LEVEL-.62);
        if(e.y<=floor&&b.vy<=0){e.y=e.ground=floor;b.grounded=true;b.impactSpeed=-b.vy;b.vy=0;if(b.kind!=='vehicle'){b.vx*=.38;b.vz*=.38;}if(b.impactSpeed>2)this.onEvent({type:'bodylanding',point:{x:e.x,y:floor+.07,z:e.z},speed:b.impactSpeed});}
      }
    }
  }
  updateGrenades(dt){
    for(let i=this.grenades.length-1;i>=0;i--){
      const g=this.grenades[i];let hit=false;const count=Math.max(1,Math.ceil(dt*120)),s=dt/count;
      for(let n=0;n<count;n++){
        const target=g.targetId===null?null:this.enemies.find(e=>e.id===g.targetId&&e.alive);
        if(target){
          const x=target.x-g.x,y=target.y+ENEMY_BODY.lock-g.y,z=target.z-g.z,distance=Math.hypot(x,y,z),blend=1-Math.exp(-9*s);
          if(distance>.001){g.vx=lerp(g.vx,x/distance*76,blend);g.vy=lerp(g.vy,y/distance*76,blend);g.vz=lerp(g.vz,z/distance*76,blend);const speed=Math.hypot(g.vx,g.vy,g.vz)||1;g.vx*=76/speed;g.vy*=76/speed;g.vz*=76/speed;}
        }else{g.targetId=null;g.vy-=9.81*s;}
        const dx=g.vx*s,dy=g.vy*s,dz=g.vz*s,len=Math.hypot(dx,dy,dz);if(!len)continue;
        const dir={x:dx/len,y:dy/len,z:dz/len};let cut=terrainRay(g,dir,len,this.colliders,.15),direct=null,pane=null;for(const w of this.windows)if(!w.broken){const d=colliderRay(g,dir,w);if(d<cut){cut=d;pane=w;}}
        for(const e of this.enemies){if(!e.alive)continue;const center={x:e.x,y:e.y+ENEMY_BODY.lock,z:e.z},distance=Math.hypot(g.x-center.x,g.y-center.y,g.z-center.z)<ENEMY_BODY.grenadeRadius?0:sphereRay(g,dir,center,ENEMY_BODY.grenadeRadius);if(distance<cut){cut=distance;direct=e;pane=null;}}
        const struck=this.fleet.cars.find(c=>!c.destroyed&&Math.abs(colliderRay(g,dir,c.collider)-cut)<.025);
        g.x+=dir.x*cut;g.y+=dir.y*cut;g.z+=dir.z*cut;g.age+=s;
        if(cut<len){g.directHitId=direct?.id;g.directVehicleId=struck?.id;if(pane)this.breakWindow(pane,g,dir);hit=true;break;}
        if(g.y<WATER_LEVEL&&heightAt(g.x,g.z)<WATER_LEVEL){hit=true;break;}
      }
      if(hit||g.age>6){g.y=Math.max(g.y,heightAt(g.x,g.z)+.15);this.grenades.splice(i,1);this.explode(g);}
    }
  }
  update(dt,input) {
    if(!this.running||this.over)return;
    this.time+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.updateBlasts(dt);
    if(this.reloadTime>0){this.reloadTime-=dt;if(this.reloadTime<=0){const a=this.ammo[this.weapon],w=WEAPONS[this.weapon],n=Math.min(w.mag-a.mag,a.reserve);a.mag+=n;a.reserve-=n;this.reloadTime=0;this.onEvent({type:'reloaded'});}}
    if(this.healTime>0){this.healTime-=dt;if(this.healTime<=0){this.medkits--;this.player.hp=Math.min(100,this.player.hp+65);this.healTime=0;this.onEvent({type:'healed'});}}
    const p=this.player;
    if(input.jump&&!this.vault&&!this.vehicle){const candidate=this.nearestVault({facing:true});if(candidate)this.vaultWindow(candidate.window.id);}
    if(this.vehicle){
      const event=this.fleet.update(dt,{throttle:input.vehicleThrottle||0,steer:input.vehicleSteer||0,brake:input.vehicleBrake},p,this.worldColliders,(car,previous)=>this.vehicleContacts(car,previous));if(event)this.onEvent(event);
    }else{
    this.fleet.updatePassive(dt,p);
    if(this.vault)this.updateVault(dt);else{
    p.crouch=!!input.crouch&&!this.swimming;
    const water=p.ground<WATER_LEVEL-.1,speed=water?2.3:(p.crouch?2.25:(input.sprint&&!input.aim?7.5:4.4));
    let forward=input.forward||0,strafe=input.strafe||0,l=Math.hypot(forward,strafe);if(l>1){forward/=l;strafe/=l;}
    const dx=(-Math.sin(p.yaw)*forward+Math.cos(p.yaw)*strafe)*speed*dt,dz=(-Math.cos(p.yaw)*forward-Math.sin(p.yaw)*strafe)*speed*dt;
    moveGround(p,dx,dz,this.colliders);
    if(input.jump&&p.jump<=.01&&!water){p.vy=6.2;p.jump=.025;this.onEvent({type:'jump'});}
    if(p.jump>0){p.vy-=15*dt;p.jump=Math.max(0,p.jump+p.vy*dt);if(!p.jump)p.vy=0;}
    if(p.vy>0){const stature=p.crouch?1.1:1.72;for(const c of this.worldColliders)if(c.houseId!==undefined&&!c.walkOnly&&c.y>p.ground+.5&&Math.abs(p.x-c.x)<c.w/2&&Math.abs(p.z-c.z)<c.d/2&&p.ground+stature+p.jump+.10>c.y){p.jump=Math.max(0,c.y-p.ground-stature-.10);p.vy=0;}}
    if(this.swimming){p.crouch=false;this.healTime=this.reloadTime=0;this.clearGrenadeLock();}
    const eye=this.swimming?WATER_LEVEL+.38:Math.max(p.ground,water?WATER_LEVEL-.55:p.ground)+(p.crouch?1.1:1.72)+p.jump;
    p.y=lerp(p.y,eye,Math.min(1,dt*18));
    }
    }
    for(const event of this.fleet.takeEvents())this.onEvent(event);
    if(this.vehicle?.sinking&&p.y<WATER_LEVEL+.05){
      if(this.drownTime===0)this.onEvent({type:'drowning',vehicle:this.vehicle});this.drownTime+=dt;
      const damage=Math.min(p.hp,12*dt);p.hp=Math.max(0,p.hp-damage);this.drownHurtTick+=dt;
      if(this.drownHurtTick>=.75){this.drownHurtTick%=.75;this.onEvent({type:'hurt',amount:damage,healthDamage:damage,armourDamage:0,source:'溺水'});}
      if(p.hp<=1e-8){p.hp=0;this.vehicle.driverDead=true;this.healTime=this.reloadTime=0;this.onEvent({type:'drowned',vehicle:this.vehicle});this.finish(false,'drowned');return;}
    }else this.drownTime=this.drownHurtTick=0;
    this.updateBullets(dt);
    this.updateGrenades(dt);
    if(this.mode==='survival'){
      this.zoneRadius=lerp(278,62,smooth(40,390,this.time));this.zoneTick+=dt;
      if(this.zoneTick>1){this.zoneTick=0;if(Math.hypot(p.x-this.zoneCenter.x,p.z-this.zoneCenter.z)>this.zoneRadius)this.hurt(4,'安全区外',{bypassArmour:true});}
    }
    this.enemyAI.update(this,dt,input);
    if(this.mode==='training'&&this.kills===this.enemies.length){this.trainingResetTime+=dt;if(this.trainingResetTime>3){this.onEvent({type:'trainingcomplete'});this.enemies=this.freshEnemies();this.enemyAI.reset();this.kills=0;this.trainingResetTime=0;this.clearGrenadeLock();}}
  }
}
