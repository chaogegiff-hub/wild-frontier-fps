import * as THREE from './vendor/three.module.js';
import {heightAt,terrainSurfaceAt,WATER_LEVEL} from './core.js?v=2.21';
import {makeCasing,makeProjectile} from './ammunition.js?v=2.21';

function plumeTexture(seed){
  const c=document.createElement('canvas');c.width=c.height=96;const ctx=c.getContext('2d'),img=ctx.createImageData(96,96);
  const hash=(x,y)=>{let n=Math.imul(x+seed,374761393)^Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return (n>>>0)/4294967295;};
  for(let y=0;y<96;y++)for(let x=0;x<96;x++){
    const r=Math.hypot((x-47.5)/47.5,(y-47.5)/47.5),noise=.40+hash(x>>3,y>>3)*.35+hash(x,y)*.25,i=(y*96+x)*4;
    img.data[i]=img.data[i+1]=img.data[i+2]=255;img.data[i+3]=Math.max(0,1-r*r)**2*noise*255;
  }ctx.putImageData(img,0,0);return new THREE.CanvasTexture(c);
}
function impactTexture(wood=false){
  const c=document.createElement('canvas');c.width=c.height=96;const ctx=c.getContext('2d'),img=ctx.createImageData(96,96);
  for(let y=0;y<96;y++)for(let x=0;x<96;x++){
    const u=(x-47.5)/47.5,v=(y-47.5)/47.5,a=Math.atan2(v,u),r=Math.hypot(u,v*(wood?.52:1)),n=(Math.sin(x*41.13+y*13.73)*43758.5453)%1;
    const edge=.67+Math.sin(a*7+.8)*.10+Math.sin(a*13)*.07,core=Math.max(0,1-r/(edge+n*.08));
    const crack=wood?Math.max(0,1-Math.abs(u)*20)*Math.max(0,1-Math.abs(v)):Math.max(0,1-Math.abs(Math.sin(a*5.0+Math.sin(a*3)*.5))*24)*Math.max(0,1-r);
    const i=(y*96+x)*4;img.data[i]=img.data[i+1]=img.data[i+2]=255;img.data[i+3]=Math.min(1,core*core*1.6+crack*.55)*255;
  }ctx.putImageData(img,0,0);return new THREE.CanvasTexture(c);
}
function fireTexture(){
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),img=ctx.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const u=(x-63.5)/63.5,v=(y-63.5)/63.5,a=Math.atan2(v,u),edge=.86+.08*Math.sin(a*7)+.05*Math.sin(a*13+.7),r=Math.hypot(u,v*.92),n=.77+.12*Math.sin(x*.37+y*.19)+.11*Math.sin(x*.16-y*.29),heat=Math.max(0,1-r/edge)*n,i=(y*128+x)*4;
    img.data[i]=255;img.data[i+1]=Math.min(255,55+heat*370);img.data[i+2]=Math.max(0,heat-.3)*350;img.data[i+3]=Math.min(1,heat*2.5)*255;
  }ctx.putImageData(img,0,0);const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;return map;
}
const up=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(0,0,1),travel=new THREE.Vector3();
export class BattleEffects{
  constructor(scene,audio,{mobile=false,floorAt=terrainSurfaceAt}={}){
    this.scene=scene;this.audio=audio;this.floorAt=floorAt;this.burnTimers=new Map();this.effects=[];this.mobile=mobile;this.maps=[plumeTexture(13),plumeTexture(51)];
    this.impactMaps=[impactTexture(),impactTexture(true)];this.fireMap=fireTexture();this.waterTimers=new Map();
    this.fragmentGeometry=new THREE.TetrahedronGeometry(.018,0);this.fragmentMaterial=new THREE.MeshStandardMaterial({color:'#6c6554',roughness:1});
    this.glassGeometry=new THREE.BufferGeometry();this.glassGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.3,0,.5,-.5,0,.2,.5,0],3));this.glassGeometry.computeVertexNormals();this.glassMaterial=new THREE.MeshStandardMaterial({color:'#b5d4ce',roughness:.17,metalness:.15,transparent:true,opacity:.62,side:THREE.DoubleSide});
    this.dropletGeometry=new THREE.IcosahedronGeometry(.004,0);this.dropletMaterial=new THREE.MeshStandardMaterial({color:'#adbfbc',roughness:.18,metalness:.05,transparent:true,opacity:.55});
    this.grenadeGeometry=new THREE.LatheGeometry([new THREE.Vector2(0,-.055),new THREE.Vector2(.018,-.055),new THREE.Vector2(.020,-.047),new THREE.Vector2(.020,.018),new THREE.Vector2(.016,.034),new THREE.Vector2(.009,.049),new THREE.Vector2(0,.053)],16);
    this.grenadeMaterial=new THREE.MeshStandardMaterial({color:'#6c7049',roughness:.5,metalness:.6});this.projectiles=new Map();
    this.muzzleLight=new THREE.PointLight('#ffcb8f',0,6,2);scene.add(this.muzzleLight);this.lightTime=0;
    this.blastLight=new THREE.PointLight('#ffbd72',0,16,2);scene.add(this.blastLight);this.blastTime=0;
  }
  plume(position,{size=.08,color='#a09478',life=.65,velocity={x:0,y:.65,z:0},opacity=.28,growth=1.3,type='plume'}={}){
    const material=new THREE.SpriteMaterial({map:type==='flame'?this.fireMap:this.maps[this.effects.length%2],color,transparent:true,opacity,depthWrite:false,blending:type==='flame'?THREE.AdditiveBlending:THREE.NormalBlending,toneMapped:type!=='flame'});
    const mesh=new THREE.Sprite(material);mesh.position.copy(position);mesh.scale.setScalar(size);this.scene.add(mesh);
    material.rotation=Math.random()*6.28;this.effects.push({mesh,life,total:life,type,velocity:{...velocity},size,opacity,growth});
  }
  muzzle(position){
    this.muzzleLight.position.copy(position);this.muzzleLight.intensity=3.5;this.lightTime=.024;
    this.plume(position,{size:.035,color:'#b0b0a6',life:.4,opacity:.13,velocity:{x:0,y:.16,z:0},growth:.25});
  }
  casing(position,velocity,ammoType='5.56'){
    const mesh=makeCasing(typeof ammoType==='number'?(ammoType>1?'7.62':'5.56'):ammoType);mesh.position.copy(position);mesh.rotation.set(Math.random()*6,Math.random()*6,Math.random()*6);this.scene.add(mesh);
    this.effects.push({mesh,life:5,total:5,type:'casing',velocity:{...velocity},spin:{x:8+Math.random()*9,y:9,z:6},resting:false,bounces:0,shared:true});
  }
  impact(point,normal,surface,hit){
    if(hit){this.plume(point,{size:.10,color:'#817b65',life:.18,opacity:.16,growth:.25});return;}
    if(surface==='water'){
      for(let i=0;i<(this.mobile?7:12);i++){
        const mesh=new THREE.Mesh(this.dropletGeometry,this.dropletMaterial);mesh.position.set(point.x,WATER_LEVEL+.018,point.z);mesh.scale.set(1,1.6+Math.random(),1);this.scene.add(mesh);
        this.effects.push({mesh,life:.55,total:.55,type:'droplet',velocity:{x:(Math.random()-.5)*1.4,y:1.1+Math.random()*1.8,z:(Math.random()-.5)*1.4},shared:true});
      }
      this.plume({x:point.x,y:WATER_LEVEL+.04,z:point.z},{size:.05,color:'#c1d0cf',life:.22,opacity:.22,growth:.10,velocity:{x:0,y:.7,z:0}});
      const mesh=new THREE.Mesh(new THREE.RingGeometry(.08,.11,32),new THREE.MeshBasicMaterial({color:'#c6d8d5',transparent:true,opacity:.25,depthWrite:false,side:THREE.DoubleSide}));mesh.rotation.x=-Math.PI/2;mesh.position.set(point.x,WATER_LEVEL+.012,point.z);this.scene.add(mesh);this.effects.push({mesh,life:1.3,total:1.3,type:'ripple'});return;
    }
    const dust=surface==='wood'?'#918066':surface==='plaster'?'#cec6b3':'#998c70';
    for(let i=0;i<(this.mobile?4:7);i++)this.plume(point,{size:.07+Math.random()*.05,color:dust,life:.35+Math.random()*.3,velocity:{x:normal.x*(.3+Math.random())+(Math.random()-.5),y:Math.max(.1,normal.y)+Math.random()*.7,z:normal.z*(.3+Math.random())+(Math.random()-.5)},growth:.38});
    for(let i=0;i<(surface==='earth'?0:this.mobile?2:3);i++){
      const mesh=new THREE.Mesh(this.fragmentGeometry,this.fragmentMaterial);mesh.position.copy(point);mesh.scale.setScalar(.3+Math.random()*.7);this.scene.add(mesh);
      this.effects.push({mesh,life:.65,total:.65,type:'debris',velocity:{x:normal.x*1.5+(Math.random()-.5)*2,y:1+Math.random()*2,z:normal.z*1.5+(Math.random()-.5)*2},shared:true});
    }
    const size=surface==='earth'?.085:.045,mesh=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshBasicMaterial({map:this.impactMaps[surface==='wood'?1:0],color:surface==='plaster'?'#696157':'#302d24',transparent:true,opacity:.80,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
    mesh.position.set(point.x+normal.x*.002,point.y+normal.y*.002,point.z+normal.z*.002);mesh.quaternion.setFromUnitVectors(forward,new THREE.Vector3(normal.x,normal.y,normal.z).normalize());mesh.rotateZ(Math.random()*6.283);this.scene.add(mesh);this.effects.push({mesh,life:14,total:14,type:'decal'});
  }
  glassBreak(point,direction){
    for(let i=0;i<(this.mobile?12:20);i++){const mesh=new THREE.Mesh(this.glassGeometry,this.glassMaterial);mesh.position.set(point.x+(Math.random()-.5)*.35,point.y+(Math.random()-.5)*.45,point.z+(Math.random()-.5)*.18);mesh.scale.setScalar(.06+Math.random()*.10);mesh.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);this.scene.add(mesh);this.effects.push({mesh,life:1.7,total:1.7,type:'glass',velocity:{x:direction.x*2+(Math.random()-.5)*2,y:Math.random()*2,z:direction.z*2+(Math.random()-.5)*2},spin:{x:6,y:8,z:4},shared:true});}
  }
  vehicleWrecks(dt,cars){
    for(const car of cars){
      if(!car.destroyed||car.wreckAge>18||car.y+1<WATER_LEVEL&&car.inWater)continue;
      const late=car.wreckAge>7,interval=late?.38:(this.mobile?.18:.14);let timer=(this.burnTimers.get(car.id)||0)+dt;
      for(let n=0;timer>=interval&&n<3;n++){
        timer-=interval;const p=new THREE.Vector3((Math.random()-.5)*.45,.78,-.70+Math.random()*.55).applyEuler(new THREE.Euler(car.pitch||0,car.yaw||0,car.roll||0)).add(new THREE.Vector3(car.x,car.y,car.z));
        this.plume(p,{type:'smoke',size:late?.62:.86,color:late?'#3c3f39':'#252823',life:late?3.2:4.2,opacity:late?.55:.88,growth:late?2.3:3.2,velocity:{x:.18,y:late?1.0:1.4,z:.08}});
        if(car.wreckAge<5.5)this.plume(p,{type:'flame',size:.78+Math.random()*.22,color:'#ffffff',life:.50+Math.random()*.20,opacity:.92,growth:1.3,velocity:{x:.04,y:1.35,z:0}});
      }this.burnTimers.set(car.id,timer);
    }
  }
  vehicleHit(point,direction,speed){
    const ground={x:point.x,y:terrainSurfaceAt(point.x,point.z)+.10,z:point.z};
    for(let i=0;i<(this.mobile?4:6);i++)this.plume(ground,{size:.16+Math.random()*.12,color:'#a09478',life:.35+Math.random()*.3,opacity:.24,growth:.55,velocity:{x:direction.x*(.6+speed*.045)+(Math.random()-.5)*.6,y:.35+Math.random()*.6,z:direction.z*(.6+speed*.045)+(Math.random()-.5)*.6}});
  }
  bodyLanding(point,speed){
    if(point.y<WATER_LEVEL+.1){this.impact(point,{x:0,y:1,z:0},'water',false);return;}
    for(let i=0;i<(this.mobile?3:5);i++){const angle=i*2.4;this.plume(point,{size:.15+Math.min(.18,speed*.016),color:'#a29679',life:.45+Math.random()*.2,opacity:.19,growth:.60,velocity:{x:Math.cos(angle)*.65,y:.25+Math.random()*.35,z:Math.sin(angle)*.65}});}
  }
  waterEntry(point,speed){
    const ring=new THREE.Mesh(new THREE.RingGeometry(.7,.78,48),new THREE.MeshBasicMaterial({color:'#d6e8df',transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(point.x,WATER_LEVEL+.04,point.z);ring.renderOrder=3;this.scene.add(ring);this.effects.push({mesh:ring,type:'wake',life:2.2,total:2.2});
    for(let i=0;i<(this.mobile?12:18);i++){
      const a=Math.random()*6.28,mesh=new THREE.Mesh(this.dropletGeometry,this.dropletMaterial),power=1.2+Math.min(3,speed*.16);mesh.position.set(point.x+Math.cos(a)*.6,WATER_LEVEL+.08,point.z+Math.sin(a)*1.1);mesh.scale.setScalar(10+Math.random()*12);this.scene.add(mesh);
      this.effects.push({mesh,type:'droplet',life:1.3,total:1.3,velocity:{x:Math.cos(a)*power,y:2+Math.random()*2,z:Math.sin(a)*power},shared:true});
    }
  }
  waterVehicles(dt,cars){
    for(const car of cars){
      if(!car.sinking||car.sinkAge>12||car.y+1.2>=WATER_LEVEL)continue;let time=(this.waterTimers.get(car.id)||0)+dt;
      if(time>.20){time=0;const mesh=new THREE.Mesh(this.dropletGeometry,this.dropletMaterial);mesh.position.set(car.x+(Math.random()-.5)*.8,car.y+1.2,car.z+(Math.random()-.5)*1.3);mesh.scale.setScalar(6+Math.random()*7);this.scene.add(mesh);this.effects.push({mesh,type:'bubble',life:4,total:4,velocity:{x:.05,y:.8+Math.random()*.7,z:.02},shared:true});}this.waterTimers.set(car.id,time);
    }
  }
  explosion(point,{vehicle=false}={}){
    this.audio.explosion(point);const dirt=new THREE.Vector3(point.x,Math.max(point.y,heightAt(point.x,point.z))+.08,point.z);
    this.blastLight.position.copy(dirt);this.blastTime=this.blastDuration=vehicle?.62:.32;this.blastStrength=vehicle?140:95;
    const waveOpacity=vehicle?.12:.34,wave=new THREE.Mesh(new THREE.SphereGeometry(vehicle?.60:.45,16,10),new THREE.MeshBasicMaterial({color:'#ffd797',transparent:true,opacity:waveOpacity,depthWrite:false,blending:THREE.AdditiveBlending}));wave.position.copy(dirt);this.scene.add(wave);this.effects.push({mesh:wave,life:vehicle?.18:.24,total:vehicle?.18:.24,opacity:waveOpacity,type:'blastwave'});
    for(let i=0;i<(vehicle?(this.mobile?10:14):(this.mobile?6:9));i++){
      const a=Math.random()*6.283,r=Math.random()*.65,p=dirt.clone().add(new THREE.Vector3(Math.cos(a)*r,.12+Math.random()*.4,Math.sin(a)*r));
      this.plume(p,{type:'flame',size:(vehicle?.95:.7)+Math.random()*.5,color:'#ffffff',life:vehicle?.60+Math.random()*.3:.32+Math.random()*.26,opacity:.95,growth:vehicle?3.2:2.3,velocity:{x:Math.cos(a)*1.2,y:1.5+Math.random(),z:Math.sin(a)*1.2}});
    }
    for(let i=0;i<(vehicle?(this.mobile?18:27):(this.mobile?14:21));i++){
      const a=Math.random()*6.283,r=Math.random()*.8,p=dirt.clone().add(new THREE.Vector3(Math.cos(a)*r,.15+Math.random()*.9,Math.sin(a)*r));
      this.plume(p,{type:'smoke',size:(vehicle?1.1:.7)+Math.random()*.65,color:vehicle?(i%3?'#232622':'#41443a'):(i%3?'#45463e':'#7b7463'),life:(vehicle?5.5:4.2)+Math.random()*(vehicle?2:1.4),opacity:(vehicle?.86:.72)+Math.random()*.10,growth:(vehicle?3.8:2.8)+Math.random(),velocity:{x:Math.cos(a)*.45+.18,y:.85+Math.random()*1.4,z:Math.sin(a)*.45}});
    }
    for(let i=0;i<(vehicle?(this.mobile?20:28):(this.mobile?16:22));i++){
      const mesh=new THREE.Mesh(this.fragmentGeometry,this.fragmentMaterial);mesh.position.copy(dirt);mesh.scale.setScalar(1+Math.random()*2);this.scene.add(mesh);
      this.effects.push({mesh,life:1.2,total:1.2,type:'debris',velocity:{x:(Math.random()-.5)*12,y:3+Math.random()*9,z:(Math.random()-.5)*12},shared:true});
    }
  }
  update(dt,bullets=[]){
    const ids=new Set();
    for(const b of bullets){
      ids.add(b.id);let mesh=this.projectiles.get(b.id);
      if(!mesh){mesh=makeProjectile(b.ammo||(b.weapon===0?'7.62':'5.56'));this.projectiles.set(b.id,mesh);this.scene.add(mesh);}
      mesh.position.set(b.x,b.y,b.z);travel.set(b.vx,b.vy,b.vz).normalize();mesh.quaternion.setFromUnitVectors(up,travel);
    }
    for(const [id,mesh] of this.projectiles)if(!ids.has(id)){this.scene.remove(mesh);this.projectiles.delete(id);}
    this.muzzleLight.intensity=this.lightTime>0?3.5:0;this.lightTime=Math.max(0,this.lightTime-dt);
    this.blastLight.intensity=(this.blastStrength||95)*Math.max(0,this.blastTime/(this.blastDuration||.32));this.blastTime=Math.max(0,this.blastTime-dt);
    for(let i=this.effects.length-1;i>=0;i--){
      const e=this.effects[i];e.life-=dt;if(e.life<=0){this.dispose(e);this.effects.splice(i,1);continue;}const t=1-e.life/e.total;
      if(e.type==='plume'||e.type==='smoke'||e.type==='flame'){
        e.mesh.position.x+=e.velocity.x*dt;e.mesh.position.y+=e.velocity.y*dt;e.mesh.position.z+=e.velocity.z*dt;e.mesh.scale.setScalar(e.size+Math.pow(t,e.type==='smoke'?.65:1)*e.growth);
        e.mesh.material.opacity=e.opacity*(e.type==='smoke'?Math.min(1,t/.09)*Math.min(1,e.life/1.8):e.type==='flame'?(1-t)**1.5:1-t);e.mesh.material.rotation+=dt*(e.type==='flame'?.65:.1);
      }else if(e.type==='droplet'){
        e.velocity.y-=9.81*dt;for(const axis of ['x','y','z'])e.mesh.position[axis]+=e.velocity[axis]*dt;
        if(e.mesh.position.y<WATER_LEVEL)e.life=0;
      }else if(e.type==='bubble'){
        for(const axis of ['x','y','z'])e.mesh.position[axis]+=e.velocity[axis]*dt;if(e.mesh.position.y>=WATER_LEVEL)e.life=0;
      }else if(e.type==='casing'||e.type==='debris'||e.type==='glass'){
        if(!e.resting){e.velocity.y-=9.81*dt;for(const axis of ['x','y','z'])e.mesh.position[axis]+=e.velocity[axis]*dt;
          if(e.spin)for(const axis of ['x','y','z'])e.mesh.rotation[axis]+=e.spin[axis]*dt;
          const floor=this.floorAt(e.mesh.position.x,e.mesh.position.z,e.mesh.position.y)+(e.mesh.userData.radius||.005);
          if(e.mesh.position.y<floor){e.mesh.position.y=floor;if(e.type==='casing'&&e.bounces++<2&&Math.abs(e.velocity.y)>.6){e.velocity.y=Math.abs(e.velocity.y)*.23;e.velocity.x*=.5;e.velocity.z*=.5;this.audio.casing(e.mesh.position);}else{e.resting=true;e.mesh.rotation.set(e.type==='glass'?-Math.PI/2:0,e.mesh.rotation.y,e.type==='glass'?0:Math.PI/2);}}
        }
      }else if(e.type==='ripple'){e.mesh.scale.setScalar(1+t*13);e.mesh.material.opacity=.25*(1-t);}
      else if(e.type==='wake'){e.mesh.scale.setScalar(1+t*5);e.mesh.material.opacity=.48*(1-t);}
      else if(e.type==='blastwave'){e.mesh.scale.setScalar(1+t*7);e.mesh.material.opacity=(e.opacity??.34)*(1-t);}
      else if(e.type==='decal')e.mesh.material.opacity=.80*Math.min(1,e.life/2);
    }
    // Bound the effect budget during sustained firing on phones.
    while(this.effects.length>(this.mobile?160:280))this.dispose(this.effects.shift());
  }
  dispose(e){this.scene.remove(e.mesh);if(e.shared)return;if(!e.mesh.isSprite)e.mesh.geometry?.dispose();e.mesh.material.dispose();}
  clear(){this.effects.forEach(e=>this.dispose(e));this.effects=[];for(const mesh of this.projectiles.values())this.scene.remove(mesh);this.projectiles.clear();this.waterTimers.clear();this.burnTimers.clear();this.lightTime=0;this.muzzleLight.intensity=0;this.blastTime=0;this.blastLight.intensity=0;}
}
