import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {airborneMotionWeights,freeFlightPitch,sampleSwingTraversalPose,nextWebHandIndex,classifyHeroMotion} from '../web-run/hero.mjs';

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
