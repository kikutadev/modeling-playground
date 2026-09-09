import * as T from 'three';
import {SwingBody,makeCity,chooseAnchor,segmentHit,STEP} from './physics.mjs';
import {applySwingAssist,applyTurnAssist,applyReleaseAssist,releaseWithAssist,performWebZip,shouldAutoReel,DEFAULT_TRAVERSAL_TUNING} from './traversal-assist.mjs';
import {createHero} from './hero.mjs';
import {AirCombat,DRONE_KICK_RANGE,TITAN_SHOT_RANGE,TITAN_THREAT_RANGE} from './combat.mjs';
import {RING_POINTS,crossesRing} from './course.mjs';
import {createCombatView} from './combat-view.mjs';
import './style.css';

const $=selector=>document.querySelector(selector);
const canvas=$('#game');
const touchCapable=matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints>0;
document.documentElement.classList.toggle('touch-input',touchCapable);
const traversalTuning=DEFAULT_TRAVERSAL_TUNING;

const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,touchCapable?1.5:2));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
const scene=new T.Scene();scene.background=new T.Color(0x8daebe);scene.fog=new T.Fog(0x8daebe,120,560);
const camera=new T.PerspectiveCamera(66,1,.1,850);
scene.add(new T.HemisphereLight(0xd1eafa,0x455466,2.4));
const sun=new T.DirectionalLight(0xffd5a2,3.2);sun.position.set(-70,140,-80);sun.castShadow=true;
sun.shadow.mapSize.set(touchCapable?1024:2048,touchCapable?1024:2048);Object.assign(sun.shadow.camera,{left:-85,right:85,top:85,bottom:-85,near:1,far:330});sun.shadow.bias=-.0003;scene.add(sun,sun.target);

const buildings=makeCity(),body=new SwingBody(buildings);
const combat=new AirCombat(buildings),combatView=createCombatView(scene,combat);
const geo=new T.BoxGeometry(1,1,1),mat=color=>new T.MeshStandardMaterial({color,roughness:.88});
const asphalt=mat(0x293e4d),concrete=mat(0x68808b),roof=mat(0x344c5c);
const boxBatches=new Map();
function box(x,y,z,w,h,d,material){if(!boxBatches.has(material))boxBatches.set(material,[]);boxBatches.get(material).push([x,y,z,w,h,d]);}
function buildBoxBatches(){
  const transform=new T.Object3D();
  for(const [material,items] of boxBatches){
    const mesh=new T.InstancedMesh(geo,material,items.length);
    items.forEach(([x,y,z,w,h,d],index)=>{transform.position.set(x,y,z);transform.scale.set(w,h,d);transform.updateMatrix();mesh.setMatrixAt(index,transform.matrix);});
    mesh.receiveShadow=true;mesh.castShadow=true;mesh.computeBoundingSphere();scene.add(mesh);
  }
  boxBatches.clear();
}
box(0,-.35,0,1200,.7,1350,asphalt);
const facadeMats=[0x466b7a,0x6e8388,0x8a9290,0x365766,0x9b8777].map(mat),windows=[];
for(const building of buildings){
  if(building.kind==='atrium'){
    const center=building.box.getCenter(new T.Vector3()),size=building.box.getSize(new T.Vector3());
    box(center.x,center.y,center.z,size.x,size.y,size.z,roof);continue;
  }
  box(building.x,building.h/2,building.z,building.w,building.h,building.d,facadeMats[building.id%5]);
  box(building.x,building.h+.15,building.z,building.w+.5,.3,building.d+.5,roof);
  box(building.x,building.h+1,building.z,4,1.5,5,concrete);box(building.x,.1,building.z,building.w+4,.2,building.d+4,concrete);
  for(let y=4;y<building.h-2;y+=4){
    for(let x=-building.w/2+2;x<building.w/2-1;x+=3.7)for(const side of [-1,1])windows.push([building.x+x,y,building.z+side*(building.d/2+.03),1.3,1.9,.06]);
    for(let z=-building.d/2+2;z<building.d/2-1;z+=3.7)for(const side of [-1,1])windows.push([building.x+side*(building.w/2+.03),y,building.z+z,.06,1.9,1.3]);
  }
}
const winmat=new T.MeshStandardMaterial({color:0xb6d6d7,emissive:0x759da6,emissiveIntensity:.22,roughness:.3,metalness:.5});
const winmesh=new T.InstancedMesh(geo,winmat,windows.length),dummy=new T.Object3D();
windows.forEach((window,index)=>{dummy.position.set(...window.slice(0,3));dummy.scale.set(...window.slice(3));dummy.updateMatrix();winmesh.setMatrixAt(index,dummy.matrix);winmesh.setColorAt(index,new T.Color(index%9===0?0xffdb91:index%4===0?0x456776:0xb6d6d7));});scene.add(winmesh);
const paint=mat(0xd7cba7);for(let z=-620;z<630;z+=12)box(0,.015,z,.16,.025,5,paint);
const carMats=[0xcd775c,0xe0d0b2,0x486576].map(mat);
for(let index=0;index<148;index++){const z=-590+index*8.1,x=index%2?7:-7;box(x,.6,z,1.8,1.1,3.8,carMats[index%3]);box(x,1.3,z+.2,1.65,.5,1.9,roof);}
const lobbyLight=new T.MeshBasicMaterial({color:0xa8fff0});
for(let z=-164;z<=-126;z+=4)box(0,45.9,z,88,.08,.13,lobbyLight);for(const x of [-45.5,45.5])box(x,17.08,-145,.16,.08,42,lobbyLight);
const signCanvas=document.createElement('canvas');signCanvas.width=1024;signCanvas.height=128;
const ink=signCanvas.getContext('2d');ink.fillStyle='#1d3e4b';ink.fillRect(0,0,1024,128);ink.fillStyle='#c1e5db';ink.font='600 62px sans-serif';ink.textAlign='center';ink.fillText('SKY GALLERY',512,88);
const signMap=new T.CanvasTexture(signCanvas);signMap.colorSpace=T.SRGBColorSpace;
const sign=new T.Mesh(new T.PlaneGeometry(40,3.2),new T.MeshBasicMaterial({map:signMap}));sign.position.set(0,48,-122.98);scene.add(sign);
buildBoxBatches();

const hero=createHero();scene.add(hero.root);
const ropeGeo=new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]);
const rope=new T.Line(ropeGeo,new T.LineBasicMaterial({color:0xf5f8ee}));rope.frustumCulled=false;scene.add(rope);
const marker=new T.Mesh(new T.OctahedronGeometry(.42),new T.MeshBasicMaterial({color:0xb5ffee,transparent:true,opacity:.85}));scene.add(marker);
const ringPoints=RING_POINTS;
const rings=ringPoints.map((point,index)=>{
  const points=Array.from({length:64},(_,i)=>{const angle=i/64*Math.PI*2;return new T.Vector3(Math.cos(angle)*8,Math.sin(angle)*8,0);});
  const geometry=new T.BufferGeometry().setFromPoints(points);
  const ring=new T.LineLoop(geometry,new T.LineDashedMaterial({color:index?0x86c9c9:0xffcc86,transparent:true,opacity:index?.08:.28,dashSize:.7,gapSize:.8}));
  ring.computeLineDistances();ring.position.copy(point);scene.add(ring);return ring;
});

let started=false,paused=true,yaw=0,pitch=.13,elapsed=0,checkpoint=0,accumulator=0,last=performance.now(),candidate=null,drag=false,mouseSwing=false,noticeUntil=0,finished=false,failed=false,combatTaught=false,swingTaught=false;
let best=null;try{best=Number(localStorage.getItem('threadline-best-v2'))||null;}catch{}
const keys=new Set(),forward=new T.Vector3(0,0,-1),right=new T.Vector3(1,0,0),mobileMove=new T.Vector2();
let mobileWebHeld=false,lookPointer=null,lookX=0,lookY=0,lookStartX=0,lookStartY=0,lookStartTime=0,movePointer=null,manualLookUntil=-10,pendingWallWeb=null;
let attackHeld=false,attackHoldPointer=null,attackHoldTargetId=null,attackHoldArmAt=-10,attackHoldNextAt=-10;
const cameraTarget=new T.Vector3(),cameraDesired=new T.Vector3(),chaseOffset=new T.Vector3(0,4,9),aimOffset=new T.Vector3(0,1,-4),cameraForward=new T.Vector3(0,0,-1);

function notice(text,seconds=2){$('#notice').textContent=text;noticeUntil=body.time+seconds;}
function direction(){forward.set(-Math.sin(yaw),0,-Math.cos(yaw));right.set(Math.cos(yaw),0,-Math.sin(yaw));}
function movementIntentDirection(){
  const forwardInput=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+(touchCapable?-mobileMove.y:0);
  const rightInput=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+(touchCapable?mobileMove.x:0);
  // Backward input means brake in this traversal scheme; never interpret it as "shoot WEB behind me".
  const travelForward=forwardInput<-.32?0:forwardInput;
  const desired=new T.Vector3().addScaledVector(forward,travelForward).addScaledVector(right,rightInput);
  return desired.lengthSq()>.04?desired.normalize():forward.clone();
}
function anchorOptions(desiredDirection=movementIntentDirection()){return {desiredDirection,velocity:body.velocity,lateralIntent:T.MathUtils.clamp(desiredDirection.dot(right),-1,1),idealRopeLength:traversalTuning.idealRopeLength};}
function chooseTraversalAnchor(desiredDirection=movementIntentDirection()){
  const building=chooseAnchor(body.position,desiredDirection,buildings,body.lastBuildingId,anchorOptions(desiredDirection));
  return combat.webAnchor(body.position,desiredDirection,building);
}
function attachTraversalWeb(desiredDirection=movementIntentDirection()){
  candidate=chooseTraversalAnchor(desiredDirection);
  if(body.attach(candidate,{preload:traversalTuning.attachPreload})){
    if(!swingTaught){swingTaught=true;if(!touchCapable)notice('押して振る。離して飛ぶ。XでWeb Zip。',2.2);}
    tone(560,.055);if(touchCapable)updateContextUI();return true;
  }
  return false;
}
function webInputHeld(){return mobileWebHeld||mouseSwing||keys.has('Space');}
function cancelPendingWallWeb(){pendingWallWeb=null;}
function processPendingWallWeb(){
  const pending=pendingWallWeb;if(!pending||body.time<pending.fireAt)return;
  if(pending.requireHeld&&!webInputHeld()){pendingWallWeb=null;return;}
  const desired=movementIntentDirection();
  if(attachTraversalWeb(desired)){pendingWallWeb=null;return;}
  if(body.time>=pending.expires){pendingWallWeb=null;notice('移動方向に接続先がありません',.9);}
}
function releaseWeb(){const released=releaseWithAssist(body,movementIntentDirection(),traversalTuning);if(released&&touchCapable)updateContextUI();return released;}
function webZip(){if(performWebZip(body,movementIntentDirection(),traversalTuning)){tone(760,.07);if(touchCapable)updateContextUI();return true;}return false;}
function shoot({requireHeld=true}={}){
  if(paused)return;
  const desired=movementIntentDirection();
  if(body.canWallJump){
    body.jump(desired);
    pendingWallWeb={fireAt:body.time+.11,expires:body.time+.46,requireHeld};
    tone(690,.06);return;
  }
  body.jump(desired);
  if(!attachTraversalWeb(desired)&&!webZip())notice('移動方向に接続先がありません',.9);
}
function resetTouchState(){
  mobileMove.set(0,0);mobileWebHeld=false;lookPointer=null;movePointer=null;pendingWallWeb=null;attackHeld=false;attackHoldPointer=null;attackHoldTargetId=null;attackHoldArmAt=-10;attackHoldNextAt=-10;
  $('#move-knob').style.transform='translate(-50%,-50%)';$('#move-stick').classList.remove('is-held');
  $('#mobile-web').classList.remove('is-held');$('#mobile-web').setAttribute('aria-pressed','false');
  const context=$('#mobile-context'),dodge=$('#mobile-dodge');if(context){context.hidden=true;context.classList.remove('is-held');}if(dodge)dodge.hidden=true;
}
function restart(){
  body.reset();combat.reset();combatView.reset();finished=false;failed=false;combatTaught=false;swingTaught=false;yaw=0;pitch=.13;checkpoint=0;elapsed=0;keys.clear();mouseSwing=false;resetTouchState();direction();updateRings();snapCamera();
  if(!touchCapable)notice('SPACEを押して、離して飛ぶ。XでZIP。',3);
}
function updateRings(){rings.forEach((ring,index)=>{ring.visible=index>=checkpoint;ring.material.opacity=index===checkpoint?.28:.06;ring.material.color.setHex(index===checkpoint?0xffcc86:0x86c9c9);});}
function setPause(value){
  paused=value;keys.clear();mouseSwing=false;drag=false;resetTouchState();$('#overlay').hidden=!value;
  if(value&&started&&!failed){
    $('.intro h1').textContent='一時停止';
    $('.intro>p:not(.eyebrow)').textContent='その位置から再開できます。';
    $('#start').innerHTML='再開 <span>↗</span>';
  }
}
$('#start').addEventListener('click',()=>{if(!started||failed){started=true;restart();}setPause(false);canvas.focus();initAudio();});
function toggleWeb(){if(paused)return;if(body.anchor)releaseWeb();else if(pendingWallWeb)cancelPendingWallWeb();else shoot({requireHeld:false});canvas.focus();}
$('#swing-toggle').addEventListener('click',toggleWeb);$('#pause').addEventListener('click',()=>setPause(!paused));

window.addEventListener('keydown',event=>{
  if(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.code))event.preventDefault();
  if(event.repeat)return;
  if(event.code==='Escape'){if(started)setPause(!paused);return;}
  if(paused)return;keys.add(event.code);
  if(event.code==='Space')shoot({requireHeld:true});if(event.code==='KeyG')toggleWeb();if(event.code==='KeyR')restart();
  if(event.code==='KeyF')combat.shoot(body,forward,hero.shotHandWorld);
  if(event.code==='KeyQ'&&!combat.kick(body,forward))notice(`敵へ近づいて Q — ${DRONE_KICK_RANGE} m以内で飛び蹴り`,1.3);
  if(event.code==='KeyX'){if(!webZip())body.dodge(right.clone().multiplyScalar(keys.has('KeyA')?-1:1));}
});
window.addEventListener('keyup',event=>{keys.delete(event.code);if(event.code==='Space'){cancelPendingWallWeb();if(!mouseSwing&&!paused)releaseWeb();}});
canvas.addEventListener('pointerdown',event=>{if(paused||event.pointerType!=='mouse')return;canvas.focus();canvas.setPointerCapture(event.pointerId);if(event.button===0){mouseSwing=true;shoot({requireHeld:true});}if(event.button===2)drag=true;});
canvas.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'&&drag){yaw-=event.movementX*.004;pitch=T.MathUtils.clamp(pitch+event.movementY*.003,-.25,.65);}});
canvas.addEventListener('pointerup',event=>{if(event.pointerType!=='mouse')return;if(event.button===0){mouseSwing=false;cancelPendingWallWeb();if(!keys.has('Space'))releaseWeb();}if(event.button===2)drag=false;});
canvas.addEventListener('contextmenu',event=>event.preventDefault());

function updateMoveStick(event){
  const ring=$('#move-stick .stick-ring').getBoundingClientRect(),cx=ring.left+ring.width/2,cy=ring.top+ring.height/2;
  const max=ring.width*.32,dx=event.clientX-cx,dy=event.clientY-cy,length=Math.hypot(dx,dy),scale=length>max?max/length:1;
  const x=dx*scale,y=dy*scale;mobileMove.set(x/max,y/max);$('#move-knob').style.transform=`translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;
}
function endMove(event){if(movePointer!==event.pointerId)return;movePointer=null;mobileMove.set(0,0);$('#move-stick').classList.remove('is-held');$('#move-knob').style.transform='translate(-50%,-50%)';}
$('#move-stick').addEventListener('pointerdown',event=>{if(paused)return;event.preventDefault();movePointer=event.pointerId;$('#move-stick').setPointerCapture(event.pointerId);$('#move-stick').classList.add('is-held');updateMoveStick(event);initAudio();});
$('#move-stick').addEventListener('pointermove',event=>{if(movePointer===event.pointerId)updateMoveStick(event);});$('#move-stick').addEventListener('pointerup',endMove);$('#move-stick').addEventListener('pointercancel',endMove);
$('#mobile-look-zone').addEventListener('pointerdown',event=>{if(paused)return;event.preventDefault();lookPointer=event.pointerId;lookX=lookStartX=event.clientX;lookY=lookStartY=event.clientY;lookStartTime=performance.now();manualLookUntil=body.time+1.2;$('#mobile-look-zone').setPointerCapture(event.pointerId);initAudio();});
$('#mobile-look-zone').addEventListener('pointermove',event=>{if(lookPointer!==event.pointerId)return;const dx=event.clientX-lookX,dy=event.clientY-lookY;lookX=event.clientX;lookY=event.clientY;yaw-=dx*.0045;pitch=T.MathUtils.clamp(pitch+dy*.003,-.18,.55);manualLookUntil=body.time+1.2;});
const endLook=event=>{
  if(lookPointer!==event.pointerId)return;
  const dx=event.clientX-lookStartX,dy=event.clientY-lookStartY,duration=performance.now()-lookStartTime;
  lookPointer=null;
  if(duration<420&&dy<-48&&Math.abs(dy)>Math.abs(dx)*1.15){webZip();return;}
  if(duration<360&&Math.abs(dx)>56&&isCombatThreatened()){body.dodge(right.clone().multiplyScalar(dx<0?-1:1));return;}
  if(duration<220&&Math.hypot(dx,dy)<18){
    const action=getContextAction();
    if(action?.kind==='KICK')combat.kick(body,movementIntentDirection());
    else if(action?.kind==='SHOT')combat.shoot(body,movementIntentDirection(),hero.shotHandWorld);
  }
};$('#mobile-look-zone').addEventListener('pointerup',endLook);$('#mobile-look-zone').addEventListener('pointercancel',event=>{if(lookPointer===event.pointerId)lookPointer=null;});
$('#mobile-web').addEventListener('pointerdown',event=>{if(paused)return;event.preventDefault();const element=$('#mobile-web');element.setPointerCapture(event.pointerId);mobileWebHeld=true;element.classList.add('is-held');element.setAttribute('aria-pressed','true');initAudio();if(!body.anchor)shoot({requireHeld:true});});
function releaseMobileWeb(event){if(!mobileWebHeld)return;mobileWebHeld=false;cancelPendingWallWeb();const element=$('#mobile-web');element.classList.remove('is-held');element.setAttribute('aria-pressed','false');if(!paused)releaseWeb();if(event&&element.hasPointerCapture?.(event.pointerId))element.releasePointerCapture(event.pointerId);}
$('#mobile-web').addEventListener('pointerup',releaseMobileWeb);$('#mobile-web').addEventListener('pointercancel',releaseMobileWeb);
const contextButton=$('#mobile-context');
contextButton?.addEventListener('pointerdown',event=>{
  if(paused)return;event.preventDefault();initAudio();
  const action=getContextAction();
  if(action?.kind==='ZIP'){webZip();return;}
  if(action?.kind!=='KICK'&&action?.kind!=='SHOT')return;
  attackHeld=true;attackHoldPointer=event.pointerId;attackHoldTargetId=action.targetId;attackHoldArmAt=body.time+.16;attackHoldNextAt=attackHoldArmAt;
  contextButton.classList.add('is-held');contextButton.setPointerCapture?.(event.pointerId);
});
function endAttackHold(event){
  if(attackHoldPointer!==event.pointerId)return;
  const armed=body.time>=attackHoldArmAt;
  attackHeld=false;attackHoldPointer=null;attackHoldTargetId=null;contextButton?.classList.remove('is-held');
  if(!armed&&!paused)runContextAction();
}
contextButton?.addEventListener('pointerup',endAttackHold);contextButton?.addEventListener('pointercancel',endAttackHold);
$('#mobile-dodge')?.addEventListener('click',event=>{event.preventDefault();if(!paused){initAudio();body.dodge(right.clone().multiplyScalar(mobileMove.x<-.15?-1:1));updateContextUI();}});
window.addEventListener('blur',()=>{
  const hadDesktopWebInput=!touchCapable&&(mouseSwing||keys.has('Space'));
  keys.clear();mouseSwing=false;drag=false;cancelPendingWallWeb();
  if(hadDesktopWebInput&&!paused&&body.anchor)releaseWeb();
});
document.addEventListener('visibilitychange',()=>{
  // Mobile browsers can transiently report visibility/focus changes during normal touch UI.
  // Never interrupt touch traversal; rAF is suspended by the browser while actually hidden.
  if(document.hidden&&started&&!touchCapable)setPause(true);
});

let audioCtx=null;
function initAudio(){try{audioCtx??=new AudioContext();audioCtx.resume();}catch{}}
function tone(freq,duration){if(!audioCtx)return;const oscillator=audioCtx.createOscillator(),gain=audioCtx.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(freq,audioCtx.currentTime);oscillator.frequency.exponentialRampToValueAtTime(freq*1.4,audioCtx.currentTime+duration);gain.gain.setValueAtTime(.045,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);oscillator.connect(gain).connect(audioCtx.destination);oscillator.start();oscillator.stop(audioCtx.currentTime+duration);}
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);resize();
function snapCamera(){cameraForward.copy(forward);chaseOffset.copy(cameraForward).multiplyScalar(-9).add(new T.Vector3(0,4,0));aimOffset.copy(cameraForward).multiplyScalar(4).add(new T.Vector3(0,1,0));camera.position.copy(body.position).add(chaseOffset);cameraTarget.copy(body.position).add(aimOffset);camera.lookAt(cameraTarget);}snapCamera();

function getContextAction(){
  const enemy=combat.target(body.position,movementIntentDirection());
  if(enemy&&body.position.distanceTo(enemy.position)<DRONE_KICK_RANGE)return {kind:'KICK',label:'ATTACK',targetId:enemy.id};
  if(!body.anchor&&!body.grounded&&body.time-body.zipTime>traversalTuning.zipCooldown)return {kind:'ZIP',label:'ZIP'};
  if(enemy&&body.position.distanceTo(enemy.position)<TITAN_SHOT_RANGE)return {kind:'SHOT',label:'ATTACK',targetId:enemy.id};
  return null;
}
function isCombatThreatened(){return combat.drones.some(drone=>drone.hp>0&&drone.charge>.32&&body.position.distanceTo(drone.position)<TITAN_THREAT_RANGE);}
function updateContextUI(){
  if(!touchCapable)return;
  const context=$('#mobile-context'),dodge=$('#mobile-dodge');if(!context||!dodge)return;
  if(!started||paused){context.hidden=true;dodge.hidden=true;delete context.dataset.kind;return;}
  if(attackHeld){context.hidden=false;context.textContent='ATTACK';context.dataset.kind='ATTACK';}
  else {const action=getContextAction();context.hidden=!action;if(action){context.textContent=action.label;context.dataset.kind=action.kind;}else delete context.dataset.kind;}
  dodge.hidden=!isCombatThreatened();
}
function runContextAction(){
  const action=getContextAction();if(!action)return;
  if(action.kind==='ZIP')webZip();
  else if(action.kind==='KICK')combat.kick(body,movementIntentDirection());
  else if(action.kind==='SHOT')combat.shoot(body,movementIntentDirection(),hero.shotHandWorld);
  updateContextUI();
}

function advanceAttackHold(){
  if(!attackHeld||paused||body.time<attackHoldArmAt||body.time<attackHoldNextAt)return;
  const target=combat.drones[attackHoldTargetId];
  if(!target||target.hp<=0){attackHoldNextAt=body.time+.12;return;}
  const desired=target.position.clone().sub(body.position).setY(0);
  if(desired.lengthSq()<1e-6)desired.copy(movementIntentDirection());else desired.normalize();
  const distance=body.position.distanceTo(target.position);
  if(distance<DRONE_KICK_RANGE&&combat.kick(body,desired))attackHoldNextAt=body.time+.70;
  else if(distance<TITAN_SHOT_RANGE&&combat.shoot(body,desired,hero.shotHandWorld))attackHoldNextAt=body.time+.55;
  else attackHoldNextAt=body.time+.12;
}

function step(){
  yaw+=(Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight')))*STEP*1.7;
  if(touchCapable)yaw-=mobileMove.x*STEP*1.45;
  direction();
  const mobileForward=-mobileMove.y;
  const moveForward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+mobileForward;
  const moveRight=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+(touchCapable?mobileMove.x*.18:0);
  const steer=new T.Vector3().addScaledVector(forward,moveForward).addScaledVector(right,moveRight);
  const before=body.position.clone();
  const brakeIntent=touchCapable?mobileMove.y>.42:keys.has('KeyS');
  const moveMagnitude=Math.min(1,Math.hypot(moveForward,moveRight));
  const throttle=brakeIntent?0:Math.max(.25,Math.min(1,Math.max(0,moveForward)));
  const turnIntent=brakeIntent?0:(touchCapable?Math.abs(mobileMove.x):Math.min(1,Math.abs(moveRight)));
  combat.syncAnchor(body);
  const assistState=applySwingAssist(body,STEP,{desiredDirection:forward,throttle,braking:brakeIntent},traversalTuning);
  applyTurnAssist(body,STEP,{desiredDirection:forward,turnIntent},traversalTuning);
  const dive=keys.has('ShiftLeft')||keys.has('ShiftRight')||(touchCapable&&!body.grounded&&mobileMove.y>.78);
  body.step(STEP,{steer,forward:!brakeIntent&&(keys.has('KeyW')||mobileMove.y<-.18),brake:brakeIntent,moveMagnitude,dive,reel:keys.has('KeyE')||shouldAutoReel(body,assistState)});
  // Wall contact is stable until the player asks for WEB. That input kicks away first,
  // then attaches after a short clearance beat instead of auto-jumping on contact.
  processPendingWallWeb();
  applyReleaseAssist(body,STEP,traversalTuning);
  combat.step(STEP,body);advanceAttackHold();if(!finished)elapsed+=STEP;
  if(body.outOfBounds){const safe=checkpoint?ringPoints[checkpoint-1].clone().add(new T.Vector3(0,2,5)):undefined;body.respawn(safe);before.copy(body.position);elapsed+=5;notice('エリア外 — 通過地点へ戻りました（+5秒）',2);snapCamera();}
  if(!combatTaught&&checkpoint>0&&body.time>noticeUntil&&combat.target(body.position,forward,135)){combatTaught=true;if(!touchCapable)notice('大型迎撃機！ Fでコアへ糸 → 近距離Qで攻撃',3);}
  for(const event of combat.drainEvents()){
    combatView.event(event);
    if(event.type==='destroy'){notice(`大型機停止 ${combat.defeated} / 3`,1.2);tone(880,.25);}else if(event.type==='hurt'){notice(touchCapable?'被弾 — 予兆時のDODGEで回避':'被弾 — Xで回避',1.4);tone(110,.2);}else if(event.type==='hit')tone(640,.08);
  }
  if(combat.health===0){failed=true;setPause(true);$('.intro h1').innerHTML='もう一度、空へ。';$('.intro>p:not(.eyebrow)').textContent=touchCapable?'敵に近づくとATTACK、攻撃予兆中だけDODGEが現れます。移動中の画面はできるだけ街に使います。':'照準が白く光る前に回避。Webを当ててから近づいて蹴る。';$('#start').innerHTML='屋上から再挑戦 <span>↗</span>';return;}
  if(checkpoint<rings.length&&crossesRing(before,body.position,checkpoint)){
    checkpoint++;tone(700+checkpoint*120,.2);updateRings();if(!touchCapable)notice(checkpoint===rings.length?'ルート完走。残りの大型機へ。':`${checkpoint} / ${rings.length}`,1.1);
  }
}
function finishCheck(){if(!finished&&!failed&&combat.health>0&&checkpoint===rings.length&&combat.defeated===combat.drones.length){finished=true;if(!best||elapsed<best){best=elapsed;try{localStorage.setItem('threadline-best-v2',String(best));}catch{}}notice(`CITY CLEAR · ${elapsed.toFixed(1)} 秒 — Rで再挑戦`,1000);tone(1100,.4);}}

function render(now){
  const dt=Math.min((now-last)/1000,.05);last=now;
  if(!paused){accumulator+=dt;while(accumulator>=STEP){step();finishCheck();accumulator-=STEP;if(paused)break;}}else accumulator=0;
  direction();candidate=chooseTraversalAnchor(movementIntentDirection());
  hero.update(body,forward,paused?0:dt,combat);combatView.update(paused?0:dt,body);
  rope.visible=!!body.anchor;if(body.anchor){const attribute=rope.geometry.attributes.position;attribute.setXYZ(0,...hero.handWorld.toArray());attribute.setXYZ(1,...body.anchor.point.toArray());attribute.needsUpdate=true;}
  marker.visible=!!candidate&&!body.anchor;if(candidate){marker.position.copy(candidate.point);marker.rotation.y+=dt;}

  const speed=body.velocity.length();
  // Character steering and camera steering share the same heading. Do not silently rotate the mobile
  // camera toward velocity: that made the avatar and the view disagree after wall kicks and turns.
  cameraForward.copy(forward);
  const recentRelease=body.time-body.assistedReleaseTime<.36,recentZip=body.time-body.zipTime<.28;
  const cameraDistance=8.1+Math.min(speed*.055,2.9)+(recentRelease?.7:0);
  chaseOffset.lerp(cameraForward.clone().multiplyScalar(-cameraDistance).add(new T.Vector3(0,3.2+pitch*7,0)),1-Math.exp(-dt*6.5));
  cameraDesired.copy(body.position).add(chaseOffset);
  for(const building of buildings){const hit=segmentHit(body.position,cameraDesired,building.box.clone().expandByScalar(.25));if(hit!==null&&hit>0)cameraDesired.lerpVectors(body.position,cameraDesired,Math.max(.12,hit-.04));}
  camera.position.lerp(cameraDesired,1-Math.exp(-dt*(recentRelease||recentZip?4.1:7.5)));
  aimOffset.lerp(cameraForward.clone().multiplyScalar(4.8).add(new T.Vector3(0,1,0)),1-Math.exp(-dt*9));cameraTarget.copy(body.position).add(aimOffset);camera.lookAt(cameraTarget);
  const targetFov=66+Math.min(14,speed*.26)+(recentRelease||recentZip?2:0);camera.fov=T.MathUtils.lerp(camera.fov,targetFov,1-Math.exp(-dt*3.4));camera.updateProjectionMatrix();
  sun.position.copy(body.position).add(new T.Vector3(-70,140,-80));sun.target.position.copy(body.position);

  $('#swing-toggle').setAttribute('aria-pressed',String(!!body.anchor));$('#swing-toggle').innerHTML=body.anchor?'糸を離す <small>G · 切替</small>':'糸を掛ける <small>G · 切替</small>';
  $('#speed strong').textContent=Math.round(speed*3.6);
  const landingLabel=body.grounded&&body.time<body.landingUntil?(body.landingType==='roll'?'LANDING ROLL':body.landingType==='skid'?'BRAKE SKID':body.landingType==='stick'?'STICK LANDING':null):null;
  $('#state').textContent=landingLabel??(recentZip?'WEB ZIP':body.time-body.dodgeTime<.42?'DODGE':body.anchor?'WEB SWING':body.wall?(body.velocity.y>1?'WALL RUN':'WALL CONTACT'):body.grounded?'ROOFTOP / STREET':body.velocity.y>2?'RISING':'FREE FALL');
  $('#shield').textContent='◆'.repeat(combat.health)+'◇'.repeat(3-combat.health);$('#security').textContent=`TITANS ${combat.defeated} / 3`;
  const enemy=combat.target(body.position,movementIntentDirection());$('#combat-hint').textContent=!touchCapable&&enemy?`${Math.round(body.position.distanceTo(enemy.position))} m · F 糸${body.position.distanceTo(enemy.position)<DRONE_KICK_RANGE?' / Q 飛び蹴り':''}`:'';
  $('#progress').textContent=`${checkpoint} / ${rings.length}`;
  $('#next').textContent=checkpoint<rings.length?`ROUTE ${Math.round(body.position.distanceTo(ringPoints[checkpoint]))} m`:finished?`CLEAR ${elapsed.toFixed(1)} s · BEST ${best?.toFixed(1)} s`:'TITANS REMAIN';
  const goal=checkpoint<rings.length?ringPoints[checkpoint]:combat.drones.filter(drone=>drone.hp>0).sort((a,b)=>a.position.distanceTo(body.position)-b.position.distanceTo(body.position))[0]?.position;
  if(goal&&!finished){const delta=goal.clone().sub(body.position),angle=Math.atan2(delta.dot(right),delta.dot(forward)),arrow=Math.abs(angle)<.45?'↑':Math.abs(angle)>2.5?'↓':angle>0?'→':'←';$('#route-arrow').textContent=touchCapable?`${arrow} ${Math.round(delta.length())} m`:`${arrow} ${checkpoint<rings.length?'次のリング':'残りの大型機'} · ${Math.round(delta.length())} m`;}else $('#route-arrow').textContent='';
  $('#reticle').classList.toggle('ready',!!candidate);$('#anchor-hint').textContent=body.anchor?'離して飛ぶ':candidate?(touchCapable?'':'SPACE / WEB'):'接続先を探索中';

  if(touchCapable){
    $('#mobile-web').setAttribute('aria-pressed',String(mobileWebHeld||!!body.anchor));$('#mobile-web .mobile-label').textContent=body.anchor?'RELEASE':'WEB';updateContextUI();
  }
  if(body.time>noticeUntil)$('#notice').textContent='';
  renderer.render(scene,camera);requestAnimationFrame(render);
}
requestAnimationFrame(render);

export function readPlayState(){const intent=movementIntentDirection();return {position:body.position.toArray(),velocity:body.velocity.toArray(),yaw,time:body.time,attached:!!body.anchor,pendingWallWeb:!!pendingWallWeb,intentDirection:intent.toArray(),candidatePoint:candidate?.point?.toArray?.()??null,anchorKind:body.anchor?.kind??null,anchorEnemyId:body.anchor?.enemyId??null,anchorPoint:body.anchor?.point?.toArray?.()??null,titans:combat.drones.map(d=>({id:d.id,position:d.position.toArray(),hp:d.hp})),grounded:body.grounded,wall:!!body.wall,wallJumpTime:body.wallJumpTime,wallJumpFacing:body.wallJumpFacing.toArray(),attackHeld,attackHoldTargetId,shotAt:combat.shotAt,kickAt:combat.kickAt,checkpoint,health:combat.health,defeated:combat.defeated,finished,failed,paused,zipTime:body.zipTime,landingType:body.landingType,landingUntil:body.landingUntil};}
const e2eParams=new URLSearchParams(location.search);
if(e2eParams.has('e2e')){
  globalThis.__threadlineReadState=readPlayState;
  globalThis.__threadlineE2E={
    placeForWallKick(){
      const wallBuilding=buildings.find(b=>b.kind!=='atrium'&&b.x<0&&Math.abs(b.z)<120);
      if(!wallBuilding)throw new Error('No wall-kick fixture building');
      body.release();body.position.set(wallBuilding.box.max.x+1.0,20,wallBuilding.z);body.velocity.set(-42,0,-22);
      body.grounded=false;body.wall=null;body.lastWallTime=-10;body.lastWallNormal=null;body.lastWallImpactVelocity=null;body.wallJumpTime=-10;
      yaw=0;pitch=.13;direction();snapCamera();
      return {buildingId:wallBuilding.id,position:body.position.toArray(),velocity:body.velocity.toArray()};
    },
    placeForAttack(){
      const target=combat.drones[0];target.position.copy(target.home);target.stunUntil=combat.time+5;
      body.release();body.position.copy(target.position).add(new T.Vector3(0,0,30));body.velocity.set(0,0,0);
      body.grounded=false;body.wall=null;yaw=0;pitch=.13;direction();snapCamera();
      return {targetId:target.id,position:body.position.toArray(),target:target.position.toArray()};
    }
  };
}
