import {lineClear} from './core.js?v=2.25-drive-grass1';

export const VOCAL_TAKES=Object.freeze({light:3,heavy:3,death:2});
export const vocalKey=(profile,kind,index)=>`reaction-${profile}-${kind}-${index}`;
const roles=['scout','veteran','leader'];

// Reflexes are driven by actual damage events, not visibility or frame polling.
// They do not wait for a tactical dialogue channel and never queue stale pain.
export class VocalReactions{
  constructor({play=()=>false,stop=()=>{},onReaction=()=>{},random=Math.random}={}){
    Object.assign(this,{play,stop,onReaction,random});this.reset();
  }
  reset(){this.stop();this.states=new Map();this.enemies=null;}
  sync(match){if(this.enemies!==match.enemies){this.reset();this.enemies=match.enemies;}}
  update(dt,match,{active=true,enabled=true,aftermath=false}={}){
    this.sync(match);if(!enabled||!active&&!aftermath)this.stop();
  }
  handle(event,match,{active=true,enabled=true}={}){
    this.sync(match);if(!['hit','kill','hurt'].includes(event.type))return false;
    const player=event.type==='hurt',actor=player?match.player:event.enemy;
    if(!actor||!Number.isFinite(actor.hp)||!player&&!match.enemies.includes(actor))return false;
    // Armour contacts and environmental damage are not flesh-impact cries.
    if(player&&(!(event.healthDamage>0)||['安全区外','溺水'].includes(event.source)))return false;
    const id=player?'player':actor.id,now=match.time,hp=Math.max(0,actor.hp);
    let s=this.states.get(id);if(!s){s={hp:100,next:0,priority:0,last:new Map(),dead:false};this.states.set(id,s);}
    const loss=player?event.healthDamage:Math.max(0,s.hp-hp);s.hp=hp;
    const terminal=player?hp<=0:event.type==='kill';if(s.dead||loss<=0&&!terminal)return false;
    if(terminal)s.dead=true;
    if(!active||!enabled)return false;
    let kind=terminal?'death':hp<=30||loss>=40?'heavy':'light';
    // A lethal head hit gets a brief involuntary grunt, never a long speech.
    if(terminal&&event.headshot)kind='light';
    const priority=terminal?3:kind==='heavy'?2:1;
    if(!terminal&&now<s.next&&priority<=s.priority)return false;
    const position=player?null:{x:actor.x,y:actor.y+1.5,z:actor.z};
    const distance=player?0:Math.hypot(actor.x-match.player.x,actor.z-match.player.z);
    if(distance>90)return false;
    const profile=player?'player':roles[((actor.id%3)+3)%3],count=VOCAL_TAKES[kind];
    let index=Math.min(count-1,Math.floor(this.random()*count));
    if(count>1&&index===s.last.get(kind))index=(index+1)%count;
    const line={actorId:id,enemyId:player?null:actor.id,profile,kind,index,terminal,priority,position,distance,
      blocked:!player&&!lineClear(position,match.player,match.colliders),key:vocalKey(profile,kind,index)};
    const duration=this.play(line);if(!(duration>0))return false;
    s.last.set(kind,index);s.priority=priority;s.next=now+(terminal?Infinity:kind==='heavy'?1.05:.55);
    this.onReaction(line,duration,now);return duration;
  }
}
