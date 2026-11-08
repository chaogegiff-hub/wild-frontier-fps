export class BattleFeedback{
  constructor(root){this.root=root;this.lockTime=0;this.deathTime=0;this.reset();}
  get(id){return this.root.getElementById(id);}
  reset(){this.lockTime=this.deathTime=0;this.get('lockConfirm').hidden=true;this.get('waterScreen').hidden=true;this.get('waterScreen').style.opacity=0;this.root.body.classList.remove('water-death');}
  clearLock(){this.lockTime=0;this.get('lockConfirm').hidden=true;}
  locked(enemy,distance){this.lockTime=2.2;this.get('lockConfirmText').textContent=`巡逻兵 ${String(enemy.id+1).padStart(2,'0')} · ${Math.round(distance)} m · 开火追踪`;this.get('lockConfirm').hidden=false;}
  drowned(){this.deathTime=1.7;this.get('result').hidden=true;}
  update(dt,{state,match}){
    if(state==='playing')this.lockTime=Math.max(0,this.lockTime-dt);
    const locked=state==='playing'&&match?.weapon===1&&match.grenadeLock.locked&&!match.vehicle;this.get('lockConfirm').hidden=!locked||this.lockTime<=0;
    const fatal=state==='result'&&match?.resultCause==='drowned';this.root.body.classList.toggle('water-death',fatal);
    if(fatal&&this.deathTime>0){this.deathTime=Math.max(0,this.deathTime-dt);if(this.deathTime===0)this.get('result').hidden=false;}
    const active=state==='playing'||state==='paused',submerged=active&&match?.drownTime>0,wet=active&&match?.vehicle?.sinking;
    const opacity=fatal?.86:submerged?.38+(1-Math.max(0,match.player?.hp??100)/100)*.36:wet?.13:0,screen=this.get('waterScreen');screen.hidden=opacity===0;screen.style.opacity=opacity;screen.classList.toggle('fatal',fatal&&this.deathTime>0);
  }
}
