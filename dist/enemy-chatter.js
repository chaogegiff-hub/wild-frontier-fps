import {lineClear} from './core.js?v=2.25-drive-grass1';

export const ENEMY_VOICE_PROFILES=Object.freeze([
  {id:'scout',label:'侦察兵',character:'年轻、急促'},
  {id:'veteran',label:'老兵',character:'低沉、沉稳'},
  {id:'leader',label:'队长',character:'有力、果断'}
]);
export const ENEMY_LINES=Object.freeze({
  spot:['发现他了！','他在那里，盯紧他！'],
  attack:['别让他跑了！','瞄准目标，开火！'],
  reload:['我换弹，掩护我！'],
  lost:['人不见了，注意搜索！'],
  vehicle:['他开车过来了，小心！'],
  grenade:['榴弹！快躲开！']
});
export const enemyVoiceKey=(profile,kind,index)=>`enemy-${profile}-${kind}-${index}`;

// Reports follow the AI's real visibility/reload state. A single nearby
// speaker owns the channel; enemies keep their voice throughout the match.
export class EnemyChatter{
  constructor({speak=()=>false,stop=()=>{},random=Math.random}={}){Object.assign(this,{speak,stop,random});this.reset();}
  reset(){this.stop();this.states=new Map();this.current=null;this.nextGlobal=0;this.lastText='';this.enemies=null;}
  update(dt,match,{active=true,enabled=true}={}){
    if(this.enemies!==match.enemies){this.reset();this.enemies=match.enemies;}
    const now=match.time;
    if(!active||!enabled||match.over){if(this.current)this.stop();this.current=null;return;}
    if(this.current&&(!match.enemies.some(e=>e.id===this.current.enemyId&&e.alive&&!e.blast)||now>=this.current.until)){this.stop();this.current=null;}
    const choices=[];
    for(const e of match.enemies){
      if(!e.alive||e.blast)continue;let s=this.states.get(e.id);
      if(!s){s={lastSeen:-Infinity,lastTalk:-Infinity,lastVehicle:-Infinity,lastGrenade:-Infinity,reported:false,lost:false,cycle:0};this.states.set(e.id,s);}
      const distance=Math.hypot(e.x-match.player.x,e.z-match.player.z),sees=!!e.sees;
      if(sees){if(now-s.lastSeen>12){s.reported=false;s.lost=false;}s.lastSeen=now;}
      if(distance>85||now-s.lastTalk<12)continue;
      let kind,priority=0;
      if(sees&&match.grenades.some(g=>Math.hypot(g.x-e.x,g.z-e.z)<15&&Math.abs(g.y-e.y)<9)&&now-s.lastGrenade>18){kind='grenade';priority=6;}
      else if(sees&&match.vehicle&&now-s.lastVehicle>24){kind='vehicle';priority=5;}
      else if(sees&&!s.reported){kind='spot';priority=4;}
      else if(sees&&e.reloadRemaining>0){kind='reload';priority=3;}
      else if(!sees&&!s.lost&&now-s.lastSeen>3&&now-s.lastSeen<11){kind='lost';priority=2;}
      else if(sees&&now-s.lastTalk>18+e.id%5){kind='attack';priority=1;}
      if(kind)choices.push({e,s,kind,priority,distance});
    }
    if(this.current||now<this.nextGlobal||!choices.length)return;
    choices.sort((a,b)=>b.priority-a.priority||a.distance-b.distance);const {e,s,kind}=choices[0],profile=ENEMY_VOICE_PROFILES[((e.id%3)+3)%3];
    const lines=ENEMY_LINES[kind];let index=s.cycle%lines.length;if(lines.length>1&&lines[index]===this.lastText)index=(index+1)%lines.length;
    const position={x:e.x,y:e.y+1.6,z:e.z},blocked=!lineClear(position,match.player,match.colliders),line={enemyId:e.id,profile:profile.id,label:profile.label,kind,index,text:lines[index],key:enemyVoiceKey(profile.id,kind,index),position,blocked};
    const duration=this.speak(line);if(!(duration>0)){this.nextGlobal=now+.5;return;}
    s.lastTalk=now;s.cycle++;if(kind==='spot')s.reported=true;if(kind==='lost')s.lost=true;if(kind==='vehicle')s.lastVehicle=now;if(kind==='grenade')s.lastGrenade=now;
    this.lastText=line.text;this.current={enemyId:e.id,until:now+duration+.12};this.nextGlobal=this.current.until+1.1+this.random()*.9;
  }
}
