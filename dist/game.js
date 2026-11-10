import {footSurface,FootstepContacts} from './foley-motion.js?v=2.25-drive-grass1';
import {PickupControls} from './pickup-controls.js?v=2.25-drive-grass1';
import {VaultControls} from './window-vault.js?v=2.25-drive-grass1';
import * as THREE from './vendor/three.module.js';
import {Match,WEAPONS,ENEMY_BODY,GRENADE_LOCK_TIME,createWorldData,heightAt,terrainSurfaceAt,clamp,lerp,direction,zoomFov,terrainRay,walkHeight,WATER_LEVEL,shotFromMuzzle,aimDistance} from './core.js?v=2.25-drive-grass1';
import {makeWorld,loadSurfaces,SURFACE_GROUPS,SURFACE_FILES} from './world.js?v=2.25-drive-grass1';
import {createViewModels,createEnemyModel,weaponViewFov,weaponViewPosition} from './weapons.js?v=2.25-drive-grass1';
import {loadAssets,lightFromSky,loadSkyDetail,ASSET_GROUPS,MODEL_FILES} from './assets.js?v=2.25-drive-grass1';
import {GameAudio} from './audio.js?v=2.27-human-pain1';
import {EnemyChatter} from './enemy-chatter.js?v=2.27-human-pain1';
import {VocalReactions} from './vocal-reactions.js?v=2.27-human-pain1';
import {BattleEffects} from './effects.js?v=2.25-drive-grass1';
import {loadStartupPack,invalidateStartupCache} from './resource-pack.js?v=2.25-drive-grass1';
import {viewPointToWorld,WeaponRecoil,syncWeaponLighting} from './weapon-view.js?v=2.25-drive-grass1';
import {AimOverlay} from './aim-overlay.js?v=2.25-drive-grass1';
import {graphicsConfig,renderSizing,textureRegistry,HDTextureStreamer} from './graphics.js?v=2.25-drive-grass1';
import {makeVehicleViews} from './vehicles.js?v=2.25-drive-grass1';
import {DrivingControls} from './vehicle-controls.js?v=2.25-drive-grass1';
import {BattleFeedback} from './battle-feedback.js?v=2.25-drive-grass1';
import {VehicleTrails} from './vehicle-trails.js?v=2.25-drive-grass1';
import {SwimView,swimViewFov} from './swim-view.js?v=2.25-drive-grass1';
import {LookControls} from './look-controls.js?v=2.28-touch-pause1';
import {PauseControls} from './pause-controls.js?v=2.28-touch-pause1';

const $=id=>document.getElementById(id);
const deployment=window.wildFrontierDeployment;
const touch=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
document.body.classList.toggle('touch',touch);
let config=graphicsConfig();
try{config=graphicsConfig(JSON.parse(localStorage.getItem('wild-frontier-settings')||'{}'));localStorage.setItem('wild-frontier-settings',JSON.stringify(config));}catch{}
let renderer,scene,camera,world,match,models,viewScene,viewCamera,data,gunLight,aimOverlay;
let hdTextures=null,graphicsRatio=1,skyDetailPromise=null,environmentTarget,activeSky,skyUpgraded=false;
let adsBlend=0;
const weaponRecoil=new WeaponRecoil();
let state='lobby',selectedMode='survival',selectedWeapon=2,aim=false,keys={},fireHeld=false,fireLatched=false,ready=false;
let recoil=0,recoilSide=0,flashTime=0,damageFlash=0,hitTime=0,breath=6,uiTimer=0,mapTimer=0,frameTime=0,frameCount=0;
let elapsed=0,last=performance.now(),stepTime=0,lastStep=0,messageTime=0,currentActionTotal=1,lookControls;
let joy={forward:0,strafe:0},joyId=null,touchJump=false,touchCrouch=false;
let enemyMeshes=[],battleEffects,shellTimers=[],projectileMeshes=[];
const qv=new THREE.Vector3(),rayDir=new THREE.Vector3();
const audio=new GameAudio();
const enemyChatter=new EnemyChatter({speak:line=>{const duration=audio.enemyVoice(line);if(duration){$('enemySubtitle').textContent=`${line.label} ${String(line.enemyId+1).padStart(2,'0')}：${line.text}`;$('enemySubtitle').hidden=false;}return duration;},stop:()=>{audio.stopChatter();$('enemySubtitle').hidden=true;}});
const vocalReactions=new VocalReactions({play:line=>audio.vocalReaction(line),stop:()=>audio.stopReactions(),onReaction:(line,duration,now)=>{if(line.enemyId!==null)enemyChatter.holdSpeaker(line.enemyId,now+duration+.45,match);}});
let vehicleViews,vehicleTrails,driveCameraReady=false,driveLookYaw=0,driveLookPitch=0;
let swimView,swimWasActive=false;const footstepContacts=new FootstepContacts();
const drivingControls=new DrivingControls(document,interactVehicle,pressed=>{if(state==='playing'&&match?.vehicle&&!match.vehicle.stalled)audio.horn(pressed);});
const battleFeedback=new BattleFeedback(document);
const pickupControls=new PickupControls(document,pickupNearby);
const vaultControls=new VaultControls(document,vaultNearby);

function updateVehicleUI(){document.body.classList.toggle('swimming',!!match?.swimming&&(state==='playing'||state==='paused'));const candidate=vaultControls.render({playing:state==='playing',match,aim});pickupControls.render({playing:state==='playing'&&!match?.swimming&&!match?.vault&&!candidate,match,aim});drivingControls.render({playing:state==='playing'&&!match?.vault,active:state==='playing'||state==='paused',vehicle:match?.vehicle,nearby:state==='playing'&&!candidate?match?.nearbyVehicle():null,exitPending:match?.fleet.exitPending,drownTime:match?.drownTime});}
function vaultNearby(){if(state!=='playing')return false;const plan=match.nearestVault();return match.vaultWindow(plan?.window.id);}
function pickupNearby(){if(state!=='playing')return;const item=match.nearestLoot();if(item)match.pickupLoot(item.id);updateHUD();}
function interactVehicle(){if(state!=='playing')return;if(!match.interactVehicle())showMessage('靠近越野车后可上车',1.6);}

function showMessage(text,seconds=2.5){$('message').textContent=text;messageTime=seconds;$('message').style.opacity='1';}
function setAim(value){value=!!value&&!match?.vehicle&&!match?.swimming&&!match?.vault;aim=value;$('aimTouch').classList.toggle('pressed',value);if(value)audio.resume();else{audio.clearLockAudio();battleFeedback.clearLock();match?.clearGrenadeLock();$('grenadeLock').hidden=true;$('scope').hidden=true;$('crosshair').hidden=false;$('aimReticle').hidden=true;$('aimReadout').hidden=true;}}
function clearInput(){drivingControls.clear();lookControls?.clear();keys={};fireHeld=false;fireLatched=false;joy={forward:0,strafe:0};joyId=null;touchJump=false;touchCrouch=false;$('joystickKnob').style.transform='';$('fireTouch').classList.remove('pressed');$('crouchTouch').classList.remove('pressed');}
function lockMouse(){if(!touch)lookControls?.requestLock();}
function startMatch(){
  if(!ready){deployment.request();return;}clearInput();setAim(false);match.reset(selectedMode);match.weapon=selectedWeapon;match.running=true;state='playing';
  battleFeedback.reset();
  $('lobby').hidden=true;$('pauseScreen').hidden=true;$('result').hidden=true;$('hud').hidden=false;$('killFeed').replaceChildren();$('scope').hidden=true;
  $('rotateNotice').hidden=!touch;
  driveCameraReady=false;vehicleViews?.update(0,match.fleet);$('modeTag').textContent=selectedMode==='training'?'自由训练':'生存对战';$('lookHint').hidden=false;
  vehicleTrails?.reset(match.fleet);world.resetInteractive(match);enemyChatter.reset();vocalReactions.reset();audio.loadChatter();audio.loadReactions();
  swimView?.reset();swimWasActive=false;footstepContacts.reset();
  enemyMeshes.forEach(m=>{m.rotation.set(0,0,0);m.visible=true;m.userData.reset();});
  recoil=0;adsBlend=0;weaponRecoil.reset();breath=6;damageFlash=0;hitTime=0;clearEffects();audio.resume();audio.setActive(true);lockMouse();
  if(touch){try{const p=document.documentElement.requestFullscreen?.();if(p?.catch)p.catch(()=>{});}catch{}try{const p=screen.orientation?.lock?.('landscape');if(p?.catch)p.catch(()=>{});}catch{}}
  showMessage(selectedMode==='training'?'自由训练 · 枪弹免伤 · 补给无限':'清除 12 名敌人，留在安全区内',4);updateHUD();
}
function pause(){if(state!=='playing')return;state='paused';match.running=false;audio.setActive(false);clearInput();setAim(false);$('pauseScreen').hidden=false;updateVehicleUI();try{document.exitPointerLock?.();}catch{}}
function resume(){if(state!=='paused')return;state='playing';match.running=true;$('pauseScreen').hidden=true;clearInput();audio.resume();audio.setActive(true);updateVehicleUI();lockMouse();}
function lobby(){state='lobby';if(match)match.running=false;audio.setActive(false);clearInput();setAim(false);battleFeedback.reset();$('lobby').hidden=false;$('hud').hidden=true;$('pauseScreen').hidden=true;$('result').hidden=true;$('rotateNotice').hidden=true;try{document.exitPointerLock?.();}catch{}clearEffects();updateVehicleUI();}
function finish(win,cause=''){
  if(swimView)swimView.group.visible=false;
  state='result';updateVehicleUI();audio.setActive(false,{allowVocalTail:true});clearInput();setAim(false);$('result').hidden=false;$('pauseScreen').hidden=true;
  $('resultEyebrow').textContent=win?'MISSION COMPLETE':cause==='drowned'?'LOST UNDERWATER':'OPERATION ENDED';$('resultTitle').textContent=win?'战场已清空':cause==='drowned'?'溺水阵亡':'作战结束';
  $('resultDescription').textContent=win?'你是谷地最后的生存者。':cause==='drowned'?'车辆沉没，未能及时逃离。再次部署后可重新进入战场。':'利用掩体与高地，准备下一次部署。';$('resultKills').textContent=match.kills;if(cause==='drowned')battleFeedback.drowned();
  $('resultAccuracy').textContent=`${Math.round(match.hits/Math.max(1,match.bulletShots)*100)}%`;
  $('resultTime').textContent=formatTime(match.time);try{document.exitPointerLock?.();}catch{}audio.tone(win?620:210,.22,.14);
}
function formatTime(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;}
function handleEvent(e){
  if(['hit','kill','hurt'].includes(e.type))vocalReactions.handle(e,match,{active:state==='playing',enabled:config.sound});
  switch(e.type){
    case 'vaultstart':clearInput();setAim(false);weaponRecoil.reset();shellTimers=[];flashTime=0;audio.footstep(footSurface(match.player,match.colliders),.09);break;
    case 'vaultend':swimView.group.visible=false;audio.footstep(footSurface(match.player,match.colliders),.14);break;
    case 'vaultcancel':swimView.group.visible=false;showMessage('翻越通道受阻，已返回',2);break;
    case 'vaultblocked':showMessage('通道被挡住 · 点击翻越按钮返回',2);break;
    case 'windowbreak':world.breakWindow(e.window.id);battleEffects.glassBreak(e.point,e.direction);audio.glassBreak(e.point);updateVehicleUI();break;
    case 'lootpicked':world.lootViews.pick(e.item.id);showMessage(e.item.kind==='armour'?'防弹衣耐久已补满':`${e.item.name} +${e.item.count}`,2);audio.tone(650,.07,.035);break;
    case 'vehicledestroyed':if(Math.hypot(match.player.x-e.vehicle.x,match.player.z-e.vehicle.z)<45)showMessage('车辆被摧毁 · 无法驾驶',2.5);break;
    case 'vehicleenter':clearInput();setAim(false);driveCameraReady=false;driveLookYaw=0;driveLookPitch=0;shellTimers=[];flashTime=0;audio.resume();showMessage('左侧转向 · 右侧前后 · 松开减速',3);break;
    case 'vehiclestopping':clearInput();showMessage('正在刹停，停车后自动下车',2);break;
    case 'vehicleexit':clearInput();setAim(false);driveCameraReady=false;audio.drive?.(null);showMessage('已下车 · 恢复步行操作',2);break;
    case 'vehicleexitblocked':clearInput();showMessage('旁边没有下车空间，请挪动车辆后再试',3);break;
    case 'vehiclehit':battleEffects.vehicleHit(e.point,e.direction,e.speed);audio.vehicleImpact(e.point,e.speed);showMessage(e.fatal?'车辆撞击 · 击败敌人':'车辆撞击 · 敌人倒地',1.6);break;
    case 'bodylanding':battleEffects.bodyLanding(e.point,e.speed);break;
    case 'vehiclewater':battleEffects.waterEntry(e.point,e.speed);audio.waterImpact(e.point);break;
    case 'vehiclesinking':if(match.vehicle===e.vehicle){clearInput();audio.tone(220,.16,.05);}break;
    case 'drowning':audio.tone(170,.18,.055);break;
    case 'drowned':clearInput();audio.tone(82,.5,.08);break;
    case 'fire':{
      models?.fire(match.weapon);
      audio.shot(e.weapon);weaponRecoil.kick(match.weapon,Math.random()*2-1);flashTime=.018;
      const gun=models.roots[match.weapon];gun.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      const muzzle=viewPointToWorld(gun.userData.muzzle.clone().applyMatrix4(gun.matrixWorld),viewCamera,camera);battleEffects.muzzle(muzzle);
      models.flash.position.copy(gun.userData.muzzle).applyMatrix4(gun.matrixWorld);models.flash.visible=!(aim&&e.weapon==='sniper');
      if(e.weapon==='rifle')ejectCasing(2);else if(e.weapon==='sniper')shellTimers.push({slot:0,time:.48});
      break;
    }
    case 'impact':{
      if(e.hit){hitTime=.18;audio.tone(e.headshot?1250:800,.045,.025);}
      battleEffects.impact(e.point,e.normal,e.surface,e.hit);
      break;
    }
    case 'kill':{
      hitTime=.32;const div=document.createElement('div');div.className='kill-entry';
      div.innerHTML=`<b>${e.cause==='vehicle'?'车辆撞击':e.headshot?'精准爆头':'击败敌人'}</b> 你 <span>›</span> 巡逻兵 ${String(e.enemy.id+1).padStart(2,'0')}`;$('killFeed').prepend(div);setTimeout(()=>div.remove(),5500);
      if(e.headshot)showMessage('精准爆头',1.3);if(match.kills%4===0&&match.medkits<5){match.medkits++;showMessage('医疗包补给 +1',2);}
      break;
    }
    case 'explosion':battleEffects.explosion(e.point,{vehicle:e.vehicle});if(e.hits){hitTime=.35;audio.tone(850,.06,.035);}if(Math.hypot(match.player.x-e.point.x,match.player.z-e.point.z)<35)weaponRecoil.kick(1);break;
    case 'targetlocked':audio.lockSuccess();battleFeedback.locked(e.enemy,match.grenadeLock.distance);break;
    case 'enemyfire':{
      const actor=enemyMeshes[e.enemy.id];actor.position.set(e.enemy.x,e.enemy.y,e.enemy.z);actor.rotation.y=e.enemy.yaw;actor.userData.fire();const p=actor.userData.muzzleWorld();audio.enemyShot(p);battleEffects.muzzle(p);break;
    }
    case 'hurt':damageFlash=e.armourDamage>0?.35:.7;if(e.armourBroken)showMessage('防弹衣已破损',2.2);if(e.source==='安全区外')showMessage('安全区外 · 生命值持续下降',1.2);if(e.armourDamage>0)audio.tone(110,.04,.018);break;
    case 'reload':setAim(false);currentActionTotal=e.duration;audio.reload();break;
    case 'reloaded':audio.tone(510,.04,.035);break;
    case 'heal':currentActionTotal=3;showMessage('正在使用医疗包',1.6);break;
    case 'healed':showMessage('生命值恢复 +65',2);audio.tone(780,.1,.035);break;
    case 'switch':adsBlend=0;setAim(false);audio.tone(310,.04,.035);break;
    case 'jump':audio.footstep(footSurface(match.player,match.colliders),.09);break;
    case 'finish':finish(e.win,e.cause);break;
    case 'trainingcomplete':showMessage('训练目标已重置',2.5);break;
  }
  if(match&&renderer)updateHUD();
}
function updateHUD(){
  updateVehicleUI();
  $('aimTouchLabel').textContent=match.weapon===1?'锁定瞄准':'开镜';$('aimTouch').setAttribute('aria-label',match.weapon===1?'锁定瞄准':'开镜');
  const p=match.player,w=WEAPONS[match.weapon],a=match.ammo[match.weapon];
  $('hpNumber').textContent=Math.ceil(p.hp);$('hpBar').style.width=`${p.hp}%`;$('hpBar').style.background=p.hp<30?'#d98362':'#dde5bd';
  $('armourNumber').textContent=Math.ceil(p.armour);$('armourBar').style.width=`${p.armour}%`;$('armourBar').style.background=p.armour>25?'#91cde8':'#dfb675';
  $('armourState').textContent=p.armour<=0?'已破损':p.armour<=25?'受损':p.armour===100?'完好':'防护中';$('armourStatus').classList.toggle('broken',p.armour<=0);$('armourTrack').setAttribute('aria-valuenow',Math.ceil(p.armour));
  $('medkitLabel').textContent=`医疗包 × ${match.medkits}`;$('healButton').disabled=match.medkits===0||p.hp===100;
  $('alive').textContent=match.enemies.filter(e=>e.alive).length;$('kills').textContent=match.kills;
  $('weaponName').textContent=w.name;$('weaponTag').textContent=w.tag;$('mag').textContent=String(a.mag).padStart(2,'0');$('reserve').textContent=match.mode==='training'?'∞':a.reserve;
  for(const b of document.querySelectorAll('[data-slot]'))b.classList.toggle('selected',+b.dataset.slot===match.weapon);
  $('zoneLabel').textContent=match.mode==='training'?'训练 · 无安全区':`安全区 · ${Math.ceil(match.zoneRadius)} m`;
  $('zoneWarning').hidden=match.mode==='training'||Math.hypot(p.x-match.zoneCenter.x,p.z-match.zoneCenter.z)<=match.zoneRadius;
  const action=match.reloadTime>0?match.reloadTime:match.healTime;
  $('actionProgress').hidden=action<=0;$('actionLabel').textContent=match.reloadTime>0?'换弹中':'使用医疗包';$('actionBar').style.width=`${clamp(1-action/currentActionTotal,0,1)*100}%`;
  if(aim&&w.id==='sniper'){
    const d=aimDistance(camera.position,camera.getWorldDirection(new THREE.Vector3()),450,match.colliders,match.enemies);
    $('scopeRange').textContent=d>=449?'测距 450 m +':`测距 ${Math.round(d)} m`;$('breathLabel').textContent=touch?'8× 瞄准 · 稳定射击':keys.ShiftLeft&&breath>0?`屏息中 · ${breath.toFixed(1)} s`:'按住 Shift 屏息稳定';
  }
}
function drawMap(){
  const c=$('minimap'),ctx=c.getContext('2d'),s=c.width;ctx.drawImage(world.mapCanvas,0,0,s,s);
  const point=(x,z)=>[(x/640+.5)*s,(z/640+.5)*s];
  if(match.mode==='survival'){
    const [zx,zz]=point(match.zoneCenter.x,match.zoneCenter.z);
    ctx.fillStyle='#52698142';ctx.beginPath();ctx.rect(0,0,s,s);ctx.arc(zx,zz,match.zoneRadius/640*s,0,Math.PI*2,true);ctx.fill('evenodd');
    ctx.strokeStyle='#dee9c0d9';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(zx,zz,match.zoneRadius/640*s,0,Math.PI*2);ctx.stroke();
  }
  const p=match.player;
  for(const e of match.enemies){if(!e.alive||match.mode==='survival'&&(!e.alert||Math.hypot(e.x-p.x,e.z-p.z)>85))continue;const [x,z]=point(e.x,e.z);ctx.fillStyle='#e9a47c';ctx.beginPath();ctx.arc(x,z,2.6,0,Math.PI*2);ctx.fill();}
  for(const car of match.fleet.cars){const [cx,cz]=point(car.x,car.z);ctx.save();ctx.translate(cx,cz);ctx.rotate(-car.yaw);ctx.fillStyle=car.id===match.fleet.driverId?'#f4d99c':'#92c9df';ctx.fillRect(-2,-3,4,6);ctx.restore();}
  const [x,z]=point(p.x,p.z);ctx.save();ctx.translate(x,z);ctx.rotate(-p.yaw);ctx.fillStyle='#f4d99c';ctx.strokeStyle='#243728';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(4.5,4);ctx.lineTo(0,2);ctx.lineTo(-4.5,4);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  ctx.fillStyle='#eef1d0';ctx.font='11px Barlow,sans-serif';ctx.textAlign='center';ctx.fillText('N',s/2,15);
}
const compassMarks=[];
for(let i=0;i<24;i++){const el=document.createElement('span');el.className=`mark ${i%6===0?'cardinal':''}`;el.textContent=i%6===0?['N','E','S','W'][i/6]:String(i*15);$('compassMarks').append(el);compassMarks.push(el);}
function updateCompass(){const bearing=(((-match.player.yaw*180/Math.PI)%360)+360)%360;$('bearing').textContent=String(Math.round(bearing)%360).padStart(3,'0');compassMarks.forEach((el,i)=>{const d=((i*15-bearing+540)%360)-180;el.style.left=`${d*2.5}px`;el.style.display=Math.abs(d)<100?'block':'none';});}

function fire(){
  if(match.vehicle||match.swimming||match.vault)return;
  const w=WEAPONS[match.weapon],p=match.player;
  camera.getWorldDirection(rayDir);const spread=w.id==='sniper'?(aim?.0001:.009):w.id==='rifle'?(aim?.0018:.008):.002;
  const forward=Math.hypot(joy.forward,joy.strafe)||keys.KeyW||keys.KeyA||keys.KeyS||keys.KeyD;
  rayDir.x+=(Math.random()-.5)*spread*(forward?2:1);rayDir.y+=(Math.random()-.5)*spread*(forward?2:1);rayDir.z+=(Math.random()-.5)*spread;rayDir.normalize();
  const gun=models.roots[match.weapon];gun.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const muzzle=viewPointToWorld(gun.userData.muzzle.clone().applyMatrix4(gun.matrixWorld),viewCamera,camera);
  const shot=shotFromMuzzle(camera.position,rayDir,muzzle,w.range,[...match.colliders,...match.windows.filter(w=>!w.broken)],match.enemies);
  match.shoot(shot.direction,shot.origin);
}
function updateDrivingCamera(dt){
  if(swimView)swimView.group.visible=false;
  const car=match.vehicle;
  if(Math.abs(car.speed)>3&&!lookControls?.interacting)driveLookYaw=THREE.MathUtils.damp(driveLookYaw,0,.7,dt);
  const angle=car.yaw+driveLookYaw,elevation=.32+driveLookPitch,target=new THREE.Vector3(car.x,car.y+1.15,car.z),desired=new THREE.Vector3(car.x+Math.sin(angle)*6.3*Math.cos(elevation),target.y+Math.sin(elevation)*6.3,car.z+Math.cos(angle)*6.3*Math.cos(elevation));
  desired.y=Math.max(desired.y,terrainSurfaceAt(desired.x,desired.z)+.7);
  if(car.inWater)desired.y=Math.max(desired.y,WATER_LEVEL+.9);
  const vector=desired.clone().sub(target),distance=vector.length();vector.normalize();const cut=terrainRay(target,vector,distance,match.colliders.filter(c=>c!==car.collider),.25);desired.copy(target).addScaledVector(vector,Math.max(.28,cut-.28));desired.y=Math.max(desired.y,terrainSurfaceAt(desired.x,desired.z)+.45);
  if(car.inWater)desired.y=Math.max(desired.y,WATER_LEVEL+.65);
  if(!driveCameraReady){camera.position.copy(desired);driveCameraReady=true;}else camera.position.lerp(desired,1-Math.exp(-10*dt));
  camera.lookAt(target);camera.fov=74;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);adsBlend=0;
  models.roots.forEach(root=>root.visible=false);models.flash.visible=false;$('scope').hidden=true;$('grenadeLock').hidden=true;$('aimReadout').hidden=true;$('crosshair').hidden=true;aimOverlay.update({active:false});
}
function updateCamera(dt){
  if(match.vehicle){footstepContacts.reset();updateDrivingCamera(dt);return;}
  if(match.vault){
    footstepContacts.reset();const p=match.player,t=match.vault.age/match.vault.duration;camera.position.set(p.x,p.y,p.z);camera.rotation.set(p.pitch-Math.sin(t*Math.PI)*.06,p.yaw,Math.sin(t*Math.PI*2)*.018,'YXZ');camera.fov=75;camera.updateProjectionMatrix();adsBlend=0;
    models.roots.forEach(root=>root.visible=false);models.flash.visible=false;for(const id of ['scope','grenadeLock','aimReadout','crosshair'])$(id).hidden=true;aimOverlay.update({active:false});swimView.vaultPose(t,viewCamera.aspect);return;
  }
  const p=match.player,w=WEAPONS[match.weapon];
  const swimming=match.swimming,handFov=swimming?swimViewFov(viewCamera.aspect):weaponViewFov(viewCamera.aspect);
  if(viewCamera.fov!==handFov){viewCamera.fov=handFov;viewCamera.updateProjectionMatrix();}
  if(swimming!==swimWasActive){
    swimWasActive=swimming;setAim(false);adsBlend=0;weaponRecoil.reset();shellTimers=[];flashTime=0;fireHeld=false;fireLatched=false;touchCrouch=false;updateVehicleUI();
  }
  const moving=state==='playing'&&(Math.hypot(joy.forward,joy.strafe)>.05||keys.KeyW||keys.KeyS||keys.KeyA||keys.KeyD),sprinting=!!(keys.ShiftLeft&&!aim&&!swimming);
  stepTime+=dt*(moving?(sprinting?14:9):0);const bob=swimming?Math.sin((swimView?.phase||0)*Math.PI*2)*.012:moving&&p.jump===0?Math.sin(stepTime)*.028*(aim?.18:1):0;
  const steady=aim&&(touch||keys.ShiftLeft&&breath>0);if(aim&&keys.ShiftLeft&&state==='playing')breath=Math.max(0,breath-dt);else breath=Math.min(6,breath+dt*1.3);
  const sway=aim?(steady?.00022:.0013):.0002;
  weaponRecoil.update(dt);recoil=weaponRecoil.pitch;recoilSide=weaponRecoil.yaw;
  camera.position.set(p.x,p.y+bob,p.z);camera.rotation.set(p.pitch+recoil+Math.sin(elapsed*.92)*sway,p.yaw+recoilSide+Math.sin(elapsed*.76)*sway,0,'YXZ');
  adsBlend=THREE.MathUtils.damp(adsBlend,aim&&match.reloadTime<=0?1:0,18,dt);
  const targetFov=zoomFov(sprinting&&moving&&!aim?79:75,1+(w.zoom-1)*adsBlend);camera.fov=targetFov;camera.updateProjectionMatrix();
  const scopeActive=aim&&w.id==='sniper'&&adsBlend>.88;$('scope').hidden=!scopeActive;$('crosshair').hidden=aim||swimming;
  const lock=match.updateGrenadeLock(dt,camera.position,camera.getWorldDirection(new THREE.Vector3()),aim&&state==='playing'),marker=$('grenadeLock');
  audio.trackLock(dt,state==='playing'?lock:null);
  marker.hidden=lock.targetId===null;
  if(!marker.hidden){
    const enemy=match.enemies.find(e=>e.id===lock.targetId),point=new THREE.Vector3(enemy.x,enemy.y+ENEMY_BODY.lock,enemy.z).project(camera),size=clamp(innerHeight*ENEMY_BODY.height/(2*Math.tan(camera.fov*Math.PI/360)*lock.distance),38,140);
    marker.hidden=Math.abs(point.x)>1||Math.abs(point.y)>1||point.z>1;marker.style.left=`${(point.x*.5+.5)*100}%`;marker.style.top=`${(-point.y*.5+.5)*100}%`;marker.style.width=`${size*.7}px`;marker.style.height=`${size}px`;marker.classList.toggle('locked',lock.locked);
    $('lockLabel').textContent=lock.locked?`✓ 锁定成功 · ${Math.round(lock.distance)} m`:`锁定中 ${Math.round(lock.progress*100)}%`;$('lockProgress').style.width=`${lock.progress*100}%`;
  }
  $('aimReadout').hidden=!aim||w.id==='sniper';$('aimReadout').textContent=w.id==='grenade'?(lock.locked?'GL-6 · 已锁定 · 开火追踪':lock.targetId!==null?'GL-6 · 保持瞄准，正在锁定':`GL-6 · 对准敌人 ${GRENADE_LOCK_TIME.toFixed(1)} 秒锁定`):`${w.short} · 机械瞄准`;
  aimOverlay.update({active:aim&&(w.id!=='sniper'||scopeActive),mode:w.id,fov:camera.fov,width:innerWidth,height:innerHeight,pixelRatio:graphicsRatio,opacity:Math.min(1,adsBlend*2)});
  const contact=footstepContacts.update(dt,p,{active:state==='playing',moving,swimming,sprinting});if(contact)audio.footstep(footSurface(p,match.colliders),contact.crouching?.055:contact.sprinting?.15:.11,contact.side);
  models.roots.forEach((g,i)=>{
    g.visible=i===match.weapon&&!scopeActive&&!swimming;const ads=adsBlend,reload=match.reloadTime>0;
    const rest=weaponViewPosition(viewCamera.aspect),y=rest.y+Math.sin(stepTime)*.006-(reload?.13*Math.sin(match.reloadTime*1.7):0);
    g.position.set(rest.x+Math.cos(stepTime*.5)*.004,y,rest.z).lerp(g.userData.aimPose.position,ads);g.position.z+=weaponRecoil.slide;
    g.quaternion.setFromEuler(new THREE.Euler(0,-.035,.008*Math.sin(stepTime*.5))).slerp(g.userData.aimPose.quaternion,ads);g.rotateX(weaponRecoil.lift+(reload?.20*Math.sin(match.reloadTime*1.6):0));g.rotateY(recoilSide);
  });
  models.update(dt,match);
  const gun=models.roots[match.weapon];gun.updateMatrixWorld(true);
  flashTime=Math.max(0,flashTime-dt);models.flash.visible=flashTime>0&&!swimming&&!(aim&&w.id==='sniper');models.flash.position.copy(gun.userData.muzzle).applyMatrix4(gun.matrixWorld);models.flash.material.rotation=Math.random()*6.3;
  if(swimView?.update(dt,{active:swimming&&p.hp>0&&(state==='playing'||state==='paused'),moving,aspect:viewCamera.aspect})&&state==='playing'){
    const side=swimView.strokeHand==='L'?-1:1,point={x:p.x-Math.sin(p.yaw)*.48+Math.cos(p.yaw)*side*.15,y:WATER_LEVEL,z:p.z-Math.cos(p.yaw)*.48-Math.sin(p.yaw)*side*.15};battleEffects.impact(point,{x:0,y:1,z:0},'water',false);
    audio.swimStroke(swimView.strokeHand,moving);
  }
}
function updateEnemies(dt){
  match.enemies.forEach((e,i)=>{
    const m=enemyMeshes[i];m.position.set(e.x,e.y,e.z);m.rotation.y=e.yaw;
    const groundAt=(x,z)=>{const y=walkHeight(x,z,match.colliders,e.y);return y>heightAt(x,z)+.05?y:terrainSurfaceAt(x,z);};
    if(!e.alive){m.userData.fall(dt,groundAt,e.blast,match.colliders);return;}
    if(m.userData.deathTime>0)m.userData.reset();m.rotation.z=0;m.rotation.x=0;
    if(e.blast){m.userData.stagger(dt,e.blast,groundAt,match.colliders);return;}
    m.userData.rig.position.y=.95;m.userData.rig.rotation.set(0,0,0);m.userData.animate(dt,e,{distance:m.position.distanceTo(camera.position),groundAt});
  });
}
function updateProjectiles(){
  while(projectileMeshes.length<match.grenades.length){const mesh=new THREE.Mesh(battleEffects.grenadeGeometry,battleEffects.grenadeMaterial);scene.add(mesh);projectileMeshes.push(mesh);}
  while(projectileMeshes.length>match.grenades.length)scene.remove(projectileMeshes.pop());
  match.grenades.forEach((g,i)=>{projectileMeshes[i].position.set(g.x,g.y,g.z);projectileMeshes[i].quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(g.vx,g.vy,g.vz).normalize());});
}
function ejectCasing(slot){
  const gun=models.roots[slot];gun.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const position=viewPointToWorld(gun.userData.eject.clone().applyMatrix4(gun.matrixWorld),viewCamera,camera);
  const velocity=new THREE.Vector3((slot===0?1.2:2.5)+Math.random()*.7,.9+Math.random()*.7,.35).applyQuaternion(camera.quaternion);
  battleEffects.casing(position,velocity,WEAPONS[slot].ammo);
}
function clearEffects(){battleEffects?.clear();shellTimers=[];projectileMeshes.forEach(m=>scene.remove(m));projectileMeshes=[];}

function renderFrame(now){
  const rawDt=(now-last)/1000,dt=Math.min(rawDt,.06);last=now;elapsed+=dt;
  if(state==='playing'){
    const p=match.player;
    const drive=drivingControls.sample(),input={forward:(keys.KeyW?1:0)-(keys.KeyS?1:0)+joy.forward,strafe:(keys.KeyD?1:0)-(keys.KeyA?1:0)+joy.strafe,sprint:!!keys.ShiftLeft||Math.hypot(joy.forward,joy.strafe)>.94,crouch:keys.KeyC||touchCrouch,jump:keys.Space||touchJump,aim,vehicleThrottle:(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)+drive.throttle,vehicleSteer:(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+drive.steer};
    match.update(dt,input);touchJump=false;keys.Space=false;updateCamera(dt);updateEnemies(dt);updateProjectiles();
    if(fireHeld&&(!fireLatched||WEAPONS[match.weapon].id==='rifle')){fire();fireLatched=true;}
    if(!fireHeld)fireLatched=false;
    uiTimer+=dt;mapTimer+=dt;
    if(uiTimer>.10){updateHUD();updateCompass();uiTimer=0;}if(mapTimer>.18){drawMap();mapTimer=0;}
    if(match.mode==='training'){const a=match.ammo[match.weapon];a.reserve=Math.max(a.reserve,WEAPONS[match.weapon].reserve);}
    if(touch&&match.time>10)$('lookHint').hidden=true;
  }else if(state==='lobby'){
    camera.position.set(-79,heightAt(-79,159)+5.9,159);camera.lookAt(14+Math.sin(elapsed*.045)*7,6,-31);
    camera.fov=66;camera.updateProjectionMatrix();models.roots.forEach(m=>m.visible=false);models.flash.visible=false;if(swimView)swimView.group.visible=false;
    if(match){match.updateBlasts(dt);updateEnemies(dt);}
  }else if(state==='result'){
    match.updateAftermath(dt);if(match.vehicle)updateDrivingCamera(dt);updateEnemies(dt);updateProjectiles();
  }
  vehicleViews?.update(state==='paused'?0:dt,match.fleet);
  if(state!=='paused'){
    for(let i=shellTimers.length-1;i>=0;i--){const pending=shellTimers[i];pending.time-=dt;if(pending.time<=0){ejectCasing(pending.slot);audio.bolt();shellTimers.splice(i,1);}}
    if(state==='playing'||state==='result'){battleEffects.waterVehicles(dt,match.fleet.cars);battleEffects.vehicleWrecks(dt,match.fleet.cars);}battleEffects.update(dt,match.bullets);vehicleTrails?.update(dt,match.fleet,{active:state==='playing'});world.updateInteractions(dt,match.fleet,state==='playing'||state==='result');
  }
  audio.drive?.(state==='playing'?match.vehicle:null);audio.horn?.(state==='playing'&&!!match.vehicle&&!match.vehicle.stalled&&(keys.KeyB||drivingControls.honking));
  battleFeedback.update(dt,{state,match});
  camera.getWorldDirection(rayDir);audio.listener(camera.position,rayDir);
  enemyChatter.update(dt,match,{active:state==='playing',enabled:config.sound});
  vocalReactions.update(dt,match,{active:state==='playing',enabled:config.sound,aftermath:state==='result'});
  world.update(elapsed,camera);syncWeaponLighting(camera,world,viewScene,gunLight);
  if(hdTextures)hdTextures.update(dt,{camera,weapon:match.weapon,world:data,enemies:match.enemies,zoom:aim?WEAPONS[match.weapon].zoom:1});
  damageFlash=Math.max(0,damageFlash-dt*.55);$('damageVignette').style.opacity=damageFlash;hitTime=Math.max(0,hitTime-dt);$('hitMarker').style.opacity=hitTime>0?1:0;
  if(messageTime>0){messageTime-=dt;if(messageTime<=0)$('message').style.opacity='0';}
  renderer.clear();renderer.render(scene,camera);
  if((state==='playing'||state==='paused'||state==='result')&&!match.vehicle){renderer.clearDepth();renderer.render(viewScene,viewCamera);}
  frameTime+=rawDt;frameCount++;if(frameTime>1){$('fpsLabel').textContent=`${Math.round(frameCount/frameTime)} FPS`;frameTime=0;frameCount=0;}
}
function startupFailed(error,message='无法建立 3D 战场，请点击重新部署。'){
  console.error('Game failed',error);ready=false;state='lobby';hdTextures?.setEnabled(false);audio.setActive(false);if(match)match.running=false;clearInput();deployment.fail(message);
}
function animate(now){
  if(deployment.status==='failed')return;
  try{renderFrame(now);requestAnimationFrame(animate);}catch(error){startupFailed(error,'战场绘制失败，请点击重新部署。');}
}
function resize(){if(!renderer)return;const w=innerWidth,h=innerHeight,size=renderSizing(w,h,{quality:config.quality,pixelRatio:devicePixelRatio,mobile:touch,maxSize:renderer.capabilities.maxTextureSize});graphicsRatio=size.ratio;renderer.setPixelRatio(graphicsRatio);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();viewCamera.aspect=w/h;viewCamera.fov=weaponViewFov(w/h);viewCamera.updateProjectionMatrix();$('graphicsLabel').title=`${renderer.domElement.width} × ${renderer.domElement.height}`;}
function activateDetails(){
  const high=config.quality==='high';hdTextures?.setEnabled(high);
  if(ready&&high){
    hdTextures?.start();
    if(!skyUpgraded&&!skyDetailPromise)skyDetailPromise=loadSkyDetail().then(sky=>{if(config.quality!=='high'||!ready){sky.dispose();return;}const previous=activeSky;activeSky=sky;const previousEnvironment=environmentTarget;environmentTarget=lightFromSky(renderer,scene,viewScene,sky);world.setSky(sky);previousEnvironment?.dispose();previous?.dispose();skyUpgraded=true;}).catch(()=>{}).finally(()=>{skyDetailPromise=null;});
  }
}
function applyQuality(){if(!renderer||!world)return;renderer.shadowMap.enabled=config.quality!=='low';world.setQuality(config.quality);activateDetails();resize();}

// Buttons and keyboard are handled through the same Match actions.
const pauseControls=new PauseControls($('pauseButton'),{document,window,isPlaying:()=>state==='playing',onPause:pause,onClear:clearInput,isTouch:()=>touch});
deployment.bindEnter(startMatch);$('resume').addEventListener('click',resume);$('leave').addEventListener('click',lobby);$('restart').addEventListener('click',startMatch);$('resultLobby').addEventListener('click',lobby);
document.addEventListener('pointerdown',()=>audio.resume(),{passive:true});
$('reloadButton').addEventListener('click',()=>{if(state==='playing')match.reload();});$('healButton').addEventListener('click',()=>{if(state==='playing')match.heal();});
$('fullscreenButton').addEventListener('click',()=>{try{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen?.()?.catch?.(()=>showMessage('当前浏览器不支持全屏',2));}catch{}});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{selectedMode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));}));
document.querySelectorAll('[data-weapon]').forEach(b=>b.addEventListener('click',()=>{selectedWeapon=+b.dataset.weapon;document.querySelectorAll('[data-weapon]').forEach(x=>x.classList.toggle('selected',x===b));}));
document.querySelectorAll('[data-slot]').forEach(b=>b.addEventListener('click',()=>{if(state==='playing')match.switchWeapon(+b.dataset.slot);}));
document.querySelectorAll('.settings-open').forEach(b=>b.addEventListener('click',()=>{
  if(state==='playing')pause();$('settings').hidden=false;$('sensitivity').value=config.sensitivity;$('sensitivityValue').value=Number(config.sensitivity).toFixed(2);$('quality').value=config.quality;$('soundToggle').checked=config.sound;
}));
$('sensitivity').addEventListener('input',e=>$('sensitivityValue').value=Number(e.target.value).toFixed(2));
$('closeSettings').addEventListener('click',()=>$('settings').hidden=true);
$('saveSettings').addEventListener('click',()=>{config.sensitivity=Number($('sensitivity').value);config.quality=$('quality').value;config.sound=$('soundToggle').checked;audio.enabled=config.sound;try{localStorage.setItem('wild-frontier-settings',JSON.stringify(config));}catch{}applyQuality();$('settings').hidden=true;});
$('portraitContinue').addEventListener('click',()=>{document.body.classList.add('portrait-approved');$('rotateNotice').hidden=true;});
window.addEventListener('resize',resize);
document.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('keydown',e=>{
  if(!['playing','paused'].includes(state)||!$('settings').hidden)return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.preventDefault();
  if(e.code==='Escape'){if(e.repeat)return;if(state==='playing')pause();else resume();return;}if(state!=='playing')return;
  if(e.code==='KeyE'){e.preventDefault();if(!e.repeat)interactVehicle();return;}
  if(e.code==='KeyB'&&match.vehicle)audio.resume();
  if(e.code==='KeyF'){e.preventDefault();if(!e.repeat&&!vaultNearby())pickupNearby();return;}
  if(e.code==='KeyR')match.reload();if(e.code==='KeyH')match.heal();if(/^Digit[123]$/.test(e.code))match.switchWeapon(Number(e.code.slice(-1))-1);
  if(e.code==='Space'&&e.repeat)return;keys[e.code]=true;
});document.addEventListener('keyup',e=>keys[e.code]=false);
function look(dx,dy){if(match.vault)return;if(match.vehicle){driveLookYaw-=dx*.0025*config.sensitivity;driveLookPitch=clamp(driveLookPitch-dy*.002*config.sensitivity,-.15,.65);return;}const w=WEAPONS[match.weapon],factor=.00225*config.sensitivity/(aim?w.zoom*.78:1);match.player.yaw-=dx*factor;match.player.pitch=clamp(match.player.pitch-dy*factor,-1.4,1.4);}
function installCanvasInput(){
  lookControls?.destroy();lookControls=new LookControls(renderer.domElement,{
    isActive:()=>state==='playing'&&!match?.vault,onLook:look,
    onPress:button=>{if(button===0){fireHeld=!match.vehicle;fireLatched=false;}if(button===2&&!match.vehicle)setAim(!aim);},
    onRelease:()=>{fireHeld=false;fireLatched=false;},onUnlock:()=>{if(state==='playing')pause();},
    onMode:mode=>{if(state==='playing'&&mode==='cursor')showMessage('移动鼠标瞄准 · 点击战场锁定鼠标',3);}
  });
  document.addEventListener('wheel',e=>{if(state==='playing'){e.preventDefault();match.switchWeapon((match.weapon+(e.deltaY>0?1:2))%3);}},{passive:false});
}
const joyEl=$('joystick');
function moveJoystick(e){const r=joyEl.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,max=r.width*.34,len=Math.hypot(dx,dy),f=Math.min(1,max/Math.max(len,.1)),x=dx*f,z=dy*f;joy.strafe=x/max;joy.forward=-z/max;$('joystickKnob').style.transform=`translate(${x}px,${z}px)`;}
joyEl.addEventListener('pointerdown',e=>{if(state!=='playing')return;joyId=e.pointerId;joyEl.setPointerCapture(e.pointerId);moveJoystick(e);e.preventDefault();});joyEl.addEventListener('pointermove',e=>{if(e.pointerId===joyId)moveJoystick(e);});
const resetJoystick=e=>{if(e.pointerId===joyId){joyId=null;joy={forward:0,strafe:0};$('joystickKnob').style.transform='';}};joyEl.addEventListener('pointerup',resetJoystick);joyEl.addEventListener('pointercancel',resetJoystick);
$('fireTouch').addEventListener('pointerdown',e=>{if(state!=='playing')return;e.preventDefault();$('fireTouch').setPointerCapture(e.pointerId);fireHeld=true;fireLatched=false;$('fireTouch').classList.add('pressed');});
for(const type of ['pointerup','pointercancel'])$('fireTouch').addEventListener(type,()=>{fireHeld=false;fireLatched=false;$('fireTouch').classList.remove('pressed');});
$('aimTouch').addEventListener('click',()=>{if(state==='playing')setAim(!aim);});$('jumpTouch').addEventListener('pointerdown',e=>{if(state==='playing'){touchJump=true;e.preventDefault();}});$('crouchTouch').addEventListener('click',()=>{if(state==='playing'){touchCrouch=!touchCrouch;$('crouchTouch').classList.toggle('pressed',touchCrouch);}});

async function boot(){
  let phase='graphics',packReady=false;
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setClearColor('#b9c3c7');renderer.autoClear=false;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.shadowMap.type=THREE.PCFSoftShadowMap;$('viewport').append(renderer.domElement);
    renderer.debug.onShaderError=(gl,program)=>{throw new Error(`Shader compilation failed: ${gl.getProgramInfoLog(program)}`);};
    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();startupFailed(new Error('WebGL context lost'),'设备暂停了 3D 画面，请点击重新部署；也可以在设置中降低画质。');});
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.08,1000);camera.rotation.order='YXZ';
    viewScene=new THREE.Scene();viewCamera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.02,5);viewScene.add(new THREE.HemisphereLight('#b4c5d5','#555446',.28));gunLight=new THREE.DirectionalLight('#ffffff',1.64);gunLight.position.set(-2,4,-3);viewScene.add(gunLight);
    phase='assets';
    await loadStartupPack({mobile:touch,onProgress:(loaded,total,info)=>deployment.progress(info?.phase||'下载战场',loaded,total,'bytes'),onStage:phase=>deployment.progress(phase)});packReady=true;
    if(deployment.status==='failed')return;
    let completed=0;const total=SURFACE_GROUPS+ASSET_GROUPS;const report=()=>deployment.progress('载入战场',++completed,total);
    deployment.progress('载入战场',0,total);
    const [surfaces,assets]=await Promise.all([loadSurfaces(report),loadAssets(report,{mobile:touch})]);
    if(deployment.status==='failed')return;
    phase='graphics';
    deployment.progress('部署山林与湖泊');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(deployment.status==='failed')return;
    data=createWorldData();activeSky=assets.sky;environmentTarget=lightFromSky(renderer,scene,viewScene,assets.sky);world=makeWorld(scene,data,surfaces,config.quality,assets);models=createViewModels(assets,surfaces);models.roots.forEach(m=>viewScene.add(m));viewScene.add(models.flash);swimView=new SwimView(assets.hands,assets.swimArms);viewScene.add(swimView.group);
    match=new Match(data,handleEvent);enemyMeshes=match.enemies.map(e=>{const m=createEnemyModel(e.id,assets,surfaces);scene.add(m);return m;});audio.enabled=config.sound;
    vehicleViews=makeVehicleViews(assets,match.fleet);scene.add(vehicleViews.group);
    vehicleTrails=new VehicleTrails(scene,world.wildGrass,{bridges:data.colliders.filter(c=>c.bridge),outletFor:car=>vehicleViews.exhaust(car)});vehicleTrails.reset(match.fleet);
    hdTextures=new HDTextureStreamer(textureRegistry(assets,surfaces,MODEL_FILES,SURFACE_FILES),{mobile:touch,onStatus:s=>{$('graphicsLabel').textContent=config.quality==='high'?`2K 超清${!s.ready?' · 高清材质准备中':s.total&&s.loaded<s.total?` · 高清材质 ${s.loaded}/${s.total}`:''}`:config.quality==='low'?'流畅画质':'均衡画质';}});applyQuality();installCanvasInput();
    battleEffects=new BattleEffects(scene,audio,{mobile:touch,floorAt:(x,z,y)=>walkHeight(x,z,match.colliders,y)});aimOverlay=new AimOverlay($('aimReticle'));
    world.grass.userData.impacts.onImpact=e=>{if(!e.landing)audio.cactusImpact(e.point,e.speed);battleEffects.impact(e.point,{x:0,y:1,z:0},'earth',false);};
    deployment.progress('准备 3D 画面');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(deployment.status==='failed')return;
    updateHUD();drawMap();last=performance.now();renderFrame(last);
    if(renderer.getContext().isContextLost())throw new Error('WebGL context lost during startup');
    ready=true;if(deployment.ready()){last=performance.now();requestAnimationFrame(animate);setTimeout(()=>{audio.load();audio.loadChatter();audio.loadReactions();},250);setTimeout(activateDetails,400);}
  }catch(e){
    if(phase==='assets'&&packReady)await invalidateStartupCache();
    startupFailed(e,phase==='assets'?(e.message?.startsWith('战场')?e.message:'战场资源读取失败，请点击重新部署。'):'3D 画面未能启动，请点击重新部署；也可以在设置中降低画质。');
  }
}

boot();
