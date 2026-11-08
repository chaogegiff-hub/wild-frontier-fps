import assert from 'node:assert/strict';
import './local-assets.mjs';
import * as THREE from '../dist/vendor/three.module.js';
import {GrassCompression,VehicleTrails} from '../dist/vehicle-trails.js';
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function grass(points){
  const tiles=new Map();for(const [x,z] of points){const key=Math.floor(x/48)+','+Math.floor(z/48);if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(x,10,z);}
  const meshes=[...tiles].map(([key,p])=>{const g=new THREE.InstancedBufferGeometry();g.instanceCount=p.length/3;g.setAttribute('aOffset',new THREE.InstancedBufferAttribute(Float32Array.from(p),3));g.setAttribute('aScale',new THREE.InstancedBufferAttribute(new Float32Array(p.length).fill(1),3));g.setAttribute('aPress',new THREE.InstancedBufferAttribute(new Float32Array(g.instanceCount*2),2));const m=new THREE.Mesh(g);m.userData.tileKey=key;return m;});return {userData:{meshes}};
}
const field=()=>grass([[-.9,1],[-.9,2],[.9,1],[.9,2],[0,1],[5,2]]),rootState=g=>g.userData.meshes.map(m=>[...m.geometry.attributes.aOffset.array]),pressState=g=>g.userData.meshes.map(m=>[...m.geometry.attributes.aPress.array]);
function setup(options={}){const g=field(),scene=new THREE.Scene(),fx=new VehicleTrails(scene,g,{terrain:()=>10,capacity:128,...options}),car={id:0,x:0,y:10.025,z:1,yaw:0,pitch:0,roll:0,speed:6,stalled:false,sinking:false,inWater:false},fleet={cars:[car],current:car};fx.reset(fleet);fx.update(1/60,fleet);return {g,scene,fx,car,fleet};}
check('only grass under the two wheel paths bends; roots, instance objects and original scales remain fixed',()=>{
  const g=field(),roots=rootState(g),scales=g.userData.meshes.map(m=>[...m.geometry.attributes.aScale.array]),objects=[...g.userData.meshes],compression=new GrassCompression(g.userData.meshes);
  compression.press({x:-.9,z:3},{x:-.9,z:0});compression.press({x:.9,z:3},{x:.9,z:0});compression.flush();assert.equal(compression.pressed,4);assert.deepEqual(rootState(g),roots);assert.deepEqual(g.userData.meshes,objects);assert.deepEqual(g.userData.meshes.map(m=>[...m.geometry.attributes.aScale.array]),scales);
  for(const m of g.userData.meshes){const a=m.geometry.attributes;for(let i=0;i<m.geometry.instanceCount;i++)assert.equal(a.aPress.getX(i)>0,Math.abs(Math.abs(a.aOffset.getX(i))-.9)<.01);}
  const fixed=pressState(g);compression.press({x:20,z:20},{x:20,z:21});compression.flush();assert.deepEqual(pressState(g),fixed);compression.reset();assert.ok(pressState(g).flat().every(x=>x===0));assert.deepEqual(rootState(g),roots);
});
check('swept grass contact also crosses negative tile and cell boundaries correctly',()=>{
  const g=grass([[-48.01,-.1],[-47.99,-.1],[-47.99,2]]),p=new GrassCompression(g.userData.meshes);p.press({x:-48.3,z:-.1},{x:-47.7,z:-.1});p.flush();assert.equal(p.pressed,2);const distant=g.userData.meshes.find(m=>m.geometry.attributes.aOffset.getZ(0)>1);assert.equal(distant.geometry.attributes.aPress.getX(0),0);
});
check('rear tires leave two grounded tread ribbons with finite normals and the correct wheel spacing',()=>{
  const {g,fx,car,fleet}=setup(),roots=rootState(g);for(let i=0;i<12;i++){car.z-=.30;fx.update(.05,fleet);}assert.ok(fx.used>=20);assert.ok(fx.compression.pressed>=4);assert.deepEqual(rootState(g),roots);
  const {position,normal,uv}=fx.geometry.attributes;for(let slot=0;slot<fx.used;slot++){let x=0;for(let i=0;i<4;i++){const at=slot*4+i;assert.ok(Math.abs(position.getY(at)-10.009)<1e-5);assert.ok(normal.getY(at)>.99);assert.ok(Number.isFinite(uv.getY(at)));x+=position.getX(at);}assert.ok(Math.abs(Math.abs(x/4)-.9)<1e-6);}
  assert.equal(fx.geometry.drawRange.count,fx.used*6);assert.ok(fx.material.transparent&&fx.material.roughness===1);assert.ok(fx.puffs.some(p=>p.sprite.visible));
});
check('tread geometry and pressed grass stay behind after the car stops, the player exits or the camera moves',()=>{
  const {g,fx,car,fleet}=setup();for(let i=0;i<8;i++){car.z-=.30;fx.update(.05,fleet);}const points=[...fx.geometry.attributes.position.array],pressed=pressState(g),used=fx.used;car.speed=0;fleet.current=null;for(let i=0;i<180;i++)fx.update(1/60,fleet);assert.ok(fx.puffs.every(p=>!p.sprite.visible));fleet.current=null;for(let i=0;i<60;i++)fx.update(1/60,fleet);assert.equal(fx.used,used);assert.deepEqual([...fx.geometry.attributes.position.array],points);assert.deepEqual(pressState(g),pressed);assert.ok(fx.puffs.every(p=>!p.sprite.visible));
});
check('curved driving is continuous while reverse changes and teleports cannot draw a false line through the car',()=>{
  const {fx,car,fleet}=setup();for(let i=0;i<16;i++){car.yaw+=.06;car.x+=.1;car.z-=.26;fx.update(.05,fleet);}assert.ok(fx.used>20);const used=fx.used;car.speed=-4;fx.update(.02,fleet);assert.equal(fx.used,used);car.z+=20;fx.update(.02,fleet);assert.equal(fx.used,used);for(let i=0;i<8;i++){car.z+=.3;fx.update(.05,fleet);}assert.ok(fx.used>used);
});
check('water, bridges and a stalled engine do not leave floating tracks or continue emitting exhaust',()=>{
  for(const options of [{terrain:()=>2},{bridges:[{x:0,z:0,w:20,d:20}]}]){const {fx,car,fleet}=setup(options);for(let i=0;i<12;i++){car.z-=.30;fx.update(.05,fleet);}assert.equal(fx.used,0);assert.equal(fx.compression.pressed,0);}
  const {fx,car,fleet}=setup();car.stalled=true;car.inWater=true;for(let i=0;i<180;i++){car.z-=.03;fx.update(1/60,fleet);}assert.equal(fx.used,0);assert.ok(fx.puffs.every(p=>!p.sprite.visible));
});
check('the trail pool is bounded, a paused update adds nothing and a new round clears only the pressure state',()=>{
  const {g,fx,car,fleet}=setup({capacity:8}),roots=rootState(g);for(let i=0;i<100;i++){car.z-=.3;fx.update(.05,fleet);}assert.equal(fx.used,8);assert.equal(fx.geometry.drawRange.count,48);assert.equal(fx.puffs.length,64);const before=fx.totalSegments;fx.update(0,fleet);assert.equal(fx.totalSegments,before);fx.reset(fleet);assert.equal(fx.used,0);assert.equal(fx.geometry.drawRange.count,0);assert.ok(pressState(g).flat().every(v=>v===0));assert.deepEqual(rootState(g),roots);
});
console.log(`${passed} exhaust, tire-track and fixed-grass checks passed. Not a browser/device render.`);
