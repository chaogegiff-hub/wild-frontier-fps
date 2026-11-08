// Generate the exact GLSL ES 3.00 programs through the vendored Three.js pipeline.
// This captures shader source only; native GLES performs the actual compilation.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import {Match,createWorldData,heightAt} from '../dist/core.js';
import {makeVehicleViews} from '../dist/vehicles.js';
import {VehicleTrails} from '../dist/vehicle-trails.js';
import {SwimView} from '../dist/swim-view.js';
import {makeWorld} from '../dist/world.js';
import {createViewModels,createEnemyModel} from '../dist/weapons.js';
import {BattleEffects} from '../dist/effects.js';
import {localAssets} from './local-assets.mjs';

const output=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw new Error('Pass an absolute scratch output directory.');
fs.mkdirSync(output,{recursive:true});
const vendor=fs.readFileSync(new URL('../dist/vendor/three.module.js',import.meta.url),'utf8');
const internalFile=path.join(output,'three-internals.mjs');
fs.writeFileSync(internalFile,vendor+'\nexport {WebGLProgram,WebGLPrograms};\n');
const {WebGLProgram,WebGLPrograms}=await import(pathToFileURL(internalFile).href);
const {assets,surfaces}=await localAssets();
const scene=new THREE.Scene(),data=createWorldData();
const world=makeWorld(scene,data,surfaces,'medium',assets);
const fleet=new Match(data).fleet;fleet.driverId=fleet.cars[0].id;
const vehicles=makeVehicleViews(assets,fleet);vehicles.update(0);scene.add(vehicles.group);
const trails=new VehicleTrails(scene,world.grass,{capacity:16});trails.reset(fleet);fleet.current.speed=3;trails.update(.1,fleet);fleet.current.z-=.4;trails.update(.1,fleet);
const effects=new BattleEffects(scene,{casing(){},explosion(){}},{mobile:true});
effects.muzzle(new THREE.Vector3(0,2,0));effects.casing(new THREE.Vector3(0,2,0),{x:1,y:1,z:0});effects.impact({x:0,y:2,z:0},{x:0,y:1,z:0},'water',false);
effects.impact({x:0,y:2,z:0},{x:0,y:0,z:1},'plaster',false);effects.impact({x:1,y:2,z:0},{x:1,y:0,z:0},'wood',false);
effects.explosion({x:0,y:2,z:0});effects.glassBreak({x:0,y:2,z:0},{x:0,y:0,z:1});effects.vehicleWrecks(.4,[{id:0,destroyed:true,wreckAge:1,x:0,y:4,z:0}]);
effects.update(.001,[{id:1,x:0,y:2,z:-1,vx:0,vy:0,vz:-820,weapon:0}]);
scene.add(createEnemyModel(0,assets,surfaces));
const camera=new THREE.PerspectiveCamera(66,390/844,.08,1000);
camera.position.set(-79,heightAt(-79,159)+5.9,159);camera.lookAt(14,6,-31);world.update(0,camera);
const env=new THREE.Texture({width:768,height:1024});env.mapping=THREE.CubeUVReflectionMapping;
scene.environment=env;
const viewScene=new THREE.Scene();viewScene.environment=env;
const view=createViewModels(assets,surfaces);view.roots.forEach(root=>viewScene.add(root));viewScene.add(view.flash);
const swim=new SwimView(assets.hands,assets.swimArms);swim.update(.1,{active:true,moving:true});viewScene.add(swim.group);

const programs=[],gl={
  VERTEX_SHADER:0x8b31,FRAGMENT_SHADER:0x8b30,
  createProgram(){const p={shaders:[]};programs.push(p);return p;},
  createShader:type=>({type}),shaderSource(shader,source){shader.source=source;},
  attachShader(program,shader){program.shaders.push(shader);},
  compileShader(){},linkProgram(){},bindAttribLocation(){}
};
const renderer={
  getContext:()=>gl,getRenderTarget:()=>null,outputColorSpace:THREE.SRGBColorSpace,
  toneMapping:THREE.ACESFilmicToneMapping,shadowMap:{enabled:true,type:THREE.PCFSoftShadowMap},
  _useLegacyLights:false,debug:{checkShaderErrors:true}
};
const bindingStates={releaseStatesOfProgram(){}};
const pipeline=WebGLPrograms(renderer,{get:t=>t},{get:t=>t},{has:()=>false},
  {precision:'highp',vertexTextures:true,logarithmicDepthBuffer:false,getMaxPrecision:p=>p},
  bindingStates,{numPlanes:0,numIntersection:0});
const records=[],seen=new Set();
function exportMaterial(material,object,activeScene,shadow,label){
  const lights={directional:[{}],point:activeScene===scene?[{},{}]:[],spot:[],spotLightMap:[],rectArea:[],hemi:[{}],
    directionalShadowMap:shadow?[{}]:[],pointShadowMap:[],spotShadowMap:[],
    numSpotLightShadowsWithMaps:0,numLightProbes:0};
  const params=pipeline.getParameters(material,lights,shadow?[world.sunLight]:[],activeScene,object);
  params.uniforms=pipeline.getUniforms(material);material.onBeforeCompile(params,renderer);
  new WebGLProgram(renderer,pipeline.getProgramCacheKey(params),params,bindingStates);
  const source=programs.pop().shaders;
  const signature=createHash('sha256').update(source.map(s=>s.source).join('\n')).digest('hex');
  if(seen.has(signature))return;seen.add(signature);
  const stem=`${String(records.length).padStart(3,'0')}-${label}`.replace(/[^\w-]/g,'_');
  for(const s of source)fs.writeFileSync(path.join(output,stem+(s.type===gl.VERTEX_SHADER?'.vert':'.frag')),s.source);
  records.push({stem,label,material:material.type,name:material.name,shadow,instancing:params.instancing,skinning:params.skinning});
}
for(const environmentHeight of [1024,2048]){
env.image={width:environmentHeight*.75,height:environmentHeight};
for(const shadow of [false,true]){
  renderer.shadowMap.enabled=shadow;
  scene.traverse(object=>{
    if(!object.isMesh&&!object.isSprite)return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      const label=object===world.terrain?'terrain':object===world.water?'water':object===world.grass?'distant-grass':material.name||material.type;
      exportMaterial(material,object,scene,shadow,label);
      if(shadow&&object.castShadow){
        const depth=object.customDepthMaterial||new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:material.map,
          alphaMap:material.alphaMap,alphaTest:material.alphaTest,side:material.side});
        exportMaterial(depth,object,scene,false,'shadow-depth');
      }
    }
  });
}
renderer.shadowMap.enabled=false;
viewScene.traverse(object=>{if(object.isMesh||object.isSprite)for(const material of Array.isArray(object.material)?object.material:[object.material])exportMaterial(material,object,viewScene,false,'view-'+(material.name||material.type));});
}
fs.writeFileSync(path.join(output,'programs.json'),JSON.stringify(records,null,2));
console.log(`${records.length} actual WebGL 2 shader variants exported, including environment, fog, shadows, bones, vehicles and all three weapons.`);
