import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {RGBELoader} from './vendor/RGBELoader.js';
import {mapConcurrent,retryAsset,photoTexture,resilientModelTextures} from './asset-loading.js?v=2.25-drive-grass1';
import {detailManifest,immutableBlob} from './detail-resources.js?v=2.25-drive-grass1';

export const MODEL_FILES={vehicle:'models/jeep/model.gltf',sniper:'models/m700/model.gltf',grenade:'models/gl6/model.gltf',rifle:'models/akm/model.gltf',scope:'models/optics/scope.gltf',soldier:'models/rocketbox-soldier/model.gltf',hands:'models/gloved-hands/model.gltf',swimArms:'models/swim-sleeves/model.gltf',treeHigh:'nature/island_tree_02/high.gltf',treeMedium:'nature/island_tree_02/low.gltf',woodlandHigh:'nature/woodland_tree_03/high.gltf',woodlandMedium:'nature/woodland_tree_03/low.gltf',cliff:'nature/rock_face_01/model.gltf',rocks:'nature/rock_moss_set_01/model.gltf'};
export const TREE_IMPOSTOR='nature/island_tree_02/impostor.png';
export const WOODLAND_IMPOSTOR='nature/woodland_tree_02/impostor.png';
export const ASSET_GROUPS=Object.keys(MODEL_FILES).length+3;
export async function loadSkyDetail({cache}={}){
  const manifest=await detailManifest(),entry=manifest.entries.find(e=>e.target==='environment/sky.hdr');if(!entry)throw new Error('2K sky is missing');
  const blob=await immutableBlob(entry,{cache}),url=URL.createObjectURL(blob);let sky;try{sky=await new RGBELoader().loadAsync(url);}finally{URL.revokeObjectURL(url);}
  if(sky.image.width<2048){sky.dispose();throw new Error('2K sky is missing');}sky.mapping=THREE.EquirectangularReflectionMapping;return sky;
}

export async function loadAssets(report=()=>{},{mobile=false}={}){
  THREE.Cache.enabled=true;
  const loader=resilientModelTextures(new GLTFLoader());
  const paths={...MODEL_FILES};if(mobile){paths.treeHigh=paths.treeMedium;paths.woodlandHigh=paths.woodlandMedium;}
  const load=async([key,path])=>{
    const model=await retryAsset('模型',()=>loader.loadAsync(`./${path}`));
    model.scene.traverse(o=>{
      if(!o.isMesh)return;
      const materials=Array.isArray(o.material)?o.material:[o.material];
      materials.forEach(m=>{
        for(const key of ['map','normalMap','roughnessMap','metalnessMap'])if(m[key])m[key].anisotropy=4;
        // Cut-out foliage writes depth and sorts correctly across many instances.
        if(key!=='vehicle'&&m.transparent&&m.map){m.transparent=false;m.alphaTest=.42;m.depthWrite=true;m.side=THREE.DoubleSide;}
        if(m.alphaTest>0)m.alphaToCoverage=true;
      });
    });
    report(key);return [key,model];
  };
  // Safari's ImageLoader caches completed images, not in-flight image requests.
  // Load one tree LOD first so the other two reuse its decoded textures.
  const treeEntries=async()=>{
    const high=await load(['treeHigh',paths.treeHigh]);
    return [high,...await Promise.all(['treeMedium'].map(key=>{
      if(paths[key]===paths.treeHigh){report(key);return [key,high[1]];}
      return load([key,paths[key]]);
    }))];
  };
  const woodlandEntries=async()=>{const high=await load(['woodlandHigh',paths.woodlandHigh]);if(paths.woodlandHigh===paths.woodlandMedium){report('woodlandMedium');return [high,['woodlandMedium',high[1]]];}return [high,await load(['woodlandMedium',paths.woodlandMedium])];};
  const skyPromise=()=>retryAsset('天空',()=>new RGBELoader().loadAsync('./environment/sky.hdr')).then(sky=>{sky.mapping=THREE.EquirectangularReflectionMapping;report('sky');return sky;});
  const impostor=async(file,key)=>{
    const map=await retryAsset('树木材质',()=>photoTexture('./'+file));
    map.colorSpace=THREE.SRGBColorSpace;map.flipY=false;map.anisotropy=4;map.needsUpdate=true;report(key);return map;
  };
  const jobs=[...Object.entries(paths).filter(([key])=>!key.startsWith('tree')&&!key.startsWith('woodland')).map(entry=>()=>load(entry)),treeEntries,woodlandEntries,skyPromise,()=>impostor(TREE_IMPOSTOR,'treeImpostor'),()=>impostor(WOODLAND_IMPOSTOR,'woodlandImpostor')];
  const results=await mapConcurrent(jobs,mobile?2:4,job=>job()),[trees,woodland,sky,treeImpostor,woodlandImpostor]=results.slice(-5),other=results.slice(0,-5);
  const entries=[...other,...trees,...woodland];
  const shared=new Map();
  for(const [key,model] of entries)if(key.startsWith('tree')||key.startsWith('woodland'))model.scene.traverse(o=>{
    if(!o.isMesh)return;
    if(!shared.has(o.material.name))shared.set(o.material.name,o.material);
    else o.material=shared.get(o.material.name);
  });
  return {...Object.fromEntries(entries),sky,treeImpostor,woodlandImpostor};
}

// Flatten each named variant without retaining its display-grid translation.
export function meshParts(root){
  root.updateMatrixWorld(true);const parts=[];
  root.traverse(o=>{
    if(!o.isMesh)return;
    const geo=o.geometry.clone();geo.applyMatrix4(o.matrixWorld);
    parts.push({geometry:geo,material:o.material,name:o.name});
  });
  return parts;
}

export function variants(model,anchorBase=false){
  return model.scene.children.map(node=>{
    const copy=node.clone(true);copy.position.set(0,0,0);copy.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(copy),size=box.getSize(new THREE.Vector3());
    const center=box.getCenter(new THREE.Vector3());
    if(anchorBase){
      const v=new THREE.Vector3();let x=0,z=0,count=0;
      copy.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);if(v.y<box.min.y+.12){x+=v.x;z+=v.z;count++;}}});
      if(count){center.x=x/count;center.z=z/count;}
    }
    copy.position.set(-center.x,-box.min.y,-center.z);copy.updateMatrixWorld(true);
    return {parts:meshParts(copy),size,anchor:new THREE.Vector3(center.x,box.min.y,center.z)};
  });
}

const lightingCache=new WeakMap();
export function skyLighting(sky){
  if(lightingCache.has(sky))return lightingCache.get(sky);
  const image=sky.image,{data,width,height}=image||{},decode=sky.type===THREE.HalfFloatType?THREE.DataUtils.fromHalfFloat:x=>x;
  let maximum=0,peakX=width*.2,peakY=height*.25,peak=[1,.94,.86],horizon=[0,0,0],samples=0;
  if(data)for(let j=0;j<height;j++){
    const v=sky.flipY?1-(j+.5)/height:(j+.5)/height,elevation=(v-.5)*Math.PI;
    if(elevation<-.04)continue;
    for(let i=0;i<width;i++){
      const k=(j*width+i)*4,r=decode(data[k]),g=decode(data[k+1]),b=decode(data[k+2]),brightness=r*.2126+g*.7152+b*.0722;
      if(elevation>.025&&brightness>maximum){maximum=brightness;peakX=i;peakY=j;peak=[r,g,b];}
      if(elevation<.12){horizon[0]+=r;horizon[1]+=g;horizon[2]+=b;samples++;}
    }
  }
  const theta=((peakX+.5)/width-.5)*Math.PI*2,v=sky.flipY?1-(peakY+.5)/height:(peakY+.5)/height,phi=(v-.5)*Math.PI;
  const direction=new THREE.Vector3(Math.cos(phi)*Math.cos(theta),Math.sin(phi),Math.cos(phi)*Math.sin(theta)).normalize(),top=Math.max(...peak);
  const sunColor=new THREE.Color().setRGB(...peak.map(n=>Math.max(.28,n/top)));
  const aces=x=>Math.max(0,Math.min(1,(x*(2.51*x+.03))/(x*(2.43*x+.59)+.14)));
  const haze=new THREE.Color().setRGB(...horizon.map(n=>aces(n/Math.max(1,samples)*.82*.95)));
  const result={direction,sunColor,haze};lightingCache.set(sky,result);return result;
}
export function lightFromSky(renderer,scene,viewScene,sky){
  const generator=new THREE.PMREMGenerator(renderer);generator.compileEquirectangularShader();
  const environment=generator.fromEquirectangular(sky);generator.dispose();
  scene.background=sky;scene.environment=environment.texture;scene.backgroundIntensity=.82;
  scene.environmentIntensity=.85;viewScene.environment=environment.texture;viewScene.environmentIntensity=.92;
  return environment;
}
