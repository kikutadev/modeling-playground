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

export function computeReleaseKickUp(body){
  const age=body.time-(body.releaseTime??-10);
  const ascent=T.MathUtils.smoothstep(body.velocity.y,4,13);
  // The kick must read immediately after release. A 100 ms dead zone left the outgoing swing tuck
  // on screen long enough to look like a seated float before the authored action began.
  if(age<.035||age>.86||ascent<=.01)return {active:false,phase:0,weight:0,sweep:0};
  const phase=T.MathUtils.clamp((age-.035)/.825,0,1);
  // Keep the authored kick fully present through its recovery. A sine envelope faded too early and
  // made the foot appear to snap back into another knee drive instead of sweeping behind the body.
  const enter=T.MathUtils.smoothstep(phase,0,.07);
  const exit=1-T.MathUtils.smoothstep(phase,.88,1);
  const weight=enter*exit*(.42+.58*ascent);
  return {active:true,phase,weight,sweep:T.MathUtils.smoothstep(phase,.38,.74)};
}

export function nextWebHandIndex(body){
  return Number.isInteger(body.attaches)?body.attaches%2:1-(body.webHand??0);
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
    const swinging=!!body.anchor;
    const kick=combat&&combat.time-combat.kickAt<.5;
    const wallJump=wallJumpAge>=0&&wallJumpAge<.38?1-T.MathUtils.smoothstep(wallJumpAge,.03,.36):0;
    const releaseAge=body.time-body.releaseTime;
    const release=releaseAge>=0&&releaseAge<.55?1-T.MathUtils.smoothstep(releaseAge,.02,.48):0;
    const zip=Math.max(0,1-(body.time-(body.zipTime??-10))/.34);
    const airborne=!body.grounded&&!wall&&!swinging;
    const airMotion=airborne?airborneMotionWeights(velocity,forward,release):{climb:0,apex:0,fall:0,bank:0};
    const freeFlight=air.airborne&&wallJump<=.02&&!kick&&zip<=.02;
    const kickUp=freeFlight?computeReleaseKickUp(body):{active:false,phase:0,weight:0};
    const climb=freeFlight?airMotion.climb:0,apex=freeFlight?airMotion.apex:0,fall=freeFlight?airMotion.fall:0,dive=freeFlight?air.dive:0;
    const landed=Math.max(0,1-(body.time-body.landTime)/.3);
    const landingActive=body.grounded&&body.time<(body.landingUntil??-10)&&body.landingType!=='run';
    const landingType=landingActive?body.landingType:'none';
    const landingDuration=Math.max(.001,(body.landingUntil??body.time)-(body.landingStart??body.time));
    const landingPhase=landingActive?T.MathUtils.clamp((body.time-body.landingStart)/landingDuration,0,1):1;
    const landingEase=T.MathUtils.smoothstep(landingPhase,0,1);
    const ropeDirection=swinging?body.position.clone().sub(body.anchor.point).normalize():null;
    const bottomness=ropeDirection?T.MathUtils.clamp((-ropeDirection.y-.18)/.82,0,1):0;
    const attachReach=swinging?1-T.MathUtils.smoothstep(body.time-body.attachTime,.08,.34):0;
    const rising=swinging?T.MathUtils.clamp((velocity.y+1)/18,0,1):0;
    const descending=swinging?T.MathUtils.clamp((-velocity.y-1)/18,0,1):0;
    const stretch=descending*(1-bottomness)*Math.min(1,speed/34);
    const swingTuck=Math.max(bottomness*.45,rising*.92);
    const tucked=wall?0:body.grounded?landed*.8:swinging?swingTuck:kick?.35:Math.max(release*.72+zip*.25+.10,wallJump*.78,airMotion.apex*.58);
    const landingPitch=landingType==='skid'?T.MathUtils.lerp(.34,-.04,landingEase):landingType==='stick'?T.MathUtils.lerp(-.22,-.08,landingEase):-.08;
    const airbornePitch=freeFlight?0:air.airborne?Math.min(.38,speed*.010):Math.min(.9,speed*.014);
    const pose=new T.Quaternion().setFromEuler(new T.Euler(wall?0:body.grounded?landingPitch:swinging?-.2:airbornePitch,yaw,0,'YXZ'));
    if(swinging){const pull=body.anchor.point.clone().sub(body.position).normalize();pose.premultiply(new T.Quaternion().setFromUnitVectors(UP,UP.clone().lerp(pull,.58).normalize()));}
    // A release changes the physical constraint instantly, but the body must not snap with it.
    // Let the torso keep the outgoing swing attitude for a few frames before settling into free flight.
    root.quaternion.slerp(pose,1-Math.exp(-dt*(release>.02?3.2:13)));
    const dodgeAge=body.time-body.dodgeTime;
    const dodgeSpin=dodgeAge<.42?Math.PI*2*T.MathUtils.smoothstep(dodgeAge,0,.42):0;
    const airBank=freeFlight?-.50*air.turnSigned:0;
    const gestureSide=body.webHand?1:-1;
    const apexRoll=freeFlight?gestureSide*.28*apex:0;
    const fallRoll=freeFlight?gestureSide*.10*fall:0;
    rig.rotation.z=dodgeSpin+airBank+apexRoll+fallRoll;
    // Rear-view readability comes from counter-rotation, not random limb noise: twist strongly during
    // the one-shot kick, unwind through the coast, then retain a smaller asymmetric apex gesture.
    const kickTwist=freeFlight?gestureSide*.25*kickUp.weight*(1-.60*kickUp.sweep):0;
    const flightTwist=freeFlight?gestureSide*(.46*apex+.24*fall):0;
    rig.rotation.y=freeFlight?kickTwist+flightTwist:0;
    // Keep yaw on root, but put the authored airborne lean on rig so it is not cancelled by pose blending.
    const coastUp=freeFlight?T.MathUtils.smoothstep(velocity.y,-.5,8):0;
    // Side-view grammar stays on one ballistic arc. Negative X rotation leans the torso toward
    // travel (-Z); apex and descent must therefore continue negative instead of standing back up.
    const flightLean=freeFlight?(-.55*coastUp-.18*kickUp.weight-.58*apex-(.86+.14*dive)*fall):0;
    rig.rotation.x=landingType==='roll'?-Math.PI*2*landingEase:landingType==='skid'?.10*Math.sin(Math.PI*landingPhase):flightLean;
    rig.position.y=-landed*.18+(landingType==='roll'?.16*Math.sin(Math.PI*landingPhase):landingType==='skid'?-.07:landingType==='stick'?-.12*(1-landingEase):0);
    root.updateMatrixWorld(true);
    const stride=landingActive?0:(body.grounded||wall)?Math.sin(body.time*(wall?10:14))*Math.min(.48,speed*.06):0;
    const shoulders=[point(-.29,.6,0),point(.29,.6,0)];
    const targets=[point(-.51,.12,-.1-stride),point(.51,.15,-.1+stride)];
    if(swinging){const support=body.webHand,free=1-support,direction=rig.worldToLocal(body.anchor.point.clone()).sub(shoulders[support]).normalize();targets[support].copy(shoulders[support]).addScaledVector(direction,.755);targets[free].set(free===0?-.53:.53,.08,-.20);}
    else if(body.grounded&&landingActive){
      if(landingType==='roll'){targets[0].set(-.30,.20,-.14);targets[1].set(.30,.20,-.14);}
      else if(landingType==='skid'){targets[0].set(-.58,.12,.26);targets[1].set(.58,.20,.18);}
      else {targets[0].set(-.48,.08,-.22);targets[1].set(.48,.20,.02);}
    }
    else if(wall){targets[0].set(-.29,.82+stride*.5,-.46);targets[1].set(.29,.82-stride*.5,-.46);}
    else if(wallJump>.02){targets[0].set(-.58,.34,.16);targets[1].set(.58,.46,.04);}
    else if(zip>.02){targets[0].set(-.30,.42,-.56);targets[1].set(.30,.42,-.56);}
    else if(!body.grounded){
      // Free-flight neutral is already an asymmetric glide, not a compact mannequin pose. The arm
      // on the released-web side trails while the opposite arm reaches into travel.
      const trailArm=body.webHand,reachArm=1-trailArm,trailSide=trailArm===0?-1:1,reachSide=reachArm===0?-1:1;
      targets[trailArm].set(trailSide*.72,.30,.52);
      targets[reachArm].set(reachSide*.72,.26,-.58);
      if(climb>.01&&!kickUp.active){
        const kickSide=air.kickLeg===0?-1:1;
        targets[0].lerp(point(-.72,.58,.14-kickSide*.04),climb*.82);
        targets[1].lerp(point(.70,.42,-.42-kickSide*.04),climb*.82);
      }
      if(kickUp.weight>.01){
        const support=body.webHand,free=1-support,ss=support===0?-1:1,fs=free===0?-1:1,p=kickUp.phase;
        // Arms counter-balance the single leg action, then open into the coast instead of cycling.
        const supportEarly=point(ss*.84,.58,.48),supportCoast=point(ss*.72,.30,.52);
        const freeEarly=point(fs*.82,.24,-.50),freeCoast=point(fs*.72,.26,-.58);
        targets[support].lerp(supportEarly.clone().lerp(supportCoast,T.MathUtils.smoothstep(p,.42,.82)),kickUp.weight*.94);
        targets[free].lerp(freeEarly.clone().lerp(freeCoast,T.MathUtils.smoothstep(p,.42,.82)),kickUp.weight*.92);
      }
      if(apex>.01){
        // At the apex, keep one side open and let the other side fold in. This reads as a
        // weightless twist instead of both shoulders collapsing into a seated/tucked pose.
        const open=body.webHand,fold=1-open;
        const os=open===0?-1:1,fs=fold===0?-1:1;
        targets[open].lerp(point(os*.78,.46,.62),apex*.88);
        targets[fold].lerp(point(fs*.62,.16,-.68),apex*.86);
      }
      if(fall>.01){
        // Descent keeps a fore/aft arm split: the next web hand reaches into travel while the other
        // arm trails. This prevents the generic symmetric skydiver/mannequin silhouette.
        const reach=nextWebHand,trail=1-reach,rs=reach===0?-1:1,ts=trail===0?-1:1;
        targets[reach].lerp(point(rs*.86,.30,-.60+dive*.08),fall*.96);
        targets[trail].lerp(point(ts*.60,.02,.68+dive*.12),fall*.96);
      }
      if(freeFlight&&air.turn>.04){
        const bank=air.turnSigned;
        targets[0].y+=bank*.14;targets[1].y-=bank*.14;
        targets[0].z-=bank*.11;targets[1].z+=bank*.11;
      }
      if(release>.02){
        // The hand that just released the web trails behind before the flight phase takes over.
        const released=body.webHand,free=1-released,side=released===0?-1:1;
        targets[released].lerp(point(side*.56,.50+release*.52,.12+release*.26),release*.82);
        targets[free].lerp(point(free===0?-.55:.55,.22+release*.08,-.24-release*.10),release*.76);
      }
      if(webPreparing&&motion?.webAim){
        const aim=rig.worldToLocal(motion.webAim.clone()).sub(shoulders[nextWebHand]).normalize();
        // Let gaze/torso intent lead the hand. The reach ramps in after a short preparation beat.
        targets[nextWebHand].lerp(shoulders[nextWebHand].clone().addScaledVector(aim,.755),.78*webArmWeight);
      }
    }
    if(combat&&combat.time-combat.shotAt<.3&&combat.aimPoint){const shooting=swinging?1-body.webHand:1,direction=rig.worldToLocal(combat.aimPoint.clone()).sub(shoulders[shooting]).normalize();targets[shooting].copy(shoulders[shooting]).addScaledVector(direction,.755);}
    const armFollow=swinging?22:release>.02?5.2:freeFlight?11.5:air.airborne?9:12;
    const armAlpha=poseInitialized?1-Math.exp(-dt*armFollow):1;
    for(let i=0;i<2;i++){
      smoothedArms[i].lerp(targets[i],armAlpha);
      const start=shoulders[i],pole=point(i===0?-.8:.8,.0,.1),{joint,end}=solveLimb(start,smoothedArms[i],pole,.39,.37);
      link(pieces[i*2],start,joint,.115);link(pieces[i*2+1],joint,end,.085);joints[i].position.copy(joint);hands[i].position.copy(end);
    }
    for(let i=0;i<2;i++){
      const side=i===0?-1:1,hip=point(side*.16,-.23,0);
      const foot=wall?point(side*.21,-.81+stride*side*.6,-.47):wallJump>.02?point(side*.29,-.58+(i?-.08:.10),.20+wallJump*.34):point(side*(.19+tucked*.15),-1.10+tucked*(i?.23:.45),tucked*(i?.42:.22)+stride*side);
      if(freeFlight){
        const kickLeg=air.kickLeg;
        // Airborne neutral is already a flight pose: legs trail behind instead of hanging vertically.
        foot.lerp(point(side*.26,-.76,.62),.96);
        // Climb stays extended. The visible kick is a single release-triggered action, not a loop.
        if(climb>.01&&!kickUp.active){
          const climbFoot=point(side*.24,-.88,i===kickLeg?-.10:.28);
          foot.lerp(climbFoot,climb*.48);
        }
        if(kickUp.active){
          const p=kickUp.phase,w=kickUp.weight;
          if(i===kickLeg){
            // One continuous foot path: chamber -> snap -> sweep behind -> long coast. There is no
            // second knee-forward target anywhere after the snap, so it cannot read as air-running.
            const neutral=point(side*.26,-.76,.62),chamber=point(side*.30,-.24,-.34);
            const snap=point(side*.34,.20,-.88),sweep=point(side*.27,-.96,.76),coast=point(side*.25,-.88,.80);
            let target;
            if(p<.20)target=neutral.clone().lerp(chamber,T.MathUtils.smoothstep(p,0,.20));
            else if(p<.42)target=chamber.clone().lerp(snap,T.MathUtils.smoothstep(p,.20,.42));
            else if(p<.76)target=snap.clone().lerp(sweep,T.MathUtils.smoothstep(p,.42,.76));
            else target=sweep.clone().lerp(coast,T.MathUtils.smoothstep(p,.76,1));
            foot.lerp(target,w*.98);
          }else{
            const supportStart=point(side*.20,-1.12,.72),supportLong=point(side*.21,-1.08,.80),supportCoast=point(side*.24,-.90,.72);
            const target=p<.52?supportStart.clone().lerp(supportLong,T.MathUtils.smoothstep(p,.16,.52)):supportLong.clone().lerp(supportCoast,T.MathUtils.smoothstep(p,.52,.92));
            foot.lerp(target,w*.92);
          }
        }
        if(apex>.01){
          // The forward leg stays below the pelvis while the opposite leg remains long and rearward.
          // This preserves the scissor silhouette without creating a seated or kneeling apex.
          const apexFoot=i===kickLeg?point(side*.38,-.80,-.50):point(side*.23,-1.01,.78);
          foot.lerp(apexFoot,apex*.84*(1-kickUp.weight*.62));
        }
        if(fall>.01){
          // Keep both legs trailing, but make one long and one softly bent. The larger vertical and
          // fore/aft stagger stays readable from the rear and does not collapse back into a squat.
          const longLeg=i===nextWebHand;
          const fallFoot=longLeg?point(side*(.40-.08*dive),-1.12,.80-.08*dive):point(side*(.18-.04*dive),-.72,.46-.04*dive);
          foot.lerp(fallFoot,fall*.99);
        }
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
      const legFollow=(body.grounded||wall)?22:swinging?13:kickUp.active?24:release>.02?9:freeFlight?12:air.airborne?9:10;
      const legAlpha=poseInitialized?1-Math.exp(-dt*legFollow):1;
      smoothedFeet[i].lerp(foot,legAlpha);
      const pole=point(side*.26,-.45,-.85);
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
