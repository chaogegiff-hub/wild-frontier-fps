import * as THREE from './vendor/three.module.js';
import {variants} from './assets.js?v=2.25-drive-grass1';
import {heightAt,slopeAt,roadX,randomSeed,noise,onTrail,WORLD_SIZE} from './core.js?v=2.25-drive-grass1';
import {meadowBlades,meadowAtlas} from './meadow-blades.js?v=2.25-drive-grass1';

const vegetationNoise=`float vegetationNoise(vec3 p){return fract(sin(dot(floor(p*32.0),vec3(12.9898,78.233,37.719)))*43758.5453);}`;
export function plantable(data,x,z,surface){
  if(Math.abs(x)>300||Math.abs(z)>300||Math.abs(x-roadX(z))<3.9||onTrail(x,z,.45))return false;
  const y=surface?.height??heightAt(x,z);return y>3.85&&y<86&&(surface?.slope??slopeAt(x,z))<1.12&&!data.buildings.some(b=>Math.abs(x-b.x)<b.w*.57&&Math.abs(z-b.z)<b.d*.57);
}

export function meadowSurface(geometry){
  const segments=224,stride=segments+1,step=WORLD_SIZE/segments,heights=new Float32Array(stride*stride),positions=geometry?.attributes?.position;
  for(let z=0;z<stride;z++)for(let x=0;x<stride;x++)heights[z*stride+x]=positions?positions.getY(z*stride+x):heightAt(x*step-WORLD_SIZE/2,z*step-WORLD_SIZE/2);
  return (x,z,result)=>{const u=(x+WORLD_SIZE/2)/step,v=(z+WORLD_SIZE/2)/step,ix=Math.floor(u),iz=Math.floor(v),tx=u-ix,tz=v-iz,i=iz*stride+ix,a=heights[i],b=heights[i+stride],d=heights[i+1],c=heights[i+stride+1];if(tx+tz<=1){result.height=a*(1-tx-tz)+d*tx+b*tz;result.slope=Math.hypot(d-a,b-a)/step;}else{result.height=c*(tx+tz-1)+b*(1-tx)+d*(1-tz);result.slope=Math.hypot(c-b,c-d)/step;}};
}

export function plantLighting(shader){
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vPlantHeight;').replace('#include <begin_vertex>','#include <begin_vertex>\nvPlantHeight=position.y;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vPlantHeight;').replace('#include <shadowmap_pars_fragment>','#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>').replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
    reflectedLight.indirectDiffuse*=mix(.70,1.0,smoothstep(.0,.34,vPlantHeight));
    #if NUM_DIR_LIGHTS > 0
      float throughLeaf=pow(max(dot(-geometryViewDir,directionalLights[0].direction),0.0),3.0);
      float leafTransmission=(.22+.78*throughLeaf)*(1.0-.55*abs(dot(normal,directionalLights[0].direction)));
      reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(.88,1.0,.68)*directionalLights[0].color*leafTransmission*.15*getShadowMask();
    #endif
  `);
}

// Keep complete connected photographic leaf cards, including their UVs and
// normals. This is a resident geometric representation, not a ground decal.
export function leafGeometry(source,maxTriangles=12,preserveOutline=false){
  const index=source.index?.array;if(!index||index.length<=maxTriangles*3)return source;
  const parent=Array.from({length:source.attributes.position.count},(_,i)=>i),root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(let i=0;i<index.length;i+=3){const a=root(index[i]);parent[root(index[i+1])]=a;parent[root(index[i+2])]=a;}
  const groups=new Map();for(let i=0;i<index.length;i+=3){const key=root(index[i]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(index[i],index[i+1],index[i+2]);}
  const cards=[...groups.values()],selected=[],chosen=new Set();let triangles=0;
  const order=[];
  if(preserveOutline){
    const position=source.attributes.position,bounds=cards.map(card=>{const box=new THREE.Box3();for(const i of card)box.expandByPoint(new THREE.Vector3().fromBufferAttribute(position,i));return box;});
    const add=i=>{if(!order.includes(i))order.push(i);};
    for(const [axis,edge,sign] of [['y','max',1],['x','min',-1],['x','max',1],['z','min',-1],['z','max',1]])add(bounds.reduce((best,b,i)=>b[edge][axis]*sign>bounds[best][edge][axis]*sign?i:best,0));
    const centers=bounds.map(b=>b.getCenter(new THREE.Vector3()));
    while(order.length<cards.length){let best=-1,spread=-1;for(let i=0;i<cards.length;i++){if(order.includes(i))continue;const d=Math.min(...order.map(j=>centers[i].distanceToSquared(centers[j])));if(d>spread){spread=d;best=i;}}add(best);}
  }
  // Walk evenly through the scan, rather than retaining only its first leaf.
  for(let i=0;i<cards.length;i++){
    const at=preserveOutline?order[i]:(i*17)%cards.length;if(chosen.has(at))continue;chosen.add(at);const card=cards[at];if(triangles+card.length/3>maxTriangles)continue;
    selected.push(...card);triangles+=card.length/3;if(triangles>=maxTriangles)break;
  }
  if(!selected.length){for(let i=0;i<maxTriangles;i++){const at=Math.floor(i*index.length/(maxTriangles*3))*3;selected.push(index[at],index[at+1],index[at+2]);}}
  const geometry=new THREE.BufferGeometry();for(const [key,a] of Object.entries(source.attributes))geometry.setAttribute(key,a);geometry.setIndex(selected);return geometry;
}

export function addLodDither(shader){
  // Anchor the transition to the undeformed leaf surface, so camera movement
  // and the shadow camera do not shuffle the coverage pattern.
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 aLodRange;varying vec2 vLodRange;varying vec3 vVegetationAnchor;').replace('#include <begin_vertex>',`#include <begin_vertex>
    vLodRange=aLodRange;vec4 vegetationAnchor=vec4(position,1.0);
    #ifdef USE_INSTANCING
      vegetationAnchor=instanceMatrix*vegetationAnchor;
    #endif
    vVegetationAnchor=(modelMatrix*vegetationAnchor).xyz;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vLodRange;varying vec3 vVegetationAnchor;\n'+vegetationNoise).replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    float lodSample=vegetationNoise(vVegetationAnchor);
    if(lodSample<vLodRange.x||lodSample>=vLodRange.y)discard;`);
}

// One material and one geometric representation for every distance. Wind and
// persistent wheel compression deform the same grass, without moving its roots.
function meadowMaterial(original,index,time,atlas){
  const material=original.clone();material.name=`fixed-meadow-${index}`;material.emissive.set(0);material.roughness=.96;material.metalness=0;material.userData.thinLeaf=true;
  material.onBeforeCompile=s=>{
    s.uniforms.time=time;s.uniforms.turfMap={value:atlas};
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 aOffset;attribute vec3 aScale;attribute float aAngle;attribute vec3 aTint;attribute vec2 aPress;attribute float aTurf;uniform float time;varying vec3 vMeadowTint;varying float vTurf;');
    s.vertexShader=s.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=normalize(objectNormal/aScale);float meadowC=cos(aAngle),meadowS=sin(aAngle);objectNormal.xz=mat2(meadowC,-meadowS,meadowS,meadowC)*objectNormal.xz;float meadowPress=clamp(aPress.x,0.0,.92);vec2 meadowLean=vec2(cos(aPress.y),sin(aPress.y));objectNormal.y=(objectNormal.y-dot(objectNormal.xz,meadowLean)*meadowPress*.82)/(1.0-meadowPress*.85);objectNormal=normalize(objectNormal);');
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed*=aScale;transformed.xz=mat2(meadowC,-meadowS,meadowS,meadowC)*transformed.xz;transformed.xz+=meadowLean*transformed.y*meadowPress*.82;transformed.y*=1.0-meadowPress*.85;float windPhase=time*.9+aOffset.x*.14+aOffset.z*.08;transformed.x+=sin(windPhase)*transformed.y*transformed.y*.12;transformed.z+=sin(windPhase*1.31+position.x*7.0+position.z*5.0)*transformed.y*transformed.y*.07;transformed+=aOffset;vMeadowTint=aTint*mix(1.0,.82,meadowPress);vTurf=aTurf;');
    const photo=THREE.ShaderChunk.map_fragment.replace('vec4 sampledDiffuseColor = texture2D( map, vMapUv );','vec4 sampledDiffuseColor = vTurf>.5 ? texture2D(turfMap,vMapUv) : texture2D(map,vMapUv);');
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vMeadowTint;varying float vTurf;uniform sampler2D turfMap;').replace('#include <map_fragment>',photo+'\ndiffuseColor.rgb*=vMeadowTint;');
    s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;','vec3 mapN = vTurf>.5 ? vec3(0.0,0.0,1.0) : texture2D(normalMap,vNormalMapUv).xyz*2.0-1.0;'));
    plantLighting(s);
  };material.customProgramCacheKey=()=> 'curved-photographic-meadow-v4';material.uniforms={time};return material;
}

class PlantRows{
  constructor(){this.length=0;this.chunks=[];}
  push(row){const chunk=this.length>>>9;if(!this.chunks[chunk])this.chunks[chunk]=new Float32Array(512*10);this.chunks[chunk].set(row,(this.length&511)*10);this.length++;}
  get(i,component){return this.chunks[i>>>9][(i&511)*10+component];}
}

function tileMeshes(tiles,bases,materials,group,label){
  const meshes=[];
  for(const [key,plants] of tiles)for(let variant=0;variant<bases.length;variant++){
    const rows=plants[variant];if(!rows.length)continue;
    const base=bases[variant],geometry=new THREE.InstancedBufferGeometry();geometry.index=base.index;if(!base.boundingBox)base.computeBoundingBox();
    for(const [name,a] of Object.entries(base.attributes))geometry.setAttribute(name,a);
    for(const [name,size,offset] of [['aOffset',3,0],['aScale',3,3],['aAngle',1,6],['aTint',3,7]]){
      const array=new Float32Array(rows.length*size);for(let i=0;i<rows.length;i++)for(let j=0;j<size;j++)array[i*size+j]=rows.get(i,offset+j);
      geometry.setAttribute(name,new THREE.InstancedBufferAttribute(array,size).setUsage(THREE.StaticDrawUsage));
    }
    geometry.instanceCount=rows.length;
    geometry.setAttribute('aPress',new THREE.InstancedBufferAttribute(new Float32Array(rows.length*2),2).setUsage(THREE.DynamicDrawUsage));
    const bounds=new THREE.Box3(),leaf=base.boundingBox,radial=Math.hypot(Math.max(Math.abs(leaf.min.x),Math.abs(leaf.max.x)),Math.max(Math.abs(leaf.min.z),Math.abs(leaf.max.z)));
    for(let i=0;i<rows.length;i++){const x=rows.get(i,0),y=rows.get(i,1),z=rows.get(i,2),sy=rows.get(i,4),height=leaf.max.y*sy,radius=radial*Math.max(rows.get(i,3),rows.get(i,5))+height*height*.12+height*.82+.03;bounds.min.x=Math.min(bounds.min.x,x-radius);bounds.min.y=Math.min(bounds.min.y,y+leaf.min.y*sy-.02);bounds.min.z=Math.min(bounds.min.z,z-radius);bounds.max.x=Math.max(bounds.max.x,x+radius);bounds.max.y=Math.max(bounds.max.y,y+height+.02);bounds.max.z=Math.max(bounds.max.z,z+radius);}
    geometry.boundingBox=bounds;geometry.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
    const mesh=new THREE.Mesh(geometry,materials[variant]);mesh.name=`${label}-${key}-${variant}`;mesh.castShadow=false;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;mesh.userData.variant=variant;mesh.userData.tileKey=key;group.add(mesh);meshes.push(mesh);rows.chunks.length=0;
  }return meshes;
}

// The entire island is planted once before the first frame. Walking, turning,
// zooming and changing quality never change a single root or instance buffer.
export function makeResidentMeadow(data,asset,time,terrainGeometry){
  const all=variants(asset),group=new THREE.Group();group.name='resident-island-meadow';
  const fixed=all.map((_,i)=>meadowBlades(i)),fieldTiles=new Map(),atlas=meadowAtlas(all[0].parts[0].material.map);let count=0;
  const add=(map,size,x,z,variant,row)=>{const key=Math.floor(x/size)+','+Math.floor(z/size);if(!map.has(key))map.set(key,all.map(()=>new PlantRows()));map.get(key)[variant].push(row);};
  const step=.48,cells=Math.ceil(300/step),sample=meadowSurface(terrainGeometry),surface={height:0,slope:0};
  for(let ix=-cells;ix<cells;ix++)for(let iz=-cells;iz<cells;iz++){
    const rand=randomSeed((ix*73856093)^(iz*19349663)),x=(ix+.15+rand()*.7)*step,z=(iz+.15+rand()*.7)*step;
    sample(x,z,surface);if(!plantable(data,x,z,surface))continue;const patch=noise(x*.053+3,z*.053-9);
    const variant=Math.floor(rand()*all.length),h=.24+patch*.24+rand()*.12,scale=h/fixed[variant].boundingBox.max.y,width=scale*(1.08+rand()*.38),tint=.92+rand()*.17,dry=1-patch;
    const row=[x,surface.height-.004,z,width,scale,width,rand()*Math.PI*2,tint*(.88+dry*.10),tint*(.96-dry*.04),tint*(.78-dry*.025)];
    add(fieldTiles,48,x,z,variant,row);count++;
  }
  const materials=all.map((v,i)=>meadowMaterial(v.parts[0].material,i,time,atlas.texture)),meshes=tileMeshes(fieldTiles,fixed,materials,group,'meadow-field');
  group.matrixAutoUpdate=false;group.userData.meshes=meshes;
  group.userData.refreshPhotos=atlas.refresh;group.userData.turf=atlas.texture;group.userData.coverage={radius:Math.hypot(600,600),count,spacing:step,groundCover:true,curvedLeaves:true,resident:true,variants:all.map((_,i)=>meshes.filter(m=>m.userData.variant===i).reduce((n,m)=>n+m.geometry.instanceCount,0))};
  return group;
}
