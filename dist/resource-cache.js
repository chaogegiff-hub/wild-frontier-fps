// Only immutable game assets are stored here; no cookies, tokens or match data.
export const RESOURCE_CACHE_BYTES=160*1048576;
export function evictionPlan(rows,next,budget,protectedKeys=new Set()){
  const remaining=rows.filter(r=>r.key!==next.key);let bytes=remaining.reduce((n,r)=>n+r.bytes,0)+next.bytes;
  const remove=[];for(const row of remaining.filter(r=>!protectedKeys.has(r.key)).sort((a,b)=>a.priority-b.priority||a.at-b.at)){
    if(bytes<=budget)break;remove.push(row.key);bytes-=row.bytes;
  }return {remove,fits:bytes<=budget};
}
export class ResourceCache{
  constructor({name='wild-frontier-assets',budgetBytes=RESOURCE_CACHE_BYTES,timeout=3000}={}){
    Object.assign(this,{name,budgetBytes,timeout,protectedKeys:new Set(),pending:null,disabled:false});
  }
  protect(keys){this.protectedKeys=new Set(keys);}
  async open(){
    if(this.disabled||!globalThis.indexedDB)return null;
    return this.pending??=new Promise(resolve=>{
      let request,finished=false;const done=db=>{if(finished){db?.close();return;}finished=true;clearTimeout(timer);if(!db)this.disabled=true;resolve(db);};
      const timer=setTimeout(()=>done(null),Math.min(this.timeout,1000));
      try{request=indexedDB.open(this.name,1);}catch{done(null);return;}
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('resources'))db.createObjectStore('resources');if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'key'});};
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.disabled=true;};done(db);};request.onerror=request.onblocked=()=>done(null);
    });
  }
  async get(key){
    const db=await this.open();if(!db)return null;
    return new Promise(resolve=>{
      let tx,finished=false;const done=value=>{if(finished)return;finished=true;clearTimeout(timer);resolve(value);};
      const timer=setTimeout(()=>{try{tx?.abort();}catch{}done(null);},this.timeout);
      try{tx=db.transaction('resources','readonly');const request=tx.objectStore('resources').get(key);let value=null;
        request.onsuccess=()=>{value=request.result??null;};
        tx.oncomplete=()=>{done(value);if(value)this.touch(db,key);};tx.onerror=tx.onabort=()=>done(null);
      }catch{done(null);}
    });
  }
  touch(db,key){
    try{const tx=db.transaction('meta','readwrite'),store=tx.objectStore('meta'),request=store.get(key);request.onsuccess=()=>{try{if(request.result)store.put({...request.result,at:Date.now()});}catch{try{tx.abort();}catch{}}};tx.onerror=()=>{};}catch{}
  }
  async put(key,value,{bytes,priority=1}={}){
    const db=await this.open();if(!db||!Number.isFinite(bytes)||bytes<=0||bytes>this.budgetBytes)return false;
    return new Promise(resolve=>{
      let tx,finished=false,accepted=false;const done=value=>{if(finished)return;finished=true;clearTimeout(timer);resolve(value);};
      const timer=setTimeout(()=>{try{tx?.abort();}catch{}done(false);},this.timeout);
      try{tx=db.transaction(['resources','meta'],'readwrite');const resources=tx.objectStore('resources'),meta=tx.objectStore('meta'),request=meta.getAll();
        request.onsuccess=()=>{
          try{const next={key,bytes,priority,at:Date.now()},plan=evictionPlan(request.result,next,this.budgetBytes,this.protectedKeys);
            if(!plan.fits){tx.abort();return;}for(const old of plan.remove){resources.delete(old);meta.delete(old);}
            resources.put(value,key);meta.put(next);accepted=true;
          }catch{try{tx.abort();}catch{}done(false);}
        };tx.oncomplete=()=>done(accepted);tx.onerror=tx.onabort=()=>done(false);
      }catch{try{tx?.abort();}catch{}done(false);}
    });
  }
  async remove(key){
    const db=await this.open();if(!db)return false;
    return new Promise(resolve=>{
      let tx;const timer=setTimeout(()=>{try{tx?.abort();}catch{}resolve(false);},this.timeout);
      try{tx=db.transaction(['resources','meta'],'readwrite');tx.objectStore('resources').delete(key);tx.objectStore('meta').delete(key);tx.oncomplete=()=>{clearTimeout(timer);resolve(true);};tx.onerror=tx.onabort=()=>{clearTimeout(timer);resolve(false);};}catch{clearTimeout(timer);resolve(false);}
    });
  }
}
export const resourceCache=new ResourceCache();
export async function verifyBytes(bytes,{bytes:expected,sha256,file}={}){
  if(expected!==undefined&&bytes.byteLength!==expected)throw new Error('资源长度校验失败');
  if(globalThis.crypto?.subtle&&(sha256||file)){
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),hash=[...digest].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(sha256?hash!==sha256:!file.includes(hash.slice(0,12)))throw new Error('资源内容校验失败');
  }
}
export async function immutableBlob(entry,{signal,cache=resourceCache}={}){
  const key=entry.sha256?'detail:'+entry.sha256:null;
  if(key){
    const hit=await cache.get(key).catch(()=>null);
    if(hit?.blob instanceof Blob&&hit.blob.size===entry.bytes){try{await verifyBytes(await hit.blob.arrayBuffer(),entry);if(signal?.aborted)throw signal.reason;return hit.blob;}catch{if(signal?.aborted)throw signal.reason;}}
    if(hit)await cache.remove(key).catch(()=>{});
  }
  const url=new URL(entry.file,import.meta.url);if(entry.sha256)url.searchParams.set('v',entry.sha256.slice(0,12));
  const response=await fetch(url,{signal,cache:'force-cache',credentials:'same-origin'});if(!response.ok)throw new Error(`资源下载失败（${response.status}）`);
  const blob=await response.blob();if(signal?.aborted)throw signal.reason;
  if(key){await verifyBytes(await blob.arrayBuffer(),entry);if(signal?.aborted)throw signal.reason;await cache.put(key,{blob},{bytes:blob.size,priority:1}).catch(()=>false);}
  return blob;
}
