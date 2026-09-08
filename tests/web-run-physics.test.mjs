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
