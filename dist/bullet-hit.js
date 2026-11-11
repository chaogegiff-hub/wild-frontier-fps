const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const point=p=>({x:p.x,y:p.y,z:p.z});
// Capture the physical hit; later player movement cannot redirect a reaction.
export function bulletHit(enemy,{point:contact,direction,headshot=false,damage=34,serial=0,at=0}={}){
  const yaw=enemy.yaw||0,p=contact||{x:enemy.x,y:enemy.y+(headshot?1.96:1.18),z:enemy.z};
  const d=direction||{x:-Math.sin(yaw),y:0,z:-Math.cos(yaw)},length=Math.hypot(d.x,d.y,d.z)||1;
  return {kind:'bullet',serial,at,point:point(p),direction:{x:d.x/length,y:d.y/length,z:d.z/length},part:headshot?'head':p.y-enemy.y<1.05?'abdomen':'chest',side:clamp((p.x-enemy.x)*Math.cos(yaw)-(p.z-enemy.z)*Math.sin(yaw),-.5,.5),strength:clamp(damage/88,.35,1),velocity:{x:enemy.vx||0,y:0,z:enemy.vz||0}};
}
export function hitFlinch(hit,remaining,yaw=0){
  if(!hit||remaining<=0)return null;
  const age=Math.max(0,(1-remaining)/3.8),wave=(1-Math.exp(-60*age))*Math.exp(-13*age)*(.75+hit.strength*.25);
  const d=hit.direction,c=Math.cos(yaw),s=Math.sin(yaw),x=d.x*c-d.z*s,z=d.x*s+d.z*c;
  return {pitch:z*wave*.18,roll:-x*wave*.13,twist:-hit.side*wave*.18,head:hit.part==='head'?wave*.14:wave*.025};
}
