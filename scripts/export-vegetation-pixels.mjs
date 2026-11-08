// Export the shipped foliage fragment operations for native pixel checks.
// These small fixtures isolate opacity/transition behaviour, not browser QA.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../dist/vendor/three.module.js';
import {createWorldData} from '../dist/core.js';
import {makeNature,makeMeadow} from '../dist/nature.js';
import {localAssets} from './local-assets.mjs';
const output=path.resolve(process.argv[2]||'');if(!process.argv[2])throw new Error('Pass an absolute scratch directory');fs.mkdirSync(output,{recursive:true});
const {assets}=await localAssets(),data=createWorldData(),time={value:0},nature=makeNature(new THREE.Scene(),data,assets,time,'high'),meadow=makeMeadow(data,assets.grassLow,time,'medium');
const header='#version 300 es\nprecision highp float;\n#define varying in\n#define texture2D texture\n#define gl_FragColor pixelColor\nout vec4 pixelColor;\nuniform sampler2D map;\nin vec2 vMapUv;\n';
for(const [name,material,photo] of [['tree-mask',nature.treeDistant.material,false],['grass-coverage',meadow.userData.meshes[0].material,false],['tree-photos',nature.treeDistant.material,true]]){
  const shader={uniforms:{},vertexShader:'',fragmentShader:`#include <common>\nvoid main(){\n${photo?'vec4 diffuseColor=vec4(1.0);\n#include <map_fragment>\ngl_FragColor=diffuseColor;':'#include <clipping_planes_fragment>\ngl_FragColor=vec4(1.0);'}\n}`};material.onBeforeCompile(shader);
  fs.writeFileSync(path.join(output,name+'.frag'),header+(photo?'#define USE_MAP\n':'')+shader.fragmentShader.replace(/#include <[^>]+>/g,''));
}
console.log('Exported actual tree and meadow fragment operations for native pixel checks.');
