const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>a+(b-a)*t,smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export const VAULT_DURATION=.96;
export function vaultSample(plan,time){
  const t=clamp(time,0,1),{start,near,far,end,sill}=plan;let a,b,u,feet,height;
  if(t<.32){a=start;b=near;u=smooth(t/.32);feet=mix(start.feet,sill,u);height=mix(1.72,1.04,smooth(t/.23));}
  else if(t<.72){a=near;b=far;u=smooth((t-.32)/.4);feet=sill;height=1.04;}
  else{a=far;b=end;u=smooth((t-.72)/.28);feet=mix(sill,end.feet,u);height=mix(1.04,1.72,smooth((t-.78)/.22));}
  return {x:mix(a.x,b.x,u),z:mix(a.z,b.z,u),feet,height,eye:feet+height};
}
export function findWindowVault(player,windows,colliders,{walkHeight,circleBlocked,requireFacing=false}){
  let found=null,best=1.80;
  for(const w of windows){
    if(!w.broken||!Number.isFinite(w.sillY)||w.h<1.15)continue;
    const nx=w.normal.x,nz=w.normal.z,dx=player.x-w.x,dz=player.z-w.z,side=dx*nx+dz*nz>=0?1:-1,tangent=dx*nz-dz*nx,distance=Math.hypot(dx,dz);
    if(distance>best||Math.abs(tangent)>(Math.max(w.w,w.d)*.5+.18)||Math.abs(player.ground-w.floorY)>.65||w.sillY-player.ground>1.35||w.sillY-player.ground<.25)continue;
    if(requireFacing&&(-Math.sin(player.yaw)*-nx*side-Math.cos(player.yaw)*-nz*side)<.38)continue;
    const ground=walkHeight(w.x-nx*side*.98,w.z-nz*side*.98,colliders,player.ground);if(Math.abs(ground-player.ground)>.75)continue;
    const plan={window:w,inside:side<0,yaw:Math.atan2(nx*side,nz*side),startYaw:player.yaw,start:{x:player.x,z:player.z,feet:player.ground},near:{x:w.x+nx*side*.65,z:w.z+nz*side*.65},far:{x:w.x-nx*side*.65,z:w.z-nz*side*.65},end:{x:w.x-nx*side*.98,z:w.z-nz*side*.98,feet:ground},sill:w.sillY+.055,duration:VAULT_DURATION};
    let clear=true;for(let i=0;i<=40;i++){const p=vaultSample(plan,i/40);if(circleBlocked(p.x,p.z,.265,colliders,p.feet,p.height+.045)||p.feet+p.height>w.topY-.045&&i>=13&&i<=28){clear=false;break;}}
    if(clear){found=plan;best=distance;}
  }return found;
}
export class VaultControls{
  constructor(root,vault){this.root=root;root.getElementById('windowVault').addEventListener('click',vault);}
  render({playing,match,aim=false}){
    const get=id=>this.root.getElementById(id),candidate=playing&&!match?.vault?match?.nearestVault():null,active=playing&&!!match?.vault;
    this.root.body.classList.toggle('vaulting',!!match?.vault);get('windowVault').hidden=!candidate&&!active;get('windowVault').disabled=active&&!match.vault.blocked;
    get('vaultLabel').textContent=active?(match.vault.blocked?'通道受阻 · 返回':'正在翻越'):candidate?.inside?'翻越到屋外':'翻越进入屋内';get('vaultHint').textContent=active?'双手撑窗 · 收起枪械':'破窗已清空 · F / 空格';return candidate;
  }
}
