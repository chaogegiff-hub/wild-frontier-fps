// Keep deployment clicks independent of the large 3D module and asset downloads.
export function createDeploymentFlow({render,enter,retry,visible=()=>true,schedule=setTimeout,cancel=clearTimeout,timeout=30000}){
  let state={status:'loading',phase:'正在载入战场',loaded:0,total:0,unit:'resources',requested:false,error:''},timer;
  const notify=()=>render({...state});
  function armTimeout(){
    cancel(timer);
    timer=schedule(()=>{
      if(!visible()){armTimeout();return;}
      fail('资源加载超时，请检查网络后点击重试。');
    },timeout);
  }
  function fail(message){
    cancel(timer);state={...state,status:'failed',requested:false,error:message};notify();
  }
  function flush(){
    if(state.status!=='ready'||!state.requested||!visible()||!enter)return;
    state.requested=false;notify();
    try{enter();}catch(error){console.error('Deployment failed',error);fail('进入战场失败，请点击重试。');}
  }
  notify();armTimeout();
  return {
    get status(){return state.status;},
    request(){
      if(state.status==='failed'){retry();return;}
      state.requested=true;notify();flush();
    },
    progress(phase,loaded=0,total=0,unit='resources'){
      if(state.status!=='loading')return;
      state={...state,phase,loaded,total,unit};notify();armTimeout();
    },
    bindEnter(fn){enter=fn;flush();},
    ready(){
      if(state.status!=='loading')return false;
      cancel(timer);state={...state,status:'ready',phase:'战场已就绪',loaded:0,total:0};notify();flush();return state.status==='ready';
    },
    resume:flush,
    fail
  };
}
