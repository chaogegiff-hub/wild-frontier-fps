import * as THREE from './vendor/three.module.js';
import {unzip,unzipSync} from './vendor/fflate.module.js';
import {STARTUP_PACKS} from './startup-pack-manifest.js?v=2.25-drive-grass1';
import {resourceCache,verifyBytes} from './resource-cache.js?v=2.25-drive-grass1';

const root=new URL('./',import.meta.url),urls=new Map();let loaded,pending,activeController,activeCache=resourceCache,activeKeys=[];
const mime=file=>file.endsWith('.jpg')?'image/jpeg':file.endsWith('.png')?'image/png':file.endsWith('.gltf')?'model/gltf+json':file.endsWith('.json')?'application/json':file.endsWith('.wav')?'audio/wav':'application/octet-stream';
const validPath=file=>typeof file==='string'&&/^(models|textures|nature|environment|audio)\//.test(file)&&!file.includes('\\')&&!file.split('/').includes('..');
function untilAborted(promise,signal){
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}
export function assetUrl(url){
  if(/^(blob:|data:)/.test(url))return url;
  const absolute=new URL(url,root);if(absolute.origin!==root.origin)return url;
  const file=decodeURIComponent(absolute.pathname.slice(root.pathname.length));if(urls.has(file))return urls.get(file);
  if(loaded&&/^(textures|models|nature|environment)\//.test(file))throw new Error('战场资源包缺少文件，请重新部署。');return url;
}
function clearUrls(){for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();loaded=undefined;THREE.DefaultLoadingManager.setURLModifier(url=>url);}
export function releaseStartupPack(){activeController?.abort(new Error('战场载入已取消'));clearUrls();}
export async function invalidateStartupCache(){await Promise.all(activeKeys.map(key=>activeCache.remove(key)));}
async function inflate(bytes,signal){
  await new Promise(resolve=>setTimeout(resolve,0));if(signal.aborted)throw signal.reason;
  if(typeof Worker==='undefined')return unzipSync(bytes);
  try{return await new Promise((resolve,reject)=>{
    let cancel;const abort=()=>{cancel?.();reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});
    try{cancel=unzip(bytes,(error,files)=>{signal.removeEventListener('abort',abort);error?reject(error):resolve(files);});}catch(error){signal.removeEventListener('abort',abort);reject(error);}
  });}catch(error){if(signal.aborted)throw signal.reason;return unzipSync(bytes);}
}
function bundleFiles(value,part){
  if(value?.schema!==1||value.part!==part.file||!Array.isArray(value.files)||value.files.length!==part.files)return null;
  const files=new Map();for(const item of value.files){if(!validPath(item.name)||files.has(item.name)||!(item.blob instanceof Blob)||item.blob.size!==item.size)return null;files.set(item.name,item.blob);}return files;
}
export function loadStartupPack(options={}){
  if(loaded)return Promise.resolve(loaded);if(pending)return pending;
  pending=hydrate(options).finally(()=>{pending=undefined;});return pending;
}
async function hydrate({mobile=false,onProgress=()=>{},onStage=()=>{},idleTimeout=30000,totalTimeout=240000,visible=()=>!globalThis.document?.hidden,cache=resourceCache}={}){
  const pack=STARTUP_PACKS[mobile?'mobile':'desktop'],parts=pack.parts||[pack],controller=new AbortController(),signal=controller.signal;
  activeController=controller;activeCache=cache;activeKeys=parts.map(p=>'bundle:'+p.file);cache.protect?.(activeKeys);
  let idleTimer,totalTimer,shown=0,phase='读取本地战场',cachedBytes=0,downloadedBytes=0,savedBytes=0;const counts=new Map();
  const abort=()=>controller.abort(new Error('战场下载超时，点击重新部署可重试。'));
  const armIdle=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>visible()?abort():armIdle(),idleTimeout);};
  const armTotal=()=>{clearTimeout(totalTimer);totalTimer=setTimeout(()=>visible()?abort():armTotal(),totalTimeout);};
  const progress=(part,n)=>{counts.set(part.file,Math.max(counts.get(part.file)||0,Math.min(part.bytes,n)));shown=Math.max(shown,[...counts.values()].reduce((a,b)=>a+b,0));onProgress(shown,pack.bytes,{phase,cachedBytes,downloadedBytes});};
  const stage=next=>{phase=next;onStage(next);};
  async function loadPart(part){
    const key='bundle:'+part.file,hit=await untilAborted(cache.get(key).catch(()=>null),signal);if(signal.aborted)throw signal.reason;
    const cached=bundleFiles(hit,part);if(cached){cachedBytes+=part.bytes;progress(part,part.bytes);armIdle();return cached;}
    if(hit)await cache.remove(key).catch(()=>{});
    stage('下载战场');let cause;
    for(let attempt=0;attempt<2;attempt++){
      let reader;
      try{
        armIdle();const response=await untilAborted(fetch(new URL(part.file,root),{signal,cache:attempt?'reload':'force-cache',credentials:'same-origin'}),signal);
        if(!response.ok)throw new Error(`战场下载失败（${response.status}），请点击重新部署。`);
        let bytes;
        if(response.body?.getReader){
          reader=response.body.getReader();const chunks=[];let length=0;
          while(true){const {done,value}=await untilAborted(reader.read(),signal);if(done)break;chunks.push(value);length+=value.length;downloadedBytes+=value.length;armIdle();progress(part,length);}
          bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}reader.releaseLock();reader=undefined;
        }else{bytes=new Uint8Array(await untilAborted(response.arrayBuffer(),signal));downloadedBytes+=bytes.length;progress(part,bytes.length);}
        try{await verifyBytes(bytes,part);}catch{throw new Error('战场下载不完整或校验失败，请点击重新部署重试。');}
        stage('解压战场资源');armIdle();const files=await inflate(bytes,signal);if(signal.aborted)throw signal.reason;
        if(Object.keys(files).length!==part.files)throw new Error('战场资源包不完整，请重新部署。');
        const items=[],result=new Map();let size=0;
        for(const [name,data] of Object.entries(files)){if(!validPath(name))throw new Error('战场资源路径无效。');const blob=new Blob([data],{type:mime(name)});items.push({name,blob,size:blob.size});result.set(name,blob);size+=blob.size;delete files[name];}
        if(await cache.put(key,{schema:1,part:part.file,files:items},{bytes:size,priority:2}).catch(()=>false))savedBytes+=part.bytes;
        progress(part,part.bytes);return result;
      }catch(error){
        cause=error;await reader?.cancel().catch(()=>{});reader?.releaseLock();if(signal.aborted)throw signal.reason;if(attempt)throw error;stage('重新连接战场资源');
      }
    }throw cause;
  }
  try{
    armIdle();armTotal();onStage(phase);onProgress(0,pack.bytes,{phase,cachedBytes:0,downloadedBytes:0});
    const jobs=parts.map(part=>loadPart(part));let decoded;
    try{decoded=await Promise.all(jobs);}catch(error){controller.abort(error);await Promise.allSettled(jobs);throw error;}
    if(signal.aborted)throw signal.reason;
    for(const files of decoded)for(const [name,blob] of files){if(urls.has(name))throw new Error('战场资源路径无效。');urls.set(name,URL.createObjectURL(blob));}
    if(urls.size!==pack.files)throw new Error('战场资源包不完整，请重新部署。');
    stage(cachedBytes===pack.bytes?'本地战场已就绪':'准备战场');loaded={bytes:pack.bytes,files:urls.size,mobile,cachedBytes,downloadedBytes,savedBytes};
    THREE.DefaultLoadingManager.setURLModifier(assetUrl);return loaded;
  }catch(error){clearUrls();throw signal.aborted?signal.reason:error?.message?.startsWith('战场')?error:new Error('战场下载或解包失败，请点击重新部署重试。',{cause:error});}
  finally{clearTimeout(idleTimer);clearTimeout(totalTimer);if(activeController===controller)activeController=undefined;}
}
