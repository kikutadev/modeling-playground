import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {airborneMotionWeights,freeFlightPitch,passiveFreeFlightArmTarget,heroArmFollowRate,sampleSwingTraversalPose,nextWebHandIndex,classifyHeroMotion,solveLimb,createHero} from '../web-run/hero.mjs';

const forward=new Vector3(0,0,-1);

test('strong ascent produces climb emphasis rather than apex or fall',()=>{
  const w=airborneMotionWeights(new Vector3(0,14,-30),forward,0);
  assert.ok(w.climb>.8);assert.ok(w.apex<.1);assert.ok(w.fall<.1);
});

test('near-zero vertical speed produces an apex emphasis',()=>{
  const w=airborneMotionWeights(new Vector3(0,.4,-34),forward,0);
  assert.ok(w.apex>.85);assert.ok(w.climb<.1);assert.ok(w.fall<.1);
});

test('fast descent produces fall emphasis',()=>{
  const w=airborneMotionWeights(new Vector3(0,-16,-32),forward,0);
  assert.ok(w.fall>.8);assert.ok(w.climb<.1);assert.ok(w.apex<.1);
});

test('early descent begins fall emphasis before the avatar can look upright in midair',()=>{
  const w=airborneMotionWeights(new Vector3(0,-5.5,-30),forward,0);
  assert.ok(w.fall>.4);assert.ok(w.apex<.1);
});

test('lateral travel relative to facing produces signed bank',()=>{
  const right=airborneMotionWeights(new Vector3(20,2,-24),forward,0);
  const left=airborneMotionWeights(new Vector3(-20,2,-24),forward,0);
  assert.ok(right.bank>0.4);assert.ok(left.bank<-.4);
});

test('passive free flight points the head along the trajectory',()=>{
  const level=freeFlightPitch(new Vector3(0,0,-30));
  const rising=freeFlightPitch(new Vector3(0,18,-30));
  const falling=freeFlightPitch(new Vector3(0,-30,-30));
  assert.ok(Math.abs(level+Math.PI/2)<1e-9);
  assert.ok(rising>-Math.PI/2,'rising flight should pitch the head above the horizon');
  assert.ok(falling<-Math.PI/2,'falling flight should pitch the head below the horizon');
  assert.ok(Math.cos(falling)<0,'the character head axis must point downward during descent');
});


test('passive free-flight hold keeps both arms long instead of frozen in a broken bend',()=>{
  for(const index of [0,1]){
    const side=index===0?-1:1;
    const shoulder=new Vector3(side*.29,.6,0);
    const target=passiveFreeFlightArmTarget(index);
    assert.ok(shoulder.distanceTo(target)>.72);
    const solved=solveLimb(shoulder,target,new Vector3(side*.8,0,.1),.39,.37);
    assert.ok(solved.joint.distanceTo(shoulder)>.38);
    assert.ok(solved.end.distanceTo(solved.joint)>.36);
  }
});

test('explicit shooting overrides passive free-flight arm hold',()=>{
  const passive=heroArmFollowRate({freeFlight:true});
  const webAim=heroArmFollowRate({freeFlight:true,webPreparing:true});
  const shooting=heroArmFollowRate({freeFlight:true,shooting:true});
  assert.ok(passive>0,'passive free flight must not freeze a compressed arm pose');
  assert.ok(webAim>passive);
  assert.ok(shooting>webAim,'shooting must win over passive flight pose locking');
});


test('free-flight web shot visibly extends the shooting arm toward its aim point',()=>{
  const body={
    position:new Vector3(0,80,0),velocity:new Vector3(0,-18,-30),wall:null,grounded:false,anchor:null,time:5,webHand:0,
    wallJumpTime:-10,wallJumpFacing:new Vector3(0,0,-1),releaseTime:-10,zipTime:-10,dodgeTime:-10,landTime:-10,
    landingUntil:-10,landingStart:-10,landingType:'none',attaches:1,
  };
  const hero=createHero(),idle={time:5,shotAt:-10,kickAt:-10,kickTarget:null,aimPoint:null};
  for(let i=0;i<30;i++)hero.update(body,forward,1/60,idle,{});
  const idleHand=hero.shotHandWorld.clone();
  const aim=new Vector3(0,80,-40),combat={time:5,shotAt:5,kickAt:-10,kickTarget:null,aimPoint:aim};
  for(let i=0;i<6;i++){combat.time+=1/60;body.time+=1/60;hero.update(body,forward,1/60,combat,{});}
  const shotHand=hero.shotHandWorld.clone();
  assert.ok(shotHand.distanceTo(idleHand)>.7,'shooting hand must not stay frozen in passive flight');
  const towardAim=shotHand.clone().sub(body.position).normalize().dot(aim.clone().sub(body.position).normalize());
  assert.ok(towardAim>.9,'shooting hand should extend in the target direction');
});

test('release temporarily suppresses the generic airborne phases',()=>{
  const free=airborneMotionWeights(new Vector3(0,14,-30),forward,0);
  const releasing=airborneMotionWeights(new Vector3(0,14,-30),forward,1);
  assert.ok(releasing.climb<free.climb*.7);
});


test('next web anticipation alternates to the hand that will actually attach',()=>{
  assert.equal(nextWebHandIndex({attaches:0,webHand:0}),0);
  assert.equal(nextWebHandIndex({attaches:1,webHand:0}),1);
  assert.equal(nextWebHandIndex({attaches:2,webHand:1}),0);
});


test('anchored ground contact is a tethered run and never a landing animation',()=>{
  const tethered=classifyHeroMotion({anchor:{},grounded:true});
  assert.equal(tethered.tetheredGround,true);
  assert.equal(tethered.swinging,false);
  assert.equal(tethered.landingAllowed,false);
  const airSwing=classifyHeroMotion({anchor:{},grounded:false});
  assert.equal(airSwing.tetheredGround,false);
  assert.equal(airSwing.swinging,true);
});


test('swing bottom keeps one long leg and one lateral accent without a run cycle',()=>{
  const pose=sampleSwingTraversalPose({
    anchor:{point:new Vector3(0,10,-5)},position:new Vector3(0,0,0),velocity:new Vector3(0,1,-30),webHand:0,
  });
  assert.equal(pose.active,true);
  assert.ok(pose.bottomness>.8);
  assert.ok(pose.feet[0].y<-1);
  assert.ok(Math.abs(pose.feet[1].x)>.35);
  assert.ok(pose.feet[1].z>0);
});
