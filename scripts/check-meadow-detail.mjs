import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import fs from 'node:fs';import {createRequire} from 'node:module';import {localModel} from './local-assets.mjs';import {meadowBlades,meadowAtlas} from '../dist/meadow-blades.js';
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const shapes=[0,1,2].map(meadowBlades);
check('three bounded 48-triangle forms have slender bent leaves, curled lower tufts and finite smooth normals',()=>{
  const hashes=new Set();for(const g of shapes){assert.equal(g.index.count/3,48);assert.equal(g.userData.photographicLeaves,6);assert.equal(g.userData.curvedClusters,2);const a=g.attributes;hashes.add(createHash('sha256').update(Buffer.from(a.position.array.buffer)).digest('hex'));
    for(let i=0;i<a.position.count;i++){assert.ok(Number.isFinite(a.position.getX(i)+a.position.getY(i)+a.position.getZ(i)));assert.ok(a.normal.getY(i)>=0);assert.ok(a.uv.getX(i)>=0&&a.uv.getX(i)<=1&&a.uv.getY(i)>=0&&a.uv.getY(i)<=1);}
    for(let blade=0;blade<6;blade++){const i=blade*6;assert.ok(Math.hypot(a.position.getX(i+4)-a.position.getX(i),a.position.getZ(i+4)-a.position.getZ(i))>.05);assert.ok(a.position.getY(i+2)>0&&a.position.getY(i+4)>a.position.getY(i+2));}
    for(let fan=0;fan<2;fan++){const i=36+fan*12,n=a.normal;assert.ok(Math.hypot(n.getX(i)-n.getX(i+3),n.getY(i)-n.getY(i+3),n.getZ(i)-n.getZ(i+3))>.05,'Tuft has a curved cross-section');}
  }assert.equal(hashes.size,3);
});
const model=await localModel('nature/grass_medium_02/low.gltf');let map;model.scene.traverse(o=>{if(o.isMesh)map=o.material.map;});const atlas=meadowAtlas(map),canvas=atlas.texture.image;
check('the shared 2K tuft atlas keeps transparent individual leaf silhouettes and puts dense roots at the bottom',()=>{
  assert.equal(canvas.width,2048);assert.equal(canvas.height,1024);assert.equal(atlas.texture.flipY,false);const pixels=canvas.getContext('2d').getImageData(0,0,2048,1024).data;
  for(let cell=0;cell<4;cell++){let top=0,bottom=0;for(let x=cell*512;x<(cell+1)*512;x+=2)for(let y=0;y<100;y+=2){top+=pixels[(y*2048+x)*4+3]>120;bottom+=pixels[((y+860)*2048+x)*4+3]>120;}assert.ok(bottom>top*2&&bottom>1200,'Photographed grass roots must fill the lower canopy');}
});
const manifest=JSON.parse(fs.readFileSync(new URL('../dist/hd2k/manifest.json',import.meta.url))),entry=manifest.entries.find(e=>e.target==='nature/grass_medium_02/textures/grass_medium_02_diff_1k.png'),require=createRequire(import.meta.url),{loadImage}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas'),hd=await loadImage(new URL('../dist/'+entry.file,import.meta.url).pathname);
check('unchanged photo frames do not rebuild the atlas; an actual native 2K image refreshes the same texture object',()=>{
  const before=atlas.texture.version,object=atlas.texture,canvasBefore=atlas.texture.image;atlas.refresh();assert.equal(atlas.texture.version,before);assert.equal(hd.width,2048);
  map.image=hd;atlas.refresh();assert.equal(atlas.texture,object);assert.equal(atlas.texture.image,canvasBefore);assert.ok(atlas.texture.version>before);
});
console.log(`${passed} curved photo-grass geometry, atlas coverage and refresh checks passed. Native assets; not mobile rendering.`);
