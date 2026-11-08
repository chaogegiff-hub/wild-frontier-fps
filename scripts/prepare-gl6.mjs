// Authored revolver launcher, in metres. No claimed scan or manufacturer CAD.
// Six real open chambers, open barrel, rigid drum pivot and +Z muzzle.
import fs from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {mergeGeometries} from '../dist/vendor/BufferGeometryUtils.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),sharp=require(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/sharp`);
const out=new URL('../dist/models/gl6/',import.meta.url).pathname;
fs.mkdirSync(out+'textures',{recursive:true});
const buckets=new Map();
function add(geo,mat='metal',xyz=[0,0,0],rot=[0,0,0],group='body'){
  geo.rotateX(rot[0]);geo.rotateY(rot[1]);geo.rotateZ(rot[2]);geo.translate(...xyz);
  const g=geo.index?geo.toNonIndexed():geo;geo.index&&geo.dispose();
  const key=group+':'+mat;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(g);
}
function box(w,h,d,xyz,mat='metal',rot=[0,0,0],group='body'){add(new T.BoxGeometry(w,h,d),mat,xyz,rot,group);}
function tube(ro,ri,len,xyz,mat='metal',group='body',segments=48){
  add(new T.CylinderGeometry(ro,ro,len,segments,1,true),mat,xyz,[Math.PI/2,0,0],group);
  const inner=new T.CylinderGeometry(ri,ri,len,segments,1,true);inner.scale(-1,1,1);
  // Mirroring reverses triangle winding; inner wall normals must also face in.
  for(let i=0;i<inner.attributes.normal.array.length;i++)inner.attributes.normal.array[i]*=-1;
  add(inner,mat,xyz,[Math.PI/2,0,0],group);
  for(const side of [-1,1])add(new T.RingGeometry(ri,ro,segments),mat,[xyz[0],xyz[1],xyz[2]+side*len/2],side<0?[0,Math.PI,0]:[0,0,0],group);
}
function cylinder(r,len,xyz,mat='metal',group='body',segments=32){add(new T.CylinderGeometry(r,r,len,segments),mat,xyz,[Math.PI/2,0,0],group);}
function screw(x,y,z,side=1){add(new T.CylinderGeometry(.0035,.0035,.0018,12),'steel',[x,y,z],[0,0,side*Math.PI/2]);box(.002,.0007,.004,[x+side*.001,y,z],'dark');}
// Compact receiver, hinge pin, latch and bridge leave the rotating drum exposed.
box(.048,.045,.175,[0,.223,-.073]);box(.066,.029,.32,[0,.256,.025]);
box(.052,.074,.073,[0,.178,-.136]);
box(.028,.032,.125,[0,.135,-.119],'metal',[.05,0,0]);
box(.018,.088,.024,[-.073,.173,.117]);box(.018,.088,.024,[.073,.173,.117]);
cylinder(.012,.030,[0,.249,.183],'steel');
box(.025,.014,.040,[.040,.248,-.15],'steel',[0,0,.12]);
for(const x of [-.032,.032])for(const z of [-.13,-.065,.115])screw(x,.235,z,x>0?1:-1);
// Drum local origin is its axle. All six chamber walls and mouths are open.
const radius=.085,inner=.022,offset=.055,depth=.147;
add(new T.CylinderGeometry(radius,radius,depth,64,1,true),'metal',[0,0,0],[Math.PI/2,0,0],'drum');
const face=new T.Shape();face.absarc(0,0,radius,0,Math.PI*2,false);
for(let k=0;k<6;k++){
  const a=Math.PI/2+k*Math.PI/3,x=Math.cos(a)*offset,y=Math.sin(a)*offset;
  const hole=new T.Path();hole.absarc(x,y,inner,0,Math.PI*2,true);face.holes.push(hole);
  tube(inner+.0013,inner,depth,[x,y,0],'dark','drum',24);
  add(new T.RingGeometry(inner,inner+.0021,24),'steel',[x,y,depth/2+.0006],[0,0,0],'drum');
  // Rear cartridge rims are rings, not luminous solid discs or muzzle caps.
  add(new T.RingGeometry(inner-.001,inner+.003,24),'brass',[x,y,-depth/2-.0006],[0,Math.PI,0],'drum');
}
for(const side of [-1,1])add(new T.ShapeGeometry(face,16),'metal',[0,0,side*depth/2],side<0?[0,Math.PI,0]:[0,0,0],'drum');
cylinder(.011,depth+.008,[0,0,0],'steel','drum',24);
// Barrel aligns with the top chamber; the actual opening is 40 mm wide.
tube(.029,.020,.282,[0,.196,.264],'metal');
tube(.033,.0295,.036,[0,.196,.386],'steel');
for(let z=.145;z<=.31;z+=.021)tube(.0307,.0295,.006,[0,.196,z],'metal');
// Ribbed polymer foregrip and sloping pistol grip.
box(.052,.043,.14,[0,.166,.237],'polymer');
for(let z=.18;z<.31;z+=.016)box(.055,.004,.005,[0,.143,z],'dark');
box(.038,.100,.050,[0,.072,-.158],'polymer',[-.28,0,0]);
for(let y=.043;y<.11;y+=.012)box(.040,.003,.037,[0,y,-.158+(y-.07)*.27],'dark',[-.28,0,0]);
box(.042,.009,.05,[0,.023,-.171],'dark');
// Open trigger guard built from slim bars, plus curved trigger shape.
box(.010,.006,.057,[0,.077,-.098]);box(.010,.035,.006,[0,.096,-.073]);
box(.010,.007,.045,[0,.114,-.096]);
const triggerShape=new T.Shape();triggerShape.moveTo(0,.020);triggerShape.quadraticCurveTo(.008,0,.002,-.018);triggerShape.lineTo(-.002,-.018);triggerShape.quadraticCurveTo(.002,0,-.004,.02);triggerShape.closePath();
const trigger=new T.ExtrudeGeometry(triggerShape,{depth:.006,bevelEnabled:false,curveSegments:10});trigger.rotateY(Math.PI/2);add(trigger,'steel',[-.003,.109,-.114]);
// Adjustable stock: slim tube, separate cheek piece, buttplate and ribs.
tube(.014,.009,.208,[0,.222,-.292],'metal');
box(.040,.043,.114,[0,.208,-.304],'polymer');
box(.047,.116,.037,[0,.177,-.392],'polymer',[.08,0,0]);
box(.050,.124,.012,[0,.174,-.416],'dark',[.08,0,0]);
for(let y=.128;y<.226;y+=.012)box(.052,.003,.013,[0,y,-.423+(y-.174)*.08],'polymer');
// Top rail slots, front post and rear aperture preserve a useful silhouette.
box(.020,.012,.285,[0,.278,.012]);
for(let z=-.11;z<.15;z+=.014)box(.029,.006,.006,[0,.287,z],'metal');
box(.011,.077,.013,[0,.2655,.334]);box(.003,.013,.004,[0,.311,.334],'steel');
box(.024,.022,.012,[0,.296,-.123]);
add(new T.TorusGeometry(.006,.002,6,16),'steel',[0,.312,-.123]);
// Author-authored microfinish maps. Coating/metal and polymer are independent.
let seed=501;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
for(const [name,color,rough,metal]of[['metal',[47,51,49],.59,.80],['polymer',[32,35,31],.85,0]]){
  const base=Buffer.alloc(256*256*3),orm=Buffer.alloc(base.length),normal=Buffer.alloc(base.length);
  for(let i=0;i<256*256;i++){
    const n=(rand()-.5)*3.2,r=(rand()-.5)*18;
    for(let c=0;c<3;c++)base[i*3+c]=Math.round(color[c]+n);
    orm[i*3]=255;orm[i*3+1]=Math.round(rough*255+r);orm[i*3+2]=Math.round(metal*255);
    normal[i*3]=128+Math.round((rand()-.5)*4);normal[i*3+1]=128+Math.round((rand()-.5)*4);normal[i*3+2]=255;
  }
  for(const [suffix,b]of[['base',base],['orm',orm],['normal',normal]])await sharp(b,{raw:{width:256,height:256,channels:3}}).png().toFile(out+`textures/${name}-${suffix}.png`);
}
const json={asset:{version:'2.0',generator:'Authored proportioned GL-6 launcher'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],accessors:[],bufferViews:[],buffers:[],images:[],textures:[],samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}],materials:[],extras:{author:'Wild Frontier project',license:'CC0-1.0',unit:'meter',muzzleDirection:'+Z',authored:true}};
for(const [name,color,metal,rough]of[['metal',[1,1,1,1],1,1],['polymer',[1,1,1,1],1,1],['steel',[.24,.27,.25,1],.87,.39],['dark',[.020,.024,.021,1],.10,.88],['brass',[.39,.28,.095,1],.84,.47]]){
  const m={name:`gl6_${name}`,pbrMetallicRoughness:{baseColorFactor:color,metallicFactor:metal,roughnessFactor:rough}};
  if(name==='metal'||name==='polymer'){
    const ids=[];for(const suffix of ['base','orm','normal']){const source=json.images.length;json.images.push({uri:`textures/${name}-${suffix}.png`});ids.push(json.textures.length);json.textures.push({source,sampler:0});}
    m.pbrMetallicRoughness.baseColorTexture={index:ids[0]};m.pbrMetallicRoughness.metallicRoughnessTexture={index:ids[1]};m.normalTexture={index:ids[2],scale:.35};
  }json.materials.push(m);
}
const matid={metal:0,polymer:1,steel:2,dark:3,brass:4},chunks=[];let bytes=0,triangles=0;
function accessor(arr,type,n){const pad=(4-bytes%4)%4;if(pad){chunks.push(Buffer.alloc(pad));bytes+=pad;}
  const data=Buffer.from(arr.buffer,arr.byteOffset,arr.byteLength),v=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:bytes,byteLength:data.length,target:34962});chunks.push(data);bytes+=data.length;
  const a={bufferView:v,componentType:5126,count:arr.length/n,type};if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.count;i++)for(let c=0;c<3;c++){a.min[c]=Math.min(a.min[c],arr[i*n+c]);a.max[c]=Math.max(a.max[c],arr[i*n+c]);}}
  json.accessors.push(a);return json.accessors.length-1;
}
const drumNode={name:'DRUM',translation:[0,.141,.045],children:[]};json.nodes.push(drumNode);json.scenes[0].nodes.push(0);
for(const [key,geos]of buckets){const [group,mat]=key.split(':'),g=mergeGeometries(geos),attrs={};for(const [name,semantic]of[['position','POSITION'],['normal','NORMAL'],['uv','TEXCOORD_0']])attrs[semantic]=accessor(g.attributes[name].array,name==='uv'?'VEC2':'VEC3',name==='uv'?2:3);
  triangles+=g.attributes.position.count/3;const mesh=json.meshes.length;json.meshes.push({name:`${group}_${mat}`,primitives:[{attributes:attrs,material:matid[mat]}]});const node=json.nodes.length;json.nodes.push({name:`${group}_${mat}`,mesh});if(group==='drum')drumNode.children.push(node);else json.scenes[0].nodes.push(node);
}
for(const [name,translation]of[['FX_FIRE',[0,.196,.405]],['Muzzle',[0,.196,.405]],['TRIGGER',[0,.109,-.114]],['FX_CASING',[.08,.141,-.03]],['ATTACH_SCOPE',[0,.288,-.03]],['SIGHT_REAR',[0,.312,-.123]],['SIGHT_FRONT',[0,.3175,.334]]]){json.scenes[0].nodes.push(json.nodes.length);json.nodes.push({name,translation});}
json.buffers=[{uri:'model.bin',byteLength:bytes}];fs.writeFileSync(out+'model.bin',Buffer.concat(chunks));fs.writeFileSync(out+'model.gltf',JSON.stringify(json));
fs.writeFileSync(out+'conversion.json',JSON.stringify({triangles,draws:json.meshes.length,length:.83818,unit:'m',chambers:6,calibre:.040,authored:true},null,2));
console.log(JSON.stringify({output:out,triangles,draws:json.meshes.length,bytes}));
