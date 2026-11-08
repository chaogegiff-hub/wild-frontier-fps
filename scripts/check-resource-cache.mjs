import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {STARTUP_PACKS} from '../dist/startup-pack-manifest.js';import {loadStartupPack,releaseStartupPack,assetUrl,invalidateStartupCache} from '../dist/resource-pack.js';
import {ResourceCache,evictionPlan,immutableBlob} from '../dist/resource-cache.js';
import {loadSkyDetail} from '../dist/assets.js';
import './local-assets.mjs';
const dist=new URL('../dist/',import.meta.url),originalFetch=globalThis.fetch;let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
class MemoryCache{constructor(){this.rows=new Map();}protect(){}async get(key){return this.rows.has(key)?structuredClone(this.rows.get(key)):null;}async put(key,value){this.rows.set(key,structuredClone(value));return true;}async remove(key){return this.rows.delete(key);}}
const cache=new MemoryCache(),parts=STARTUP_PACKS.mobile.parts,calls=[],fetchPacks=async(url)=>{const part=parts.find(p=>String(url).includes(p.file));assert.ok(part);calls.push(part.file);return new Response(fs.readFileSync(new URL(part.file,dist)));};
try{
  await check('initial phone loading fetches all parts concurrently, persists decoded files, and emits monotonic progress',async()=>{
    const gates=[];globalThis.fetch=url=>new Promise(resolve=>gates.push(()=>resolve(fetchPacks(url))));const progress=[],p=loadStartupPack({mobile:true,cache,onProgress:n=>progress.push(n)});
    await new Promise(r=>setTimeout(r,0));assert.equal(gates.length,parts.length,'All requests should start before any completes');gates.forEach(r=>r());const result=await p;
    assert.equal(result.downloadedBytes,STARTUP_PACKS.mobile.bytes);assert.equal(result.savedBytes,result.bytes);assert.equal(result.cachedBytes,0);assert.equal(cache.rows.size,parts.length);assert.equal(progress.at(-1),result.bytes);assert.ok(progress.every((n,i)=>!i||n>=progress[i-1]));
    for(const part of parts){const bundle=cache.rows.get('bundle:'+part.file);assert.equal(bundle.files.length,part.files);assert.ok(bundle.files.every(f=>f.blob instanceof Blob&&f.blob.size===f.size));}
  });
  await check('a fresh loader session reads every decoded Blob from cache with zero pack fetches even when network requests would fail',async()=>{
    releaseStartupPack();const before=calls.length;globalThis.fetch=async()=>{throw new Error('No network is allowed for a warm pack');};const result=await loadStartupPack({mobile:true,cache});assert.equal(calls.length,before);assert.equal(result.downloadedBytes,0);assert.equal(result.cachedBytes,result.bytes);assert.equal(result.files,STARTUP_PACKS.mobile.files);
    const source=cache.rows.get('bundle:'+parts[0].file).files.find(f=>f.name==='models/m700/model.gltf'),response=await originalFetch(assetUrl('./models/m700/model.gltf'));assert.equal(await response.text(),await source.blob.text());
  });
  await check('corrupt cached metadata is removed and only that bundle is downloaded again',async()=>{
    releaseStartupPack();const key='bundle:'+parts[0].file,bad=cache.rows.get(key);bad.files[0].blob=new Blob(['truncated']);globalThis.fetch=fetchPacks;calls.length=0;const result=await loadStartupPack({mobile:true,cache});assert.deepEqual(calls,[parts[0].file]);assert.equal(result.cachedBytes,parts.slice(1).reduce((n,p)=>n+p.bytes,0));assert.equal(result.downloadedBytes,parts[0].bytes);
  });
  await check('simultaneous deployment requests share one load, cache failures stay playable, and invalidation permits recovery',async()=>{
    releaseStartupPack();await invalidateStartupCache();assert.equal(cache.rows.size,0);const unavailable={async get(){throw new Error('Storage disabled');},async put(){throw new Error('Quota exceeded');},async remove(){return false;}};calls.length=0;globalThis.fetch=fetchPacks;const a=loadStartupPack({mobile:true,cache:unavailable}),b=loadStartupPack({mobile:true,cache:unavailable});assert.equal(a,b);const result=await a;assert.equal(result.savedBytes,0);assert.equal(calls.length,parts.length);assert.equal(result.files,STARTUP_PACKS.mobile.files);
  });
  await check('a verified bundle survives another part failing and retry requests only the missing part',async()=>{
    releaseStartupPack();const partial=new MemoryCache(),originalPut=partial.put.bind(partial);let markReady;const ready=new Promise(resolve=>markReady=resolve);partial.put=async(key,value,options)=>{const saved=await originalPut(key,value,options);if(key==='bundle:'+parts[0].file)markReady();return saved;};
    globalThis.fetch=async url=>{if(String(url).includes(parts[1].file)){await ready;return new Response('unavailable',{status:503});}return fetchPacks(url);};await assert.rejects(loadStartupPack({mobile:true,cache:partial}),/503/);assert.ok(partial.rows.has('bundle:'+parts[0].file));calls.length=0;globalThis.fetch=fetchPacks;const recovered=await loadStartupPack({mobile:true,cache:partial});assert.deepEqual(calls,[parts[1].file]);assert.equal(recovered.cachedBytes,parts.filter((_,i)=>i!==1).reduce((n,p)=>n+p.bytes,0));assert.equal(recovered.files,STARTUP_PACKS.mobile.files);
  });
  await check('cache eviction protects the current battlefield, removes old HD entries first and replaces existing keys without double counting',async()=>{
    const rows=[{key:'base',bytes:60,priority:2,at:1},{key:'older-HD',bytes:30,priority:1,at:1},{key:'newer-HD',bytes:30,priority:1,at:2}],pins=new Set(['base']);assert.deepEqual(evictionPlan(rows,{key:'next',bytes:30},120,pins),{remove:['older-HD'],fits:true});assert.deepEqual(evictionPlan(rows,{key:'base',bytes:60},120,pins),{remove:[],fits:true});assert.equal(evictionPlan(rows,{key:'too-big',bytes:150},120,pins).fits,false);
  });
  await check('blocked IndexedDB is optional and returns promptly without breaking subsequent downloads',async()=>{
    const previous=globalThis.indexedDB;try{globalThis.indexedDB={open(){throw new Error('Private storage unavailable');}};const disabled=new ResourceCache({name:'disabled-test',timeout:20});assert.equal(await disabled.get('anything'),null);assert.equal(await disabled.put('anything',{}, {bytes:4}),false);assert.equal(disabled.disabled,true);}finally{if(previous===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=previous;}
  });
  await check('unchanged 2K resources reuse their content hash across sessions; bad downloaded bytes cannot poison the cache',async()=>{
    const hdCache=new MemoryCache(),manifest=JSON.parse(fs.readFileSync(new URL('hd2k/manifest.json',dist))),entry=manifest.entries.find(e=>e.target==='models/akm/basecolor.jpg');let fetches=0;
    globalThis.fetch=async()=>{fetches++;return new Response(fs.readFileSync(new URL(entry.file,dist)));};const first=await immutableBlob(entry,{cache:hdCache});assert.equal(first.size,entry.bytes);assert.equal(fetches,1);globalThis.fetch=async()=>{throw new Error('HD must use cache');};const second=await immutableBlob(entry,{cache:hdCache});assert.equal(createHash('sha256').update(Buffer.from(await second.arrayBuffer())).digest('hex'),entry.sha256);assert.equal(fetches,1);
    globalThis.fetch=async()=>new Response('broken');await assert.rejects(immutableBlob({...entry,sha256:'0'.repeat(64)},{cache:hdCache}),/校验/);assert.equal(hdCache.rows.size,1);
    hdCache.rows.set('detail:'+entry.sha256,{blob:new Blob([new Uint8Array(entry.bytes)])});globalThis.fetch=async()=>{fetches++;return new Response(fs.readFileSync(new URL(entry.file,dist)));};const repaired=await immutableBlob(entry,{cache:hdCache});assert.equal(fetches,2);assert.equal(repaired.size,entry.bytes);
  });
  await check('the actual 2K HDR loader uses the shared manifest and restores its original texture from cached bytes',async()=>{
    const skyCache=new MemoryCache();let manifestReads=0,skyReads=0;
    globalThis.fetch=async(url,options)=>{const text=url instanceof Request?url.url:String(url);if(text.startsWith('blob:'))return originalFetch(url,options);if(text.includes('hd2k/manifest.json')){manifestReads++;return new Response(fs.readFileSync(new URL('hd2k/manifest.json',dist)));}assert.ok(text.includes('hd2k/environment/sky.hdr'));skyReads++;return new Response(fs.readFileSync(new URL('hd2k/environment/sky.hdr',dist)));};
    const first=await loadSkyDetail({cache:skyCache}),second=await loadSkyDetail({cache:skyCache});assert.equal(first.image.width,2048);assert.equal(second.image.height,1024);assert.equal(manifestReads,1);assert.equal(skyReads,1);assert.equal(first.mapping,second.mapping);assert.deepEqual(first.image.data,second.image.data);first.dispose();second.dispose();
  });
}finally{releaseStartupPack();globalThis.fetch=originalFetch;}
console.log(`${passed} persistent-cache, parallel-startup, corruption-recovery and HD-reuse checks passed. Browser storage is checked separately.`);
