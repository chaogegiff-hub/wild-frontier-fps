import * as THREE from './vendor/three.module.js';
import {randomSeed,noise} from './core.js?v=2.21';
import {plantable,meadowSurface} from './resident-vegetation.js?v=2.21';

// Small, irregular clumps of curved physical leaves and occasional dry seed
// stalks. No square photo cards, per-frame spawning or distance-based reseeding.
export function wildGrassGeometry(variant=0){
  const rand=randomSeed(42791+variant*71),p=[],color=[],index=[];
  const strip=(angle,height,width,bend,root,seed=false)=>{
    const start=p.length/3,dx=Math.sin(angle),dz=Math.cos(angle),sx=Math.cos(angle),sz=-Math.sin(angle);
    for(let row=0;row<4;row++){
      const t=row/3,half=width*(row===3?.018:row===0?.32:.5)*(seed&&row===2?2:1),lean=bend*t*t,x=dx*(root+lean),y=height*(t-.14*t*t*t),z=dz*(root+lean);
      for(const side of [-1,1]){p.push(x+sx*half*side,y,z+sz*half*side);const light=.82+t*.24;const base=seed?[.29,.235,.105]:variant===1?[.255,.265,.125]:[.17,.255,.095];color.push(...base.map(c=>c*light*(.92+rand()*.12)));}
    }
    for(let row=0;row<3;row++){const a=start+row*2;index.push(a,a+1,a+2,a+1,a+3,a+2);}
  };
  for(let i=0;i<7+variant;i++)strip(i*2.39996+rand()*.55,.18+rand()*.24,.014+rand()*.014,.045+rand()*.20,.014+rand()*.06);
  if(variant!==0)for(let i=0;i<2;i++)strip(i*2.3+variant,.40+rand()*.16,.006,.05,.02,true);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));g.setIndex(index);g.computeVertexNormals();
  const n=g.attributes.normal,v=new THREE.Vector3();for(let i=0;i<n.count;i++){v.fromBufferAttribute(n,i);if(v.y<0)v.negate();v.lerp(new THREE.Vector3(0,1,0),.45).normalize();n.setXYZ(i,v.x,v.y,v.z);}g.computeBoundingBox();return g;
}
function grassMaterial(time){
  const m=new THREE.MeshStandardMaterial({name:'sparse-wild-grass',color:0xffffff,vertexColors:true,side:THREE.DoubleSide,roughness:.97,metalness:0});
  m.onBeforeCompile=s=>{
    s.uniforms.time=time;
    s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>
      attribute vec3 aOffset;attribute vec3 aScale;attribute float aAngle;attribute vec3 aTint;attribute vec2 aPress;uniform float time;varying vec3 vGrassTint;`);
    s.vertexShader=s.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
      float gc=cos(aAngle),gs=sin(aAngle);mat2 gr=mat2(gc,-gs,gs,gc);float press=clamp(aPress.x,0.0,.92);vec2 lean=vec2(cos(aPress.y),sin(aPress.y));
      objectNormal=normalize(objectNormal/aScale);objectNormal.xz=gr*objectNormal.xz;
      objectNormal.y=(objectNormal.y-dot(objectNormal.xz,lean)*press*.82)/(1.0-press*.85);objectNormal=normalize(objectNormal);`);
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      transformed*=aScale;transformed.xz=gr*transformed.xz;transformed.xz+=lean*transformed.y*press*.82;transformed.y*=1.0-press*.85;
      float wind=time*1.3+aOffset.x*.19+aOffset.z*.13;transformed.x+=sin(wind)*transformed.y*transformed.y*.14;transformed.z+=cos(wind*.87)*transformed.y*transformed.y*.09;
      transformed+=aOffset;vGrassTint=aTint*mix(1.0,.78,press);`);
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vGrassTint;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=vGrassTint;');
  };m.customProgramCacheKey=()=> 'sparse-wild-grass-wind-and-wheel-press-v1';return m;
}
export function makeWildGrass(data,time,terrainGeometry){
  const group=new THREE.Group();group.name='sparse-resident-wild-grass';const bases=[0,1,2].map(wildGrassGeometry),material=grassMaterial(time),sample=meadowSurface(terrainGeometry),surface={},tiles=new Map(),step=2.25,cells=Math.ceil(300/step);let count=0;
  for(let ix=-cells;ix<cells;ix++)for(let iz=-cells;iz<cells;iz++){
    const rand=randomSeed((ix*73856093)^(iz*19349663)^15319),x=(ix+.12+rand()*.76)*step,z=(iz+.12+rand()*.76)*step,patch=noise(x*.052+12,z*.052-7);
    if(rand()>.18+.44*patch)continue;sample(x,z,surface);if(!plantable(data,x,z,surface))continue;
    if(data.rocks.some(r=>Math.hypot(x-r.x,z-r.z)<r.r+.3)||data.cliffs?.some(r=>Math.hypot(x-r.x,z-r.z)<r.r*.85))continue;
    const variant=Math.floor(rand()*3),scale=.64+rand()*.65,tint=.82+rand()*.32,key=Math.floor(x/48)+','+Math.floor(z/48),dry=1-patch;
    if(!tiles.has(key))tiles.set(key,[[],[],[]]);tiles.get(key)[variant].push([x,surface.height+.003,z,scale,scale,scale,rand()*Math.PI*2,tint*(.95+dry*.15),tint,tint*(.86-dry*.05)]);count++;
  }
  const meshes=[];
  for(const [tileKey,variants] of tiles)variants.forEach((rows,variant)=>{
    if(!rows.length)return;const base=bases[variant],g=new THREE.InstancedBufferGeometry();g.index=base.index;for(const [name,a] of Object.entries(base.attributes))g.setAttribute(name,a);
    for(const [name,size,offset] of [['aOffset',3,0],['aScale',3,3],['aAngle',1,6],['aTint',3,7]]){const a=new Float32Array(rows.length*size);rows.forEach((r,i)=>a.set(r.slice(offset,offset+size),i*size));g.setAttribute(name,new THREE.InstancedBufferAttribute(a,size));}
    g.setAttribute('aPress',new THREE.InstancedBufferAttribute(new Float32Array(rows.length*2),2).setUsage(THREE.DynamicDrawUsage));g.instanceCount=rows.length;
    const box=new THREE.Box3();for(const r of rows){box.expandByPoint(new THREE.Vector3(r[0]-.85,r[1]-.02,r[2]-.85));box.expandByPoint(new THREE.Vector3(r[0]+.85,r[1]+.8,r[2]+.85));}g.boundingBox=box;g.boundingSphere=box.getBoundingSphere(new THREE.Sphere());
    const mesh=new THREE.Mesh(g,material);mesh.name='wild-grass-'+variant+'-'+tileKey;mesh.userData={tileKey,variant,wildGrass:true};mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;group.add(mesh);meshes.push(mesh);
  });group.userData={meshes,coverage:{count,spacing:step,resident:true,sparse:true},compressible:true};group.matrixAutoUpdate=false;return group;
}
