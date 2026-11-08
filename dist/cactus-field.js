import * as THREE from './vendor/three.module.js';
import {randomSeed} from './core.js?v=2.25-drive-grass1';
import {plantable,meadowSurface} from './resident-vegetation.js?v=2.25-drive-grass1';
import {CactusImpacts} from './cactus-impact.js?v=2.25-drive-grass1';

// Authored opaque volumes with ribs, rounded crowns, pads, areoles and spines.
// These models are not photographs or scans.
const up=new THREE.Vector3(0,1,0),TAU=Math.PI*2;
class CactusMesh{
  constructor(){this.p=[];this.c=[];this.uv=[];this.indices=[];this.areoles=0;this.spines=0;}
  vertex(p,color,u=0,v=0){const i=this.p.length/3;this.p.push(...p);this.c.push(...color);this.uv.push(u,v);return i;}
  tri(a,b,c){this.indices.push(a,b,c);}
  areole(point,normal,size=.013,length=.042){
    this.areoles++;const n=normal.clone().normalize(),x=new THREE.Vector3().crossVectors(n,up).normalize();if(x.lengthSq()<.1)x.set(1,0,0);const y=new THREE.Vector3().crossVectors(n,x).normalize(),center=point.clone().addScaledVector(n,.001),ids=[];
    for(let i=0;i<4;i++){const a=i*TAU/4;ids.push(this.vertex(center.clone().addScaledVector(x,Math.cos(a)*size).addScaledVector(y,Math.sin(a)*size).toArray(),[.50,.44,.28]));}
    this.tri(ids[0],ids[1],ids[2]);this.tri(ids[0],ids[2],ids[3]);
    for(let i=0;i<3;i++){
      const a=i*TAU/3+.4,axis=x.clone().multiplyScalar(Math.cos(a)).addScaledVector(y,Math.sin(a)),tip=center.clone().addScaledVector(n,length*.55).addScaledVector(axis,length),side=new THREE.Vector3().crossVectors(tip.clone().sub(center),n).normalize().multiplyScalar(.0018);
      const a0=this.vertex(center.clone().add(side).toArray(),[.59,.51,.32]),a1=this.vertex(center.clone().sub(side).toArray(),[.59,.51,.32]),a2=this.vertex(tip.toArray(),[.76,.70,.51]);this.tri(a0,a1,a2);this.spines++;
    }
  }
  column(path,radius,{rings=8,sides=18,ribs=6,areoles=true}={}){
    const rows=[],crownSpan=Math.min(.35,Math.max(.07,radius/path(1).distanceTo(path(0)))),profile=[];
    for(let j=0;j<=rings;j++)profile.push([(1-crownSpan)*j/rings,1]);
    for(let j=1;j<=5;j++){const a=j/5*Math.PI/2;profile.push([1-crownSpan+crownSpan*Math.sin(a),Math.max(.02,Math.cos(a))]);}
    for(let j=0;j<profile.length;j++){
      const [t,cap]=profile[j],center=path(t),tangent=path(Math.min(1,t+.01)).sub(path(Math.max(0,t-.01))).normalize(),q=new THREE.Quaternion().setFromUnitVectors(up,tangent),row=[],root=.84+.16*Math.min(1,t*8);
      for(let i=0;i<=sides;i++){
        const a=i*TAU/sides,r=radius*(1+.15*Math.cos(a*ribs))*cap*root,local=new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r),normal=local.clone().normalize().applyQuaternion(q),p=local.applyQuaternion(q).add(center),wax=.91+.09*Math.sin(a*ribs+1.2),color=[.145*wax,.27*wax,.155*wax];
        row.push(this.vertex(p.toArray(),color,i/sides,t));if(areoles&&j>0&&cap>.65&&i<sides&&i%(sides/ribs)===0&&j%2===1)this.areole(p,normal,radius*.075,radius*.25);
      }rows.push(row);
    }
    for(let j=0;j<rows.length-1;j++)for(let i=0;i<sides;i++){const a=rows[j][i],b=rows[j+1][i],c=rows[j][i+1],d=rows[j+1][i+1];this.tri(a,b,c);this.tri(b,d,c);}
    const base=this.vertex(path(0).toArray(),[.15,.23,.12]);for(let i=0;i<sides;i++)this.tri(base,rows[0][i],rows[0][i+1]);
    const crown=this.vertex(path(1).toArray(),[.17,.28,.16]),last=rows.length-1;for(let i=0;i<sides;i++)this.tri(crown,rows[last][i+1],rows[last][i]);
  }
  pad(center,width,height,depth,tilt=0){
    const rows=[],sides=12,rings=6,q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),tilt),colour=[.23,.34,.18];
    for(let j=0;j<=rings;j++){
      const phi=Math.PI*j/rings,row=[];
      for(let i=0;i<=sides;i++){
        const a=i*TAU/sides,local=new THREE.Vector3(Math.sin(phi)*Math.cos(a)*width,Math.cos(phi)*height,Math.sin(phi)*Math.sin(a)*depth),p=local.clone().applyQuaternion(q).add(center),n=new THREE.Vector3(local.x/width**2,local.y/height**2,local.z/depth**2).normalize().applyQuaternion(q);
        row.push(this.vertex(p.toArray(),colour,i/sides,j/rings));if(j>0&&j<rings&&i<sides&&i%3===1)this.areole(p,n,.010,.028);
      }rows.push(row);
    }
    for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){const a=rows[j][i],b=rows[j+1][i],c=rows[j][i+1],d=rows[j+1][i+1];this.tri(a,c,b);this.tri(b,c,d);}
  }
  finish(name){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));g.setIndex(this.indices);g.computeVertexNormals();
    const p=g.attributes.position,n=g.attributes.normal,sums=new Map(),keys=[];
    for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(',');keys.push(key);if(!sums.has(key))sums.set(key,new THREE.Vector3());sums.get(key).add(new THREE.Vector3().fromBufferAttribute(n,i));}
    for(let i=0;i<p.count;i++){const v=sums.get(keys[i]).clone().normalize();if(v.lengthSq()<.1)v.set(0,1,0);n.setXYZ(i,v.x,v.y,v.z);}
    g.computeBoundingBox();g.userData={form:name,areoles:this.areoles,spines:this.spines};return g;
  }
}
export function cactusGeometries(){
  const barrel=new CactusMesh();barrel.column(t=>new THREE.Vector3(.025*Math.sin(t*2),t*.58,0),.24,{rings:8,sides:24,ribs:8});
  const pear=new CactusMesh();pear.pad(new THREE.Vector3(0,.23,0),.18,.25,.065,.12);pear.pad(new THREE.Vector3(-.16,.59,.01),.18,.26,.06,.34);pear.pad(new THREE.Vector3(.18,.51,-.025),.15,.23,.065,-.52);pear.pad(new THREE.Vector3(-.24,.97,.015),.13,.20,.055,-.15);
  const column=new CactusMesh();column.column(t=>new THREE.Vector3(.026*Math.sin(t*2),t*1.78,0),.145,{rings:10});
  column.column(t=>{const a=Math.min(1,t*2)*Math.PI/2;return new THREE.Vector3(-.12-.25*Math.sin(a),.64+.24*(1-Math.cos(a))+Math.max(0,t-.5)*1.18,.025);},.09,{rings:8,sides:12,ribs:6});
  column.column(t=>{const a=Math.min(1,t*2)*Math.PI/2;return new THREE.Vector3(.12+.23*Math.sin(a),.97+.22*(1-Math.cos(a))+Math.max(0,t-.5)*.68,-.035);},.085,{rings:8,sides:12,ribs:6});
  return [barrel.finish('ribbed-barrel'),pear.finish('prickly-pear'),column.finish('branched-column')];
}
function cactusMaterial(time){
  const m=new THREE.MeshStandardMaterial({name:'opaque-ribbed-cactus',color:0xffffff,vertexColors:true,roughness:.82,metalness:0,side:THREE.DoubleSide});
  m.uniforms={time};m.onBeforeCompile=s=>{
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 aOffset;attribute vec3 aScale;attribute float aAngle;attribute vec3 aTint;attribute vec4 aFall;varying vec3 vCactusTint;varying vec3 vCactusP;\nvec3 cactusFall(vec3 p){vec3 axis=vec3(aFall.x,0.0,aFall.y);float c=cos(aFall.z),s=sin(aFall.z);return p*c+cross(axis,p)*s+axis*dot(axis,p)*(1.0-c);}');
    s.vertexShader=s.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nfloat cactusC=cos(aAngle),cactusS=sin(aAngle);mat2 cactusR=mat2(cactusC,-cactusS,cactusS,cactusC);objectNormal=normalize(objectNormal/aScale);objectNormal.xz=cactusR*objectNormal.xz;');
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCactusP=position;transformed*=aScale;transformed.xz=cactusR*transformed.xz;transformed=cactusFall(transformed);transformed.y+=aFall.w;transformed+=aOffset;vCactusTint=aTint;');
    s.vertexShader=s.vertexShader.replace('objectNormal.xz=cactusR*objectNormal.xz;','objectNormal.xz=cactusR*objectNormal.xz;objectNormal=cactusFall(objectNormal);');
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCactusTint;varying vec3 vCactusP;').replace('#include <color_fragment>','#include <color_fragment>\nfloat waxGrain=sin(vCactusP.x*328.0+sin(vCactusP.y*171.0))*sin(vCactusP.z*285.0+vCactusP.y*410.0);diffuseColor.rgb*=vCactusTint*(.96+.04*waxGrain)*mix(.76,1.0,smoothstep(0.0,.18,vCactusP.y));');
  };m.customProgramCacheKey=()=> 'solid-cactus-persistent-topple-v2';return m;
}
export function makeCactusField(data,time,terrainGeometry){
  const group=new THREE.Group();group.name='fixed-island-cactus-field';const bases=cactusGeometries(),material=cactusMaterial(time),tiles=new Map(),sample=meadowSurface(terrainGeometry),surface={},spacing=4.0,counts=[0,0,0];
  for(let ix=-75;ix<75;ix++)for(let iz=-75;iz<75;iz++){
    const rand=randomSeed((ix*73856093)^(iz*19349663)^817923),x=(ix+.2+rand()*.6)*spacing,z=(iz+.2+rand()*.6)*spacing;sample(x,z,surface);if(!plantable(data,x,z,surface))continue;
    if(data.buildings.some(b=>Math.abs(x-b.x)<b.w*.5+1.3&&Math.abs(z-b.z)<b.d*.5+1.3))continue;
    const r=rand(),variant=r<.57?0:r<.86?1:2,scale=.65+rand()*.63,tint=.86+rand()*.22,key=Math.floor(x/48)+','+Math.floor(z/48);
    if(!tiles.has(key))tiles.set(key,[[],[],[]]);tiles.get(key)[variant].push([x,surface.height-.008,z,scale*(.89+rand()*.22),scale,scale,rand()*TAU,tint*(.94+rand()*.07),tint,tint*(.88+rand()*.10)]);counts[variant]++;
  }
  const meshes=[],plants=[];
  for(const [key,variants] of tiles)variants.forEach((rows,variant)=>{
    if(!rows.length)return;const base=bases[variant],g=new THREE.InstancedBufferGeometry();g.index=base.index;for(const [name,a] of Object.entries(base.attributes))g.setAttribute(name,a);
    for(const [name,size,offset] of [['aOffset',3,0],['aScale',3,3],['aAngle',1,6],['aTint',3,7]]){const a=new Float32Array(rows.length*size);rows.forEach((r,i)=>a.set(r.slice(offset,offset+size),i*size));g.setAttribute(name,new THREE.InstancedBufferAttribute(a,size).setUsage(THREE.StaticDrawUsage));}
    g.instanceCount=rows.length;g.userData=base.userData;const box=new THREE.Box3(),b=base.boundingBox,rad=Math.hypot(Math.max(Math.abs(b.min.x),Math.abs(b.max.x)),Math.max(Math.abs(b.min.z),Math.abs(b.max.z)));
    for(const r of rows){const radius=rad*Math.max(r[3],r[5]);box.expandByPoint(new THREE.Vector3(r[0]-radius,r[1]+b.min.y*r[4],r[2]-radius));box.expandByPoint(new THREE.Vector3(r[0]+radius,r[1]+b.max.y*r[4],r[2]+radius));}
    // A falling crown may cross its tile boundary. Keep the conservative bounds
    // resident so rotating the camera never hides an impacted plant.
    box.expandByScalar(2.8);g.boundingBox=box;g.boundingSphere=box.getBoundingSphere(new THREE.Sphere());g.setAttribute('aFall',new THREE.InstancedBufferAttribute(new Float32Array(rows.length*4),4).setUsage(THREE.DynamicDrawUsage));
    const mesh=new THREE.Mesh(g,material);mesh.name='resident-'+base.userData.form;mesh.userData={tileKey:key,variant,cactus:true};mesh.receiveShadow=true;mesh.castShadow=false;mesh.matrixAutoUpdate=false;group.add(mesh);meshes.push(mesh);
    rows.forEach((r,index)=>plants.push({mesh,index,x:r[0],y:r[1],z:r[2],sx:r[3],sy:r[4],sz:r[5],yaw:r[6],height:b.max.y*r[4],radius:rad*Math.max(r[3],r[5]),variant,angle:0,lift:0}));
  });const impacts=new CactusImpacts(plants,{sample});group.userData={meshes,impacts,coverage:{count:counts.reduce((a,b)=>a+b,0),spacing,resident:true,cactus:true,variants:counts},compressible:false};group.matrixAutoUpdate=false;return group;
}
