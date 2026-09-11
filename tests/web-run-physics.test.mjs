import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {SwingBody, makeCity, chooseAnchor, STEP, segmentHit} from '../web-run/physics.mjs';
const f=new Vector3(0,0,-1);
test('anchor sits on an actual visible facade',()=>{
 const city=makeCity(),body=new SwingBody(city),target=chooseAnchor(body.position,f,city);
 assert.ok(target);const b=city.find(b=>b.id===target.buildingId);assert.ok(b.box.containsPoint(target.point));
 assert.ok(['x','z'].some(k=>target.point[k]===b.box.min[k]||target.point[k]===b.box.max[k]));
 assert.ok(!city.some(x=>x!==b&&segmentHit(body.position,target.point,x.box)!==null));
});
test('release preserves momentum exactly and free flight obeys gravity',()=>{
 const body=new SwingBody([]);body.position.set(0,30,0);body.velocity.set(0,0,-24);body.attach({point:new Vector3(5,50,-20),buildingId:1});
 for(let i=0;i<180;i++)body.step(STEP,{steer:f});
 const v=body.velocity.clone(),p=body.position.clone();body.release();assert.deepEqual(body.velocity,v);assert.deepEqual(body.position,p);
 body.step(STEP);assert.ok(body.velocity.y<v.y);assert.ok(body.position.distanceTo(p)>0);
});
test('taut rope stays bounded and never pushes on a slack rope',()=>{
 const body=new SwingBody([]);body.position.set(0,50,0);body.velocity.set(20,0,-10);body.attach({point:new Vector3(0,70,0),buildingId:1});
 for(let i=0;i<600;i++){body.step(STEP,{steer:f});assert.ok(body.position.distanceTo(body.anchor.point)<=body.ropeLength+1e-7);}
 body.position.copy(body.anchor.point).add(new Vector3(0,-10,0));body.velocity.set(0,0,0);body.step(STEP);assert.ok(body.position.distanceTo(body.anchor.point)<11);
});
test('roof landing and wall contact do not tunnel at high speed',()=>{
 const city=makeCity(),body=new SwingBody(city),b=city[0];
 body.position.set(b.x,b.h+1.2,b.z);body.velocity.set(0,-62,0);body.step(STEP);assert.ok(body.grounded);assert.ok(body.position.y>=b.h+1.05);
 body.position.set(b.box.min.x-1,12,b.z);body.velocity.set(62,0,0);for(let i=0;i<6;i++)body.step(STEP);
 assert.ok(body.position.x<b.box.min.x);assert.ok(body.wall);body.jump(f);assert.ok(body.velocity.x<0);assert.ok(body.velocity.y>0);
});

test('fresh wall contact stays on the wall until an explicit jump',()=>{
 const city=makeCity(),body=new SwingBody(city),b=city[0];
 body.position.set(b.box.min.x-1,12,b.z);body.velocity.set(62,0,0);
 for(let i=0;i<6&&!body.wall;i++)body.step(STEP);
 assert.ok(body.wall);assert.equal(body.wallJumpTime,-10,'wall contact alone must not auto-jump');
 const contactPosition=body.position.clone();
 body.jump(new Vector3(0,0,-1));
 assert.equal(body.wall,null);assert.ok(body.wallJumpTime>-1);assert.ok(body.velocity.y>0);
 assert.ok(body.position.equals(contactPosition),'explicit kick must not teleport the body');
});

test('idle wall contact clings in place instead of sliding down under gravity',()=>{
 const city=makeCity(),body=new SwingBody(city),b=city[0];
 body.position.set(b.box.min.x-1,18,b.z);body.velocity.set(62,-7,0);
 for(let i=0;i<12&&!body.wall;i++)body.step(STEP);
 assert.ok(body.wall,'expected wall contact');
 const clingPosition=body.position.clone();
 for(let i=0;i<Math.round(2/STEP);i++)body.step(STEP,{moveMagnitude:0});
 assert.ok(body.wall,'idle cling should retain wall contact');
 assert.ok(body.position.distanceTo(clingPosition)<1e-6,`idle wall cling drifted ${body.position.distanceTo(clingPosition)}`);
 assert.ok(body.velocity.length()<1e-9,'idle wall cling should have zero velocity');
});

test('wall kick keeps an outward escape component while following the aimed heading',()=>{
 const city=makeCity(),body=new SwingBody(city),b=city[0];
 body.position.set(b.box.min.x-1,12,b.z);body.velocity.set(62,0,0);for(let i=0;i<6;i++)body.step(STEP);
 assert.ok(body.wall);assert.equal(body.wallJumpTime,-10);const jumpAt=body.time;body.jump(new Vector3(0,0,-1));
 assert.ok(body.velocity.x<0,'Kick must clear the facade');
 assert.ok(body.velocity.z<0,'Aim direction must shape the launch instead of a pure normal bounce');
 assert.ok(body.velocity.y>0);assert.equal(body.wallJumpTime,jumpAt);
 assert.ok(body.wallJumpFacing.x<0&&body.wallJumpFacing.z<0);
 const planar=body.velocity.clone().setY(0),desired=new Vector3(0,0,-1);
 const angle=Math.acos(Math.max(-1,Math.min(1,planar.clone().normalize().dot(desired))))*180/Math.PI;
 assert.ok(angle<22,`wall kick diverged ${angle.toFixed(1)}° from player heading`);
});

test('wall kick keeps momentum and stays on a clean post-jump trajectory for 0.6 seconds',()=>{
 const city=makeCity(),body=new SwingBody(city),b=city.find(x=>x.kind!=='atrium'&&x.x<0);
 const desired=new Vector3(0,0,-1);
 body.position.set(b.box.max.x+1,20,b.z);body.velocity.set(-42,0,-22);
 const incomingHorizontal=Math.hypot(body.velocity.x,body.velocity.z);
 let kicked=false,kickPosition=null;
 for(let i=0;i<30&&!body.wall;i++)body.step(STEP,{steer:desired,forward:true,moveMagnitude:1});
 assert.ok(body.wall,'expected wall contact');assert.equal(body.wallJumpTime,-10);
 body.jump(desired);kicked=true;kickPosition=body.position.clone();
 assert.ok(kicked,'expected explicit wall kick');
 const launchHorizontal=Math.hypot(body.velocity.x,body.velocity.z);
 assert.ok(launchHorizontal>=incomingHorizontal*.70,`kick bled too much speed: ${launchHorizontal.toFixed(1)} from ${incomingHorizontal.toFixed(1)}`);
 const normal=body.wallJumpFacing.clone().setY(0);
 assert.ok(normal.dot(desired)>.90,'launch heading should remain close to intended forward direction');
 for(let i=0;i<Math.round(.6/STEP);i++)body.step(STEP,{steer:desired,forward:true,moveMagnitude:1});
 assert.equal(body.wall,null,'post-jump path must not immediately stick to a facade again');
 assert.equal(body.grounded,false);
 assert.ok(body.position.z<kickPosition.z-12,'post-jump path should keep meaningful forward progress');
 assert.ok(Math.abs(body.position.x-kickPosition.x)<12,'wall clearance must not become a large sideways throw');
});

test('anchor selection follows movement intent instead of choosing a nearer off-axis facade',()=>{
 const city=makeCity(),position=new Vector3(0,22,0);
 const rightward=new Vector3(1,0,0);
 const target=chooseAnchor(position,rightward,city,null,{desiredDirection:rightward,idealRopeLength:58});
 assert.ok(target);
 const travel=target.point.clone().sub(position).setY(0).normalize();
 assert.ok(travel.dot(rightward)>.65,'anchor must be strongly aligned with movement intent');
 assert.ok(target.point.x>30,'rightward intent should choose the right side of the avenue');
});

test('landing chooses roll, skid and stick from impact plus stop intent',()=>{
 const land=(velocity,input)=>{const body=new SwingBody([]);body.position.set(0,1.35,0);body.velocity.copy(velocity);for(let i=0;i<24&&!body.grounded;i++)body.step(STEP,input);return body;};
 const roll=land(new Vector3(0,-18,-30),{brake:true,moveMagnitude:1});assert.equal(roll.landingType,'roll');
 const skid=land(new Vector3(0,-4,-14),{brake:true,moveMagnitude:1});assert.equal(skid.landingType,'skid');
 const stick=land(new Vector3(0,-4,-5),{moveMagnitude:0});assert.equal(stick.landingType,'stick');
});

test('reverse input can actually bleed free-flight and ground speed',()=>{
 const air=new SwingBody([]);air.position.set(0,24,0);air.velocity.set(0,0,-40);air.grounded=false;
 for(let i=0;i<120;i++)air.step(STEP,{brake:true,moveMagnitude:1});
 assert.ok(Math.hypot(air.velocity.x,air.velocity.z)<10);
 const ground=new SwingBody([]);ground.position.set(0,1.1,0);ground.velocity.set(0,0,-26);ground.grounded=true;
 for(let i=0;i<45;i++)ground.step(STEP,{brake:true,moveMagnitude:1});
 assert.ok(Math.hypot(ground.velocity.x,ground.velocity.z)<2.5);
});

test('city reads as a larger urban canyon while leaving a wide central avenue',()=>{
 const city=makeCity().filter(b=>b.kind!=='atrium'&&b.x!==0);
 assert.ok(Math.max(...city.map(b=>b.h))>130);
 assert.ok(Math.max(...city.map(b=>Math.abs(b.x)))>=460);
 const nearestFacade=Math.min(...city.map(b=>Math.abs(b.x)-b.w/2));
 assert.ok(nearestFacade>55);
});

test('ground brake starts a visible skid state and can retrigger after release',()=>{
 const body=new SwingBody([]);body.position.set(0,1.1,0);body.velocity.set(0,0,-22);body.grounded=true;
 body.step(STEP,{brake:true,moveMagnitude:1});
 assert.equal(body.landingType,'skid');assert.ok(body.landingUntil>body.time);
 for(let i=0;i<60;i++)body.step(STEP,{moveMagnitude:0});
 body.position.y=1.1;body.grounded=true;body.velocity.set(0,0,-18);body.landingType='none';
 body.step(STEP,{brake:true,moveMagnitude:1});
 assert.equal(body.landingType,'skid');
});


test('landing while web-attached flows into a run instead of a roll',()=>{
  const body=new SwingBody([]);
  body.position.set(0,1.35,0);body.velocity.set(0,-18,-30);
  body.attach({point:new Vector3(0,35,-45),buildingId:1});
  for(let i=0;i<24&&!body.grounded;i++)body.step(STEP,{moveMagnitude:1,forward:true,steer:f});
  assert.equal(body.grounded,true);
  assert.equal(body.anchor!==null,true);
  assert.equal(body.landingType,'run');
});

test('attaching on the ground clears an in-progress roll state',()=>{
  const body=new SwingBody([]);
  body.position.set(0,1.1,0);body.grounded=true;body.landingType='roll';body.landingUntil=body.time+.5;
  body.attach({point:new Vector3(0,30,-40),buildingId:1});
  assert.equal(body.landingType,'none');
  assert.equal(body.landingUntil,body.time);
});
