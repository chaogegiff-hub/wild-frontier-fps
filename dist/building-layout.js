// Shared geometry/collision/pickup coordinates. No renderer or mutable game state.
export function housePlan(b){
  const stories=b.stories===2||b.h>=5.7?2:1,floor=b.h/stories;
  const faces=[{span:b.w,x:0,z:b.d/2-.14,yaw:0,front:true},{span:b.w,x:0,z:-b.d/2+.14,yaw:Math.PI},{span:b.d,x:b.w/2-.14,z:0,yaw:Math.PI/2},{span:b.d,x:-b.w/2+.14,z:0,yaw:-Math.PI/2}];
  for(const [fi,f] of faces.entries()){
    f.openings=[];
    for(let level=0;level<stories;level++)for(const [i,x] of [-f.span*.285,f.span*.285].entries())f.openings.push({id:`${b.id??0}:${fi}:${level}:${i}`,x,y:level*floor+Math.min(1.74,floor*.53),w:f.span>9?1.35:1.2,h:Math.min(1.45,floor*.44),type:'window',level});
    if(f.front)f.openings.push({x:0,y:1.36,w:1.40,h:2.24,type:'door'});
  }
  const base=.28,upper=floor+.10,stair=stories===2?{x:-b.w/2+1.15,w:1.40,start:b.d/2-1.20,end:-b.d/2+.85,base,top:upper}:null;
  if(stair){stair.run=stair.start-stair.end;stair.count=Math.ceil((stair.top-base)/.18);stair.tread=stair.run/stair.count;}
  const slabs=[{x:0,z:0,w:b.w-.56,d:b.d-.56,top:base,h:.18}];
  if(stair){const left=-b.w/2+.28,right=b.w/2-.28,front=b.d/2-.28,back=-b.d/2+.28,l=stair.x-stair.w/2-.10,r=stair.x+stair.w/2+.10;
    for(const [a,c] of [[left,l],[r,right]])if(c>a)slabs.push({x:(a+c)/2,z:0,w:c-a,d:front-back,top:upper,h:.16});
    for(const [a,c] of [[back,stair.end],[stair.start,front]])if(c>a)slabs.push({x:stair.x,z:(a+c)/2,w:r-l,d:c-a,top:upper,h:.16});
  }
  const furniture=[{kind:'table',x:b.w*.27,z:b.d*.20,w:1.35,d:.78,top:base+.76},{kind:'bed',x:b.w*.27,z:-b.d*.28,w:1.25,d:1.85,top:base+.47}];
  return {stories,floor,base,upper,faces,stair,slabs,furniture};
}
export function facePoint(b,f,x,y,z=0){const c=Math.cos(f.yaw),s=Math.sin(f.yaw);return {x:b.x+f.x+c*x+s*z,y:b.y+y,z:b.z+f.z-s*x+c*z};}
export function houseWindows(b){const out=[],plan=housePlan(b);for(const f of plan.faces)for(const o of f.openings)if(o.type==='window'){
  const p=facePoint(b,f,o.x,o.y,-.09),across=Math.abs(Math.cos(f.yaw))>.5;
  out.push({id:o.id,houseId:b.id??0,...p,y:p.y-(o.h-.09)/2,type:'box',w:across?o.w-.09:.035,d:across?.035:o.w-.09,h:o.h-.09,level:o.level,floorY:b.y+(o.level?plan.upper:plan.base),sillY:b.y+o.y-o.h/2,topY:b.y+o.y+o.h/2,normal:{x:Math.sin(f.yaw),y:0,z:Math.cos(f.yaw)}});
}return out;}
export function houseColliders(b){
  const p=housePlan(b),out=[],box=(x,y,z,w,h,d,extra={})=>out.push({type:'box',x:b.x+x,y:b.y+y,z:b.z+z,w,h,d,surface:'wood',houseId:b.id,...extra});
  for(const f of p.faces){
    const cuts=[...new Set([0,b.h,...f.openings.flatMap(o=>[o.y-o.h/2,o.y+o.h/2])])].sort((a,b)=>a-b),merged=new Map();
    for(let i=0;i<cuts.length-1;i++){
      const y0=cuts[i],y1=cuts[i+1],ym=(y0+y1)/2,holes=f.openings.filter(o=>ym>o.y-o.h/2&&ym<o.y+o.h/2).map(o=>[o.x-o.w/2,o.x+o.w/2]).sort((a,b)=>a[0]-b[0]);let cursor=-f.span/2;
      for(const [a,c] of [...holes,[f.span/2,f.span/2]]){if(a>cursor){const key=cursor.toFixed(5)+','+a.toFixed(5),last=merged.get(key);if(last&&Math.abs(last.y+last.h-y0)<1e-6)last.h=y1-last.y;else{const item={a:cursor,c:a,y:y0,h:y1-y0};out.push(item);merged.set(key,item);}}cursor=Math.max(cursor,c);}
    }
    for(let i=0;i<out.length;i++){const o=out[i];if(o.a===undefined)continue;const q=facePoint(b,f,(o.a+o.c)/2,o.y),across=Math.abs(Math.cos(f.yaw))>.5;out[i]={type:'box',...q,w:across?o.c-o.a:.28,d:across?.28:o.c-o.a,h:o.h,surface:'plaster',houseId:b.id};}
  }
  for(const s of p.slabs)box(s.x,s.top-s.h,s.z,s.w,s.h,s.d,{bridge:true,indoor:true});
  box(0,b.h-.14,0,b.w-.56,.14,b.d-.56,{bridge:true,indoor:true});
  // An open inward-swinging front door leaves a real 1.4m doorway.
  box(-.70,.24,b.d/2-.14-.70,.10,2.24,1.33);
  for(let i=0;i<2;i++)box(0,0,b.d/2+.50-i*.15,1.55-i*.08,.13+i*.13,1.03-i*.30,{bridge:true,indoor:true,surface:'stone'});
  if(p.stair){const s=p.stair;for(let i=0;i<s.count;i++){const top=s.base+(s.top-s.base)*(i+1)/s.count;box(s.x,top-.12,s.start-(i+.5)*s.tread,s.w,.12,s.tread+.012,{bridge:true,indoor:true});}
    box(s.x+s.w/2+.06,s.base,s.start-s.run/2,.06,s.top-s.base+.8,s.run-.22,{walkOnly:true});
  }
  for(const f of p.furniture){if(f.kind==='bed')box(f.x,p.base,f.z,f.w,f.top-p.base,f.d);else{box(f.x,f.top-.08,f.z,f.w,.08,f.d);for(const sx of [-1,1])for(const sz of [-1,1])box(f.x+sx*(f.w/2-.10),p.base,f.z+sz*(f.d/2-.10),.07,f.top-p.base,.07);}}
  return out;
}
export function houseLoot(b){const p=housePlan(b),weapon=(b.id??0)%3,names=['7.62×51 狙击弹','40 mm 榴弹','7.62×39 步枪弹'],count=[10,6,30],base={houseId:b.id??0,taken:false};
  const list=[{...base,id:`${b.id}:ammo`,kind:'ammo',weapon,count:count[weapon],name:names[weapon],x:b.x,y:b.y+p.base,z:b.z-b.d*.20},
    {...base,id:`${b.id}:medkit`,kind:'medkit',count:1,name:'医疗包',x:b.x+b.w*.27,y:b.y+p.base+.76,z:b.z+b.d*.20},
    {...base,id:`${b.id}:armour`,kind:'armour',count:100,name:'防弹衣',x:b.x+b.w*.27,y:b.y+p.base,z:b.z-b.d*.05}];
  if(p.stair)list.push({...base,id:`${b.id}:upstairs`,kind:'ammo',weapon:2,count:30,name:names[2],x:b.x+b.w*.20,y:b.y+p.upper,z:b.z-b.d*.15});return list;
}
