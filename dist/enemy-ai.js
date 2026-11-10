const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const angle=v=>Math.atan2(Math.sin(v),Math.cos(v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const copy=p=>({x:p.x,y:p.y,z:p.z});

// Only perception can update knowledge. Navigation consumes snapshots, never
// the current player's position. Core supplies the game's real collision ops.
export class EnemyDirector{
  constructor(operations){Object.assign(this,operations);this.reset();}
  reset(){this.noises=[];this.sequence=0;this.playerPosition=null;this.nextStepSound=0;}
  state(e){
    return e.ai??={notice:0,visible:false,sample:null,nextSense:0,lastSeen:-Infinity,lastKnown:null,contact:false,
      heard:null,heardAt:-Infinity,heardId:0,investigateUntil:0,searchUntil:0,reactionUntil:0,reportAt:Infinity,
      lastReport:-Infinity,underFireUntil:0,planAt:0,goal:null,anchor:null,cover:null,coverUntil:0,coverCooldown:0,
      flanks:0,burst:0,stuck:0,detourUntil:0};
  }
  clear(a,b,colliders){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.05||this.lineClear(a,b,colliders);}
  noise(point,kind,radius,now){
    this.noises.push({id:++this.sequence,point:copy(point),kind,radius,at:now});
    if(this.noises.length>20)this.noises.shift();
  }
  heardPoint(e,sound,blocked=false){
    const d=distance(e,sound.point),spread=(sound.kind==='step'?1.7:4+d*.045)*(blocked?1.5:1),phase=e.id*2.71+sound.id*1.37;
    return {x:sound.point.x+Math.sin(phase)*spread,y:sound.point.y,z:sound.point.z+Math.cos(phase)*spread};
  }
  startle(e,now){
    const a=this.state(e);a.underFireUntil=now+3.5;a.reactionUntil=Math.max(a.reactionUntil,now+.22);a.notice=Math.max(a.notice,.35);
    const sound=[...this.noises].reverse().find(s=>s.kind!=='step'&&now-s.at<1.5&&distance(e,s.point)<s.radius);
    if(sound){a.heard=this.heardPoint(e,sound,true);a.heardAt=now;a.investigateUntil=now+9;}
    a.planAt=0;
  }
  confirm(e,point,now){
    const a=this.state(e),newContact=!a.contact||now-a.lastSeen>2;
    if(newContact){
      a.reactionUntil=now+.38+(e.id%5)*.075;a.anchor={x:e.x,z:e.z};a.flanks=0;a.planAt=0;e.aimReady=0;
      if(Number.isFinite(e.shoot))e.shoot=Math.min(Math.max(0,e.shoot),.55+(e.id%4)*.08);
    }
    a.contact=true;a.notice=1;a.lastKnown=copy(point);a.lastSeen=now;a.searchUntil=now+14+(e.id%3)*2;
    if(now-a.lastReport>8&&a.reportAt===Infinity)a.reportAt=now+.65+(e.id%3)*.13;
  }
  targetPoint(match){
    const car=match.vehicle;
    return car?{x:car.x,y:car.collider.y+car.collider.h+.12,z:car.z}:copy(match.player);
  }
  hear(e,match,now){
    const a=this.state(e);if(a.heardId===this.sequence)return;
    let best=null,score=0;
    for(let i=this.noises.length-1;i>=0;i--){
      const sound=this.noises[i];if(sound.id<=a.heardId)break;if(now-sound.at>3.5)continue;
      const d=distance(e,sound.point);if(d>sound.radius)continue;
      const blocked=!this.clear({x:e.x,y:e.y+1.6,z:e.z},sound.point,match.colliders),range=sound.radius*(blocked?.38:1);
      const strength=1-d/range;if(strength>score){best={sound,blocked};score=strength;}
    }
    a.heardId=this.sequence;
    if(best&&!e.sees){a.heard=this.heardPoint(e,best.sound,best.blocked);a.heardAt=now;a.investigateUntil=now+8;a.notice=Math.max(a.notice,.24);}
  }
  coverPoint(e,threat,colliders){
    const candidates=colliders.filter(c=>!c.bridge&&!c.walkThrough&&c.h>.8&&distance(c,e)<15)
      .sort((a,b)=>distance(a,e)-distance(b,e)).slice(0,8);
    let best=null,bestCost=Infinity;
    for(const c of candidates){
      const x=c.x-threat.x,z=c.z-threat.z,len=Math.hypot(x,z)||1,r=c.r??Math.hypot(c.w||0,c.d||0)*.5;
      for(const side of [0,-.65,.65]){
        const ux=x/len,uz=z/len,p={x:c.x+(ux-uz*side)*(r+.85),z:c.z+(uz+ux*side)*(r+.85)};
        p.y=this.walkHeight(p.x,p.z,colliders,e.y);const d=distance(p,e);
        if(d>16||Math.abs(p.y-e.y)>1.1||p.y<this.waterLevel-.1||this.circleBlocked(p.x,p.z,.5,colliders,p.y))continue;
        if(this.clear({x:p.x,y:p.y+1.35,z:p.z},threat,colliders))continue;
        if(!this.clear({x:e.x,y:e.y+.8,z:e.z},{x:p.x,y:p.y+.8,z:p.z},colliders))continue;
        if(d<bestCost){best=p;bestCost=d;}
      }
    }
    return best;
  }
  plan(e,match,now){
    const a=this.state(e),p=a.lastKnown;if(!p)return {x:e.x,z:e.z};
    if(now<a.planAt&&a.goal)return a.goal;a.planAt=now+1.8+(e.id%4)*.19;
    const d=distance(e,p),ux=(e.x-p.x)/(d||1),uz=(e.z-p.z)/(d||1);
    const pressured=e.hp<38||a.underFireUntil>now||e.reloadRemaining>0;
    if(a.cover&&now>=a.coverUntil)a.cover=null;
    if(pressured&&!a.cover&&now>=a.coverCooldown){
      a.cover=this.coverPoint(e,p,match.colliders);
      if(a.cover){a.coverUntil=now+2.6;a.coverCooldown=now+7;}
    }
    if(a.cover)a.goal=a.cover;
    else if(d>65)a.goal={x:p.x+ux*46,z:p.z+uz*46};
    else if(d<11)a.goal={x:p.x+ux*17,z:p.z+uz*17};
    else if(!pressured&&e.id%3!==0&&a.flanks===0&&match.enemies.some(n=>n!==e&&n.alive&&n.ai?.contact&&distance(n,e)<27)){
      const side=e.id%3===1?1:-1;a.goal={x:e.x-uz*side*8-ux*2,z:e.z+ux*side*8-uz*2};a.anchor={...a.goal};a.flanks++;
    }else a.goal=a.anchor||{x:e.x,z:e.z};
    return a.goal;
  }
  update(match,dt,input={}){
    const now=match.time,p=match.player,active=match.mode==='survival';
    this.noises=this.noises.filter(s=>now-s.at<4);
    if(active&&this.playerPosition){
      const travel=distance(p,this.playerPosition),moving=travel>.008&&travel<Math.max(2,dt*16);
      if(now>=this.nextStepSound&&(moving||match.vehicle&&!match.vehicle.stalled)){
        const radius=match.vehicle?(Math.abs(match.vehicle.speed)>2?76:19):p.crouch?4.5:input.sprint?28:12;
        this.noise(p,match.vehicle?'engine':'step',radius,now);this.nextStepSound=now+(match.vehicle ? .35 : .48);
      }
    }this.playerPosition=copy(p);
    for(const e of match.enemies){
      if(match.over)break;if(!e.alive||e.blast)continue;const a=this.state(e);
      e.shoot=(e.shoot??1)-dt;e.hitReact=Math.max(0,(e.hitReact||0)-dt*3.8);
      if(e.reloadRemaining>0){e.reloadRemaining=Math.max(0,e.reloadRemaining-dt);if(!e.reloadRemaining){e.rounds=30;e.shoot=Math.max(.35,e.shoot);}}
      if(active){
        this.hear(e,match,now);
        if(now>=a.nextSense){
          a.nextSense=now+.12+(e.id%4)*.025;const target=this.targetPoint(match),d=distance(e,target),bearing=Math.atan2(target.x-e.x,target.z-e.z);
          const offset=Math.abs(angle(bearing-e.yaw-(e.lookYaw||0)*.6)),range=match.vehicle?155:p.crouch?91:128;
          a.visible=d<range&&(offset<(a.contact?1.34:1.08)||d<1.7)&&this.clear({x:e.x,y:e.y+this.body.head-.12,z:e.z},target,match.colliders);
          a.sample=a.visible?target:null;a.sampleAt=now;a.sightRate=(1.2+2*(1-d/range))*(p.crouch?.68:1)*(offset>.85?.55:1);
        }
        a.notice=clamp(a.notice+dt*(a.visible?a.sightRate:-.65),0,1);
        e.sees=!!a.visible&&(a.notice>=1-1e-7||a.contact&&a.notice>.2);
        if(e.sees)this.confirm(e,a.sample,a.sampleAt);
      }else{e.sees=false;a.notice=0;}
      const remembered=a.contact&&now<a.searchUntil,heard=now<a.investigateUntil&&a.heard;
      let state='patrol',goal={x:e.homeX+Math.sin(now*.18+e.phase)*7,z:e.homeZ+Math.cos(now*.14+e.phase)*7},lookTarget=null;
      if(active&&e.sees){
        state=now<a.reactionUntil?'alert':e.reloadRemaining>0?'reload':'combat';goal=this.plan(e,match,now);lookTarget=a.lastKnown;
        if(a.cover&&state==='combat')state='cover';
      }else if(active&&remembered){
        lookTarget=heard&&a.heardAt>a.lastSeen?a.heard:a.lastKnown;
        if(a.cover&&now<a.coverUntil){state='cover';goal=a.cover;}
        else if(a.cover&&now<a.coverUntil+2){state='peek';goal=a.anchor;a.planAt=0;}
        else{
          a.cover=null;state='search';goal=lookTarget;
          if(distance(e,lookTarget)<3){const phase=Math.floor((now-a.lastSeen)/2.6)+e.id*1.9;goal={x:lookTarget.x+Math.sin(phase)*4,z:lookTarget.z+Math.cos(phase)*4};}
        }
      }else if(active&&a.visible&&a.notice>.05){state='suspicious';goal={x:e.x,z:e.z};lookTarget=a.sample;}
      else if(active&&heard){state='investigate';goal=a.heard;lookTarget=a.heard;}
      else if(active&&a.contact){a.contact=false;a.lastKnown=null;a.goal=null;a.anchor=null;a.reportAt=Infinity;state='return';}
      if(active&&Math.hypot(e.x-match.zoneCenter.x,e.z-match.zoneCenter.z)>match.zoneRadius-8)goal=match.zoneCenter;
      e.aiState=state;e.awareness=a.notice;e.alert=state==='patrol'?0:state==='combat'||state==='cover'?1:.55;
      e.weaponReady=e.reloadRemaining>0?.15:e.sees?1:state==='search'||state==='cover'||state==='peek'?.6:state==='investigate'?.4:state==='suspicious'?a.notice*.7:0;
      this.move(e,goal,lookTarget,match,dt,now,state);
      const aimTarget=a.lastKnown,aimYaw=aimTarget?Math.atan2(aimTarget.x-e.x,aimTarget.z-e.z):e.yaw;
      const error=Math.abs(angle(aimYaw-e.yaw)),ready=e.sees&&now>=a.reactionUntil&&error<.42&&e.moveSpeed<1.1&&!(e.reloadRemaining>0)&&e.hitReact<.3;
      e.aimReady=clamp((e.aimReady||0)+dt*(ready?3:-6),0,1);
      if(active&&now>2&&ready&&e.shoot<=0&&e.aimReady>=.8){
        // A fresh ray prevents a cached sight sample from firing through cover.
        const target=this.targetPoint(match),bearing=Math.atan2(target.x-e.x,target.z-e.z),origin={x:e.x,y:e.y+this.body.fire,z:e.z};
        if(Math.abs(angle(bearing-e.yaw))<.48&&this.clear(origin,target,match.colliders)){
          if(!a.burst)a.burst=2+(e.id%2);a.burst--;e.shoot=a.burst?.18+(e.id%3)*.025:1.55+(e.id%4)*.23;
          match.onEvent({type:'enemyfire',enemy:e});const len=Math.hypot(target.x-origin.x,target.y-origin.y,target.z-origin.z);
          if(len>0)match.breakGlassAlong(origin,{x:(target.x-origin.x)/len,y:(target.y-origin.y)/len,z:(target.z-origin.z)/len},len);
          if(Math.random()<clamp(.48-distance(e,target)*.0021,.12,.43)*(p.crouch?.65:1)){
            if(match.vehicle)match.damageVehicle(match.vehicle,2+e.id%3);else match.hurt(2+e.id%3,'敌方射击');
          }
          e.rounds=(e.rounds??30)-1;if(e.rounds<=0){e.reloadRemaining=e.reloadDuration||2.6;a.planAt=0;a.burst=0;}
        }else{e.aimReady=0;e.shoot=.15;}
      }
    }
    if(active)this.communicate(match,now);
  }
  communicate(match,now){
    for(const e of match.enemies){
      const a=e.ai;if(!e.alive||!e.sees||!a||now<a.reportAt)continue;a.reportAt=Infinity;a.lastReport=now;
      for(const n of match.enemies){
        if(n===e||!n.alive||n.blast||n.sees||distance(n,e)>32)continue;
        if(!this.clear({x:e.x,y:e.y+1.6,z:e.z},{x:n.x,y:n.y+1.6,z:n.z},match.colliders)&&distance(n,e)>13)continue;
        const b=this.state(n);b.heard=this.heardPoint(n,{point:a.lastKnown,id:e.id+Math.floor(now),kind:'ally'},false);b.heardAt=now;b.investigateUntil=now+8;b.notice=Math.max(b.notice,.24);
      }
    }
  }
  move(e,goal,lookTarget,match,dt,now,state){
    const a=this.state(e),ex=goal.x-e.x,ez=goal.z-e.z,dist=Math.hypot(ex,ez),oldX=e.x,oldZ=e.z;
    let heading=Math.atan2(ex,ez);
    if(a.stuck>.45&&dist>2){a.detourUntil=now+.9;a.detourYaw=heading+(e.id%2?1:-1)*1.1;a.stuck=0;}
    if(now<a.detourUntil)heading=a.detourYaw;
    const alignment=.04+.96*Math.max(0,Math.cos(angle(heading-e.yaw)))**2;
    const hold=state==='alert'||state==='suspicious'||e.sees&&dist<1.8&&e.aimReady>.2;
    const pace=e.reloadRemaining>0?.65:1,max=state==='patrol'?1.25:state==='investigate'?1.65:2.8;
    const speed=!hold&&dist>.7?Math.min(max,Math.sqrt(5.2*(dist-.7)))*alignment*pace:0;
    const wantX=Math.sin(heading)*speed,wantZ=Math.cos(heading)*speed,cx=wantX-(e.vx||0),cz=wantZ-(e.vz||0),change=Math.hypot(cx,cz),blend=change?Math.min(1,(e.alert?4:2.6)*dt/change):0;
    e.vx=(e.vx||0)+cx*blend;e.vz=(e.vz||0)+cz*blend;this.moveGround(e,e.vx*dt,e.vz*dt,match.colliders,.42*this.enemyScale);
    e.y=Math.max(this.walkHeight(e.x,e.z,match.colliders,e.ground??e.y),this.waterLevel-.62);
    const moved=Math.hypot(e.x-oldX,e.z-oldZ);e.walk=(e.walk||0)+moved*2.8;e.vx=dt?(e.x-oldX)/dt:0;e.vz=dt?(e.z-oldZ)/dt:0;e.moveSpeed=dt?moved/dt:0;
    a.stuck=speed>.5&&moved<dt*.08?a.stuck+dt:0;
    const targetYaw=e.moveSpeed>.15?Math.atan2(e.vx,e.vz):lookTarget?Math.atan2(lookTarget.x-e.x,lookTarget.z-e.z):heading;
    const turn=clamp(angle(targetYaw-e.yaw),-(e.alert?2.65:2.1)*dt,(e.alert?2.65:2.1)*dt);e.yaw+=turn;e.turnRate=dt?turn/dt:0;
    const scan=state==='search'&&dist<5?Math.sin(now*1.35+e.id)*.6:0;
    e.lookYaw=lookTarget?clamp(angle(Math.atan2(lookTarget.x-e.x,lookTarget.z-e.z)-e.yaw)+scan,-.85,.85):0;
    e.aimPitch=e.sees&&lookTarget?clamp(Math.atan2(lookTarget.y-e.y-this.body.fire,Math.max(1,distance(e,lookTarget))),-.55,.55):0;
  }
}
