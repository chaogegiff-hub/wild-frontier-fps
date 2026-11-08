import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const dist=new URL('../dist/',import.meta.url).pathname,entries=[],notes=[],targets=new Set();
for(const part of ['nature','equipment']){
  const source=JSON.parse(fs.readFileSync(path.join(dist,`hd2k/${part}-manifest.json`)));notes.push(...source.notes);
  for(const entry of source.entries){if(targets.has(entry.target))throw new Error('Duplicate HD target '+entry.target);targets.add(entry.target);const bytes=fs.readFileSync(path.join(dist,entry.file));if(bytes.length>25*1048576)throw new Error('Hosting limit '+entry.file);entries.push({...entry,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
}
const manifest={version:3,renderLongEdge:2560,textureLongEdge:2048,entries:entries.sort((a,b)=>a.target.localeCompare(b.target)),notes};fs.writeFileSync(path.join(dist,'hd2k/manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(`${entries.length} HD resources; ${entries.filter(e=>e.native).length} native 2K. Startup packs unchanged.`);
