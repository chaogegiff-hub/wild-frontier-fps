import * as THREE from './vendor/three.module.js';

// All colour, normal and roughness samples use the same physical coordinates.
// Random offsets change the visible tile without rotating the photographed
// normals, and explicit gradients keep tile boundaries from blurring.
const sampling=`
vec2 groundHash(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}
float groundNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(groundHash(i).x,groundHash(i+vec2(1,0)).x,f.x),mix(groundHash(i+vec2(0,1)).x,groundHash(i+vec2(1,1)).x,f.x),f.y);}
vec4 groundSample(sampler2D photo,vec2 uv){
  vec2 cell=floor(uv*.4),f=fract(uv*.4),a=cell,b=cell+vec2(1,0),c=cell+vec2(0,1);
  vec3 weights=vec3(1.0-f.x-f.y,f.x,f.y);
  if(f.x+f.y>1.0){a=cell+vec2(1);weights=vec3(f.x+f.y-1.0,1.0-f.y,1.0-f.x);}
  weights=pow(max(weights,vec3(0)),vec3(4));weights/=max(.0001,weights.x+weights.y+weights.z);
  vec2 dx=dFdx(uv),dy=dFdy(uv);
  return textureGrad(photo,uv+groundHash(a)*19.0,dx,dy)*weights.x+textureGrad(photo,uv+groundHash(b)*19.0,dx,dy)*weights.y+textureGrad(photo,uv+groundHash(c)*19.0,dx,dy)*weights.z;
}`;

export function makeGroundMaterial(surfaces,contact){
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.96,normalMap:surfaces.normal,normalScale:new THREE.Vector2(.62,.62)});
  material.name='stochastic-dry-soil-and-rock';
  material.onBeforeCompile=s=>{
    Object.assign(s.uniforms,{tGrass:{value:surfaces.grass},tRock:{value:surfaces.rock},tTrail:{value:surfaces.ground},tForest:{value:surfaces.forest},tGrassN:{value:surfaces.grassNormal},tRockN:{value:surfaces.rockNormal},tTrailN:{value:surfaces.normal},tGrassR:{value:surfaces.grassRough},tContact:{value:contact}});
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrainP; varying vec3 vTerrainN;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvTerrainP=(modelMatrix*vec4(transformed,1.0)).xyz;vTerrainN=normalize(mat3(modelMatrix)*objectNormal);');
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrainP;varying vec3 vTerrainN;uniform sampler2D tGrass;uniform sampler2D tRock;uniform sampler2D tTrail;uniform sampler2D tForest;uniform sampler2D tGrassN;uniform sampler2D tRockN;uniform sampler2D tTrailN;uniform sampler2D tGrassR;uniform sampler2D tContact;\n'+sampling)
    .replace('#include <map_fragment>',`
      vec2 uvW=vTerrainP.xz,grassUv=uvW*.50;
      vec3 baseGrass=groundSample(tTrail,grassUv).rgb;
      vec3 axes=pow(abs(normalize(vTerrainN)),vec3(4));axes/=max(.001,axes.x+axes.y+axes.z);
      vec3 stoneColor=texture2D(tRock,vTerrainP.zy*.24).rgb*axes.x+texture2D(tRock,vTerrainP.xz*.24).rgb*axes.y+texture2D(tRock,vTerrainP.xy*.24).rgb*axes.z;
      vec3 trailColor=texture2D(tTrail,uvW*.28).rgb;
      float rockAmount=smoothstep(.20,.57,1.0-vTerrainN.y);
      float roadX=-89.0+sin(vTerrainP.z*.015)*18.0+cos(vTerrainP.z*.031)*6.0;
      float road=(1.0-smoothstep(3.5,7.4,abs(vTerrainP.x-roadX)))*(1.0-smoothstep(195.0,245.0,abs(vTerrainP.z)));
      float shore=1.0-smoothstep(3.7,6.0,vTerrainP.y);
      vec3 floorMask=texture2D(tContact,vec2(uvW.x/640.0+.5,.5-uvW.y/640.0)).rgb;
      road=max(road,1.0-floorMask.b);
      float dryPatch=smoothstep(.38,.78,groundNoise(uvW*.037+vec2(5.2,1.7)));
      float microPatch=groundNoise(uvW*.23-vec2(2.6,7.1));
      vec3 groundColor=mix(baseGrass,trailColor,dryPatch*(.04+.06*microPatch));
      groundColor*=mix(vec3(.91,.86,.72),vec3(1.00,.94,.82),dryPatch)*(.96+.08*microPatch);
      groundColor=mix(groundColor,texture2D(tForest,uvW*.36).rgb,(1.0-floorMask.g)*.18);
      vec3 col=mix(groundColor,stoneColor,rockAmount);
      col=mix(col,trailColor,max(road,shore*.84));diffuseColor.rgb*=col*(.88+.12*floorMask.r);
    `)
    .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor*=mix(clamp(groundSample(tGrassR,grassUv).g,.62,1.0),.98,max(road,rockAmount));')
    .replace('#include <normal_fragment_maps>',`
      vec3 groundN=groundSample(tTrailN,grassUv).xyz*2.0-1.0;
      vec3 trailN=texture2D(tTrailN,uvW*.28).xyz*2.0-1.0;
      vec3 mapN=normalize(mix(groundN,trailN,max(road,shore*.84)));mapN.xy*=normalScale;
      vec3 nW=normalize(vTerrainN),tW=normalize(vec3(1,0,0)-nW*nW.x),bW=normalize(cross(tW,nW));
      vec3 mappedWorld=normalize(tW*mapN.x+bW*mapN.y+nW*max(.1,mapN.z));
      vec3 rx=texture2D(tRockN,vTerrainP.zy*.24).xyz*2.0-1.0,ry=texture2D(tRockN,vTerrainP.xz*.24).xyz*2.0-1.0,rz=texture2D(tRockN,vTerrainP.xy*.24).xyz*2.0-1.0;
      vec3 rockWorld=normalize(vec3(abs(rx.z)*sign(vTerrainN.x),rx.y*.6,rx.x*.6)*axes.x+vec3(ry.x*.6,abs(ry.z),ry.y*.6)*axes.y+vec3(rz.x*.6,rz.y*.6,abs(rz.z)*sign(vTerrainN.z))*axes.z);
      normal=normalize(mat3(viewMatrix)*normalize(mix(mappedWorld,rockWorld,rockAmount)));
    `);
  };
  material.customProgramCacheKey=()=> 'coherent-dry-cactus-soil-v2';return material;
}

export const DETAIL_SURFACES={grass:'grass-2k.jpg',grassNormal:'grass-normal-2k.jpg',rock:'rock-2k.jpg',rockNormal:'rock-normal-2k.jpg'};
export function detailSurfaceLoader(surfaces,loadTexture=(url)=>new THREE.TextureLoader().loadAsync(url)){
  let pending=null;const completed=new Set();
  // Update shared Texture objects so terrain and rock-root shaders stay in sync.
  // Optional detail can fail independently of deployment and the first frame.
  return ()=>pending??=(async()=>{
    const results=await Promise.allSettled(Object.entries(DETAIL_SURFACES).filter(([key])=>!completed.has(key)).map(async([key,file])=>{
      const detail=await loadTexture('./textures/detail/'+file),target=surfaces[key];
      if(!detail.image||detail.image.width<2048)throw new Error('High-detail photo is missing');
      target.image=detail.image;target.needsUpdate=true;completed.add(key);return key;
    }));
    const result={loaded:results.filter(r=>r.status==='fulfilled').map(r=>r.value),failed:results.filter(r=>r.status==='rejected').length};
    if(result.failed)pending=null;return result;
  })();
}
