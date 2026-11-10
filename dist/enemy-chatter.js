import {lineClear} from './core.js?v=2.25-drive-grass1';

export const ENEMY_VOICE_PROFILES=Object.freeze([
  {id:'scout',label:'侦察兵',character:'年轻、急促'},
  {id:'veteran',label:'老兵',character:'低沉、沙哑、受压时紧绷'},
  {id:'leader',label:'队长',character:'沉着、有力、紧张下令'}
]);
export const ENEMY_LINES=Object.freeze({
  spot:['发现他了！','在那儿！快！'],
  attack:['压住他！别停！','冲！别让他跑了！'],
  reload:['没子弹了！掩护我！'],
  lost:['他去哪了？小心点……'],
  vehicle:['有车！快闪开！'],
  grenade:['小心榴弹！快趴下！'],
  wounded:['啊！我中弹了！','啊！我受伤了！']
});
export const enemyVoiceKey=(profile,kind,index)=>`enemy-${profile}-${kind}-${index}`;

// Reports follow the AI's real visibility/reload state. A single nearby
// speaker owns the channel; enemies keep their voice throughout the match.
export class EnemyChatter{
  constructor({speak=()=>false,stop=()=>{},random=Math.random}={}){Object.assign(this,{speak,stop,random});this.reset();}
  reset(){this.stop();this.states=new Map();this.holds=new Map();this.current=null;this.nextGlobal=0;this.lastStart=-Infinity;this.lastUrgent=-Infinity;this.retryAfter=0;this.lastText='';this.enemies=null;}
  holdSpeaker(id,until,match){if(match&&this.enemies!==match.enemies){this.reset();this.enemies=match.enemies;}this.holds.set(id,Math.max(until,this.holds.get(id)||0));if(this.current?.enemyId===id){this.stop();this.current=null;}}
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
      if(distance>85||now<(this.holds.get(e.id)||0))continue;
      let kind,priority=0;const normalReady=now-s.lastTalk>=12;
      if(now-s.lastGrenade>8&&(match.grenades||[]).some(g=>Math.hypot(g.x-e.x,g.z-e.z)<15&&Math.abs(g.y-e.y)<9&&lineClear({x:e.x,y:e.y+1.5,z:e.z},g,match.colliders))){kind='grenade';priority=9;}
      else if(normalReady&&sees&&match.vehicle&&now-s.lastVehicle>24){kind='vehicle';priority=5;}
      else if(normalReady&&sees&&!s.reported){kind='spot';priority=4;}
      else if(normalReady&&sees&&e.reloadRemaining>0){kind='reload';priority=3;}
      else if(!sees&&!s.lost&&now-s.lastTalk>3.2&&now-s.lastSeen>2&&now-s.lastSeen<12){kind='lost';priority=2;}
      else if(normalReady&&sees&&now-s.lastTalk>18+e.id%5){kind='attack';priority=1;}
      if(kind)choices.push({e,s,kind,priority,distance});
    }
    if(!choices.length||now<this.retryAfter)return;
    choices.sort((a,b)=>b.priority-a.priority||a.distance-b.distance);const {e,s,kind}=choices[0],profile=ENEMY_VOICE_PROFILES[((e.id%3)+3)%3];
    // A grenade warning can interrupt a routine report, while the single voice
    // channel and its short global urgent cooldown prevent a shouting chorus.
    const priority=choices[0].priority,urgent=priority>=7,interrupt=urgent&&priority>(this.current?.priority||0)+1&&now-this.lastStart>=.4&&now-this.lastUrgent>=2.1;
    if((this.current||now<this.nextGlobal)&&!interrupt)return;
    if(this.current){this.stop();this.current=null;}
    const lines=ENEMY_LINES[kind];let index=s.cycle%lines.length;if(lines.length>1&&lines[index]===this.lastText)index=(index+1)%lines.length;
    const position={x:e.x,y:e.y+1.6,z:e.z},blocked=!lineClear(position,match.player,match.colliders),line={enemyId:e.id,profile:profile.id,label:profile.label,kind,index,text:lines[index],key:enemyVoiceKey(profile.id,kind,index),position,blocked};
    const duration=this.speak(line);if(!(duration>0)){this.retryAfter=now+.5;return;}
    s.lastTalk=now;s.cycle++;if(kind==='spot')s.reported=true;if(kind==='lost')s.lost=true;if(kind==='vehicle')s.lastVehicle=now;if(kind==='grenade')s.lastGrenade=now;
    this.lastStart=now;if(urgent)this.lastUrgent=now;this.lastText=line.text;this.current={enemyId:e.id,priority,until:now+duration+.12};this.nextGlobal=this.current.until+1.1+this.random()*.9;
  }
}
