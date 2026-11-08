import * as THREE from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

/**
 * Original authored cartridge meshes and material definitions, CC0-1.0.
 * Units are metres. Every case/projectile has its base at Y = 0 and its
 * longitudinal axis along +Y. These are spent cases and separate bullets,
 * rather than a complete cartridge flying out of the muzzle.
 * No external texture, model, document, or network request is required.
 */
let cartridgeAssets;

function lathe(points){
  return new THREE.LatheGeometry(points.map(([r,y])=>new THREE.Vector2(r,y)),24);
}

function finish(geometry,name){
  geometry.name=name;
  geometry.normalizeNormals();
  if(!geometry.groups.length)geometry.addGroup(0,geometry.index.count,0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function spentCase({name,length,radius,groove,body,shoulder,neck,shoulderY,neckY,primerRadius,wall}){
  // The recessed primer well, rim and extractor groove are real geometry.
  // The final annulus is the thin open case mouth, with a dark inner wall.
  const outer=lathe([
    [primerRadius*1.08,.00030],[primerRadius*1.08,0],
    [radius,0],[radius,.00085],[groove,.00115],[groove,.00185],
    [body,.00235],[body,.0040],[shoulder,shoulderY],
    [neck,neckY],[neck,length],[neck-wall,length]
  ]);
  const primer=new THREE.CylinderGeometry(primerRadius,primerRadius,.00020,12,1);
  // Inset above the bottom face, rather than a protruding silver button.
  primer.translate(0,.00023,0);
  const inner=lathe([[neck-wall,length],[neck-wall,length-.006],[0,length-.006]]);
  const geometry=mergeGeometries([outer,primer,inner],true);
  outer.dispose();primer.dispose();inner.dispose();
  finish(geometry,name);
  return {geometry,length,radius,centerY:length*.40};
}

function bullet({name,length,caliber}){
  const r=caliber*.5;
  // Boat tail, full-calibre bearing surface and a curved copper-jacket ogive.
  const geometry=lathe([
    [0,0],[r*.77,0],[r,length*.10],[r,length*.42],
    [r*.98,length*.50],[r*.91,length*.62],[r*.79,length*.73],
    [r*.61,length*.83],[r*.40,length*.91],[r*.18,length*.97],[0,length]
  ]);
  finish(geometry,name);
  return {geometry,length,radius:r,centerY:length*.43};
}

export function normalizeAmmoType(type='5.56'){
  const key=String(type).toLowerCase();
  if(key.includes('40')||key==='grenade'||key==='launcher'||key==='gl6')return '40mm';
  if(key==='akm'||key.includes('39')&&(key.includes('7.62')||key.includes('762')))return '7.62x39';
  if(key.includes('7.62')||key.includes('762')||key==='sniper'||key==='m700')return '7.62';
  return '5.56';
}

/** Shared geometry/material resources; creating a new mesh makes no GPU assets. */
export function buildCartridgeAssets(){
  if(cartridgeAssets)return cartridgeAssets;
  const brass=new THREE.MeshStandardMaterial({name:'Cartridge brass',color:'#b69a62',metalness:.94,roughness:.35});
  const primer=new THREE.MeshStandardMaterial({name:'Recessed primer metal',color:'#8d8676',metalness:.82,roughness:.53});
  const inner=new THREE.MeshStandardMaterial({name:'Fired case interior',color:'#4d4432',metalness:.67,roughness:.70});
  const copper=new THREE.MeshStandardMaterial({name:'Copper bullet jacket',color:'#a16c49',metalness:.86,roughness:.39});
  const caseMaterials=[brass,primer,inner];
  const casings={
    '5.56':spentCase({name:'Spent 5.56 x 45 mm case',length:.0447,radius:.00480,groove:.00412,body:.00470,shoulder:.00450,neck:.003215,shoulderY:.0344,neckY:.0390,primerRadius:.002225,wall:.00027}),
    '7.62':spentCase({name:'Spent 7.62 x 51 mm case',length:.05118,radius:.006005,groove:.00523,body:.00596,shoulder:.005765,neck:.00436,shoulderY:.0401,neckY:.0435,primerRadius:.002665,wall:.00031}),
    '7.62x39':spentCase({name:'Spent 7.62 x 39 mm case',length:.0387,radius:.005675,groove:.0049,body:.00565,shoulder:.005035,neck:.0043,shoulderY:.0309,neckY:.0347,primerRadius:.00275,wall:.00030}),
    '40mm':spentCase({name:'Spent 40 x 46 mm low-velocity case',length:.046,radius:.0220,groove:.0198,body:.0204,shoulder:.0203,neck:.0203,shoulderY:.0350,neckY:.0380,primerRadius:.0070,wall:.0010})
  };
  const projectiles={
    '5.56':bullet({name:'5.56 mm copper-jacket projectile',length:.0230,caliber:.00570}),
    '7.62':bullet({name:'7.62 mm copper-jacket projectile',length:.0285,caliber:.00782}),
    '7.62x39':bullet({name:'7.62 x39 mm copper-jacket projectile',length:.0268,caliber:.00792})
  };
  for(const spec of Object.values(casings))spec.materials=caseMaterials;
  for(const spec of Object.values(projectiles))spec.materials=[copper];
  cartridgeAssets={casings,projectiles,materials:{brass,primer,inner,copper}};
  return cartridgeAssets;
}

export function makeCasing(type='5.56'){
  const ammoType=normalizeAmmoType(type),spec=buildCartridgeAssets().casings[ammoType];
  const mesh=new THREE.Mesh(spec.geometry,spec.materials);
  mesh.name=spec.geometry.name;
  mesh.receiveShadow=true;
  mesh.userData={ammoType,assetKind:'spent-case',length:spec.length,radius:spec.radius,centerY:spec.centerY};
  return mesh;
}

export function makeProjectile(type='5.56'){
  const ammoType=normalizeAmmoType(type);
  const spec=buildCartridgeAssets().projectiles[ammoType];
  if(!spec)return null; // Grenades retain their separate projectile model.
  const mesh=new THREE.Mesh(spec.geometry,spec.materials);
  mesh.name=spec.geometry.name;
  mesh.userData={ammoType,assetKind:'bullet',length:spec.length,radius:spec.radius,centerY:spec.centerY};
  return mesh;
}
