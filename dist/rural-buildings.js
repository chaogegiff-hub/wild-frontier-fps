import * as THREE from './vendor/three.module.js';
import {housePlan} from './building-layout.js?v=2.25-drive-grass1';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Exterior, room floors, open doors and breakable panes share one physical layout.
export function makeRuralBuilding(b,surfaces){
  const g=new THREE.Group(),style=Math.abs(Math.floor(b.style??(b.color??.3)*9))%3;
  g.name=`rural-house-${['cream-tile','ochre-tile','grey-slate'][style]}`;
  g.position.set(b.x,b.y,b.z);
  const plan=housePlan(b),{stories,floor}=plan,w=b.w,d=b.d,h=b.h,windows=[];
  const texture=(key)=>surfaces[key]??null;
  const mat=(name,params)=>{const m=new THREE.MeshStandardMaterial(params);m.name=name;return m;};
  const mats={
    plaster:mat('weathered-photographic-stucco',{color:[0xe7dfca,0xd7c29b,0xc9cebf][style],map:texture('wall'),normalMap:texture('wallNormal'),normalScale:new THREE.Vector2(.5,.5),roughnessMap:texture('wallRough'),roughness:1}),
    masonry:mat('damp-foundation-and-sills',{color:0x827f70,map:texture('wall'),normalMap:texture('wallNormal'),normalScale:new THREE.Vector2(.7,.7),roughnessMap:texture('wallRough'),roughness:1}),
    roof:mat('weathered-photographic-roof',{color:style===2?0x929b9a:style===1?0xaf7960:0xb98d72,map:texture('roof'),normalMap:texture('roofNormal'),normalScale:new THREE.Vector2(.6,.6),roughnessMap:texture('roofRough'),roughness:1}),
    timber:mat('paint-worn-timber-frames-and-doors',{color:style===1?0x717f75:0x827d68,map:texture('wood'),normalMap:texture('woodNormal'),normalScale:new THREE.Vector2(.35,.35),roughnessMap:texture('woodRough'),roughness:.92}),
    trim:mat('aged-light-painted-window-trim',{color:0xc1bba6,map:texture('wood'),roughness:.95}),
    glass:new THREE.MeshPhysicalMaterial({name:'breakable-window-glass',color:0xb6cec8,transparent:true,opacity:.19,roughness:.12,metalness:.02,clearcoat:.8,side:THREE.DoubleSide,depthWrite:false}),
    recess:mat('unlit-window-and-door-recess',{color:0x131a17,roughness:1}),
    metal:mat('dull-zinc-gutters-and-downpipes',{color:0x737b78,roughness:.68,metalness:.45}),
    brick:mat('weathered-chimney-masonry',{color:0x8a7668,map:texture('wall'),normalMap:texture('wallNormal'),roughnessMap:texture('wallRough'),roughness:1})
  };
  const parts=new Map(),counts={windows:0,doors:0,wallOpenings:0};
  const add=(key,geo,matrix)=>{if(matrix)geo.applyMatrix4(matrix);if(geo.index){const old=geo;geo=geo.toNonIndexed();old.dispose();}let arr=parts.get(key);if(!arr)parts.set(key,arr=[]);arr.push(geo);};
  const trs=(x,y,z,rx=0,ry=0,rz=0)=>new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1));
  const box=(key,x,y,z,sx,sy,sz,matrix=null,rz=0)=>{const geo=new THREE.BoxGeometry(sx,sy,sz),uv=geo.attributes.uv,normal=geo.attributes.normal,p=geo.attributes.position;
    for(let i=0;i<uv.count;i++){const nx=Math.abs(normal.getX(i)),ny=Math.abs(normal.getY(i));uv.setXY(i,(nx>.5?p.getZ(i):p.getX(i))*.65,(ny>.5?p.getZ(i):p.getY(i))*.65);}
    const m=trs(x,y,z,0,0,rz);if(matrix)m.premultiply(matrix);add(key,geo,m);};
  const plane=(key,x,y,z,sx,sy,matrix=null)=>{const m=trs(x,y,z);if(matrix)m.premultiply(matrix);const geo=new THREE.PlaneGeometry(sx,sy),p=geo.attributes.position,uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,p.getX(i)*.65,p.getY(i)*.65);add(key,geo,m);};
  const pipe=(x,z)=>{const geo=new THREE.CylinderGeometry(.043,.043,h-.18,6,1);add('metal',geo,trs(x,(h-.18)*.5+.1,z));box('metal',x,.17,z,.14,.09,.13);};
  box('masonry',0,.085,0,w+.06,.33,d+.06);
  const faces=plan.faces;
  for(const face of faces){
    const M=trs(face.x,0,face.z,0,face.yaw),outer=new THREE.Shape();outer.moveTo(-face.span/2,0);outer.lineTo(face.span/2,0);outer.lineTo(face.span/2,h);outer.lineTo(-face.span/2,h);outer.closePath();
    const openings=face.openings;
    for(const o of openings){const hole=new THREE.Path(),l=o.x-o.w/2,r=o.x+o.w/2,bot=o.y-o.h/2,top=o.y+o.h/2;hole.moveTo(l,bot);hole.lineTo(l,top);hole.lineTo(r,top);hole.lineTo(r,bot);hole.closePath();outer.holes.push(hole);}
    const wallGeo=new THREE.ExtrudeGeometry(outer,{depth:.28,bevelEnabled:false,steps:1,curveSegments:1});wallGeo.translate(0,0,-.14);
    const wp=wallGeo.attributes.position,uv=wallGeo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,wp.getX(i)*.4,wp.getY(i)*.4);add('plaster',wallGeo,M);
    for(const o of openings){counts.wallOpenings++;
      if(o.type==='window'){
        counts.windows++;const pane=new THREE.Mesh(new THREE.PlaneGeometry(o.w-.09,o.h-.09),mats.glass);pane.name='window-'+o.id;pane.applyMatrix4(M.clone().multiply(trs(o.x,o.y,-.09)));pane.castShadow=false;g.add(pane);windows.push({id:o.id,mesh:pane});
        const t=.07;for(const sign of [-1,1]){plane('trim',o.x+sign*(o.w/2+.025),o.y,.16,t,o.h+.20,M);plane('trim',o.x,o.y+sign*(o.h/2+.025),.16,o.w+.12,t,M);}
        // Full-width panes leave an unobstructed opening once the glass breaks.
        box('masonry',o.x,o.y-o.h/2-.075,.16,o.w+.23,.10,.32,M);
      }else{
        counts.doors++;const D=M.clone().multiply(trs(-o.w/2,0,-.08,0,Math.PI/2));box('timber',o.w/2,o.y,0,o.w-.07,o.h-.025,.10,D);
        for(const sign of [-1,1])box('trim',o.x+sign*(o.w/2+.025),o.y,.16,.085,o.h+.13,.09,M);
        box('trim',o.x,o.y+o.h/2+.035,.16,o.w+.16,.09,.09,M);
        for(const py of [-.53,.42]){plane('recess',o.w/2,o.y+py,.051,o.w-.24,.64,D);plane('timber',o.w/2,o.y+py,.056,o.w-.30,.58,D);}
        box('metal',o.w-.16,o.y+.02,.075,.045,.12,.035,D);
      }
    }
    if(!face.front)box('masonry',0,.22,.148,face.span,.38,.035,M);
    else for(const sign of [-1,1])box('masonry',sign*(face.span/4+.31),.22,.148,face.span/2-.62,.38,.035,M);
  }
  // Floors, actual stair treads and furniture remain present at every distance.
  for(const f of plan.slabs)box('timber',f.x,f.top-f.h/2,f.z,f.w,f.h,f.d);
  box('plaster',0,h-.07,0,w-.56,.14,d-.56);
  if(plan.stair){const q=plan.stair;for(let i=0;i<q.count;i++){const top=q.base+(q.top-q.base)*(i+1)/q.count,z=q.start-(i+.5)*q.tread;box('timber',q.x,top-.06,z,q.w,.12,q.tread+.012);if(i%3===0)box('timber',q.x+q.w/2,top+.42,z,.045,.84,.045);}
    const length=Math.hypot(q.run,q.top-q.base),angle=Math.atan2(q.top-q.base,q.run),geo=new THREE.CylinderGeometry(.025,.025,length,6);geo.rotateX(-Math.PI/2+angle);add('timber',geo,trs(q.x+q.w/2,(q.top+q.base)/2+.84,(q.start+q.end)/2));
  }
  for(const f of plan.furniture){
    if(f.kind==='table'){box('timber',f.x,f.top-.04,f.z,f.w,.08,f.d);for(const sx of [-1,1])for(const sz of [-1,1])box('timber',f.x+sx*(f.w/2-.10),(plan.base+f.top)/2,f.z+sz*(f.d/2-.10),.07,f.top-plan.base,.07);}
    else{box('timber',f.x,plan.base+.18,f.z,f.w,.30,f.d);box('plaster',f.x,f.top-.04,f.z,f.w-.08,.13,f.d-.08);box('trim',f.x,f.top+.045,f.z-f.d*.31,f.w*.64,.11,.35);box('timber',f.x,plan.base+.43,f.z-f.d/2,.08+f.w,.62,.07);}
  }
  const eave=.42,half=w/2+eave,roofDepth=d+.88,rise=Math.min(3.8,half*(style===2?.39:.48)),slope=Math.atan2(rise,half),slopeLength=Math.hypot(half,rise);
  for(const side of [-1,1]){
    box('roof',side*half*.5,h+rise*.5+.08,0,slopeLength+.04,.13,roofDepth,null,-side*slope);
    box('timber',side*half,h+.015,0,.13,.18,roofDepth+.04);
    box('metal',side*(half+.045),h+.04,0,.14,.12,roofDepth+.08);
  }
  const tri=new THREE.Shape(),gableEave=h+rise*eave/half;tri.moveTo(-w/2,h);tri.lineTo(w/2,h);tri.lineTo(w/2,gableEave);tri.lineTo(0,h+rise+.015);tri.lineTo(-w/2,gableEave);tri.closePath();
  for(const sign of [-1,1]){
    const gg=new THREE.ExtrudeGeometry(tri,{depth:.23,bevelEnabled:false,steps:1,curveSegments:1});gg.translate(0,0,-.115);const p=gg.attributes.position,uv=gg.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,p.getX(i)*.4,p.getY(i)*.4);add('plaster',gg,trs(0,0,sign*(d/2-.115),0,sign<0?Math.PI:0));
    for(const side of [-1,1])box('timber',side*half*.5,h+rise*.5+.035,sign*(roofDepth/2+.025),slopeLength+.09,.16,.09,null,-side*slope);
  }
  box('roof',0,h+rise+.12,0,.21,.15,roofDepth+.12);
  pipe(half+.045,-d/2+.45);pipe(-half-.045,d/2-.42);
  for(let i=0;i<2;i++)box('masonry',0,.065+i*.065,d/2+.50-i*.15,1.55-i*.08,.13+i*.13,1.03-i*.30);
  const cx=w*.23,cz=-d*.20,roofY=h+rise*(1-Math.abs(cx)/half),chimneyH=.95;
  box('brick',cx,roofY+chimneyH*.35,cz,.62,chimneyH+.5,.68);
  box('masonry',cx,roofY+chimneyH-.06,cz,.77,.12,.84);
  box('recess',cx,roofY+chimneyH+.005,cz,.45,.025,.50);
  for(const [key,arr] of parts){const merged=mergeGeometries(arr,false);for(const geo of arr)geo.dispose();const mesh=new THREE.Mesh(merged,mats[key]);mesh.name=`rural-house-${key}`;mesh.castShadow=!['glass','recess'].includes(key);mesh.receiveShadow=true;g.add(mesh);}
  g.userData={...g.userData,ruralBuilding:true,style,stories,windows,enterable:true,features:{...counts,pitchedRoof:true,wallThickness:.28,downpipes:2,chimney:true,enterable:true,stairs:!!plan.stair},wallFootprint:{w,d,h},drawCalls:g.children.length,triangles:g.children.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0)};
  return g;
}
