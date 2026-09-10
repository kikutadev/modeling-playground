import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {airborneMotionWeights,computeReleaseKickUp} from '../web-run/hero.mjs';

const forward=new Vector3(0,0,-1);

test('strong ascent produces climb emphasis rather than apex or fall',()=>{
  const w=airborneMotionWeights(new Vector3(0,14,-30),forward,0);
  assert.ok(w.climb>.8);assert.ok(w.apex<.1);assert.ok(w.fall<.1);
});

test('near-zero vertical speed produces an apex tuck',()=>{
  const w=airborneMotionWeights(new Vector3(0,.4,-34),forward,0);
  assert.ok(w.apex>.85);assert.ok(w.climb<.1);assert.ok(w.fall<.1);
});

test('fast descent produces fall emphasis',()=>{
  const w=airborneMotionWeights(new Vector3(0,-16,-32),forward,0);
  assert.ok(w.fall>.8);assert.ok(w.climb<.1);assert.ok(w.apex<.1);
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


test('release kick-up is a single bounded action, not a free-flight loop',()=>{
  const body={time:0,releaseTime:0,velocity:new Vector3(0,14,-30)};
  assert.equal(computeReleaseKickUp(body).active,false);
  body.time=.35;const rising=computeReleaseKickUp(body);assert.equal(rising.active,true);assert.ok(rising.weight>0);
  body.time=.60;const peak=computeReleaseKickUp(body);assert.equal(peak.active,true);assert.ok(peak.weight>=rising.weight*.8);
  body.time=1.0;assert.equal(computeReleaseKickUp(body).active,false);
});
