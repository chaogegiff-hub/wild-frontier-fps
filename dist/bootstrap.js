import {createDeploymentFlow} from './startup.js?v=2.21';

const $=id=>document.getElementById(id);
const deployment=createDeploymentFlow({
  visible:()=>!document.hidden,
  retry:()=>location.reload(),
  render(state){
    const loading=state.status==='loading',failed=state.status==='failed';
    $('start').disabled=false;
    $('start').classList.toggle('loading',loading);
    $('start').setAttribute('aria-busy',String(loading));
    $('startText').textContent=failed?'重新部署':loading&&state.requested?'正在部署…':'开始作战';
    const progress=state.unit==='bytes'?` ${(state.loaded/1048576).toFixed(1)} / ${(state.total/1048576).toFixed(1)} MB · ${Math.min(100,Math.floor(state.loaded/state.total*100))}%`:` ${state.loaded}/${state.total}`;
    $('loadLabel').textContent=failed?'点击重试':state.phase+(state.total?progress:'');
    $('bootProgress').hidden=!loading;
    if(state.total){$('bootProgress').max=state.total;$('bootProgress').value=state.loaded;}
    else $('bootProgress').removeAttribute('value');
    $('bootStatus').textContent=loading?(state.phase.includes('本地')?'优先读取已保存的战场资源。':state.requested?'已收到部署请求，加载完成后自动进入。':'优先复用本地资源，可先点击部署。'):'战场已就绪，点击开始作战。';
    $('bootStatus').hidden=failed;
    $('bootError').hidden=!failed;$('bootError').textContent=state.error;
    if(failed){$('lobby').hidden=false;for(const id of ['hud','pauseScreen','result','rotateNotice'])$(id).hidden=true;}
  }
});
window.wildFrontierDeployment=deployment;
$('start').addEventListener('click',()=>deployment.request());
document.addEventListener('visibilitychange',()=>deployment.resume());

// Import failures occur before game.js can run its own startup catch.
import('./game.js?v=2.21').catch(error=>{
  console.error('Game module failed to load',error);
  deployment.fail('游戏文件未能载入，请检查网络后点击重试。');
});
