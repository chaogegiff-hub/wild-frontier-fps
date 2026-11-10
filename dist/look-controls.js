// Mouse input is selected from the event, not from touchscreen hardware flags.
// Embedded browsers can refuse pointer lock; absolute cursor deltas still aim.
export class LookControls{
  constructor(canvas,{document:doc=canvas.ownerDocument,isActive=()=>true,onLook=()=>{},onPress=()=>{},onRelease=()=>{},onUnlock=()=>{},onMode=()=>{}}={}){
    Object.assign(this,{canvas,doc,isActive,onLook,onPress,onRelease,onUnlock,onMode,dragging:false,touchId:null,mouseId:null,lastMouse:null,lastTouch:null,wasLocked:false,pending:false,mode:'cursor',bindings:[]});
    const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);this.bindings.push([target,type,fn,options]);};
    if(canvas.style)canvas.style.touchAction='none';
    listen(canvas,'touchmove',e=>{if(this.isActive()&&e.cancelable)e.preventDefault();},{passive:false});
    listen(canvas,'pointerenter',e=>{if(this.mouse(e))this.lastMouse={x:e.clientX,y:e.clientY};});
    listen(canvas,'pointerleave',e=>{if(this.mouse(e)&&!this.dragging)this.lastMouse=null;});
    listen(canvas,'pointerdown',e=>{
      if(!this.isActive())return;
      if(!this.mouse(e)){
        if(this.touchId!==null)return;this.touchId=e.pointerId;this.lastTouch={x:e.clientX,y:e.clientY};this.capture(e.pointerId);if(e.cancelable)e.preventDefault();return;
      }
      this.lastMouse={x:e.clientX,y:e.clientY};this.requestLock();
      if(e.button===0){this.dragging=true;this.mouseId=e.pointerId;this.capture(e.pointerId);}
      this.onPress(e.button);e.preventDefault();
    });
    listen(canvas,'pointermove',e=>{
      if(!this.isActive()){this.lastMouse=null;return;}
      if(this.mouse(e)){
        if(this.locked)return;const previous=this.lastMouse;this.lastMouse={x:e.clientX,y:e.clientY};
        if(previous)this.move(e.clientX-previous.x,e.clientY-previous.y);return;
      }
      if(e.pointerId!==this.touchId)return;const previous=this.lastTouch;this.lastTouch={x:e.clientX,y:e.clientY};
      if(previous)this.move((e.clientX-previous.x)*1.7,(e.clientY-previous.y)*1.7);if(e.cancelable)e.preventDefault();
    });
    listen(doc,'mousemove',e=>{if(this.isActive()&&this.locked)this.move(e.movementX,e.movementY);});
    const release=e=>{
      if(e.pointerId===this.touchId){this.touchId=null;this.lastTouch=null;}
      if(this.mouse(e)&&e.button===0&&this.dragging){this.dragging=false;this.mouseId=null;this.onRelease();}
    };
    listen(canvas,'pointerup',release);listen(doc,'pointerup',release);
    listen(canvas,'pointercancel',e=>{release({...e,pointerId:e.pointerId,pointerType:e.pointerType,button:0});this.lastMouse=null;});
    listen(canvas,'lostpointercapture',e=>{if(!this.locked)release({pointerId:e.pointerId,pointerType:e.pointerType,button:0});});
    listen(doc,'pointerlockchange',()=>{
      const locked=this.locked,previous=this.wasLocked;this.wasLocked=locked;this.pending=false;this.lastMouse=null;this.setMode(locked?'locked':'cursor');
      if(previous&&!locked)this.onUnlock();
    });
    listen(doc,'pointerlockerror',()=>{this.pending=false;this.setMode('cursor');});
  }
  mouse(e){return !e.pointerType||e.pointerType==='mouse';}
  get locked(){return this.doc.pointerLockElement===this.canvas;}
  get interacting(){return this.dragging||this.touchId!==null;}
  capture(id){try{this.canvas.setPointerCapture?.(id);}catch{}}
  move(dx,dy){if(Number.isFinite(dx)&&Number.isFinite(dy)&&(dx||dy))this.onLook(dx,dy);}
  setMode(mode){if(mode!==this.mode){this.mode=mode;this.onMode(mode);}}
  requestLock(){
    if(this.locked||this.pending||!this.canvas.requestPointerLock)return;
    this.pending=true;
    try{
      const result=this.canvas.requestPointerLock();
      if(result?.then)result.then(()=>{this.pending=false;},()=>{this.pending=false;this.setMode('cursor');});else this.pending=false;
    }catch{this.pending=false;this.setMode('cursor');}
  }
  clear(){
    for(const id of [this.touchId,this.mouseId])if(id!==null)try{if(this.canvas.hasPointerCapture?.(id))this.canvas.releasePointerCapture(id);}catch{}
    this.touchId=null;this.mouseId=null;this.lastTouch=null;this.lastMouse=null;this.dragging=false;this.onRelease();
  }
  destroy(){this.clear();for(const [target,type,fn,options] of this.bindings)target.removeEventListener(type,fn,options);this.bindings=[];}
}
