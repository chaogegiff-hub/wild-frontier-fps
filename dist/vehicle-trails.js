import * as THREE from './vendor/three.module.js';
import {terrainSurfaceAt,WATER_LEVEL} from './core.js?v=2.25-drive-grass1';
import {vehicleWorld,VEHICLE_EXHAUST,VEHICLE_EXHAUST_AXIS} from './vehicle-physics.js?v=2.25-drive-grass1';

const clamp=THREE.MathUtils.clamp,TILE=48,CELL=2,GRID=24;
export const TRACK_CAPACITY=65536;

// Spatial indices are built only for tiles that a tire actually touches.
// Roots, seed data and the base instance buffers never move or regenerate.
export class GrassCompression{
  constructor(meshes=[]){
    this.tiles=new Map();this.indices=new Map();this.dirty=new Map();this.touched=new Set();this.pressed=0;
    for(const mesh of meshes){const key=mesh.userData.tileKey;if(!this.tiles.has(key))this.tiles.set(key,[]);this.tiles.get(key).push(mesh);}
  }
  index(mesh){
    if(this.indices.has(mesh))return this.indices.get(mesh);
    const [tx,tz]=mesh.userData.tileKey.split(',').map(Number),a=mesh.geometry.attributes.aOffset,n=mesh.geometry.instanceCount,counts=new Uint32Array(GRID*GRID),cell=i=>clamp(Math.floor((a.getX(i)-tx*TILE)/CELL),0,GRID-1)+GRID*clamp(Math.floor((a.getZ(i)-tz*TILE)/CELL),0,GRID-1);
    for(let i=0;i<n;i++)counts[cell(i)]++;
    const offsets=new Uint32Array(GRID*GRID+1);for(let i=0;i<counts.length;i++)offsets[i+1]=offsets[i]+counts[i];
    const cursors=offsets.slice(),ids=n<65536?new Uint16Array(n):new Uint32Array(n);for(let i=0;i<n;i++)ids[cursors[cell(i)]++]=i;
    const result={tx,tz,offsets,ids};this.indices.set(mesh,result);return result;
  }
  press(a,b,radius=.36){
    const dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;if(len2<1e-8||len2>25)return 0;
    const minX=Math.min(a.x,b.x)-radius,maxX=Math.max(a.x,b.x)+radius,minZ=Math.min(a.z,b.z)-radius,maxZ=Math.max(a.z,b.z)+radius,angle=Math.atan2(dz,dx);let changed=0;
    for(let tx=Math.floor(minX/TILE);tx<=Math.floor(maxX/TILE);tx++)for(let tz=Math.floor(minZ/TILE);tz<=Math.floor(maxZ/TILE);tz++){
      for(const mesh of this.tiles.get(tx+','+tz)||[]){
        const index=this.index(mesh),p=mesh.geometry.attributes.aOffset,attr=mesh.geometry.attributes.aPress;if(!attr)continue;
        const x0=clamp(Math.floor((minX-tx*TILE)/CELL),0,GRID-1),x1=clamp(Math.floor((maxX-tx*TILE)/CELL),0,GRID-1),z0=clamp(Math.floor((minZ-tz*TILE)/CELL),0,GRID-1),z1=clamp(Math.floor((maxZ-tz*TILE)/CELL),0,GRID-1);
        for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)for(let at=index.offsets[x+z*GRID];at<index.offsets[x+z*GRID+1];at++){
          const i=index.ids[at],t=clamp(((p.getX(i)-a.x)*dx+(p.getZ(i)-a.z)*dz)/len2,0,1),distance=Math.hypot(p.getX(i)-a.x-dx*t,p.getZ(i)-a.z-dz*t);if(distance>=radius)continue;
          const strength=.92*Math.pow(1-distance/radius,.25),old=attr.getX(i);if(strength<=old)continue;
          if(old===0)this.pressed++;attr.setXY(i,strength,angle);changed++;this.touched.add(mesh);const range=this.dirty.get(mesh)||[i,i];range[0]=Math.min(range[0],i);range[1]=Math.max(range[1],i);this.dirty.set(mesh,range);
        }
      }
    }return changed;
  }
  flush(){for(const [mesh,[lo,hi]] of this.dirty){const a=mesh.geometry.attributes.aPress;a.clearUpdateRanges();a.addUpdateRange(lo*2,(hi-lo+1)*2);a.needsUpdate=true;}this.dirty.clear();}
  reset(){for(const mesh of this.touched){const a=mesh.geometry.attributes.aPress;a.array.fill(0);a.clearUpdateRanges();a.needsUpdate=true;}this.touched.clear();this.dirty.clear();this.pressed=0;}
}

function treadTexture(){
  const c=document.createElement('canvas');c.width=128;c.height=512;const ctx=c.getContext('2d'),image=ctx.createImageData(c.width,c.height);
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
    const u=(x-63.5)/63.5,edge=clamp((1-Math.abs(u))/.18,0,1),row=(y/512*14+Math.abs(u)*.35)%1,groove=Math.abs(u)<.065||Math.abs(Math.abs(u)-.50)<.045,noise=.83+.17*(Math.sin(x*13.7+y*2.17)*43758.5%1),alpha=edge*(groove?.12:row<.67?.66:.23)*noise,i=(y*128+x)*4;
    image.data[i]=87;image.data[i+1]=77;image.data[i+2]=56;image.data[i+3]=Math.max(0,alpha)*255;
  }ctx.putImageData(image,0,0);const map=new THREE.CanvasTexture(c);map.wrapT=THREE.RepeatWrapping;map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;
}
function exhaustTexture(){
  const c=document.createElement('canvas');c.width=c.height=96;const ctx=c.getContext('2d'),image=ctx.createImageData(96,96);
  for(let y=0;y<96;y++)for(let x=0;x<96;x++){const u=(x-47.5)/47.5,v=(y-47.5)/47.5,r=Math.hypot(u,v),noise=.73+.16*Math.sin(x*.25+y*.19)+.11*Math.sin(x*.11-y*.28),i=(y*96+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=255;image.data[i+3]=Math.max(0,1-r*r)**2*noise*255;}ctx.putImageData(image,0,0);return new THREE.CanvasTexture(c);
}

export class VehicleTrails{
  constructor(scene,grass,{terrain=terrainSurfaceAt,waterLevel=WATER_LEVEL,capacity=TRACK_CAPACITY,bridges=[],outletFor=null}={}){
    Object.assign(this,{terrain,waterLevel,capacity,bridges,outletFor});this.compression=new GrassCompression(grass?.userData?.compressible===false?[]:grass?.userData?.meshes||[]);this.group=new THREE.Group();this.group.name='fixed-tire-ruts-and-exhaust';scene.add(this.group);
    this.geometry=new THREE.BufferGeometry();for(const [name,size] of [['position',3],['normal',3],['uv',2]])this.geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(capacity*4*size),size).setUsage(THREE.DynamicDrawUsage));
    const indices=new Uint32Array(capacity*6);for(let i=0;i<capacity;i++){const v=i*4;indices.set([v,v+2,v+1,v+2,v+3,v+1],i*6);}this.geometry.setIndex(new THREE.BufferAttribute(indices,1));this.geometry.setDrawRange(0,0);
    this.trackMap=treadTexture();this.material=new THREE.MeshStandardMaterial({name:'compressed-tire-treads',map:this.trackMap,color:'#a8a18a',roughness:1,metalness:0,transparent:true,opacity:.70,alphaTest:.025,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
    this.tracks=new THREE.Mesh(this.geometry,this.material);this.tracks.name='stationary-wheel-tracks';this.tracks.frustumCulled=false;this.tracks.receiveShadow=true;this.tracks.matrixAutoUpdate=false;this.group.add(this.tracks);
    this.exhaustMap=exhaustTexture();this.puffs=Array.from({length:64},()=>{const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.exhaustMap,color:'#858b83',transparent:true,opacity:0,depthWrite:false}));sprite.name='tailpipe-exhaust';sprite.visible=false;this.group.add(sprite);return {sprite,life:0,total:1,velocity:new THREE.Vector3(),size:0,opacity:0};});
    this.reset();
  }
  reset(fleet){this.fleet=fleet;this.last=new Map();this.cursor=0;this.used=0;this.totalSegments=0;this.emitTime=0;this.puffCursor=0;this.dirtyLow=Infinity;this.dirtyHigh=-1;this.geometry.setDrawRange(0,0);this.compression.reset();for(const p of this.puffs){p.life=0;p.sprite.visible=false;}}
  markable(p){return this.terrain(p.x,p.z)>this.waterLevel+.1&&!this.bridges.some(b=>Math.abs(p.x-b.x)<b.w/2&&Math.abs(p.z-b.z)<b.d/2);}
  segment(a,b,distance0,distance1){
    if(!this.markable(a)||!this.markable(b))return;const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.01||len>1)return;
    const nx=-dz/len*.15,nz=dx/len*.15,corners=[[a.x+nx,a.z+nz,0,distance0/1.12],[a.x-nx,a.z-nz,1,distance0/1.12],[b.x+nx,b.z+nz,0,distance1/1.12],[b.x-nx,b.z-nz,1,distance1/1.12]],attributes=this.geometry.attributes,slot=this.cursor;
    for(let i=0;i<4;i++){
      const [x,z,u,v]=corners[i],normal=new THREE.Vector3(this.terrain(x-.12,z)-this.terrain(x+.12,z),.24,this.terrain(x,z-.12)-this.terrain(x,z+.12)).normalize(),at=slot*4+i;attributes.position.setXYZ(at,x,this.terrain(x,z)+.009,z);attributes.normal.setXYZ(at,normal.x,normal.y,normal.z);attributes.uv.setXY(at,u,v);
    }
    this.dirtyLow=Math.min(this.dirtyLow,slot);this.dirtyHigh=Math.max(this.dirtyHigh,slot);this.cursor=(slot+1)%this.capacity;this.used=Math.min(this.capacity,this.used+1);this.totalSegments++;this.geometry.setDrawRange(0,this.used*6);this.compression.press(a,b);
  }
  emit(car){
    const outlet=this.outletFor?.(car),rotation=new THREE.Euler(car.pitch,car.yaw,car.roll,'YXZ'),local=outlet?.position||new THREE.Vector3(VEHICLE_EXHAUST.x,VEHICLE_EXHAUST.y,VEHICLE_EXHAUST.z).applyEuler(rotation).add(new THREE.Vector3(car.x,car.y,car.z));if(local.y<this.waterLevel+.06&&car.inWater)return;
    const p=this.puffs[this.puffCursor];this.puffCursor=(this.puffCursor+1)%this.puffs.length;
    const load=Math.max(Math.abs(car.throttle||0),Math.min(1,Math.abs(car.speed)/14));p.life=p.total=1.15+Math.random()*.30;p.size=.12+load*.04+Math.random()*.02;p.opacity=.34+load*.16;p.sprite.position.copy(local);p.sprite.scale.setScalar(p.size);p.sprite.material.rotation=Math.random()*6.28;p.sprite.material.opacity=p.opacity*.75;p.sprite.visible=true;
    p.velocity.copy(outlet?.direction||new THREE.Vector3(VEHICLE_EXHAUST_AXIS.x,VEHICLE_EXHAUST_AXIS.y,VEHICLE_EXHAUST_AXIS.z).normalize().applyEuler(rotation)).multiplyScalar(.8+load*.35);
    // Gas initially inherits the car's motion, then slows in the surrounding air.
    p.velocity.x+=.06-Math.sin(car.yaw)*car.speed;p.velocity.z-=Math.cos(car.yaw)*car.speed;p.velocity.y+=.28+Math.random()*.12;
  }
  update(dt,fleet,{active=true}={}){
    if(dt<=0)return;if(fleet!==this.fleet)this.reset(fleet);
    for(const p of this.puffs){if(p.life<=0)continue;p.life-=dt;if(p.life<=0){p.sprite.visible=false;continue;}const t=1-p.life/p.total,drag=Math.exp(-2.8*dt);p.velocity.x*=drag;p.velocity.z*=drag;p.velocity.y+=dt*.12;p.sprite.position.addScaledVector(p.velocity,dt);p.sprite.scale.setScalar(p.size+t*.62);p.sprite.material.opacity=p.opacity*(.75+.25*Math.min(1,t*14))*(1-t)**1.3;}
    const car=active?fleet.current:null;
    if(car&&!car.destroyed&&!car.stalled&&!car.sinking){const interval=Math.abs(car.speed)>.3?.035:.09;this.emitTime+=dt;for(let n=0;this.emitTime>=interval&&n<4;n++){this.emitTime-=interval;this.emit(car);}}else this.emitTime=0;
    for(const c of fleet.cars){
      const sign=Math.sign(c.speed),old=this.last.get(c.id),dry=active&&car===c&&!c.inWater&&!c.sinking&&Math.abs(c.speed)>.25,current={x:c.x,z:c.z,yaw:c.yaw,sign};
      if(!dry||!old||old.sign!==sign||Math.hypot(c.x-old.x,c.z-old.z)>5){this.last.set(c.id,{...current,travel:old?.travel||0});continue;}
      const distance=Math.hypot(c.x-old.x,c.z-old.z);if(distance<.24)continue;const count=Math.ceil(distance/.32),axle=sign>0?1.08:-1.34,track=sign>0?.90:.85;
      for(const side of [-1,1]){
        let a=vehicleWorld(old,side*track,axle);for(let n=1;n<=count;n++){const t=n/count,yaw=old.yaw+Math.atan2(Math.sin(c.yaw-old.yaw),Math.cos(c.yaw-old.yaw))*t,b=vehicleWorld({x:old.x+(c.x-old.x)*t,z:old.z+(c.z-old.z)*t,yaw},side*track,axle);this.segment(a,b,old.travel+distance*(n-1)/count,old.travel+distance*t);a=b;}
      }
      this.last.set(c.id,{...current,travel:old.travel+distance});
    }
    if(this.dirtyHigh>=0){for(const attr of Object.values(this.geometry.attributes)){attr.clearUpdateRanges();attr.addUpdateRange(this.dirtyLow*4*attr.itemSize,(this.dirtyHigh-this.dirtyLow+1)*4*attr.itemSize);attr.needsUpdate=true;}this.dirtyLow=Infinity;this.dirtyHigh=-1;}this.compression.flush();
  }
}
