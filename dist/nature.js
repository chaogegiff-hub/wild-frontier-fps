import * as THREE from './vendor/three.module.js';
import {variants} from './assets.js?v=2.25-drive-grass1';
import {terrainSurfaceAt,slopeAt,roadX,randomSeed,noise} from './core.js?v=2.25-drive-grass1';
import {plantLighting,leafGeometry,addLodDither} from './resident-vegetation.js?v=2.25-drive-grass1';
export {makeResidentMeadow as makeMeadow} from './resident-vegetation.js?v=2.25-drive-grass1';

function windShader(s,time,amount,lod=false){
  s.uniforms.windTime=time;
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform float windTime;').replace('#include <begin_vertex>',`#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat plantWind=sin(windTime*.65+instanceMatrix[3].x*.13+instanceMatrix[3].z*.19)+.22*sin(windTime*2.1+position.x*3.0);\ntransformed.x+=plantWind*max(0.0,position.y)*${amount.toFixed(4)};\ntransformed.z+=plantWind*max(0.0,position.y)*${(amount*.32).toFixed(4)};\n#endif`);
  if(lod)addLodDither(s);
}
function wind(material,time,amount,lod=false){
  const m=material.clone(),leaf=m.alphaTest>0;
  if(leaf){m.emissive.set(0);m.metalness=0;m.roughness=Math.max(.86,m.roughness);m.userData.thinLeaf=true;}
  m.onBeforeCompile=s=>{windShader(s,time,amount,lod);if(leaf)plantLighting(s);};
  m.customProgramCacheKey=()=>`foliage-wind-${amount}-${leaf}-${lod}`;return m;
}
function batch(scene,parts,max,time,amount=0,lod=false){
  return parts.map(p=>{
    let geometry=p.geometry;
    if(lod){geometry=new THREE.BufferGeometry();geometry.index=p.geometry.index;for(const [key,a] of Object.entries(p.geometry.attributes))geometry.setAttribute(key,a);geometry.setAttribute('aLodRange',new THREE.InstancedBufferAttribute(new Float32Array(max*2),2).setUsage(THREE.DynamicDrawUsage));}
    const mesh=new THREE.InstancedMesh(geometry,amount?wind(p.material,time,amount,lod):p.material,max);
    mesh.count=0;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if(lod){const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:p.material.map,alphaMap:p.material.alphaMap,alphaTest:p.material.alphaTest,side:p.material.side});depth.onBeforeCompile=s=>windShader(s,time,amount,true);depth.customProgramCacheKey=()=>`resident-tree-shadow-${amount}`;mesh.customDepthMaterial=depth;}
    scene.add(mesh);return mesh;
  });
}
const dummy=new THREE.Object3D();
function put(meshes,index,matrix,range){meshes.forEach(m=>{m.setMatrixAt(index,matrix);if(range)m.geometry.attributes.aLodRange.setXY(index,...range);});}
function finish(meshes,count){meshes.forEach(m=>{m.count=count;m.instanceMatrix.needsUpdate=true;if(m.geometry.attributes.aLodRange)m.geometry.attributes.aLodRange.needsUpdate=true;});}
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

export function makeNature(scene,data,assets,time,initialQuality){
  let quality=initialQuality;
  const treeVariants=[assets.treeHigh,assets.treeMedium].map(m=>variants(m,true)[0]);
  const woodlandVariants=[assets.woodlandHigh,assets.woodlandMedium].map(m=>variants(m,true)[0]);
  const treeBatches=treeVariants.map(v=>batch(scene,v.parts,data.trees.length,time,.005,true));
  const woodlandBatches=woodlandVariants.map(v=>batch(scene,v.parts,data.trees.length,time,.004,true));
  const distant=(map,size,center)=>{
    const plane=new THREE.PlaneGeometry(size,size);plane.translate(0,center,0);
    plane.setAttribute('aFrame',new THREE.InstancedBufferAttribute(new Float32Array(data.trees.length),1).setUsage(THREE.DynamicDrawUsage));
    plane.setAttribute('aLodRange',new THREE.InstancedBufferAttribute(new Float32Array(data.trees.length*2),2).setUsage(THREE.DynamicDrawUsage));
    const material=new THREE.MeshBasicMaterial({map,alphaTest:.30,alphaToCoverage:true,side:THREE.DoubleSide});material.color.setRGB(.80,.83,.77);
    material.onBeforeCompile=s=>{
      addLodDither(s);
      s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute float aFrame;varying float vTreeFrame;').replace('#include <uv_vertex>','#include <uv_vertex>\nvTreeFrame=aFrame;vMapUv.y=1.0-vMapUv.y;');
      s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying float vTreeFrame;').replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('vec4 sampledDiffuseColor = texture2D( map, vMapUv );',`float treeFrame=floor(vTreeFrame);vec2 photoUv=vec2(clamp(vMapUv.x,.002,.998),vMapUv.y);
        vec4 photoA=texture2D(map,vec2((photoUv.x+treeFrame)/8.0,photoUv.y)),photoB=texture2D(map,vec2((photoUv.x+mod(treeFrame+1.0,8.0))/8.0,photoUv.y));
        vec4 sampledDiffuseColor=mix(vec4(photoA.rgb*photoA.a,photoA.a),vec4(photoB.rgb*photoB.a,photoB.a),fract(vTreeFrame));
        sampledDiffuseColor.rgb/=max(sampledDiffuseColor.a,.00001);`));
    };material.customProgramCacheKey=()=> 'resident-eight-angle-tree-v4';
    const mesh=new THREE.InstancedMesh(plane,material,data.trees.length);mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=false;mesh.name='resident-distant-canopy';scene.add(mesh);return mesh;
  };
  const treeDistant=distant(assets.treeImpostor,5.2,1.7),woodlandDistant=distant(assets.woodlandImpostor,5.4,2.28),farCounts=[0,0];
  const trees=data.trees.map(tree=>{
    const species=tree.species?1:0,v=(species?woodlandVariants:treeVariants)[0],scale=tree.h/v.size.y;
    dummy.position.set(tree.x,tree.y-.035,tree.z);dummy.rotation.set(Math.sin(tree.seed)*.013,tree.seed,Math.cos(tree.seed)*.013);dummy.scale.set(scale*tree.width,scale,scale*tree.width*(.94+Math.sin(tree.seed)*.04));dummy.updateMatrix();
    const offset=v.anchor.clone().negate().multiply(new THREE.Vector3(scale*tree.width,scale,scale*tree.width)).applyAxisAngle(new THREE.Vector3(0,1,0),tree.seed);
    return {tree,species,matrix:dummy.matrix.clone(),farIndex:farCounts[species]++,scale,cx:tree.x+offset.x,cz:tree.z+offset.z};
  });
  treeDistant.count=farCounts[0];woodlandDistant.count=farCounts[1];
  // Small scanned stones collect beside the dirt road, with natural scale
  // and partial burial rather than a row of identical decorative boulders.
  const looseStones=[],stoneRand=randomSeed(778109);
  for(let i=0;i<95&&looseStones.length<34;i++){
    const z=-242+stoneRand()*490,x=roadX(z)+(stoneRand()<.5?-1:1)*(4.5+stoneRand()*4.0),y=terrainSurfaceAt(x,z),r=.08+stoneRand()**2*.27;
    if(y<4.4||slopeAt(x,z)>.75||data.buildings.some(b=>Math.abs(x-b.x)<b.w*.7&&Math.abs(z-b.z)<b.d*.7))continue;
    looseStones.push({x,y:y-.025,z,r,h:r*(.75+stoneRand()*.65),rotation:stoneRand()*Math.PI*2});
  }
  const visualRocks=[...data.rocks,...looseStones];
  const rockVariants=variants(assets.rocks),rockBatches=rockVariants.map(v=>batch(scene,v.parts,visualRocks.length,time));
  const rockCounts=rockVariants.map(()=>0);
  visualRocks.forEach((r,i)=>{
    const j=i%rockVariants.length,v=rockVariants[j];dummy.position.set(r.x,r.y,r.z);dummy.rotation.set(0,r.rotation,0);
    // Keep the original scan proportions; fitting each axis separately made
    // rounded rocks look stretched and flattened.
    const scale=Math.min(r.r*1.9/Math.max(v.size.x,v.size.z),r.h/v.size.y);
    dummy.scale.setScalar(scale);dummy.updateMatrix();put(rockBatches[j],rockCounts[j]++,dummy.matrix);
  });rockBatches.forEach((b,i)=>finish(b,rockCounts[i]));
  const cliffVariant=variants(assets.cliff)[0],cliffBatches=batch(scene,cliffVariant.parts,data.cliffs.length,time),cliffMatrices=data.cliffs.map(c=>{
    dummy.position.set(c.x,c.y,c.z);dummy.rotation.set(c.tiltX,c.rotation,c.tiltZ);dummy.scale.setScalar(c.h/cliffVariant.size.y);dummy.updateMatrix();return dummy.matrix.clone();
  });cliffBatches.forEach(m=>m.castShadow=false);

  // Cliffs and floor plants are installed once, never re-populated around a
  // moving camera. Coarse leaf cards retain the scan's shape and photographs.
  cliffMatrices.forEach((m,i)=>put(cliffBatches,i,m));finish(cliffBatches,data.cliffs.length);
  // All floor foliage is replaced by the fixed cactus field.
  const fernBatches=[],flowerBatches=[],understoreyBatches=[],understorey=[];
  const frustum=new THREE.Frustum(),matrix=new THREE.Matrix4(),sphere=new THREE.Sphere();
  const visibility=trees.map(()=>({high:0,medium:0,far:1}));
  return {
    treeBatches,treeDistant,woodlandBatches,woodlandDistant,rockBatches,cliffBatches,fernBatches,flowerBatches,understoreyBatches,understorey,looseStones,visibility,
    setQuality(q){quality=q;},
    update(t,camera){
      camera.updateMatrixWorld(true);matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
      const counts=[[0,0],[0,0]],zoom=Math.sqrt(Math.min(8,75/camera.fov));
      trees.forEach(({tree,species,matrix:root,farIndex,scale,cx,cz},i)=>{
        const batches=species?woodlandBatches:treeBatches,far=species?woodlandDistant:treeDistant,d=Math.hypot(camera.position.x-tree.x,camera.position.z-tree.z)/zoom;
        const near=species?(quality==='high'?22:quality==='medium'?16:11):(quality==='high'?18:quality==='medium'?12:8),mid=species?(quality==='high'?78:quality==='medium'?64:46):(quality==='high'?48:quality==='medium'?35:25);
        const high=1-smooth(near*.70,near*1.30,d),distant=smooth(mid*.78,mid*1.22,d),medium=1-high-distant;
        visibility[i]={high,medium,far:distant};
        sphere.center.set(tree.x,tree.y+tree.h*.5,tree.z);sphere.radius=tree.h*.85;
        if(frustum.intersectsSphere(sphere)){
          if(high>0)put(batches[0],counts[species][0]++,root,[0,high]);
          if(medium>0)put(batches[1],counts[species][1]++,root,[high,1-distant]);
        }
        const theta=Math.atan2(camera.position.x-cx,camera.position.z-cz),frame=(((theta-tree.seed)/(Math.PI/4))%8+8)%8;
        dummy.position.set(cx,tree.y,cz);dummy.rotation.set(0,theta,0);dummy.scale.set(scale*tree.width,scale,scale*tree.width);dummy.updateMatrix();far.setMatrixAt(farIndex,dummy.matrix);
        far.geometry.attributes.aFrame.setX(farIndex,frame);far.geometry.attributes.aLodRange.setXY(farIndex,1-distant,1);
      });
      [treeBatches,woodlandBatches].forEach((b,species)=>b.forEach((lod,i)=>finish(lod,counts[species][i])));
      [treeDistant,woodlandDistant].forEach(far=>{far.instanceMatrix.needsUpdate=true;far.geometry.attributes.aFrame.needsUpdate=true;far.geometry.attributes.aLodRange.needsUpdate=true;});
    }
  };
}
