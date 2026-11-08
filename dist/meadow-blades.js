import * as THREE from './vendor/three.module.js';
import {randomSeed} from './core.js?v=2.21';

// Narrow, curved ribbons sample individual leaves from the existing CC0 photo
// atlas, with curled photographic tufts sharing one 2K sheet at every distance.
export function meadowBlades(variant=0){
  const random=randomSeed(928431+variant*971),position=[],uv=[],indices=[],tuft=[];
  // Image coordinates are top-down because glTF leaf textures keep flipY=false.
  const crops=[[.018,.07,.102,.975],[.145,.175,.275,.975],[.357,.24,.417,.735],[.657,.17,.797,.902],[.910,.025,.998,.990],[.462,.09,.620,.785]];
  for(let blade=0;blade<6;blade++){
    const crop=crops[(blade+variant*2)%crops.length],angle=blade*2.399963+random()*.55,radial=.015+random()*.045,height=blade===0?.42:.22+random()*.20,lean=.08+random()*.19,width=.012+random()*.008,twist=(random()-.5)*.9,start=position.length/3;
    const dx=Math.sin(angle),dz=Math.cos(angle),rootX=dx*radial,rootZ=dz*radial;
    for(let row=0;row<3;row++){
      const t=row/2,bend=t*t,turn=angle+twist*t,sideX=Math.cos(turn),sideZ=-Math.sin(turn),half=width*(row===0?.42:row===1?.50:.025);
      const x=rootX+dx*lean*bend,y=height*(t-Math.max(0,t-.55)**2*.65),z=rootZ+dz*lean*bend;
      for(const side of [-1,1]){position.push(x+sideX*half*side,y,z+sideZ*half*side);uv.push(side<0?crop[0]:crop[2],crop[3]+(crop[1]-crop[3])*t);tuft.push(0);}
    }
    indices.push(start,start+1,start+2,start+1,start+3,start+2,start+2,start+3,start+4,start+3,start+5,start+4);
  }
  // Two offset, curled surfaces carry small photographic grass clusters. Their
  // bowed cross-section and staggered roots avoid a large flat X-shaped card.
  for(let fan=0;fan<2;fan++){
    const start=position.length/3,angle=fan*1.73+variant*.73,cell=(variant+fan*2)%4,height=.23+random()*.035;
    for(let row=0;row<3;row++)for(let column=0;column<4;column++){
      const t=row/2,u=column/3,x=(u-.5)*.40*(.88+.12*Math.sin(t*Math.PI)),y=t*height*(.86+.14*Math.cos((u-.5)*Math.PI)),z=Math.cos((u-.5)*Math.PI)*.10+t*t*.07-.06;
      position.push(Math.cos(angle)*x+Math.sin(angle)*z+(fan?-.04:.04),y,-Math.sin(angle)*x+Math.cos(angle)*z);uv.push((cell+u)/4,1-t);tuft.push(1);
    }
    for(let row=0;row<2;row++)for(let column=0;column<3;column++){const n=start+row*4+column;indices.push(n,n+1,n+4,n+1,n+5,n+4);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('aTurf',new THREE.Float32BufferAttribute(tuft,1));geometry.setIndex(indices);geometry.computeVertexNormals();
  // A grass canopy scatters light upwards, avoiding the dark sheet-like faces
  // produced by treating each thin leaf as an opaque vertical board.
  const normals=geometry.attributes.normal,n=new THREE.Vector3();for(let i=0;i<normals.count;i++){n.fromBufferAttribute(normals,i);if(n.y<0)n.negate();n.lerp(new THREE.Vector3(0,1,0),.35).normalize();normals.setXYZ(i,n.x,n.y,n.z);}
  geometry.computeBoundingBox();geometry.userData={photographicLeaves:6,curvedClusters:2,curvedLeaves:true,variant};return geometry;
}

export function meadowAtlas(source){
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;const texture=new THREE.CanvasTexture(canvas);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;let image;
  const refresh=()=>{if(image===source.image)return;image=source.image;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,2048,1024);
    const crops=[[.018,.07,.084,.905],[.145,.175,.130,.800],[.357,.24,.060,.495],[.657,.17,.140,.732],[.910,.025,.088,.965]];
    for(let cell=0;cell<4;cell++){const random=randomSeed(71143+cell*7381);ctx.save();ctx.beginPath();ctx.rect(cell*512,0,512,1024);ctx.clip();for(let blade=0;blade<40;blade++){const [x,y,w,h]=crops[Math.floor(random()*crops.length)],height=440+random()*570,width=50+random()*85;ctx.save();ctx.translate(cell*512+25+random()*462,1028+random()*22);ctx.rotate((random()-.5)*.75);ctx.drawImage(image,x*image.width,y*image.height,w*image.width,h*image.height,-width/2,-height,width,height);ctx.restore();}ctx.restore();}
    texture.needsUpdate=true;
  };refresh();return {texture,refresh};
}
