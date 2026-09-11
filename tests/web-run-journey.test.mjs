import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {SwingBody,makeCity,chooseAnchor,STEP} from '../web-run/physics.mjs';
import {AirCombat} from '../web-run/combat.mjs';
import {RING_POINTS,crossesRing} from '../web-run/course.mjs';
import {performWebZip} from '../web-run/traversal-assist.mjs';
import {computeAirborneMotion} from '../web-run/hero.mjs';

test('the full course and three drones are reachable through production movement and combat',()=>{
 const city=makeCity(),body=new SwingBody(city),combat=new AirCombat(city);
 let ring=0,nextAttach=0;const passed=[];
 // Feedback controller exercises production traversal primitives. The widened city uses longer
 // swings, and the final short gap is intentionally bridged with the same Web Zip the game exposes.
 for(let i=0;i<120*40 && ring<RING_POINTS.length;i++){
   const target=RING_POINTS[ring],delta=target.clone().sub(body.position);
   const forward=delta.clone().setY(0).normalize();
   const steer=new Vector3(delta.x*.7-body.velocity.x*.7,0,delta.z*.6-body.velocity.z*.4).clampLength(0,1);
   const finalGap=ring===5&&delta.length()<58;
   if(body.anchor&&((body.velocity.y>7&&body.position.y>target.y-3)||delta.length()<9||finalGap)){body.release();nextAttach=body.time+.2;}
   if(finalGap&&!body.anchor&&body.time-body.zipTime>.6)performWebZip(body,forward);
   if(!body.anchor&&body.time>nextAttach&&body.velocity.y<4&&!finalGap){body.attach(chooseAnchor(body.position,forward,city,body.lastBuildingId));nextAttach=body.time+.25;}
   if(body.grounded||body.wall)body.jump(forward);
   if(combat.target(body.position,forward))combat.shoot(body,forward);
   const prev=body.position.clone();body.step(STEP,{steer,forward:true,reel:body.position.y<target.y+5});combat.step(STEP,body);
   assert.ok(!body.outOfBounds);assert.ok(combat.health>0);
   if(crossesRing(prev,body.position,ring)){ring++;passed.push({ring,time:body.time,position:body.position.toArray()});}
 }
 assert.equal(ring,6,JSON.stringify(passed));assert.equal(combat.defeated,3);assert.ok(body.attaches>=6);assert.ok(body.releases>=6);
});
test('a near miss or a teleport sample on one side does not count as a ring crossing',()=>{
 const r=RING_POINTS[0];assert.equal(crossesRing(r.clone().add(new Vector3(0,0,2)),r.clone().add(new Vector3(0,0,1)),0),false);
 assert.equal(crossesRing(r.clone().add(new Vector3(9,0,2)),r.clone().add(new Vector3(9,0,-2)),0),false);
 assert.equal(crossesRing(r.clone().add(new Vector3(0,0,2)),r.clone().add(new Vector3(0,0,-2)),0),true);
});

test('airborne motion weights follow climb, apex, fall and turn continuously',()=>{
 const body={anchor:null,grounded:false,wall:null,webHand:0,velocity:new Vector3(0,16,-28)};
 let motion=computeAirborneMotion(body,new Vector3(0,0,-1));
 assert.ok(motion.climb>.95);assert.ok(motion.apex<.05);assert.equal(motion.kickLeg,1);
 body.velocity.set(0,0,-30);motion=computeAirborneMotion(body,new Vector3(0,0,-1));
 assert.ok(motion.apex>.95);assert.ok(motion.climb<.05);assert.ok(motion.fall<.05);
 body.velocity.set(0,-22,-30);motion=computeAirborneMotion(body,new Vector3(0,0,-1));
 assert.ok(motion.fall>.95);assert.ok(motion.dive>0);
 body.velocity.set(24,2,-24);motion=computeAirborneMotion(body,new Vector3(0,0,-1));
 assert.ok(motion.turn>.65);assert.ok(motion.turnSigned>0,'rightward travel should create a right bank');
 body.grounded=true;motion=computeAirborneMotion(body,new Vector3(0,0,-1));
 assert.equal(motion.airborne,false);assert.equal(motion.climb,0);assert.equal(motion.apex,0);assert.equal(motion.fall,0);
});
