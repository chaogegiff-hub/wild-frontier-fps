import assert from 'node:assert/strict';
import {LookControls} from '../dist/look-controls.js';
class Surface extends EventTarget{
  constructor(){super();this.captured=new Set();this.style={};}
  fire(type,data={}){const event=new Event(type,{cancelable:true});for(const [key,value] of Object.entries(data))Object.defineProperty(event,key,{value});this.dispatchEvent(event);return event;}
  setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}releasePointerCapture(id){this.captured.delete(id);}
}
let passed=0;async function check(name,fn){await fn();console.log('PASS '+name);passed++;}
function setup(lock){const doc=new Surface(),canvas=new Surface(),moves=[],press=[],release=[],modes=[];let active=true,unlocks=0;canvas.ownerDocument=doc;if(lock)canvas.requestPointerLock=lock;
  const controls=new LookControls(canvas,{isActive:()=>active,onLook:(...v)=>moves.push(v),onPress:b=>press.push(b),onRelease:()=>release.push(true),onUnlock:()=>unlocks++,onMode:m=>modes.push(m)});
  return {doc,canvas,controls,moves,press,release,modes,setActive:n=>active=n,get unlocks(){return unlocks;}};
}
const mouse={pointerType:'mouse',pointerId:1,clientX:100,clientY:100,button:0};
await check('embedded mouse hover rotates without pointer lock, a held button, or movementX',()=>{
  const s=setup();s.canvas.fire('pointerenter',mouse);s.canvas.fire('pointermove',{...mouse,clientX:132,clientY:82,movementX:0,movementY:0});assert.deepEqual(s.moves,[[32,-18]]);assert.equal(s.press.length,0);
  s.canvas.fire('pointerleave',mouse);s.canvas.fire('pointerenter',{...mouse,clientX:600});s.canvas.fire('pointermove',{...mouse,clientX:604});assert.deepEqual(s.moves.at(-1),[4,0]);s.controls.destroy();
});
await check('touchscreen-equipped computers still fire, aim and request lock when the event comes from a mouse',async()=>{
  let requests=0;const s=setup(()=>{requests++;return Promise.reject(new Error('Pointer lock disabled in this embed'));});
  s.canvas.fire('pointerdown',mouse);await Promise.resolve();assert.equal(requests,1);assert.deepEqual(s.press,[0]);assert.ok(s.controls.dragging);s.canvas.fire('pointermove',{...mouse,clientX:115});assert.deepEqual(s.moves,[[15,0]]);
  s.canvas.fire('pointerup',mouse);s.doc.fire('pointerup',mouse);assert.equal(s.release.length,1);assert.ok(!s.controls.dragging);
  s.canvas.fire('pointerdown',{...mouse,button:2});assert.equal(s.press.at(-1),2);assert.equal(s.unlocks,0);s.controls.destroy();
});
await check('locked relative movement is applied once and releasing pointer lock reports one pause',()=>{
  const s=setup();s.doc.pointerLockElement=s.canvas;s.doc.fire('pointerlockchange');s.canvas.fire('pointermove',{...mouse,movementX:9,movementY:-4});s.doc.fire('mousemove',{movementX:9,movementY:-4});assert.deepEqual(s.moves,[[9,-4]]);assert.deepEqual(s.modes,['locked']);
  s.doc.pointerLockElement=null;s.doc.fire('pointerlockchange');s.doc.fire('pointerlockchange');assert.equal(s.unlocks,1);s.controls.destroy();
});
await check('touch and pen drag use their own captured pointer without firing or requesting mouse lock',()=>{
  let requests=0;const s=setup(()=>requests++);for(const pointerType of ['touch','pen']){s.canvas.fire('pointerdown',{...mouse,pointerType,pointerId:8});s.canvas.fire('pointermove',{...mouse,pointerType,pointerId:9,clientX:600});s.canvas.fire('pointermove',{...mouse,pointerType,pointerId:8,clientX:120,clientY:90});assert.deepEqual(s.moves.at(-1),[34,-17]);s.canvas.fire('pointerup',{...mouse,pointerType,pointerId:8});}
  assert.equal(requests,0);assert.equal(s.press.length,0);s.controls.destroy();
});
await check('pause and clear stop held fire, ignore movement, and resume with a fresh cursor baseline',()=>{
  const s=setup();s.canvas.fire('pointerdown',mouse);s.controls.clear();assert.ok(!s.controls.interacting);assert.equal(s.canvas.captured.size,0);assert.equal(s.release.length,1);
  s.setActive(false);s.canvas.fire('pointermove',{...mouse,clientX:200});s.doc.fire('mousemove',{movementX:30});assert.equal(s.moves.length,0);s.setActive(true);s.canvas.fire('pointermove',{...mouse,clientX:400});assert.equal(s.moves.length,0);s.canvas.fire('pointermove',{...mouse,clientX:405});assert.deepEqual(s.moves,[[5,0]]);s.controls.destroy();
});
await check('lost capture and cancelled gestures release fire, with no stale pointer after reinstall',()=>{
  const s=setup();s.canvas.fire('pointerdown',mouse);s.canvas.fire('lostpointercapture',mouse);assert.ok(!s.controls.dragging);assert.equal(s.release.length,1);s.canvas.fire('pointerdown',mouse);s.canvas.fire('pointercancel',mouse);assert.equal(s.release.length,2);s.controls.destroy();s.canvas.fire('pointermove',{...mouse,clientX:1000});assert.equal(s.moves.length,0);
});
await check('active touch aiming suppresses page gestures without applying duplicate look movement',()=>{
  const s=setup();assert.equal(s.canvas.style.touchAction,'none');const finger={...mouse,pointerType:'touch',pointerId:11};assert.ok(s.canvas.fire('pointerdown',finger).defaultPrevented);s.canvas.fire('pointermove',{...finger,clientX:120});assert.deepEqual(s.moves,[[34,0]]);assert.ok(s.canvas.fire('touchmove').defaultPrevented);assert.equal(s.moves.length,1);s.setActive(false);assert.equal(s.canvas.fire('touchmove').defaultPrevented,false);s.controls.destroy();
});
console.log(`${passed} actual mouse, embedded fallback, lock lifecycle and touch/pen input checks passed.`);
