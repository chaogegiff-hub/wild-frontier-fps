import {makeLootViews} from './loot-views.js?v=2.21';
import * as THREE from './vendor/three.module.js';
import {heightAt,slopeAt,noise,randomSeed,WORLD_SIZE,WATER_LEVEL,roadX,TRAIL_ROUTES,onTrail} from './core.js?v=2.21';
import {makeNature} from './nature.js?v=2.21';
import {makeCactusField} from './cactus-field.js?v=2.21';
import {skyLighting} from './assets.js?v=2.21';
import {makeRuralBuilding} from './rural-buildings.js?v=2.21';
import {makeGroundMaterial,detailSurfaceLoader} from './terrain-material.js?v=2.21';
import {mapConcurrent,retryAsset} from './asset-loading.js?v=2.21';
import {makeSunnySky,DAYLIGHT} from './daylight.js?v=2.21';

export const SURFACE_GROUPS=21;
export const SURFACE_FILES={ground:'ground.jpg',rock:'rock.jpg',normal:'ground-normal.jpg',rockNormal:'rock-normal.jpg',grass:'grass.jpg',grassNormal:'grass-normal.jpg',grassRough:'grass-rough.jpg',forest:'forest.jpg',forestNormal:'forest-normal.jpg',metalNormal:'metal-normal.jpg',metalRough:'metal-rough.jpg',waterNormal:'water-normal.jpg',wall:'wall.jpg',wallNormal:'wall-normal.jpg',wallRough:'wall-rough.jpg',roof:'roof.jpg',roofNormal:'roof-normal.jpg',roofRough:'roof-rough.jpg',wood:'wood.jpg',woodNormal:'wood-normal.jpg',woodRough:'wood-rough.jpg'};

const texLoader=new THREE.TextureLoader();
const canvasTexture=(canvas)=>{const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;};
function canvas(w,h=w){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
export async function loadSurfaces(report=()=>{}){
  const files=SURFACE_FILES;
  const entries=await mapConcurrent(Object.entries(files),3,async([key,file])=>{
    const t=await retryAsset('地表材质',()=>texLoader.loadAsync(`./textures/${file}`));t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=/^(wall|roof|wood)/.test(key)?16:8;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;
    if(['ground','rock','grass','forest','wall','roof','wood'].includes(key))t.colorSpace=THREE.SRGBColorSpace;
    report(key);return [key,t];
  });return Object.fromEntries(entries);
}
export function makeWorld(scene,data,surfaces,quality,assets){
  const rand=randomSeed(12),timeUniform={value:0},lighting=skyLighting(assets.sky);
  const skyDome=makeSunnySky(assets.sky,lighting);scene.add(skyDome);
  const geo=new THREE.PlaneGeometry(WORLD_SIZE,WORLD_SIZE,224,224);geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++)pos.setY(i,heightAt(pos.getX(i),pos.getZ(i)));geo.computeVertexNormals();
  const contact=makeContactMap(data);
  const terrainMat=makeGroundMaterial(surfaces,contact),requestSurfaceDetail=detailSurfaceLoader(surfaces);
  const terrain=new THREE.Mesh(geo,terrainMat);terrain.receiveShadow=true;scene.add(terrain);

  // A bathymetric texture clips the water surface to the actual terrain basin.
  const hc=canvas(512),hctx=hc.getContext('2d'),hd=hctx.createImageData(512,512);
  for(let j=0;j<512;j++)for(let i=0;i<512;i++){const y=heightAt((i/511-.5)*WORLD_SIZE,(j/511-.5)*WORLD_SIZE),k=(j*512+i)*4,n=Math.round(Math.max(0,Math.min(1,y/128))*65535);hd.data[k]=n>>8;hd.data[k+1]=n&255;hd.data[k+2]=0;hd.data[k+3]=255;}hctx.putImageData(hd,0,0);
  const heightTex=new THREE.CanvasTexture(hc);heightTex.minFilter=heightTex.magFilter=THREE.LinearFilter;
  const waterMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),time:timeUniform,bathymetry:{value:heightTex},skyMap:{value:assets.sky},waveMap:{value:surfaces.waterNormal},cameraPos:{value:new THREE.Vector3()},sunDirection:{value:lighting.direction},sunColor:{value:lighting.sunColor}},vertexShader:`
    #include <fog_pars_vertex>
    uniform float time;varying vec3 vW;varying vec2 vUv;
    void main(){vec3 p=position;p.y+=sin(p.x*.24+time*.7)*.020+cos(p.z*.21+time*.9)*.015;vW=p;vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
    }
  `,fragmentShader:`
    uniform float time;uniform sampler2D bathymetry;uniform sampler2D skyMap;uniform sampler2D waveMap;uniform vec3 cameraPos;uniform vec3 sunDirection;uniform vec3 sunColor;varying vec3 vW;varying vec2 vUv;
    #include <fog_pars_fragment>
    void main(){vec2 terrainUV=vec2(vW.x/640.0+.5,.5-vW.z/640.0);vec2 encoded=texture2D(bathymetry,terrainUV).rg;float h=(encoded.r*255.0*256.0+encoded.g*255.0)/65535.0*128.0;
      if(any(lessThan(terrainUV,vec2(0.0)))||any(greaterThan(terrainUV,vec2(1.0))))h=-12.0;if(h>3.0)discard;
      float coastDepth=smoothstep(235.0,315.0,length(vW.xz*vec2(.97,1.015)))*12.0;float depth=max(3.0-h,coastDepth);
      float stream=1.0-smoothstep(-92.0,-58.0,vW.z),speed=mix(.001,.012,stream);
      vec3 wave1=texture2D(waveMap,vW.xz*.045-vec2(time*.001,time*speed)).xyz*2.0-1.0;
      vec3 wave2=texture2D(waveMap,vW.xz*.11+vec2(time*.002,-time*speed*.65)).xyz*2.0-1.0;
      vec3 n=normalize(vec3((wave1.x+wave2.x)*.038,1.0,(wave1.y+wave2.y)*.038));
      vec3 viewDir=normalize(cameraPos-vW);float fresnel=.035+.965*pow(1.0-max(dot(n,viewDir),0.0),5.0);
      vec3 reflection=reflect(-viewDir,n);
      vec2 skyUV=vec2(atan(reflection.z,reflection.x)*.15915494+.5,asin(clamp(reflection.y,-1.0,1.0))*.31830989+.5);
      vec3 skyColor=texture2D(skyMap,skyUV).rgb*.8;
      vec3 base=mix(vec3(.13,.17,.105),vec3(.026,.073,.066),smoothstep(0.0,2.5,depth));base=mix(base,vec3(.022,.060,.082),smoothstep(2.5,10.0,depth));base=mix(base,skyColor,fresnel);
      float ripple=sin(vW.x*2.6+vW.z*1.9+time*1.2)*sin(vW.z*2.7-vW.x*.6+time*.9)*.025;
      vec3 sun=normalize(sunDirection);float shine=pow(max(dot(reflect(-sun,n),viewDir),0.0),90.0);
      float foam=(1.0-smoothstep(.0,.28,depth))*(.3+.3*sin(vW.x*3.0+vW.z*2.1+time));
      vec3 color=base+ripple+sunColor*shine*.9+vec3(.62,.66,.57)*foam;
      gl_FragColor=vec4(color,mix(.32,.93,smoothstep(.0,1.7,depth)));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>
#include <fog_fragment>
    }
  `});
  const wg=new THREE.PlaneGeometry(WORLD_SIZE*4,WORLD_SIZE*4,100,100);wg.rotateX(-Math.PI/2);wg.translate(0,WATER_LEVEL,0);const water=new THREE.Mesh(wg,waterMat);water.renderOrder=2;scene.add(water);

  const nature=makeNature(scene,data,assets,timeUniform,quality);
  blendRockRoots(nature,heightTex,contact,surfaces);
  const buildings=new THREE.Group();
  for(const b of data.buildings)buildings.add(makeRuralBuilding(b,surfaces));scene.add(buildings);
  const windows=new Map(buildings.children.flatMap(b=>b.userData.windows.map(w=>[w.id,w.mesh]))),lootViews=makeLootViews(data.loot||[]);scene.add(lootViews.group);
  const grass=makeCactusField(data,timeUniform,geo);scene.add(grass);

  const sunLight=new THREE.DirectionalLight(lighting.sunColor,DAYLIGHT.sunIntensity);sunLight.position.copy(lighting.direction).multiplyScalar(320);sunLight.castShadow=quality!=='low';sunLight.shadow.mapSize.set(quality==='high'?2048:1024,quality==='high'?2048:1024);Object.assign(sunLight.shadow.camera,{left:-80,right:80,top:80,bottom:-80,near:1,far:640});sunLight.shadow.bias=-.00035;sunLight.shadow.normalBias=.16;scene.add(sunLight,sunLight.target);
  const ambient=new THREE.HemisphereLight('#c0dcf5','#555e40',DAYLIGHT.ambientIntensity);scene.add(ambient);
  scene.fog=new THREE.FogExp2('#b6d4e9',DAYLIGHT.hazeDensity);
  const mapCanvas=makeMap(data);
  return {terrain,grass,water,nature,buildings,windows,lootViews,skyDome,breakWindow(id){const pane=windows.get(id);if(pane)pane.visible=false;},resetInteractive(match){for(const w of match.windows){const pane=windows.get(w.id);if(pane)pane.visible=!w.broken;}lootViews.reset(match.loot);},sunLight,ambient,mapCanvas,timeUniform,requestSurfaceDetail,
    setSky(sky){skyDome.material.uniforms.photoSky.value=sky;waterMat.uniforms.skyMap.value=sky;},
    update(time,camera){timeUniform.value=time;grass.userData.refreshPhotos?.();skyDome.position.copy(camera.position);waterMat.uniforms.cameraPos.value.copy(camera.position);nature.update(time,camera);sunLight.target.position.copy(camera.position);sunLight.position.copy(camera.position).addScaledVector(lighting.direction,320);},
    setQuality(q){nature.setQuality(q);sunLight.castShadow=q!=='low';const size=q==='high'?2048:1024;if(sunLight.shadow.mapSize.x!==size){sunLight.shadow.mapSize.set(size,size);if(sunLight.shadow.map){sunLight.shadow.map.dispose();sunLight.shadow.map=null;}}}
  };
}
function blendRockRoots(nature,heightTex,contact,surfaces){
  const cache=new Map();
  for(const mesh of [...nature.rockBatches.flat(),...nature.cliffBatches]){
    const original=mesh.material;if(!cache.has(original)){
      const material=original.clone();
      material.onBeforeCompile=s=>{
        Object.assign(s.uniforms,{rootHeight:{value:heightTex},rootGrass:{value:surfaces.ground},rootForest:{value:surfaces.forest},rootContact:{value:contact}});
        s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRockRoot;').replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
          vec4 rootWorld=vec4(transformed,1.0);
          #ifdef USE_INSTANCING
          rootWorld=instanceMatrix*rootWorld;
          #endif
          vRockRoot=(modelMatrix*rootWorld).xyz;`);
        s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRockRoot;uniform sampler2D rootHeight;uniform sampler2D rootGrass;uniform sampler2D rootForest;uniform sampler2D rootContact;').replace('#include <map_fragment>',`#include <map_fragment>
          vec2 rootUV=vec2(vRockRoot.x/640.0+.5,.5-vRockRoot.z/640.0),encodedRoot=texture2D(rootHeight,rootUV).rg;
          float terrainY=(encodedRoot.r*255.0*256.0+encodedRoot.g*255.0)/65535.0*128.0;
          vec2 rootMask=texture2D(rootContact,rootUV).rg;
          vec3 earth=mix(texture2D(rootGrass,vRockRoot.xz*.50).rgb,texture2D(rootForest,vRockRoot.xz*.24).rgb,(1.0-rootMask.g)*.72);
          earth*=.86+.14*rootMask.r;
          float dirtyRoot=1.0-smoothstep(-.02,.38,vRockRoot.y-terrainY);
          diffuseColor.rgb=mix(diffuseColor.rgb,earth,dirtyRoot*.88);`);
      };material.customProgramCacheKey=()=> 'scanned-rock-ground-blend-v1';cache.set(original,material);
    }mesh.material=cache.get(original);
  }
}
function makeContactMap(data){
  const ao=canvas(512),ac=ao.getContext('2d'),floor=canvas(512),fc=floor.getContext('2d'),trails=canvas(512),tc=trails.getContext('2d');
  for(const ctx of [ac,fc,tc]){ctx.fillStyle='#fff';ctx.fillRect(0,0,512,512);}
  function shade(ctx,x,z,r,opacity){const g=ctx.createRadialGradient(x,z,0,x,z,r);g.addColorStop(0,`rgba(0,0,0,${opacity})`);g.addColorStop(.35,`rgba(0,0,0,${opacity*.4})`);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-r,z-r,r*2,r*2);}
  for(const t of data.trees){const x=(t.x/640+.5)*512,z=(t.z/640+.5)*512;shade(ac,x,z,(.7+t.h*.025)*512/640,.38);shade(fc,x,z,t.r*.84*512/640,.68);}
  for(const r of data.rocks){shade(ac,(r.x/640+.5)*512,(r.z/640+.5)*512,(r.r*.70+.15)*512/640,.46);}
  tc.strokeStyle='#000';tc.lineCap=tc.lineJoin='round';tc.shadowColor='#000';tc.shadowBlur=1.25;
  for(const route of TRAIL_ROUTES){tc.lineWidth=route.width*2*512/640;tc.beginPath();route.points.forEach(([x,z],i)=>tc[i?'lineTo':'moveTo']((x/640+.5)*512,(z/640+.5)*512));tc.stroke();}
  const c=canvas(512),ctx=c.getContext('2d'),mask=ctx.createImageData(512,512),a=ac.getImageData(0,0,512,512).data,f=fc.getImageData(0,0,512,512).data,t=tc.getImageData(0,0,512,512).data;
  for(let i=0;i<a.length;i+=4){mask.data[i]=a[i];mask.data[i+1]=f[i];mask.data[i+2]=t[i];mask.data[i+3]=255;}ctx.putImageData(mask,0,0);return new THREE.CanvasTexture(c);
}
function makeMap(data){
  const c=canvas(512),ctx=c.getContext('2d'),d=ctx.createImageData(512,512);
  for(let j=0;j<512;j++)for(let i=0;i<512;i++){
    const x=(i/511-.5)*640,z=(j/511-.5)*640,h=heightAt(x,z),n=noise(x*.11,z*.11),k=(j*512+i)*4;
    let col=h<3?[64,104,103]:h>45?[106,112,94]:[68,86,58];
    const shade=(heightAt(x-1,z-1)-h)*1.9+n*12;
    if(h>=3&&(Math.abs(x-roadX(z))<5&&Math.abs(z)<220||onTrail(x,z)))col=[137,126,92];
    d.data[k]=col[0]+shade;d.data[k+1]=col[1]+shade;d.data[k+2]=col[2]+shade;d.data[k+3]=255;
  }ctx.putImageData(d,0,0);
  ctx.strokeStyle='#bfc5a13b';ctx.lineWidth=1;
  for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(i*64,0);ctx.lineTo(i*64,512);ctx.moveTo(0,i*64);ctx.lineTo(512,i*64);ctx.stroke();}
  for(const t of data.trees){ctx.fillStyle='#253d25';ctx.beginPath();ctx.arc((t.x/640+.5)*512,(t.z/640+.5)*512,2.8,0,6.3);ctx.fill();}
  for(const b of data.buildings){ctx.fillStyle='#d4c69c';ctx.fillRect((b.x/640+.5)*512-b.w*.4,(b.z/640+.5)*512-b.d*.4,b.w*.8,b.d*.8);}return c;
}
