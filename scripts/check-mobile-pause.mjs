import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PauseControls} from '../dist/pause-controls.js';

class Surface extends EventTarget{
  constructor(){super();this.captured=new Set();}
  fire(type,props={}){const e=new Event(type,{cancelable:true});for(const [k,v] of Object.entries(props))Object.defineProperty(e,k,{value:v});this.dispatchEvent(e);return e;}
  setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}releasePointerCapture(id){this.captured.delete(id);}
  getBoundingClientRect(){return {left:600,top:20,right:640,bottom:60};}
}
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const finger={pointerType:'touch',pointerId:7,button:0,clientX:620,clientY:40};
function fixture(touch=true){
  const doc=new Surface(),win=new Surface(),button=new Surface();doc.hidden=false;doc.defaultView=win;button.ownerDocument=doc;
  let playing=true,pauses=0,clears=0,time=100;
  const controls=new PauseControls(button,{document:doc,window:win,isTouch:()=>touch,isPlaying:()=>playing,onPause:()=>{pauses++;playing=false;},onClear:()=>clears++,now:()=>time});
  return {doc,win,button,controls,get playing(){return playing;},get pauses(){return pauses;},get clears(){return clears;},resume(){playing=true;},advance(ms){time+=ms;},down(p=finger){doc.fire('pointerdown',p);return button.fire('pointerdown',p);}};
}
check('a visible mobile blur clears held input without opening the pause screen',()=>{
  const f=fixture();f.doc.fire('pointerdown',finger);f.win.fire('blur');assert.equal(f.playing,true);assert.equal(f.pauses,0);assert.equal(f.clears,1);f.win.fire('resize');assert.equal(f.pauses,0);
});
check('real backgrounding and pagehide pause, and returning does not resume a hidden fight automatically',()=>{
  for(const type of ['visibilitychange','pagehide']){const f=fixture();if(type==='visibilitychange'){f.doc.hidden=true;f.doc.fire(type);}else f.win.fire(type);assert.equal(f.playing,false);assert.equal(f.pauses,1);f.doc.hidden=false;f.doc.fire('visibilitychange');assert.equal(f.playing,false);}
});
check('desktop and actual mouse/keyboard use still pause on blur even on touch-capable computers',()=>{
  const desktop=fixture(false);desktop.win.fire('blur');assert.equal(desktop.pauses,1);
  for(const type of ['pointerdown','pointermove','keydown']){const f=fixture(true);f.doc.fire(type,{pointerType:'mouse',code:'KeyW'});f.win.fire('blur');assert.equal(f.pauses,1);}
});
check('a swipe ending over pause cannot activate it through pointerup or a compatibility click',()=>{
  const f=fixture();f.doc.fire('pointerdown',{...finger,clientX:350});f.button.fire('pointerup',finger);f.button.fire('click',{detail:1,pointerType:'touch'});f.advance(1200);f.button.fire('click',{detail:0,pointerType:'touch'});assert.equal(f.pauses,0);
});
check('a drag beginning on pause remains a drag even if it returns to the original point',()=>{
  const f=fixture();f.down();f.button.fire('pointermove',{...finger,clientX:520});f.button.fire('pointermove',finger);f.button.fire('pointerup',finger);f.button.fire('click',{detail:1});assert.equal(f.pauses,0);assert.equal(f.button.captured.size,0);
});
check('an intentional stationary touch or mouse tap pauses exactly once',()=>{
  for(const pointerType of ['touch','mouse','pen']){const f=fixture();const p={...finger,pointerType};assert.equal(f.down(p).defaultPrevented,true);f.button.fire('pointerup',{...p,clientX:623});f.button.fire('click',{detail:1,pointerType});assert.equal(f.pauses,1);assert.equal(f.button.captured.size,0);}
});
check('cancelled/lost/mismatched pointers and visible blur cannot turn into a late pause',()=>{
  for(const type of ['pointercancel','lostpointercapture','blur']){const f=fixture();f.down();if(type==='blur')f.win.fire(type);else f.button.fire(type,finger);f.button.fire('pointerup',finger);f.button.fire('click',{detail:0});assert.equal(f.pauses,0);}
  const f=fixture();f.down();f.button.fire('pointerup',{...finger,pointerId:9});assert.equal(f.pauses,0);f.button.fire('pointerup',{...finger,clientX:680});assert.equal(f.pauses,0);
});
check('keyboard and assistive activation remain available without double firing a pointer tap',()=>{
  const f=fixture();f.button.fire('click',{detail:0});assert.equal(f.pauses,1);f.resume();f.down();f.button.fire('pointercancel',finger);f.doc.fire('keydown',{code:'Enter'});f.button.fire('click',{detail:0});assert.equal(f.pauses,2);
  const g=fixture();g.win.fire('blur');g.button.fire('click',{detail:0});assert.equal(g.pauses,1,'A visible blur without a button gesture blocked assistive activation');
});
check('destroy removes lifecycle listeners and releases a captured pause gesture',()=>{
  const f=fixture();f.down();f.controls.destroy();assert.equal(f.button.captured.size,0);f.doc.hidden=true;f.doc.fire('visibilitychange');f.win.fire('blur');f.win.fire('pagehide');assert.equal(f.pauses,0);
});
check('the shipped bindings ignore mobile blur and ghost clicks while keeping the real pause button',()=>{
  const source=fs.readFileSync(new URL('../dist/game.js',import.meta.url),'utf8'),start=source.indexOf('// Buttons and keyboard are handled'),end=source.indexOf("document.addEventListener('contextmenu'",start);
  assert.ok(start>=0&&end>start);const doc=new Surface(),win=new Surface(),nodes=new Map();doc.hidden=false;doc.defaultView=win;doc.querySelectorAll=()=>[];
  const $=id=>{if(!nodes.has(id)){const n=new Surface();n.ownerDocument=doc;nodes.set(id,n);}return nodes.get(id);};let pauses=0,clears=0;
  const context=vm.createContext({PauseControls,document:doc,window:win,$,touch:true,state:'playing',deployment:{bindEnter(){}},startMatch(){},resume(){},lobby(){},resize(){},pause(){pauses++;context.state='paused';},clearInput(){clears++;},audio:{resume(){}}});
  vm.runInContext(source.slice(start,end),context);doc.fire('pointerdown',finger);win.fire('blur');assert.equal(context.state,'playing');assert.equal(clears,1);$('pauseButton').fire('click',{detail:1,pointerType:'touch'});assert.equal(pauses,0,'A legacy click handler still pauses after a swipe');
  $('pauseButton').fire('pointerdown',finger);$('pauseButton').fire('pointerup',finger);assert.equal(context.state,'paused');assert.equal(pauses,1);
});
console.log(`${passed} pause intent and mobile lifecycle checks passed. These do not replace an iPhone hardware gesture test.`);
