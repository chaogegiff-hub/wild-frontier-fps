import * as THREE from './vendor/three.module.js';

// Keep decoded-image pressure bounded on phone browsers.
export async function mapConcurrent(items,limit,load){
  const results=new Array(items.length);let next=0,failed=false;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(!failed&&next<items.length){const i=next++;try{results[i]=await load(items[i],i);}catch(error){failed=true;throw error;}}
  }));return results;
}

export async function retryAsset(label,load){
  let cause;
  for(let attempt=0;attempt<2;attempt++){
    try{return await load();}catch(error){cause=error;await new Promise(resolve=>setTimeout(resolve,0));}
  }
  throw new Error(`战场${label}读取失败，请点击重新部署重试。`,{cause});
}

export async function photoTexture(url,manager=THREE.DefaultLoadingManager){
  if(typeof createImageBitmap==='function'){
    try{const texture=new THREE.Texture(await new THREE.ImageBitmapLoader(manager).loadAsync(url));texture.needsUpdate=true;return texture;}catch{
      // Some WebKit views expose ImageBitmap but reject otherwise valid PNGs.
      THREE.Cache.remove(manager.resolveURL(url));
    }
  }
  return new THREE.TextureLoader(manager).loadAsync(url);
}

export function resilientModelTextures(loader){
  return loader.register(parser=>{
    class TextureDecoder extends THREE.Loader{
      load(url,onLoad,_onProgress,onError){
        const texture=new THREE.Texture();photoTexture(url,this.manager).then(decoded=>{texture.copy(decoded);onLoad?.(texture);},error=>onError?.(error));return texture;
      }
    }
    parser.textureLoader=new TextureDecoder(parser.options.manager);
    return {name:'WILD_FRONTIER_texture_recovery',async afterRoot(){
      const textures=await Promise.all((parser.json.textures||[]).map((_,i)=>parser.getDependency('texture',i)));
      if(textures.some(texture=>!texture))throw new Error('模型材质未能解码');
    }};
  });
}
