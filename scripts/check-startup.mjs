import assert from 'node:assert/strict';
import {createDeploymentFlow} from '../dist/startup.js';

function setup(){
  const updates=[],timers=new Map();let nextTimer=0,entered=0,retried=0,visible=true;
  const flow=createDeploymentFlow({
    render:s=>updates.push(s),enter:()=>entered++,retry:()=>retried++,visible:()=>visible,
    schedule:fn=>{timers.set(++nextTimer,fn);return nextTimer;},cancel:id=>timers.delete(id)
  });
  return {flow,updates,get entered(){return entered;},get retried(){return retried;},
    get latest(){return updates.at(-1);},hide:()=>visible=false,show:()=>visible=true,
    expire(){assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}
  };
}
export function checkStartup(check){
  check('deployment responds while loading and enters once after readiness',()=>{
    const h=setup();h.flow.request();h.flow.request();assert.equal(h.latest.requested,true);assert.equal(h.entered,0);
    h.flow.progress('材质',7,31);assert.equal(h.latest.loaded,7);assert.equal(h.latest.requested,true);
    assert.equal(h.flow.ready(),true);assert.equal(h.entered,1);assert.equal(h.latest.requested,false);
    assert.equal(h.flow.ready(),false);h.flow.resume();assert.equal(h.entered,1);
    h.flow.request();assert.equal(h.entered,2);
  });
  check('deployment waits for foreground without losing the queued click',()=>{
    const h=setup();h.flow.request();h.hide();h.flow.ready();assert.equal(h.entered,0);assert.equal(h.latest.requested,true);
    h.show();h.flow.resume();h.flow.resume();assert.equal(h.entered,1);
  });
  check('load failure stays recoverable and late assets cannot auto-enter',()=>{
    const h=setup();h.flow.request();h.flow.fail('资源失败');assert.equal(h.latest.status,'failed');assert.equal(h.latest.error,'资源失败');
    h.flow.progress('迟到资源',31,31);assert.equal(h.flow.ready(),false);assert.equal(h.entered,0);
    h.flow.request();assert.equal(h.retried,1);
  });
  check('stalled loading times out and retries; hidden tabs retain their request',()=>{
    const h=setup();h.flow.request();h.hide();h.expire();assert.equal(h.latest.status,'loading');
    h.show();h.expire();assert.equal(h.latest.status,'failed');assert.match(h.latest.error,/超时/);
    h.flow.request();assert.equal(h.retried,1);assert.equal(h.entered,0);
  });
  check('readiness without a click keeps the user in the lobby',()=>{
    const h=setup();h.flow.ready();h.flow.resume();assert.equal(h.entered,0);
    h.flow.request();assert.equal(h.entered,1);
  });
}
