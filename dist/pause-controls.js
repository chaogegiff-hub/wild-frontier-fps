// A visible mobile page can blur during browser chrome/gesture interaction.
// Visibility/pagehide determine backgrounding; pointer taps determine UI intent.
export class PauseControls{
  constructor(button,{document:doc=button.ownerDocument,window:win=doc.defaultView,isPlaying=()=>true,onPause=()=>{},onClear=()=>{},isTouch=()=>false,now=()=>performance.now()}={}){
    Object.assign(this,{button,doc,win,isPlaying,onPause,onClear,isTouch,now,down:null,lastInput:null,lastPointerAt:-Infinity,bindings:[]});
    const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);this.bindings.push([target,type,fn,options]);};
    listen(doc,'pointerdown',e=>{this.lastInput=e.pointerType||'mouse';},{capture:true,passive:true});
    listen(doc,'pointermove',e=>{if(e.pointerType==='mouse')this.lastInput='mouse';},{capture:true,passive:true});
    listen(doc,'keydown',()=>{this.lastInput='keyboard';},{capture:true});
    listen(win,'blur',()=>{
      if(!this.isPlaying())return;
      const touch=this.lastInput?['touch','pen'].includes(this.lastInput):this.isTouch();
      this.cancel();
      if(this.doc.hidden||!touch)this.onPause();else this.onClear();
    });
    listen(doc,'visibilitychange',()=>{if(this.doc.hidden){this.cancel();if(this.isPlaying())this.onPause();}});
    listen(win,'pagehide',()=>{this.cancel();if(this.isPlaying())this.onPause();});
    listen(button,'pointerdown',e=>{
      this.lastPointerAt=this.now();if(!this.isPlaying()||this.down||e.button>0)return;
      this.down={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
      try{button.setPointerCapture(e.pointerId);}catch{}
      if(e.cancelable)e.preventDefault();
    });
    listen(button,'pointermove',e=>{
      const p=this.down;if(p&&p.id===e.pointerId&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>12)p.moved=true;
    });
    listen(button,'pointerup',e=>{
      const p=this.down;if(!p||p.id!==e.pointerId)return;
      const r=button.getBoundingClientRect(),moved=p.moved||Math.hypot(e.clientX-p.x,e.clientY-p.y)>12;
      this.cancel();if(e.cancelable)e.preventDefault();
      if(!moved&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom&&this.isPlaying())this.onPause();
    });
    for(const type of ['pointercancel','lostpointercapture'])listen(button,type,e=>{if(this.down?.id===e.pointerId)this.cancel();});
    // Pointer taps were already handled on release. Keep keyboard/assistive
    // activation while rejecting compatibility clicks left behind by a swipe.
    listen(button,'click',e=>{
      e.preventDefault();
      const fromTouch=['touch','pen'].includes(e.pointerType)||e.sourceCapabilities?.firesTouchEvents;
      if(!fromTouch&&e.detail===0&&(this.lastInput==='keyboard'||this.now()-this.lastPointerAt>700)&&this.isPlaying())this.onPause();
    });
  }
  cancel(){
    const p=this.down;this.down=null;if(p)this.lastPointerAt=this.now();
    if(p)try{if(this.button.hasPointerCapture?.(p.id))this.button.releasePointerCapture(p.id);}catch{}
  }
  destroy(){this.cancel();for(const [target,type,fn,options] of this.bindings)target.removeEventListener(type,fn,options);this.bindings=[];}
}
