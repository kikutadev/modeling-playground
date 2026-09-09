import * as T from 'three';
const UP=new T.Vector3(0,1,0);
const point=(x,y,z)=>new T.Vector3(x,y,z);

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
  let poseInitialized=false;
  return {root,handWorld,shotHandWorld,update(body,forward,dt,combat=null){
    root.position.copy(body.position);
    const velocity=body.velocity,speed=velocity.length(),wall=body.wall&&!body.grounded;
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
    const tucked=wall?0:body.grounded?landed*.8:swinging?swingTuck:kick?.35:Math.max(release*.85+zip*.25+.15,wallJump*.78);
    const landingPitch=landingType==='skid'?T.MathUtils.lerp(.34,-.04,landingEase):landingType==='stick'?T.MathUtils.lerp(-.22,-.08,landingEase):-.08;
    const pose=new T.Quaternion().setFromEuler(new T.Euler(wall?0:body.grounded?landingPitch:swinging?-.2:Math.min(.9,speed*.014),yaw,0,'YXZ'));
    if(swinging){const pull=body.anchor.point.clone().sub(body.position).normalize();pose.premultiply(new T.Quaternion().setFromUnitVectors(UP,UP.clone().lerp(pull,.58).normalize()));}
    // A release changes the physical constraint instantly, but the body must not snap with it.
    // Let the torso keep the outgoing swing attitude for a few frames before settling into free flight.
    root.quaternion.slerp(pose,1-Math.exp(-dt*(release>.02?3.2:13)));
    const dodgeAge=body.time-body.dodgeTime;
    rig.rotation.z=dodgeAge<.42?Math.PI*2*T.MathUtils.smoothstep(dodgeAge,0,.42):0;
    rig.rotation.x=landingType==='roll'?-Math.PI*2*landingEase:landingType==='skid'?.10*Math.sin(Math.PI*landingPhase):0;
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
      targets[0].set(-.57,.30,-.02);targets[1].set(.54,.17,-.21);
      if(release>.02){
        // The hand that just released the web trails behind the torso instead of teleporting
        // straight into the generic airborne pose. The opposite arm opens forward for balance.
        const released=body.webHand,free=1-released,side=released===0?-1:1;
        targets[released].set(side*.56,.50+release*.52,.12+release*.26);
        targets[free].set(free===0?-.55:.55,.22+release*.08,-.24-release*.10);
      }
    }
    if(combat&&combat.time-combat.shotAt<.3&&combat.aimPoint){const shooting=swinging?1-body.webHand:1,direction=rig.worldToLocal(combat.aimPoint.clone()).sub(shoulders[shooting]).normalize();targets[shooting].copy(shoulders[shooting]).addScaledVector(direction,.755);}
    const armFollow=swinging?22:release>.02?4.0:12;
    const armAlpha=poseInitialized?1-Math.exp(-dt*armFollow):1;
    for(let i=0;i<2;i++){
      smoothedArms[i].lerp(targets[i],armAlpha);
      const start=shoulders[i],pole=point(i===0?-.8:.8,.0,.1),{joint,end}=solveLimb(start,smoothedArms[i],pole,.39,.37);
      link(pieces[i*2],start,joint,.115);link(pieces[i*2+1],joint,end,.085);joints[i].position.copy(joint);hands[i].position.copy(end);
    }
    for(let i=0;i<2;i++){
      const side=i===0?-1:1,hip=point(side*.16,-.23,0);
      const foot=wall?point(side*.21,-.81+stride*side*.6,-.47):wallJump>.02?point(side*.29,-.58+(i?-.08:.10),.20+wallJump*.34):point(side*(.19+tucked*.15),-1.10+tucked*(i?.23:.45),tucked*(i?.42:.22)+stride*side);
      if(body.grounded&&landingActive){
        if(landingType==='roll')foot.set(side*.24,-.58,.26);
        else if(landingType==='skid')foot.set(side*.22,-1.02,i===0?-.46:.22);
        else foot.set(side*.28,-.78,-.18);
      }
      if(kick&&i===1)foot.set(.17,-.2,-.85);
      const legFollow=(body.grounded||wall)?22:swinging?13:release>.02?4.6:10;
      const legAlpha=poseInitialized?1-Math.exp(-dt*legFollow):1;
      smoothedFeet[i].lerp(foot,legAlpha);
      const pole=point(side*.26,-.45,-.85);
      const {joint,end}=solveLimb(hip,smoothedFeet[i],pole,.48,.46);
      link(pieces[4+i*2],hip,joint,.145);link(pieces[5+i*2],joint,end,.106);joints[2+i].position.copy(joint);feet[i].position.copy(end);
      feet[i].rotation.x=wall?-.8:kick&&i===1?-1.1:0;
    }
    poseInitialized=true;
    head.rotation.y=wall?0:Math.sin(body.time*.7)*.025;
    root.updateMatrixWorld(true);hands[body.webHand].getWorldPosition(handWorld);hands[swinging?1-body.webHand:1].getWorldPosition(shotHandWorld);
  }};
}
