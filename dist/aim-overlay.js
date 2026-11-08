import {reticleLayout,grenadeSightMarks} from './weapon-view.js?v=2.21';

// Only reticle ink is drawn here. The magnified image remains the live 3D
// camera render; there is no picture texture or shared fake scope image.
export class AimOverlay{
  constructor(canvas){this.canvas=canvas;this.context=canvas.getContext('2d');this.width=0;this.height=0;this.ratio=0;}
  update({active,mode,fov,width,height,pixelRatio=1,opacity=1}){
    this.canvas.hidden=!active;if(!active||width<1||height<1)return;
    const ratio=Math.min(8,pixelRatio);
    if(this.width!==width||this.height!==height||this.ratio!==ratio){this.width=width;this.height=height;this.ratio=ratio;this.canvas.width=Math.round(width*ratio);this.canvas.height=Math.round(height*ratio);}
    const ctx=this.context,{x,y,radius,pixelsPerMil}=reticleLayout(width,height,fov);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);ctx.globalAlpha=opacity;
    if(mode==='rifle')return; // The real notch and front post are the reticle.
    ctx.save();ctx.translate(x,y);ctx.strokeStyle=mode==='sniper'?'#101713':'#e4e2cd';ctx.fillStyle=ctx.strokeStyle;ctx.lineCap='butt';
    if(mode==='sniper'){
      ctx.beginPath();ctx.arc(0,0,radius*.94,0,Math.PI*2);ctx.clip();
      ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(-radius,0);ctx.lineTo(radius,0);ctx.moveTo(0,-radius);ctx.lineTo(0,radius);ctx.stroke();
      for(let mil=1;mil<=10;mil++)for(const sign of [-1,1]){
        const p=mil*pixelsPerMil,r=Math.max(.65,pixelsPerMil*.10);ctx.beginPath();ctx.arc(sign*p,0,r,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(0,sign*p,r,0,Math.PI*2);ctx.fill();
      }
      const gap=14*pixelsPerMil;ctx.lineWidth=2.5;ctx.beginPath();for(const sign of [-1,1]){ctx.moveTo(sign*radius,0);ctx.lineTo(sign*gap,0);ctx.moveTo(0,sign*radius);ctx.lineTo(0,sign*gap);}ctx.stroke();
    }else if(mode==='grenade'){
      ctx.shadowColor='#000';ctx.shadowBlur=2;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-11,0);ctx.lineTo(-5,0);ctx.moveTo(5,0);ctx.lineTo(11,0);ctx.stroke();
      ctx.font='10px Barlow,Arial,sans-serif';ctx.textBaseline='middle';
      for(const mark of grenadeSightMarks(width,height,fov)){const offset=mark.y-y,half=11-(mark.distance/50)*1.5;ctx.beginPath();ctx.moveTo(-half,offset);ctx.lineTo(half,offset);ctx.stroke();ctx.fillText(`${mark.distance}`,half+6,offset);}
    }
    ctx.restore();
  }
}
