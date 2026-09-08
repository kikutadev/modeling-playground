import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {SwingBody,STEP} from '../web-run/physics.mjs';
import {applySwingAssist,applyTurnAssist,applyReleaseAssist,releaseWithAssist,performWebZip,DEFAULT_TRAVERSAL_TUNING} from '../web-run/traversal-assist.mjs';

const FORWARD=new Vector3(0,0,-1);

test('swing assist adds tangential energy without moving the body directly',()=>{
  const body=new SwingBody([]);
  body.position.set(0,14,0);body.velocity.set(0,-2,-12);
  body.attach({point:new Vector3(14,42,-18),buildingId:1});
  const beforePosition=body.position.clone(),beforeForward=body.velocity.dot(FORWARD);
  const state=applySwingAssist(body,STEP,{desiredDirection:FORWARD,throttle:1});
  assert.equal(state.assisted,true);
  assert.deepEqual(body.position,beforePosition);
  assert.ok(body.velocity.dot(FORWARD)>beforeForward);
});


test('turn assist bends high-speed free flight toward intent without bleeding speed',()=>{
  const body=new SwingBody([]);
  body.position.set(0,20,0);body.velocity.set(0,4,-40);body.grounded=false;
  const beforeHorizontal=Math.hypot(body.velocity.x,body.velocity.z),beforeY=body.velocity.y;
  const desired=new Vector3(1,0,0);
  for(let i=0;i<24;i++)assert.equal(applyTurnAssist(body,STEP,{desiredDirection:desired,turnIntent:1}),true);
  const afterHorizontal=Math.hypot(body.velocity.x,body.velocity.z);
  assert.ok(body.velocity.x>15,'horizontal momentum should visibly turn toward input');
  assert.ok(Math.abs(afterHorizontal-beforeHorizontal)<1e-6,'turn assist must preserve horizontal speed');
  assert.equal(body.velocity.y,beforeY,'turn assist must not alter vertical momentum');
});

test('assisted release preserves continuity but guarantees a useful upward launch',()=>{
  const body=new SwingBody([]);
  body.position.set(0,22,0);body.velocity.set(3,-8,-24);
  body.attach({point:new Vector3(16,52,-24),buildingId:2});
  const before=body.velocity.clone(),speedBefore=body.velocity.length();
  assert.equal(releaseWithAssist(body,FORWARD),true);
  assert.equal(body.anchor,null);
  assert.deepEqual(body.velocity,before);
  assert.equal(body.assistedReleaseTime,body.time);
  for(let elapsed=0;elapsed<DEFAULT_TRAVERSAL_TUNING.releaseAssistDuration;elapsed+=STEP){body.step(STEP);applyReleaseAssist(body,STEP);}
  assert.ok(body.velocity.y>=DEFAULT_TRAVERSAL_TUNING.releaseMinimumUp-.05);
  assert.ok(body.velocity.length()>speedBefore);
  assert.equal(body.releaseAssist,null);
});

test('web zip bridges free flight and respects its cooldown',()=>{
  const body=new SwingBody([]);
  body.position.set(0,20,0);body.velocity.set(0,-5,-20);body.grounded=false;
  assert.equal(performWebZip(body,FORWARD),true);
  assert.ok(body.velocity.z<0);
  assert.ok(body.velocity.y>=DEFAULT_TRAVERSAL_TUNING.zipMinimumUp);
  assert.equal(performWebZip(body,FORWARD),false);
  body.time+=DEFAULT_TRAVERSAL_TUNING.zipCooldown+.01;
  assert.equal(performWebZip(body,FORWARD),true);
});