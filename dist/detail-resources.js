import {immutableBlob} from './resource-cache.js?v=2.21';
let manifest;
export function detailManifest(){
  return manifest??=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{const response=await fetch(new URL('./hd2k/manifest.json?v=2.21',import.meta.url),{signal:controller.signal,cache:'force-cache',credentials:'same-origin'});if(!response.ok)throw new Error('HD manifest unavailable');const data=await response.json();if(!Array.isArray(data.entries))throw new Error('HD manifest invalid');return data;}
    catch(error){manifest=null;throw error;}finally{clearTimeout(timer);}
  })();
}
export {immutableBlob};
