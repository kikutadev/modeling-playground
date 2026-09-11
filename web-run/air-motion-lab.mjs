import * as T from 'three';
import {createHero,computeAirborneMotion} from './hero.mjs';

const canvas=document.querySelector('#canvas');
const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.shadowMap.enabled=true;
const scene=new T.Scene();scene.background=new T.Color(0xeef0eb);
scene.add(new T.HemisphereLight(0xffffff,0x858b82,2.7));
const key=new T.DirectionalLight(0xffffff,3.0);key.position.set(-4,7,5);key.castShadow=true;scene.add(key);
const fill=new T.DirectionalLight(0xd9e7ff,1.0);fill.position.set(4,2,-4);scene.add(fill);
const hero=createHero();scene.add(hero.root);
const camera=new T.PerspectiveCamera(31,1,.1,100);let view='back';
const timeInput=document.querySelector('#time'),timeOut=document.querySelector('#time-out'),phaseEl=document.querySelector('#phase'),telemetry=document.querySelector('#telemetry');
const body={position:new T.Vector3(),velocity:new T.Vector3(),wall:null,grounded:false,anchor:null,time:0,webHand:0,wallJumpTime:-10,wallJumpFacing:new T.Vector3(0,0,-1),releaseTime:0,assistedReleaseTime:0,zipTime:-10,dodgeTime:-10,landTime:-10,landingUntil:-10,landingStart:-10,landingType:'none'};
const forward=new T.Vector3(0,0,-1),dt=1/60;
function velocityAt(t){return new T.Vector3(0,16-9.8*t,-30);}
function phase(m){return m.climb>.55?'FREE FLIGHT / RISING HOLD':m.apex>.55?'FREE FLIGHT / APEX HOLD':m.fall>.55?'FREE FLIGHT / FALL HOLD':'FREE FLIGHT / HOLD';}
function setCamera(){if(view==='side')camera.position.set(6.2,.3,0);else if(view==='front')camera.position.set(0,.3,-6.2);else camera.position.set(0,.3,6.2);camera.lookAt(0,.05,0);}
function resetAndSimulate(target){
  scene.remove(hero.root);const replacement=createHero();hero.root=replacement.root;hero.handWorld=replacement.handWorld;hero.shotHandWorld=replacement.shotHandWorld;hero.update=replacement.update;scene.add(hero.root);
  const swingMode=new URLSearchParams(location.search).has('swing');
  if(swingMode){
    const applySwingState=s=>{
      const u=T.MathUtils.clamp(s,0,1),theta=T.MathUtils.lerp(-.82,.82,u),rope=5.4;
      body.position.set(0,0,0);body.anchor={point:new T.Vector3(0,rope*Math.cos(theta),rope*Math.sin(theta))};body.webHand=0;
      body.grounded=false;body.wall=null;body.attachTime=-1;body.releaseTime=-10;body.velocity.set(0,30*Math.sin(theta),-30*Math.cos(theta));body.time=u*1.25;
    };
    for(let s=0;s<=target+1e-8;s+=1/90){applySwingState(s);hero.update(body,forward,dt,null,{webPreparing:false,webAim:null});}
    applySwingState(target);hero.update(body,forward,dt,null,{webPreparing:false,webAim:null});
    const label=target<.4?'SWING / DESCEND':target<.6?'SWING / BOTTOM':'SWING / RISE';phaseEl.textContent=label;
    telemetry.textContent=`phase ${target.toFixed(2)} · vy ${body.velocity.y.toFixed(1)} m/s · speed ${body.velocity.length().toFixed(1)} m/s`;timeOut.textContent=`${target.toFixed(2)}`;renderer.render(scene,camera);return;
  }
  // Pre-roll the actual outgoing swing pose so t=0 represents a real WEB release, not a standing reset.
  body.anchor={point:new T.Vector3(-2.2,4.8,-5.4)};body.attachTime=-1;body.releaseTime=-10;body.velocity.set(0,10,-28);
  for(let t=-.5;t<0;t+=dt){body.time=t;hero.update(body,forward,dt,null,{webPreparing:false,webAim:null});}
  body.anchor=null;body.releaseTime=0;body.assistedReleaseTime=0;
  for(let t=0;t<=target+1e-8;t+=dt){body.time=t;body.velocity.copy(velocityAt(t));hero.update(body,forward,dt,null,{webPreparing:false,webAim:null});}
  body.time=target;body.velocity.copy(velocityAt(target));hero.update(body,forward,dt,null,{webPreparing:false,webAim:null});const m=computeAirborneMotion(body,forward);phaseEl.textContent=phase(m);telemetry.textContent=`t ${target.toFixed(2)} s · vy ${body.velocity.y.toFixed(1)} m/s · climb ${m.climb.toFixed(2)} · apex ${m.apex.toFixed(2)} · fall ${m.fall.toFixed(2)}`;timeOut.textContent=`${target.toFixed(2)} s`;renderer.render(scene,camera);
}
function resize(){renderer.setSize(innerWidth,innerHeight-54,false);camera.aspect=innerWidth/Math.max(1,innerHeight-54);camera.updateProjectionMatrix();setCamera();resetAndSimulate(Number(timeInput.value));}
timeInput.addEventListener('input',()=>resetAndSimulate(Number(timeInput.value)));
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));setCamera();resetAndSimulate(Number(timeInput.value));}));
addEventListener('resize',resize);resize();
const params=new URLSearchParams(location.search);if(params.has('view'))view=params.get('view');if(params.has('swing')){timeInput.min='0';timeInput.max='1';timeInput.step='0.01';timeInput.value=params.get('swing')||'.5';}else if(params.has('t'))timeInput.value=params.get('t');setCamera();resetAndSimulate(Number(timeInput.value));globalThis.__airMotionLabReady=true;
