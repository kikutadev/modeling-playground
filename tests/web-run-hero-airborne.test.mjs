import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {airborneMotionWeights,computeReleaseKickUp,nextWebHandIndex} from '../web-run/hero.mjs';

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
  body.time=.12;const immediate=computeReleaseKickUp(body);assert.equal(immediate.active,true);assert.ok(immediate.weight>.8);assert.ok(immediate.sweep<.1);
  body.time=.28;const chamber=computeReleaseKickUp(body);assert.equal(chamber.active,true);assert.ok(chamber.weight>.8);assert.ok(chamber.sweep<.1);
  body.time=.58;const recovery=computeReleaseKickUp(body);assert.equal(recovery.active,true);assert.ok(recovery.weight>.75);assert.ok(recovery.sweep>0);
  body.time=.82;const coast=computeReleaseKickUp(body);assert.equal(coast.active,true);assert.ok(coast.sweep>.9);
  body.time=1.0;assert.equal(computeReleaseKickUp(body).active,false);
});


test('next web anticipation alternates to the hand that will actually attach',()=>{
  assert.equal(nextWebHandIndex({attaches:0,webHand:0}),0);
  assert.equal(nextWebHandIndex({attaches:1,webHand:0}),1);
  assert.equal(nextWebHandIndex({attaches:2,webHand:1}),0);
});
