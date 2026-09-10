import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {airborneMotionWeights} from '../web-run/hero.mjs';

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
