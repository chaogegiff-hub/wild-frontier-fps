// Native posed-asset diagnostics, not browser screenshots or device measurements.
import fs from 'node:fs';import path from 'node:path';
import * as THREE from '../dist/vendor/three.module.js';
import {localAssets} from './local-assets.mjs';import {createEnemyModel} from '../dist/weapons.js';
import {Match,createWorldData,terrainSurfaceAt} from '../dist/core.js';
if(!process.argv[2])throw new Error('Pass a scratch output directory');
const output=path.resolve(process.argv[2]);fs.mkdirSync(output,{recursive:true});const {assets,surfaces}=await localAssets(),textures=new Map(),records=[];
function texture(map){
  if(!map)return null;if(textures.has(map.uuid))return textures.get(map.uuid);const c=document.createElement('canvas');c.width=map.image.width;c.height=map.image.height;c.getContext('2d').drawImage(map.image,0,0);const file=`texture-${textures.size}.png`;fs.writeFileSync(path.join(output,file),c.toBuffer('image/png'));const result={file,flipY:map.flipY};textures.set(map.uuid,result);return result;
}
for(const [label,speed,seconds,slope,knock,eye,state] of [
  ['walk-contact',1.25,.35,0,0,[2.0,1.6,2.7]],['walk-stride',1.25,.73,0,0,[2.7,1.6,.7]],
  ['run',2.8,.52,0,0,[2.4,1.6,1.9]],['slope-contact',1.25,.8,.20,0,[2.0,1.6,2.7]],
  ['vehicle-knockdown',0,0,0,1,[2.3,2.8,1.7]],['survivor-getting-up',0,0,0,2,[2.3,2.8,1.7]],['patrol-low-ready',0,1,0,0,[1.8,1.55,2.6],'patrol'],['aim-up-and-turn',0,1,0,0,[1.8,1.55,2.6],'aim'],['magazine-reload',0,1,0,0,[-1.8,1.5,2.5],'reload'],
  ...['explosion','vehicle'].flatMap(kind=>[.2,.5,1.2,3.2].map(t=>[kind+'-'+t,0,0,0,0,[2.2,1.6,2.7],'impact:'+kind+':'+t]))
]){
  const actor=createEnemyModel(1,assets,surfaces),ground=(x,z)=>state?.startsWith('impact:')?terrainSurfaceAt(x,z):x*slope+z*slope*.6,e={walk:0,sees:state!=='patrol',lookYaw:state==='aim'?.65:.15,aimPitch:state==='aim'?.35:0,reloadRemaining:state==='reload'?1.2:0,reloadDuration:2.6};
  for(let t=0;t<seconds;t+=1/120){actor.position.z+=speed/120;actor.position.y=ground(actor.position.x,actor.position.z);e.walk+=speed/120*2.8;actor.userData.animate(1/120,e,{groundAt:ground});}
  if(knock)actor.userData.stagger(1/60,{kind:'vehicle',age:.7,grounded:true,flightTime:.5,landedAge:knock===1?.3:1.5,downTime:1.1,recoverTime:.8,poseX:1.48,poseZ:0});
  if(state?.startsWith('impact:')){
    const [_,kind,duration]=state.split(':'),m=new Match({...createWorldData(),colliders:[]});m.reset('training');m.running=true;const enemy=m.enemies[1];m.enemies=[enemy];
    if(kind==='vehicle'){const car=m.fleet.cars[0];Object.assign(enemy,{x:car.x,z:car.z-1.8,y:terrainSurfaceAt(car.x,car.z-1.8)});car.speed=18;m.vehicleContacts(car,{x:car.x,z:car.z+.3});}
    actor.position.set(enemy.x,enemy.y,enemy.z);actor.rotation.y=enemy.yaw;actor.userData.animate(.1,{walk:0,sees:true});if(kind!=='vehicle')m.explode({x:enemy.x-1,y:enemy.y+.7,z:enemy.z});
    for(let t=0;t<Number(duration);t+=1/120){m.updateAftermath(1/120);actor.position.set(enemy.x,enemy.y,enemy.z);actor.userData.fall(1/120,ground,enemy.blast,m.colliders);}
  }
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(3.6,3.6,4,4),new THREE.MeshStandardMaterial({color:'#747e65'}));plane.rotation.x=-Math.PI/2;plane.position.set(actor.position.x,0,actor.position.z);plane.updateMatrixWorld(true);
  const g=plane.geometry.attributes.position;for(let i=0;i<g.count;i++)g.setZ(i,ground(g.getX(i)+actor.position.x,-g.getY(i)+actor.position.z));plane.geometry.computeVertexNormals();
  const group=new THREE.Group();group.add(actor,plane);group.updateMatrixWorld(true);const camera=new THREE.PerspectiveCamera(50,16/9,.02,30);camera.position.copy(actor.position).add(new THREE.Vector3(...eye));camera.lookAt(actor.position.clone().add(new THREE.Vector3(0,.8,0)));camera.updateMatrixWorld(true);
  const item={aspect:16/9,slot:label,projection:camera.projectionMatrix.toArray(),parts:[]};
  group.traverseVisible(o=>{
    if(!o.isMesh)return;if(o.isSkinnedMesh)o.skeleton.update();const geometry=o.geometry.clone(),p=geometry.attributes.position;
    if(o.isSkinnedMesh){for(let i=0;i<p.count;i++){const v=new THREE.Vector3();o.getVertexPosition(i,v);p.setXYZ(i,v.x,v.y,v.z);}geometry.computeVertexNormals();}
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse,o.matrixWorld));const n=geometry.attributes.normal,uv=geometry.attributes.uv,vertex=new Float32Array(p.count*8);
    for(let i=0;i<p.count;i++)vertex.set([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i),uv?uv.getX(i):0,uv?uv.getY(i):0],i*8);
    const id=`${records.length}-${item.parts.length}`,vfile=id+'-vertices.bin',ifile=id+'-indices.bin',indices=geometry.index?new Uint32Array(geometry.index.array):Uint32Array.from({length:p.count},(_,i)=>i);fs.writeFileSync(path.join(output,vfile),Buffer.from(vertex.buffer));fs.writeFileSync(path.join(output,ifile),Buffer.from(indices.buffer));const m=o.material;item.parts.push({vertices:vfile,indices:ifile,count:indices.length,color:m.color.toArray(),texture:texture(m.map),alphaTest:m.alphaTest||0});geometry.dispose();
  });records.push(item);
}
fs.writeFileSync(path.join(output,'layout.json'),JSON.stringify(records));console.log(`Exported ${records.length} actual walking, slope and knockdown poses.`);
