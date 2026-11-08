export class DrivingControls{
  constructor(root,interact,onHorn=()=>{}){
    this.root=root;this.onHorn=onHorn;this.held=new Map();this.hornPointers=new Set();this.buttons=[...root.querySelectorAll('[data-drive]')];
    for(const button of this.buttons){
      button.addEventListener('pointerdown',event=>{
        if(root.getElementById('drivingControls').hidden||button.disabled)return;
        event.preventDefault();button.setPointerCapture?.(event.pointerId);this.held.set(event.pointerId,button);button.classList.add('pressed');
      });
      button.addEventListener('pointermove',event=>{
        const previous=this.held.get(event.pointerId),next=root.elementFromPoint?.(event.clientX,event.clientY)?.closest?.('[data-drive]');
        if(!previous||!next||next.disabled||next===previous)return;
        const group=['left','right'].includes(previous.dataset.drive)?['left','right']:['forward','reverse'];if(!group.includes(next.dataset.drive))return;
        this.held.set(event.pointerId,next);next.classList.add('pressed');if(![...this.held.values()].includes(previous))previous.classList.remove('pressed');
      });
      const release=event=>{const previous=this.held.get(event.pointerId);this.held.delete(event.pointerId);if(previous&&![...this.held.values()].includes(previous))previous.classList.remove('pressed');};
      for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release);
    }
    root.getElementById('vehicleEnter').addEventListener('click',interact);root.getElementById('vehicleExit').addEventListener('click',interact);
    const horn=root.getElementById('vehicleHorn');horn.addEventListener('pointerdown',event=>{if(root.getElementById('drivingControls').hidden||horn.disabled)return;event.preventDefault();horn.setPointerCapture?.(event.pointerId);this.hornPointers.add(event.pointerId);this.renderHorn();this.onHorn(true);});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])horn.addEventListener(type,event=>{this.hornPointers.delete(event.pointerId);this.renderHorn();this.onHorn(this.honking);});
  }
  get honking(){return this.hornPointers.size>0;}
  renderHorn(){const h=this.root.getElementById('vehicleHorn');h.classList.toggle('pressed',this.honking);h.setAttribute?.('aria-pressed',String(this.honking));}
  sample(){const actions=new Set([...this.held.values()].map(button=>button.dataset.drive));return {throttle:Number(actions.has('forward'))-Number(actions.has('reverse')),steer:Number(actions.has('right'))-Number(actions.has('left'))};}
  clear(){this.held.clear();this.hornPointers.clear();this.renderHorn();this.onHorn(false);for(const button of this.buttons)button.classList.remove('pressed');}
  render({playing,active,vehicle,nearby,exitPending=false,drownTime=0}){
    const get=id=>this.root.getElementById(id),driving=!!vehicle;
    this.root.body.classList.toggle('driving',!!active&&driving);
    get('drivingControls').hidden=!playing||!driving;get('vehicleEnter').hidden=!playing||driving||!nearby;
    get('vehicleWaterAlert').hidden=!playing||!vehicle?.inWater;
    if(vehicle){
      get('vehicleSpeed').textContent=Math.round(Math.abs(vehicle.speed)*3.6);get('vehicleGear').textContent=vehicle.stalled?'停':vehicle.speed<-.1?'R':vehicle.speed>.1?'D':'N';get('vehicleName').textContent=vehicle.name;get('vehicleExit').textContent=exitPending?'正在停车…':vehicle.inWater?'下车逃生':'下车';get('vehicleExit').disabled=exitPending;get('vehicleExit').classList.toggle('danger',vehicle.inWater);
      const critical=drownTime>0;get('vehicleWaterAlert').classList.toggle('critical',critical);get('vehicleWaterTitle').textContent=critical?'正在溺水 · 生命值下降':vehicle.sinking?'车辆正在下沉':vehicle.stalled?'发动机进水熄火':'车辆进入水中';get('vehicleWaterText').textContent=critical?'立即点击「下车逃生」，浮出水面停止失血':vehicle.sinking||vehicle.stalled?'尽快下车，游回岸边':'深水会导致沉没，请及时返回岸边';
    }
    for(const button of this.buttons)button.disabled=!!vehicle?.stalled;get('vehicleHorn').disabled=!!vehicle?.stalled;
    if(!playing||!driving||vehicle?.stalled)this.clear();
  }
}
