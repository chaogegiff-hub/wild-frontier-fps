import * as THREE from './vendor/three.module.js';
export const DAYLIGHT={sunIntensity:2.45,ambientIntensity:.72,hazeDensity:.00082,sunRadius:.00465};
export function makeSunnySky(photo,lighting){
  const material=new THREE.ShaderMaterial({name:'clear-day-sky',side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{photoSky:{value:photo},sunDirection:{value:lighting.direction},sunColor:{value:lighting.sunColor},sunRadius:{value:DAYLIGHT.sunRadius}},
    vertexShader:'varying vec3 vSkyRay;void main(){vSkyRay=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`precision highp float;uniform sampler2D photoSky;uniform vec3 sunDirection;uniform vec3 sunColor;uniform float sunRadius;varying vec3 vSkyRay;
    void main(){vec3 ray=normalize(vSkyRay);float elevation=max(0.0,ray.y);vec2 uv=vec2(atan(ray.z,ray.x)*.159154943+.5,asin(clamp(ray.y,-1.0,1.0))*.318309886+.5);vec3 photo=max(vec3(0),texture2D(photoSky,uv).rgb);float luminance=dot(photo,vec3(.2126,.7152,.0722));float neutral=1.0-clamp((photo.b-photo.r)/max(.08,luminance)*1.6,0.0,1.0);float cloud=smoothstep(.42,1.25,luminance)*neutral*.60*smoothstep(-.04,.08,ray.y);
      vec3 atmosphere=mix(vec3(.63,.81,1.00),vec3(.045,.28,.69),pow(elevation,.40));vec3 cloudColor=vec3(.96,1.02,1.08)*(.82+.24*clamp(luminance,0.0,1.5));vec3 color=mix(atmosphere,cloudColor,cloud);float facing=dot(ray,normalize(sunDirection));float disc=smoothstep(cos(sunRadius*1.12),cos(sunRadius*.88),facing);float corona=exp((facing-1.0)*1100.0)*.34+exp((facing-1.0)*80.0)*.035;color+=sunColor*corona;color=mix(color,sunColor*18.0,disc);gl_FragColor=vec4(color,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(850,48,24),material);mesh.name='resident-sunny-sky';mesh.frustumCulled=false;mesh.renderOrder=-100;return mesh;
}
