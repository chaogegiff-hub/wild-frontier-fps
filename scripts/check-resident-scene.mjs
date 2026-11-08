import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import {heightAt,terrainSurfaceAt,SPAWN} from '../dist/core.js';

export function checkResidentScene(check,{world,data}){
  const grass=world.grass.userData.meshes;
  const plants=[...world.nature.fernBatches.flat(),...world.nature.flowerBatches.flat(),...world.nature.understoreyBatches.flat()];
  const digest=()=>{const hash=createHash('sha256');for(const m of grass){hash.update(String(m.geometry.instanceCount));hash.update(new Uint8Array(m.geometry.index.array.buffer));for(const name of ['aOffset','aScale','aAngle','aTint'])hash.update(new Uint8Array(m.geometry.attributes[name].array.buffer));}for(const m of plants){hash.update(String(m.count));hash.update(new Uint8Array(m.instanceMatrix.array.buffer));}return hash.digest('hex');};
  const before=digest(),objects=world.grass.children.map(m=>m.uuid),count=grass.reduce((n,m)=>n+m.geometry.instanceCount,0);
  check('all island grass is replaced by grounded solid cacti before walking',()=>{
    assert.ok(count>14000&&count<16000);assert.equal(world.grass.children.length,grass.length);
    const quadrants=[0,0,0,0];let nearSpawn=0,beyondOldRange=0;
    for(const m of grass){const a=m.geometry.attributes.aOffset;for(let i=0;i<m.geometry.instanceCount;i++){
      const x=a.getX(i),y=a.getY(i),z=a.getZ(i),d=Math.hypot(x-SPAWN.x,z-SPAWN.z);quadrants[(x>0?1:0)+(z>0?2:0)]++;
      if(d<15)nearSpawn++;if(d>150)beyondOldRange++;
      if(i%97===0){assert.ok(Math.abs(y-terrainSurfaceAt(x,z))<.012);assert.ok(y>3.8);}
    }}
    assert.ok(quadrants.every(n=>n>3000));assert.ok(nearSpawn>25);assert.ok(beyondOldRange>7500);
    assert.equal(plants.length,0,'Legacy ground foliage remains');assert.equal(world.grass.userData.coverage.cactus,true);assert.equal(world.grass.userData.compressible,false);for(const m of grass){assert.equal(m.material.transparent,false);assert.equal(m.material.alphaTest,0);assert.ok(m.geometry.userData.spines>80);assert.equal(m.geometry.attributes.aPress,undefined);}
  });
  check('walking, turning, scope zoom and quality changes preserve the entire scene',()=>{
    const c=new THREE.PerspectiveCamera(75,.6,.08,1000);
    const route=[[SPAWN.x,SPAWN.z,0],[120,-125,2.8],[-210,-150,-1.5],[180,145,.9],[SPAWN.x,SPAWN.z,Math.PI]];
    for(const quality of ['high','low','medium'])for(const [x,z,yaw] of route)for(const zoom of [1,8]){
      world.setQuality(quality);c.position.set(x,heightAt(x,z)+1.72,z);c.rotation.set(-.045,yaw,0,'YXZ');c.fov=2*Math.atan(Math.tan(75*Math.PI/360)/zoom)*180/Math.PI;c.aspect=zoom===1?.6:16/9;c.updateProjectionMatrix();
      world.update(50,c);
      assert.equal(world.nature.treeDistant.count+world.nature.woodlandDistant.count,data.trees.length);
      assert.ok(world.nature.cliffBatches.every(m=>m.count===data.cliffs.length));
      assert.equal(digest(),before,'Movement changed fixed vegetation buffers');assert.deepEqual(world.grass.children.map(m=>m.uuid),objects);
      for(const v of world.nature.visibility){assert.ok(v.high>=0&&v.medium>=-1e-12&&v.far>=0);assert.ok(Math.abs(v.high+v.medium+v.far-1)<1e-12);}
    }
    world.setQuality('high');
  });
  check('every tree retains continuous coverage through both detail transitions',()=>{
    const tree=data.trees.find(t=>t.species===1),index=data.trees.indexOf(tree),c=new THREE.PerspectiveCamera(75,1,.08,1000);let previous;
    for(let distance=1;distance<=110;distance+=.25){
      c.position.set(tree.x,tree.y+tree.h*.45,tree.z+distance);c.lookAt(tree.x,tree.y+tree.h*.55,tree.z);world.update(50,c);const v=world.nature.visibility[index];
      if(previous)for(const key of ['high','medium','far'])assert.ok(Math.abs(v[key]-previous[key])<.04,'Tree coverage jumps at a distance threshold');previous={...v};
      const high=world.nature.woodlandBatches[0][0],medium=world.nature.woodlandBatches[1][0];
      assert.ok(v.high===0||high.count>0);assert.ok(v.medium===0||medium.count>0);
    }
  });
  check('cactus geometry, instance counts and visibility never change with camera distance',()=>{
    const c=new THREE.PerspectiveCamera(75,.6,.08,1000),anchor=grass[0].geometry.attributes.aOffset,sceneObjects=world.grass.children.map(m=>m.uuid);
    const states=grass.map(m=>({triangles:m.geometry.index.count,instances:m.geometry.instanceCount,alphaTest:m.material.alphaTest,opacity:m.material.opacity}));
    for(const quality of ['low','high','medium'])for(const d of [1,5,10,15,20,23,50,100,500]){
      world.setQuality(quality);c.position.set(anchor.getX(0),anchor.getY(0)+1.72,anchor.getZ(0)+d);c.lookAt(anchor.getX(0),anchor.getY(0)+.3,anchor.getZ(0));world.update(60,c);
      assert.deepEqual(world.grass.children.map(m=>m.uuid),sceneObjects);assert.ok(grass.every(m=>m.visible),'A grass layer disappears with distance');
      assert.deepEqual(grass.map(m=>({triangles:m.geometry.index.count,instances:m.geometry.instanceCount,alphaTest:m.material.alphaTest,opacity:m.material.opacity})),states,'Near grass gained leaves or changed opacity');
    }
    assert.equal(digest(),before);world.setQuality('high');
  });
  check('every rigid cactus and its spines remain inside their tile culling bounds',()=>{
    const p=new THREE.Vector3();for(const m of grass){const g=m.geometry,a=g.attributes,vertices=[...new Set(g.index.array)],box=g.boundingBox;
      for(const i of [0,Math.floor(g.instanceCount/2),g.instanceCount-1])for(const vertex of vertices){
        const x=a.position.getX(vertex)*a.aScale.getX(i),y=a.position.getY(vertex)*a.aScale.getY(i),z=a.position.getZ(vertex)*a.aScale.getZ(i),angle=a.aAngle.getX(i),c=Math.cos(angle),s=Math.sin(angle),ox=a.aOffset.getX(i),oz=a.aOffset.getZ(i);
        p.set(c*x+s*z+ox,y+a.aOffset.getY(i),-s*x+c*z+oz);assert.ok(box.containsPoint(p),'Cactus lies outside its fixed culling box');
      }
    }
  });
}
