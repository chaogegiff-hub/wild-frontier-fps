import * as THREE from './vendor/three.module.js';
import {detailManifest,immutableBlob} from './detail-resources.js?v=2.25-drive-grass1';

export const TWO_K_EDGE=2560;
export function renderSizing(width,height,{quality='high',pixelRatio=1,mobile=false,maxSize=4096}={}){
  const longest=Math.max(1,width,height),ratio=quality==='high'?Math.min(TWO_K_EDGE,maxSize)/longest:Math.min(pixelRatio,quality==='low'?1:mobile?1.2:1.35);
  return {ratio,width:Math.max(1,Math.floor(width*ratio)),height:Math.max(1,Math.floor(height*ratio))};
}
export function graphicsConfig(saved={}){
  saved??={};const config={sensitivity:1,sound:true,...saved};
  config.quality=saved.graphicsVersion===3&&['low','medium','high'].includes(saved.quality)?saved.quality:'high';config.graphicsVersion=3;return config;
}

export function textureRegistry(assets,surfaces,modelFiles,surfaceFiles){
  const records=new Map(),root=new URL('./',import.meta.url);
  const add=(target,texture,group,color)=>{
    if(!texture?.image)return;let r=records.get(target);
    if(!r){r={target,textures:new Set(),base:new Map(),groups:new Set(),color:false};records.set(target,r);}
    r.textures.add(texture);r.base.set(texture,texture.image);r.groups.add(group);r.color||=color;
  };
  for(const [group,file] of Object.entries(modelFiles)){
    const model=assets[group],parser=model?.parser;if(!parser)continue;
    model.scene.traverse(o=>{if(!o.isMesh)return;for(const material of Array.isArray(o.material)?o.material:[o.material]){
      const original=parser.json.materials?.find(m=>m.name===material.name);
      for(const slot of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap']){
        const t=material[slot];if(!t)continue;
        // Shared/derived branch materials can lose their parser association.
        // Resolve their original glTF material slot as well as texture IDs.
        const reference=slot==='map'?original?.pbrMetallicRoughness?.baseColorTexture:slot==='emissiveMap'?original?.emissiveTexture:slot==='normalMap'?original?.normalTexture:slot==='aoMap'?original?.occlusionTexture:original?.pbrMetallicRoughness?.metallicRoughnessTexture;
        const index=parser.associations.get(t)?.textures??reference?.index,definition=parser.json.textures?.[index],image=parser.json.images?.[definition?.source];if(!image?.uri||/^(data:|blob:)/.test(image.uri))continue;
        const target=decodeURIComponent(new URL(image.uri,new URL(file,root)).pathname.slice(root.pathname.length));add(target,t,group,slot==='map'||slot==='emissiveMap');
      }
    }});
  }
  for(const [key,file] of Object.entries(surfaceFiles)){
    const target='textures/'+file;add(target,surfaces[key],'surface',!/(normal|rough)/i.test(key));
    if(/^(wall|roof|wood)/.test(key))records.get(target)?.groups.add('building');
  }
  return records;
}

async function fetchImage(entry,{signal,flipY}){
  // Direct immutable assets bypass the lower-resolution startup pack modifier.
  const blob=await immutableBlob(entry,{signal});
  if(typeof createImageBitmap==='function')return createImageBitmap(blob,{imageOrientation:flipY?'flipY':'none',premultiplyAlpha:'none',colorSpaceConversion:'none'});
  const imageUrl=URL.createObjectURL(blob);try{return await new THREE.ImageLoader().loadAsync(imageUrl);}finally{URL.revokeObjectURL(imageUrl);}
}

export class HDTextureStreamer{
  constructor(records,{mobile=false,loadImage=fetchImage,onStatus=()=>{},budgetBytes=(mobile?256:640)*1048576}={}){
    Object.assign(this,{records,loadImage,onStatus,budgetBytes,enabled:false,entries:new Map(),wanted:new Set(),queue:[],usedBytes:0,pending:null,started:null,clock:1,failures:0,lastManifestAttempt:0});
  }
  async start(entries){
    if(entries){this.install(entries);return;}
    return this.started??=(async()=>{this.lastManifestAttempt=Date.now();try{const m=await detailManifest();this.install(m.entries);}catch{this.started=null;this.failures++;this.status();}})();
  }
  install(entries){for(const entry of entries){const r=this.records.get(entry.target);if(!r)continue;r.entry=entry;this.entries.set(entry.target,r);}this.clock=1;this.status();}
  setEnabled(value){this.enabled=value;if(!value){this.wanted.clear();this.queue=[];this.pending?.controller.abort();for(const r of this.entries.values())this.evict(r);}this.clock=1;this.status();}
  evict(r){if(!r.hd)return;for(const t of r.textures){t.image=r.base.get(t);t.needsUpdate=true;}r.hd.close?.();r.hd=null;this.usedBytes-=r.cost||0;r.cost=0;}
  status(){const wanted=[...this.wanted].map(k=>this.entries.get(k)),loaded=wanted.filter(r=>r?.hd||r?.native).length;this.onStatus({enabled:this.enabled,ready:this.entries.size>0,loaded,total:wanted.length,failed:this.failures,bytes:this.usedBytes});}
  select(weights){
    if(!this.enabled)return;
    const ranked=[...this.entries.values()].map(r=>({r,score:Math.max(...[...r.groups].map(g=>weights[g]||0))+(r.color?7:0)+(weights[r.target]||0)})).filter(x=>x.score>7).sort((a,b)=>b.score-a.score||a.r.target.localeCompare(b.r.target));
    const wanted=new Set();let bytes=0;
    for(const {r} of ranked){r.native=[...r.base.values()].every(image=>image.width>=r.entry.width&&image.height>=r.entry.height);const cost=r.native?0:r.entry.width*r.entry.height*4;if(bytes+cost>this.budgetBytes)continue;bytes+=cost;wanted.add(r.target);}
    this.wanted=wanted;for(const r of this.entries.values())if(!wanted.has(r.target))this.evict(r);
    this.queue=ranked.map(x=>x.r).filter(r=>wanted.has(r.target)&&r!==this.pending?.r&&!r.native&&!r.hd&&(!r.failedAt||Date.now()-r.failedAt>30000));this.status();this.pump();
  }
  async pump(){
    if(this.pending||!this.enabled)return;let r;while(this.queue.length){const c=this.queue.shift();if(this.wanted.has(c.target)&&!c.hd&&!c.native){r=c;break;}}if(!r)return;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);this.pending={r,controller};
    try{const texture=[...r.textures][0],image=await this.loadImage(r.entry,{signal:controller.signal,flipY:texture.flipY});if(!this.enabled||!this.wanted.has(r.target)||controller.signal.aborted){image.close?.();return;}if(image.width!==r.entry.width||image.height!==r.entry.height){image.close?.();throw new Error('HD dimensions mismatch');}r.hd=image;r.cost=image.width*image.height*4;this.usedBytes+=r.cost;for(const t of r.textures){t.image=image;t.anisotropy=Math.max(t.anisotropy,8);t.needsUpdate=true;}}
    catch{if(!controller.signal.aborted){r.failedAt=Date.now();this.failures++;}}
    finally{clearTimeout(timer);this.pending=null;this.status();this.pump();}
  }
  update(dt,{weapon=2}={}){
    if(!this.enabled)return;if(!this.entries.size){if(!this.started&&Date.now()-this.lastManifestAttempt>30000)this.start();return;}this.clock+=dt;if(this.clock<1)return;this.clock=0;
    // Scenery priorities are fixed for the complete island. Moving, rotating
    // or zooming cannot evict scenery maps and trigger another download.
    const weights={building:140,surface:34,hands:105,swimArms:105,sniper:30,grenade:30,rifle:40,grass:78,grassLow:78,treeHigh:72,treeMedium:72,woodlandHigh:72,woodlandMedium:72,cliff:64,rocks:62,fern:56,flowers:52,soldier:75};
    weights[['sniper','grenade','rifle'][weapon]]=115;
    for(const r of this.entries.values())if(r.color&&[...r.groups].some(g=>['grass','grassLow','treeHigh','treeMedium','woodlandHigh','woodlandMedium'].includes(g)))weights[r.target]=48;
    for(const target of ['textures/grass.jpg','textures/ground.jpg','textures/rock.jpg'])weights[target]=75;
    this.select(weights);
  }

  dispose(){this.setEnabled(false);this.entries.clear();this.records.clear();}
}
