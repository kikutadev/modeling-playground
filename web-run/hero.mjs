import * as T from 'three';
const UP=new T.Vector3(0,1,0);
const point=(x,y,z)=>new T.Vector3(x,y,z);

export function airborneMotionWeights(velocity,forward,releaseWeight=0){
  const vy=velocity.y;
  const climb=T.MathUtils.smoothstep(vy,3,15)*(1-releaseWeight*.45);
  const apex=(1-T.MathUtils.smoothstep(Math.abs(vy),1.5,5.5))*(1-releaseWeight*.7);
  const fall=T.MathUtils.smoothstep(-vy,.2,7.5)*(1-releaseWeight*.35);
  const planar=velocity.clone().setY(0);
  const facing=forward.clone().setY(0);
  let bank=0;
  if(planar.lengthSq()>9&&facing.lengthSq()>1e-6){
    planar.normalize();facing.normalize();
    const right=new T.Vector3(-facing.z,0,facing.x);
    bank=T.MathUtils.clamp(planar.dot(right),-1,1);
  }
  return {climb,apex,fall,bank};
}

// Fixed segment lengths: the elbow bends toward a pole; the arm never rubber-stretches.
export function solveLimb(start,target,pole,upper,lower){
  const axis=target.clone().sub(start),raw=axis.length();
  axis.divideScalar(Math.max(raw,1e-6));
  if(raw<1e-6)axis.set(0,-1,0);
  const length=T.MathUtils.clamp(raw,Math.abs(upper-lower)+.001,upper+lower-.001);
  const end=start.clone().addScaledVector(axis,length);
  const along=(upper*upper-lower*lower+length*length)/(2*length);
  const bend=pole.clone().sub(start);bend.addScaledVector(axis,-bend.dot(axis));
  if(bend.lengthSq()<1e-8){bend.set(0,0,1);if(Math.abs(axis.z)>.9)bend.set(1,0,0);bend.addScaledVector(axis,-bend.dot(axis));}
  bend.normalize();
  const joint=start.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,upper*upper-along*along)));
  return {joint,end};
}

export function computeAirborneMotion(body, forward){
  const airborne=!body.anchor&&!body.grounded&&!body.wall;
  if(!airborne)return {airborne:false,climb:0,apex:0,fall:0,dive:0,turn:0,turnSigned:0,kickLeg:1-(body.webHand??0)};
  const vy=body.velocity.y;
  const climb=T.MathUtils.smoothstep(vy,3,15);
  const apex=1-T.MathUtils.smoothstep(Math.abs(vy),1.2,5.2);
  const fall=T.MathUtils.smoothstep(-vy,.2,7.5);
  const dive=fall*T.MathUtils.smoothstep(-vy,12,30);
  const horizontal=body.velocity.clone().setY(0);
  const right=new T.Vector3(-forward.z,0,forward.x).normalize();
  const turnSigned=horizontal.lengthSq()>1e-6?T.MathUtils.clamp(horizontal.normalize().dot(right),-1,1):0;
  const turn=Math.abs(turnSigned);
  return {airborne:true,climb,apex,fall,dive,turn,turnSigned,kickLeg:1-(body.webHand??0)};
}

const RELEASE_TRAVERSAL_DURATION=.62;
const RELEASE_TRAVERSAL_KEYS=[
  {at:0,  pitch:-.18,roll:.02,twist:.00,releasedArm:[.60,.72,.30],freeArm:[.68,.18,-.48],kickFoot:[.34,-.78,.16],supportFoot:[.30,-1.02,.34]},
  {at:.15,pitch:-.30,roll:.08,twist:.12,releasedArm:[.68,.66,.42],freeArm:[.70,.08,-.60],kickFoot:[.40,-.18,-.36],supportFoot:[.31,-1.10,.40]},
  {at:.34,pitch:-.50,roll:.18,twist:.30,releasedArm:[.70,.40,.58],freeArm:[.72,-.02,-.48],kickFoot:[.50,.28,-.88],supportFoot:[.32,-1.15,.46]},
  {at:.58,pitch:-.72,roll:.16,twist:.34,releasedArm:[.72,.14,.72],freeArm:[.66,.06,.30],kickFoot:[.54,-.80,.30],supportFoot:[.34,-1.16,.50]},
  {at:.78,pitch:-.78,roll:.08,twist:.18,releasedArm:[.68,.08,.78],freeArm:[.68,.16,.58],kickFoot:[.68,-1.04,.54],supportFoot:[.34,-1.14,.52]},
  {at:1,  pitch:-.76,roll:.04,twist:.08,releasedArm:[.62,.10,.74],freeArm:[.70,.20,.52],kickFoot:[.64,-1.08,.56],supportFoot:[.34,-1.15,.50]},
];

function sampleReleaseKey(phase){
  const p=T.MathUtils.clamp(phase,0,1);
  let a=RELEASE_TRAVERSAL_KEYS[0],b=RELEASE_TRAVERSAL_KEYS.at(-1);
  for(let i=1;i<RELEASE_TRAVERSAL_KEYS.length;i++){
    if(p<=RELEASE_TRAVERSAL_KEYS[i].at){a=RELEASE_TRAVERSAL_KEYS[i-1];b=RELEASE_TRAVERSAL_KEYS[i];break;}
  }
  const span=Math.max(1e-6,b.at-a.at),t=T.MathUtils.smoothstep((p-a.at)/span,0,1);
  const lerp=(x,y)=>T.MathUtils.lerp(x,y,t),lerp3=(x,y)=>[lerp(x[0],y[0]),lerp(x[1],y[1]),lerp(x[2],y[2])];
  return {
    pitch:lerp(a.pitch,b.pitch),roll:lerp(a.roll,b.roll),twist:lerp(a.twist,b.twist),
    releasedArm:lerp3(a.releasedArm,b.releasedArm),freeArm:lerp3(a.freeArm,b.freeArm),
    kickFoot:lerp3(a.kickFoot,b.kickFoot),supportFoot:lerp3(a.supportFoot,b.supportFoot),
  };
}

// The release is one authored traversal sentence: carry the swing pose, chamber once, snap once,
// sweep that same leg behind the body, then lengthen into the ballistic coast.
export function sampleReleaseTraversalPose(body){
  const age=body.time-(body.releaseTime??-10);
  if(age<=0||age>RELEASE_TRAVERSAL_DURATION)return {active:false,phase:0,weight:0,sweep:0,stage:'none'};
  const phase=T.MathUtils.clamp(age/RELEASE_TRAVERSAL_DURATION,0,1),key=sampleReleaseKey(phase);
  const released=body.webHand??0,free=1-released,kick=free,support=released;
  const releasedSide=released===0?-1:1,freeSide=free===0?-1:1,kickSide=kick===0?-1:1,supportSide=support===0?-1:1;
  const toPoint=(side,v)=>point(side*v[0],v[1],v[2]),arms=[null,null],feet=[null,null];
  arms[released]=toPoint(releasedSide,key.releasedArm);arms[free]=toPoint(freeSide,key.freeArm);
  feet[kick]=toPoint(kickSide,key.kickFoot);feet[support]=toPoint(supportSide,key.supportFoot);
  const stage=phase<.15?'release':phase<.34?'chamber':phase<.58?'snap':phase<.78?'sweep':'coast';
  return {
    active:true,phase,weight:1,sweep:T.MathUtils.smoothstep(phase,.34,.78),stage,
    torsoPitch:key.pitch,torsoRoll:releasedSide*key.roll,torsoTwist:releasedSide*key.twist,arms,feet,
  };
}

export function computeReleaseKickUp(body){
  const pose=sampleReleaseTraversalPose(body);
  return {active:pose.active,phase:pose.phase,weight:pose.weight,sweep:pose.sweep};
}

export function nextWebHandIndex(body){
  return Number.isInteger(body.attaches)?body.attaches%2:1-(body.webHand??0);
}

// After the release accent, vertical velocity selects a complete ballistic silhouette. The apex opens
// sideways, not forward at the knee, so it reads as a weightless accent rather than air-running.
export function sampleBallisticTraversalPose(body){
  const vy=body.velocity?.y??0;
  const released=body.webHand??0,other=1-released,kick=other,support=released;
  const releasedSide=released===0?-1:1,otherSide=other===0?-1:1,kickSide=kick===0?-1:1,supportSide=support===0?-1:1;
  const arms=[null,null],feet=[null,null];
  const put=(array,index,side,x,y,z)=>{array[index]=point(side*x,y,z);};
  if(vy>3.8){
    // The coast is not a frozen pose. As upward speed bleeds away, the body quietly opens toward
    // the apex accent while both feet remain behind the pelvis.
    const prepare=1-T.MathUtils.smoothstep(vy,4,9);
    const blend=(a,b)=>a.clone().lerp(b,prepare);
    arms[released]=blend(point(releasedSide*.72,.10,.72),point(releasedSide*.88,.32,.54));
    arms[other]=blend(point(otherSide*.78,.22,.52),point(otherSide*.86,.08,.56));
    feet[kick]=blend(point(kickSide*.62,-1.10,.50),point(kickSide*.70,-.92,.38));
    feet[support]=blend(point(supportSide*.36,-1.15,.56),point(supportSide*.38,-1.14,.60));
    return {
      phase:'climb',open:prepare*.28,
      torsoPitch:T.MathUtils.lerp(-.76,-.84,prepare),
      torsoRoll:releasedSide*T.MathUtils.lerp(.04,.11,prepare),
      torsoTwist:releasedSide*T.MathUtils.lerp(.08,.17,prepare),
      arms,feet,
    };
  }
  if(vy>-2){
    const open=.32+.68*(1-T.MathUtils.smoothstep(Math.abs(vy),.6,4.2));
    const blend=(a,b)=>a.clone().lerp(b,open);
    const climbReleased=point(releasedSide*.80,.20,.64),climbOther=point(otherSide*.80,.30,.46);
    const starReleased=point(releasedSide*.98,.52,.36),starOther=point(otherSide*.86,-.02,.48);
    const climbKick=point(kickSide*.64,-1.06,.46),climbSupport=point(supportSide*.38,-1.15,.58);
    const starKick=point(kickSide*.80,-.62,.12),starSupport=point(supportSide*.40,-1.15,.62);
    arms[released]=blend(climbReleased,starReleased);arms[other]=blend(climbOther,starOther);
    feet[kick]=blend(climbKick,starKick);feet[support]=blend(climbSupport,starSupport);
    return {
      phase:'apex',open,
      torsoPitch:T.MathUtils.lerp(-.84,-.92,open),
      torsoRoll:releasedSide*T.MathUtils.lerp(.08,.30,open),
      torsoTwist:releasedSide*T.MathUtils.lerp(.12,.40,open),
      arms,feet,
    };
  }
  const dive=T.MathUtils.smoothstep(-vy,2,14),longLeg=nextWebHandIndex(body),softLeg=1-longLeg;
  const longSide=longLeg===0?-1:1,softSide=softLeg===0?-1:1;
  put(arms,released,releasedSide,.72,.12,.82+dive*.06);put(arms,other,otherSide,.82,.28,.66+dive*.04);
  put(feet,longLeg,longSide,.40,-1.17,.58-dive*.03);put(feet,softLeg,softSide,.64,-1.04,.44-dive*.02);
  return {phase:'fall',open:0,torsoPitch:-1.04-.16*dive,torsoRoll:releasedSide*.06,torsoTwist:releasedSide*.08,arms,feet};
}

// Swinging also has a deliberate silhouette: the web-side leg stays long while the free-side leg
// softens near the bottom of the arc, then both trail as upward velocity builds. This avoids both a
// rigid mannequin swing and a run cycle in mid-air.
export function sampleSwingTraversalPose(body){
  if(!body.anchor?.point)return {active:false};
  const rope=body.position.clone().sub(body.anchor.point),length=Math.max(rope.length(),1e-6);
  const ropeDirection=rope.divideScalar(length),vy=body.velocity.y;
  const bottomness=T.MathUtils.clamp((-ropeDirection.y-.18)/.82,0,1);
  const rising=T.MathUtils.clamp((vy+1)/18,0,1),descending=T.MathUtils.clamp((-vy-1)/18,0,1);
  const pump=bottomness*(1-T.MathUtils.smoothstep(Math.abs(vy),4,18));
  const support=body.webHand??0,free=1-support,supportSide=support===0?-1:1,freeSide=free===0?-1:1;
  const feet=[null,null];
  // The web-side leg stays long through the arc. Only the free-side leg compresses near the bottom,
  // giving the swing one clear pump rather than alternating knees like a run cycle.
  feet[support]=point(supportSide*.38,-1.15,.44+rising*.16+descending*.06);
  const freeLong=point(freeSide*.62,-1.05,.52+rising*.10+descending*.04);
  const freePump=point(freeSide*.78,-.54,.28);
  feet[free]=freeLong.lerp(freePump,pump*.90);
  const freeArm=point(freeSide*(.86+.10*pump),.12+.18*pump-rising*.04,.58+.12*rising+.05*descending-.26*pump);
  const verticalRatio=T.MathUtils.clamp(vy/26,-1,1);
  return {
    active:true,bottomness,pump,rising,descending,freeArm,feet,
    // Body orientation follows the tangent of travel. The anchor affects the support hand, not the
    // whole torso; otherwise the avatar merely hangs vertically from the line.
    torsoPitch:-.95+.26*verticalRatio,
    torsoRoll:freeSide*(.22+.14*pump),
    torsoTwist:freeSide*(.26+.16*pump),
  };
}

export function classifyHeroMotion(body){
  const anchored=Boolean(body.anchor);
  const tetheredGround=anchored&&Boolean(body.grounded);
  return {tetheredGround,swinging:anchored&&!body.grounded,landingAllowed:Boolean(body.grounded)&&!tetheredGround};
}

export function createHero(){
  const root=new T.Group(),rig=new T.Group();root.add(rig);
  const red=new T.MeshStandardMaterial({color:0xd74731,roughness:.52});
  const dark=new T.MeshStandardMaterial({color:0x152b40,roughness:.7});
  const white=new T.MeshStandardMaterial({color:0xffe9bd,roughness:.4});
  const sphere=new T.SphereGeometry(1,16,12),limbGeo=new T.CylinderGeometry(.82,1,1,10);
  function ellipsoid(parent,material,x,y,z,sx,sy,sz){
    const m=new T.Mesh(sphere,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;parent.add(m);return m;
  }
  ellipsoid(rig,red,0,.36,0,.31,.38,.20);
  ellipsoid(rig,dark,0,.01,0,.22,.25,.16);
  ellipsoid(rig,dark,0,-.17,0,.255,.18,.18);
  ellipsoid(rig,red,0,.75,0,.095,.16,.095);
  const head=new T.Group();head.position.y=.99;rig.add(head);
  ellipsoid(head,red,0,0,0,.182,.238,.195);
  for(const side of [-1,1]){
    const eye=ellipsoid(head,white,side*.086,.033,-.175,.071,.07,.022);eye.rotation.z=side*.3;
    // Suit panels connect the shoulder to the waist on both sides of the silhouette.
    const panel=ellipsoid(rig,dark,side*.255,.30,0,.058,.28,.17);panel.rotation.z=side*-.2;
    const seam=ellipsoid(rig,white,side*.10,.42,.187,.022,.21,.016);seam.rotation.z=side*-.22;
  }
  ellipsoid(rig,white,0,.25,.16,.045,.05,.018);
  const pieces=Array.from({length:8},(_,i)=>{const m=new T.Mesh(limbGeo,i<2||i%2===1?red:dark);m.castShadow=true;rig.add(m);return m;});
  const joints=Array.from({length:4},(_,i)=>ellipsoid(rig,i<2?red:dark,0,0,0,.1,.1,.1));
  const hands=Array.from({length:2},()=>ellipsoid(rig,red,0,0,0,.081,.115,.09));
  const feet=Array.from({length:2},()=>ellipsoid(rig,red,0,0,0,.10,.105,.18));
  function link(mesh,a,b,r){mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.set(r,a.distanceTo(b),r*.92);mesh.quaternion.setFromUnitVectors(UP,b.clone().sub(a).normalize());}
  const handWorld=new T.Vector3(),shotHandWorld=new T.Vector3();let yaw=0;
  const smoothedArms=[point(-.51,.12,-.1),point(.51,.15,-.1)];
  const smoothedFeet=[point(-.19,-1.10,0),point(.19,-1.10,0)];
  let poseInitialized=false,wasWebPreparing=false,webPrepareStartedAt=-10;
  const smoothedAirRotation={x:0,y:0,z:0};
  return {root,handWorld,shotHandWorld,update(body,forward,dt,combat=null,motion=null){
    root.position.copy(body.position);
    const velocity=body.velocity,speed=velocity.length(),wall=body.wall&&!body.grounded;
    const air=computeAirborneMotion(body,forward);
    const webPreparing=Boolean(motion?.webPreparing&&!body.anchor&&!body.grounded);
    // While free-flying, body.webHand is the hand from the previous attachment. The upcoming web
    // alternates to attaches % 2, so anticipation must lead with that next hand rather than snapping
    // from the just-released hand to the opposite hand at attachment time.
    const nextWebHand=nextWebHandIndex(body);
    if(webPreparing&&!wasWebPreparing)webPrepareStartedAt=body.time;
    if(!webPreparing)webPrepareStartedAt=-10;
    const webPrepareAge=webPreparing?Math.max(0,body.time-webPrepareStartedAt):0;
    const webHeadWeight=webPreparing?T.MathUtils.smoothstep(webPrepareAge,0,.08):0;
    const webArmWeight=webPreparing?T.MathUtils.smoothstep(webPrepareAge,.07,.22):0;
    const wallJumpAge=body.time-(body.wallJumpTime??-10);
    const wallJumpFacingActive=wallJumpAge>=0&&wallJumpAge<.30;
    const facing=wall?body.wall.clone().negate():wallJumpFacingActive?body.wallJumpFacing:combat?.kickTarget!==null&&combat?.aimPoint?combat.aimPoint.clone().sub(body.position).setY(0).normalize():forward;
    const desired=Math.atan2(-facing.x,-facing.z);
    yaw+=Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw))*Math.min(1,dt*12);
    const motionState=classifyHeroMotion(body);
    const tetheredGround=motionState.tetheredGround,swinging=motionState.swinging,anchored=Boolean(body.anchor);
    const swingPose=swinging?sampleSwingTraversalPose(body):null;
    const kick=combat&&combat.time-combat.kickAt<.5;
    const wallJump=wallJumpAge>=0&&wallJumpAge<.38?1-T.MathUtils.smoothstep(wallJumpAge,.03,.36):0;
    const releaseAge=body.time-body.releaseTime;
    const release=releaseAge>=0&&releaseAge<.55?1-T.MathUtils.smoothstep(releaseAge,.02,.48):0;
    const zip=Math.max(0,1-(body.time-(body.zipTime??-10))/.34);
    const airborne=!body.grounded&&!wall&&!swinging;
    const airMotion=airborne?airborneMotionWeights(velocity,forward,release):{climb:0,apex:0,fall:0,bank:0};
    const freeFlight=air.airborne&&wallJump<=.02&&!kick&&zip<=.02;
    const releasePose=freeFlight?sampleReleaseTraversalPose(body):{active:false,phase:0,weight:0,sweep:0,stage:'none',arms:null,feet:null};
    const releaseAction=freeFlight&&releasePose.active;
    const ballisticPose=freeFlight&&!releaseAction?sampleBallisticTraversalPose(body):null;
    const landed=Math.max(0,1-(body.time-body.landTime)/.3);
    const landingActive=motionState.landingAllowed&&body.time<(body.landingUntil??-10)&&body.landingType!=='run';
    const landingType=landingActive?body.landingType:'none';
    const landingDuration=Math.max(.001,(body.landingUntil??body.time)-(body.landingStart??body.time));
    const landingPhase=landingActive?T.MathUtils.clamp((body.time-body.landingStart)/landingDuration,0,1):1;
    const landingEase=T.MathUtils.smoothstep(landingPhase,0,1);
    const tucked=wall||tetheredGround?0:body.grounded?landed*.8:swinging?0:kick?.35:freeFlight?.08:Math.max(zip*.25+.10,wallJump*.78,airMotion.apex*.58);
    const landingPitch=landingType==='skid'?T.MathUtils.lerp(.34,-.04,landingEase):landingType==='stick'?T.MathUtils.lerp(-.22,-.08,landingEase):-.08;
    const airbornePitch=freeFlight?0:air.airborne?Math.min(.38,speed*.010):Math.min(.9,speed*.014);
    const posePitch=wall?0:tetheredGround?-.20:body.grounded?landingPitch:airbornePitch;
    const pose=new T.Quaternion().setFromEuler(new T.Euler(posePitch,yaw,0,'YXZ'));
    // The physical rope constraint disappears immediately, but the outgoing body attitude carries for
    // a few frames so release reads as follow-through rather than an orientation snap.
    root.quaternion.slerp(pose,1-Math.exp(-dt*(releaseAction?8:release>.02?5.5:13)));
    const dodgeAge=body.time-body.dodgeTime;
    const dodgeSpin=dodgeAge<.42?Math.PI*2*T.MathUtils.smoothstep(dodgeAge,0,.42):0;
    const airBank=freeFlight?-.50*air.turnSigned:0;
    const authoredPose=releaseAction?releasePose:ballisticPose;
    const targetPitch=freeFlight?(authoredPose?.torsoPitch??0):swinging?(swingPose?.torsoPitch??0):0;
    const targetTwist=freeFlight?(authoredPose?.torsoTwist??0):swinging?(swingPose?.torsoTwist??0):0;
    const targetRoll=(freeFlight?airBank:0)+(freeFlight?(authoredPose?.torsoRoll??0):swinging?(swingPose?.torsoRoll??0):0);
    const rotationFollow=releaseAction?11:swinging?9:freeFlight?8:14,rotationAlpha=1-Math.exp(-dt*rotationFollow);
    smoothedAirRotation.x=T.MathUtils.lerp(smoothedAirRotation.x,targetPitch,rotationAlpha);
    smoothedAirRotation.y=T.MathUtils.lerp(smoothedAirRotation.y,targetTwist,rotationAlpha);
    smoothedAirRotation.z=T.MathUtils.lerp(smoothedAirRotation.z,targetRoll,rotationAlpha);
    const tetherLean=tetheredGround?-.18:0;
    rig.rotation.z=dodgeSpin+smoothedAirRotation.z;rig.rotation.y=smoothedAirRotation.y;
    rig.rotation.x=landingType==='roll'?-Math.PI*2*landingEase:landingType==='skid'?.10*Math.sin(Math.PI*landingPhase):smoothedAirRotation.x+tetherLean;
    rig.position.y=-landed*.18+(landingType==='roll'?.16*Math.sin(Math.PI*landingPhase):landingType==='skid'?-.07:landingType==='stick'?-.12*(1-landingEase):0);
    root.updateMatrixWorld(true);
    const stride=landingActive?0:(body.grounded||wall)?Math.sin(body.time*(wall?10:14))*Math.min(.48,speed*.06):0;
    const shoulders=[point(-.29,.6,0),point(.29,.6,0)];
    const targets=[point(-.51,.12,-.1-stride),point(.51,.15,-.1+stride)];
    if(tetheredGround){
      const support=body.webHand,free=1-support,direction=rig.worldToLocal(body.anchor.point.clone()).sub(shoulders[support]).normalize();
      targets[support].copy(shoulders[support]).addScaledVector(direction,.755);
      const side=free===0?-1:1,run=Math.sin(body.time*(12+Math.min(6,speed*.16))+(free?Math.PI:0));targets[free].set(side*.58,.18,-.10-run*.34);
    }
    else if(swinging){
      const support=body.webHand,free=1-support,direction=rig.worldToLocal(body.anchor.point.clone()).sub(shoulders[support]).normalize();
      targets[support].copy(shoulders[support]).addScaledVector(direction,.755);targets[free].copy(swingPose.freeArm);
    }
    else if(body.grounded&&landingActive){
      if(landingType==='roll'){targets[0].set(-.30,.20,-.14);targets[1].set(.30,.20,-.14);}
      else if(landingType==='skid'){targets[0].set(-.58,.12,.26);targets[1].set(.58,.20,.18);}
      else {targets[0].set(-.48,.08,-.22);targets[1].set(.48,.20,.02);}
    }
    else if(wall){targets[0].set(-.29,.82+stride*.5,-.46);targets[1].set(.29,.82-stride*.5,-.46);}
    else if(wallJump>.02){targets[0].set(-.58,.34,.16);targets[1].set(.58,.46,.04);}
    else if(zip>.02){targets[0].set(-.30,.42,-.56);targets[1].set(.30,.42,-.56);}
    else if(!body.grounded){
      const flightPose=releaseAction?releasePose:ballisticPose;
      if(flightPose?.arms){targets[0].copy(flightPose.arms[0]);targets[1].copy(flightPose.arms[1]);}
      else {
        const trailArm=body.webHand,reachArm=1-trailArm,trailSide=trailArm===0?-1:1,reachSide=reachArm===0?-1:1;
        targets[trailArm].set(trailSide*.72,.30,.52);targets[reachArm].set(reachSide*.72,.26,-.58);
      }
      if(freeFlight&&air.turn>.04){
        const bank=air.turnSigned;targets[0].y+=bank*.14;targets[1].y-=bank*.14;targets[0].z-=bank*.11;targets[1].z+=bank*.11;
      }
      if(webPreparing&&motion?.webAim){
        const aim=rig.worldToLocal(motion.webAim.clone()).sub(shoulders[nextWebHand]).normalize();
        const releaseReachGate=releaseAction?T.MathUtils.smoothstep(releasePose.phase,.70,.90):1;
        targets[nextWebHand].lerp(shoulders[nextWebHand].clone().addScaledVector(aim,.755),.78*webArmWeight*releaseReachGate);
      }
    }
    if(combat&&combat.time-combat.shotAt<.3&&combat.aimPoint){const shooting=swinging?1-body.webHand:1,direction=rig.worldToLocal(combat.aimPoint.clone()).sub(shoulders[shooting]).normalize();targets[shooting].copy(shoulders[shooting]).addScaledVector(direction,.755);}
    const armFollow=releaseAction?18:swinging?22:release>.02?8:freeFlight?12:air.airborne?9:12;
    const armAlpha=poseInitialized?1-Math.exp(-dt*armFollow):1;
    for(let i=0;i<2;i++){
      smoothedArms[i].lerp(targets[i],armAlpha);
      const start=shoulders[i],pole=point(i===0?-.8:.8,.0,.1),{joint,end}=solveLimb(start,smoothedArms[i],pole,.39,.37);
      link(pieces[i*2],start,joint,.115);link(pieces[i*2+1],joint,end,.085);joints[i].position.copy(joint);hands[i].position.copy(end);
    }
    for(let i=0;i<2;i++){
      const side=i===0?-1:1,hip=point(side*.16,-.23,0);
      const foot=wall?point(side*.21,-.81+stride*side*.6,-.47):wallJump>.02?point(side*.29,-.58+(i?-.08:.10),.20+wallJump*.34):point(side*(.19+tucked*.15),-1.10+tucked*(i?.23:.45),tucked*(i?.42:.22)+stride*side);
      if(tetheredGround){
        const phase=body.time*(12+Math.min(6,speed*.16))+(i?Math.PI:0),cycle=Math.sin(phase),lift=Math.max(0,Math.cos(phase));
        foot.set(side*.20,-1.06+lift*.20,-cycle*.42);
      }
      else if(swinging){foot.copy(swingPose.feet[i]);}
      else if(freeFlight){
        const flightPose=releaseAction?releasePose:ballisticPose;if(flightPose?.feet)foot.copy(flightPose.feet[i]);
        if(air.turn>.04){foot.x+=side*air.turn*.07;foot.y+=(i===0?-1:1)*air.turnSigned*.06;}
      }
      if(body.grounded&&landingActive){
        if(landingType==='roll')foot.set(side*.24,-.58,.26);
        else if(landingType==='skid')foot.set(side*.22,-1.02,i===0?-.46:.22);
        else foot.set(side*.28,-.78,-.18);
      }
      if(kick&&i===1)foot.set(.17,-.2,-.85);
      // The release kick needs a fast leg response; otherwise smoothing preserves the prior swing
      // tuck for several frames and visually delays the one-shot action.
      const legFollow=tetheredGround?24:(body.grounded||wall)?22:swinging?14:releaseAction?26:freeFlight?12:air.airborne?9:10;
      const legAlpha=poseInitialized?1-Math.exp(-dt*legFollow):1;
      smoothedFeet[i].lerp(foot,legAlpha);
      const kickPole=releaseAction&&i===air.kickLeg&&releasePose.phase<.55;
      const pole=kickPole?point(side*.34,.30,-.28):point(side*.26,-.45,-.85);
      const {joint,end}=solveLimb(hip,smoothedFeet[i],pole,.48,.46);
      link(pieces[4+i*2],hip,joint,.145);link(pieces[5+i*2],joint,end,.106);joints[2+i].position.copy(joint);feet[i].position.copy(end);
      feet[i].rotation.x=wall?-.8:kick&&i===1?-1.1:0;
    }
    poseInitialized=true;
    let webLookYaw=0;
    if(webPreparing&&motion?.webAim&&webHeadWeight>.001){
      const localAim=rig.worldToLocal(motion.webAim.clone());
      webLookYaw=T.MathUtils.clamp(Math.atan2(-localAim.x,-localAim.z),-.65,.65)*.44*webHeadWeight;
    }
    head.rotation.y=wall?0:(airborne?-airMotion.bank*.18+webLookYaw:Math.sin(body.time*.7)*.025);
    wasWebPreparing=webPreparing;
    root.updateMatrixWorld(true);hands[body.webHand].getWorldPosition(handWorld);hands[swinging?1-body.webHand:1].getWorldPosition(shotHandWorld);
  }};
}
