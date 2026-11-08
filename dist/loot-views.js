import * as THREE from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

export function makeLootViews(definitions=[]){
  const group=new THREE.Group();group.name='fixed-indoor-supplies';const items=new Map(),cache=new Map();
  function model(kind){
    if(cache.has(kind))return cache.get(kind);const pieces=[[],[],[]],materials=[new THREE.MeshStandardMaterial({color:kind==='armour'?'#686c53':'#4f6043',roughness:.94}),new THREE.MeshStandardMaterial({color:'#cbc3a7',roughness:.84}),new THREE.MeshStandardMaterial({color:kind==='medkit'?'#9c4031':'#393f34',roughness:.9})];
    const add=(geo,index,x,y,z,rx=0,ry=0,rz=0)=>{geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1)));const a=geo.index?geo.toNonIndexed():geo;if(a!==geo)geo.dispose();pieces[index].push(a);};
    const box=(index,x,y,z,w,h,d)=>add(new THREE.BoxGeometry(w,h,d),index,x,y,z);
    if(kind==='ammo'){
      box(0,0,.10,0,.31,.20,.22);box(0,0,.205,0,.335,.028,.24);box(2,0,.225,0,.10,.018,.06);for(const x of [-.12,.12])box(2,x,.1,0,.018,.21,.235);box(1,0,.135,.112,.16,.064,.003);
    }else if(kind==='medkit'){
      const body=new THREE.CapsuleGeometry(.105,.23,4,8);body.scale(1,.72,1);add(body,0,0,.09,0,0,0,Math.PI/2);for(const x of [-.1,.1])box(2,x,.112,0,.026,.16,.22);box(1,0,.171,0,.13,.009,.13);box(2,0,.179,0,.085,.004,.025);box(2,0,.179,0,.025,.004,.085);box(0,0,.215,0,.13,.025,.025);
    }else{
      const shape=new THREE.Shape();shape.moveTo(-.16,0);shape.lineTo(.16,0);shape.lineTo(.18,.30);shape.lineTo(.11,.43);shape.lineTo(-.11,.43);shape.lineTo(-.18,.30);shape.closePath();
      for(const z of [-.045,.045])add(new THREE.ExtrudeGeometry(shape,{depth:.025,bevelEnabled:true,bevelThickness:.008,bevelSize:.008,bevelSegments:1,steps:1}),0,0,.025,z);
      for(const x of [-.10,.10])box(2,x,.45,0,.045,.06,.15);for(const y of [.12,.18,.24])box(2,0,y,.076,.31,.013,.012);for(const x of [-.09,.09])box(0,x,.115,.09,.12,.105,.04);
    }
    const groups=[];for(let i=0;i<3;i++){if(!pieces[i].length)continue;const g=mergeGeometries(pieces[i],false);g.clearGroups();g.addGroup(0,g.attributes.position.count,i);groups.push(g);}const geometry=mergeGeometries(groups,true);geometry.groups.forEach((g,i)=>g.materialIndex=i);for(const p of pieces.flat())p.dispose();groups.forEach(g=>g.dispose());const base=new THREE.Mesh(geometry,materials);base.castShadow=true;base.receiveShadow=true;cache.set(kind,base);return base;
  }
  for(const item of definitions){const mesh=model(item.kind).clone();mesh.name='supply-'+item.id;mesh.position.set(item.x,item.y+.012,item.z);mesh.rotation.y=(item.houseId%5-.5)*.21;if(item.kind==='armour')mesh.rotation.x=-.10;group.add(mesh);items.set(item.id,mesh);}
  return {group,items,pick(id){const m=items.get(id);if(m)m.visible=false;},reset(state=definitions){const taken=new Map(state.map(i=>[i.id,i.taken]));for(const [id,m] of items)m.visible=taken.has(id)&&!taken.get(id);}};
}
