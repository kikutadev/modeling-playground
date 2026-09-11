import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {airborneMotionWeights,computeReleaseKickUp,sampleReleaseTraversalPose,sampleBallisticTraversalPose,sampleSwingTraversalPose,nextWebHandIndex,classifyHeroMotion} from '../web-run/hero.mjs';

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

test('release temporarily suppresses the generic airborne phases',()=>{
  const free=airborneMotionWeights(new Vector3(0,14,-30),forward,0);
  const releasing=airborneMotionWeights(new Vector3(0,14,-30),forward,1);
  assert.ok(releasing.climb<free.climb*.7);
});


test('release kick-up is a single bounded action with an explicit backward sweep',()=>{
  const body={time:0,releaseTime:0,velocity:new Vector3(0,14,-30)};
  assert.equal(computeReleaseKickUp(body).active,false);
  body.time=.08;const immediate=computeReleaseKickUp(body);assert.equal(immediate.active,true);assert.ok(immediate.weight>.8);assert.ok(immediate.sweep<.1);
  body.time=.18;const chamber=computeReleaseKickUp(body);assert.equal(chamber.active,true);assert.ok(chamber.weight>.8);assert.ok(chamber.sweep<.1);
  body.time=.42;const recovery=computeReleaseKickUp(body);assert.equal(recovery.active,true);assert.ok(recovery.weight>.75);assert.ok(recovery.sweep>0);
  body.time=.58;const coast=computeReleaseKickUp(body);assert.equal(coast.active,true);assert.ok(coast.sweep>.9);
  body.time=.70;assert.equal(computeReleaseKickUp(body).active,false);
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


test('release traversal keeps one kick leg on a continuous chamber snap sweep coast path',()=>{
  const body={time:0,releaseTime:0,velocity:new Vector3(0,14,-30),webHand:0};
  const at=time=>{body.time=time;return sampleReleaseTraversalPose(body);};
  const chamber=at(.12),snap=at(.24),sweep=at(.40),coast=at(.52);
  assert.equal(chamber.stage,'chamber');
  assert.equal(snap.stage,'snap');
  assert.equal(sweep.stage,'sweep');
  assert.equal(coast.stage,'coast');
  assert.ok(snap.feet[1].z<chamber.feet[1].z);
  assert.ok(sweep.feet[1].z>snap.feet[1].z);
  assert.ok(coast.feet[1].z>sweep.feet[1].z);
  assert.ok(coast.feet[0].y<-1.05);
  assert.ok(Math.abs(coast.feet[0].x)>.28);
  assert.ok(coast.feet[0].z>.35);
});

test('release recovery never drives the kicked foot forward a second time',()=>{
  const body={releaseTime:0,velocity:new Vector3(0,10,-30),webHand:1};
  const zs=[];
  for(const time of [.38,.42,.46,.50,.54,.58]){body.time=time;zs.push(sampleReleaseTraversalPose(body).feet[0].z);}
  for(let i=1;i<zs.length;i++)assert.ok(zs[i]>=zs[i-1]-.001);
});


test('ballistic climb keeps both legs trailing instead of restarting a run cycle',()=>{
  const pose=sampleBallisticTraversalPose({velocity:new Vector3(0,8,-30),webHand:0,attaches:1});
  assert.equal(pose.phase,'climb');
  assert.ok(pose.feet[0].z>.35);assert.ok(pose.feet[1].z>.35);
  assert.ok(Math.abs(pose.feet[1].x)>.5);
  assert.ok(pose.feet[0].y<-.95);assert.ok(pose.feet[1].y<-.95);
});

test('apex accent opens laterally while every foot stays behind the pelvis',()=>{
  const pose=sampleBallisticTraversalPose({velocity:new Vector3(0,.2,-30),webHand:0,attaches:1});
  assert.equal(pose.phase,'apex');
  assert.ok(pose.open>.9);
  assert.ok(Math.abs(pose.feet[1].x)>.48);
  assert.ok(pose.feet.every(foot=>foot.z>.08));
  assert.ok(Math.min(...pose.feet.map(foot=>foot.y))<-1.1);
  assert.ok(Math.abs(pose.torsoTwist)>.3);
});

test('fall returns to long trailing legs after the apex accent',()=>{
  const pose=sampleBallisticTraversalPose({velocity:new Vector3(0,-14,-30),webHand:0,attaches:1});
  assert.equal(pose.phase,'fall');
  assert.ok(pose.feet.every(foot=>foot.z>.35));
  assert.ok(Math.max(...pose.feet.map(foot=>Math.abs(foot.x)))>.55);
  assert.ok(pose.feet.every(foot=>foot.y<-1));
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
