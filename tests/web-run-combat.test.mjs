import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Box3} from 'three';
import {AirCombat,DRONE_SPAWNS,DRONE_HIT_RADIUS,TITAN_WEB_RADIUS_XZ} from '../web-run/combat.mjs';
import {SwingBody,STEP,makeCity,chooseAnchor,segmentHit} from '../web-run/physics.mjs';
import {solveLimb} from '../web-run/hero.mjs';
const forward=new Vector3(0,0,-1);
function setup(buildings=[]){const body=new SwingBody(buildings);body.position.set(0,24,-43);body.velocity.set(0,0,0);const combat=new AirCombat(buildings);combat.drones[0].home.set(0,24,-73);combat.drones[0].position.copy(combat.drones[0].home);return {body,combat};}
function tick(combat,body,seconds){for(let i=0;i<seconds/STEP;i++){body.time+=STEP;combat.step(STEP,body);}}

test('web shots stop a drone and three hits destroy it',()=>{
 const {body,combat}=setup();
 for(let i=0;i<3;i++){assert.ok(combat.shoot(body,forward));tick(combat,body,.55);}
 assert.equal(combat.defeated,1);assert.equal(combat.drones[0].hp,0);assert.ok(combat.drainEvents().some(e=>e.type==='destroy'));
});
test('facades block target acquisition and web projectiles',()=>{
 const wall={box:new Box3(new Vector3(-20,0,-60),new Vector3(20,60,-58))};
 const {body,combat}=setup([wall]);assert.equal(combat.target(body.position,forward),null);
 combat.shoot(body,forward);tick(combat,body,1);assert.equal(combat.drones[0].hp,3);
});
test('web stun followed by aerial kick destroys a drone without teleporting',()=>{
 const {body,combat}=setup();body.position.z=-56;
 combat.shoot(body,forward);tick(combat,body,.3);assert.equal(combat.drones[0].hp,2);
 const start=body.position.clone();assert.ok(combat.kick(body,forward));assert.deepEqual(body.position,start);
 for(let i=0;i<65;i++){body.step(STEP);combat.step(STEP,body);}
 assert.equal(combat.drones[0].hp,0);assert.ok(body.position.distanceTo(start)>10);
});
test('drone warns before firing; dodge protects only its brief window',()=>{
 const {body,combat}=setup();tick(combat,body,2.5);assert.ok(combat.drones[0].charge>0);assert.equal(combat.projectiles.filter(p=>p.kind==='bolt').length,0);
 const bolt=()=>({kind:'bolt',position:body.position.clone().add(new Vector3(0,0,1)),velocity:new Vector3(0,0,-120),life:1});
 body.dodge(new Vector3(1,0,0));combat.projectiles.push(bolt());tick(combat,body,STEP);assert.equal(combat.health,3);
 tick(combat,body,.5);combat.projectiles.push(bolt());tick(combat,body,STEP);assert.equal(combat.health,2);
 combat.projectiles.push(bolt());tick(combat,body,STEP);assert.equal(combat.health,2);
});
test('reeling stores upward momentum for the release, without a position jump on release',()=>{
 const body=new SwingBody([]);body.position.set(0,25,0);body.velocity.set(0,0,0);body.attach({point:new Vector3(0,50,0),buildingId:1});
 for(let i=0;i<30;i++)body.step(STEP,{reel:true});assert.ok(body.velocity.y>10);
 const p=body.position.clone(),v=body.velocity.clone();body.release();assert.deepEqual(body.position,p);assert.deepEqual(body.velocity,v);
});
test('anchors can be selected when looking sideways and never through their own building',()=>{
 const city=makeCity();for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
 const body=new SwingBody(city);body.position.set(0,20,0);const direction=new Vector3(Math.sin(yaw),0,-Math.cos(yaw));const target=chooseAnchor(body.position,direction,city);assert.ok(target);
 assert.ok(target.point.clone().sub(body.position).setY(0).normalize().dot(direction)>.1);
 assert.ok(!city.some(b=>{const t=segmentHit(body.position,target.point,b.box);return t!==null&&t<.999;}));
 }
});
test('sky lobby can be crossed internally, while its floor and ceiling collide',()=>{
 const body=new SwingBody(makeCity());body.position.set(0,28,-123);body.velocity.set(0,0,-25);
 for(let i=0;i<180;i++)body.step(STEP,{steer:forward});assert.ok(body.position.z<-160);assert.ok(body.position.y>=18);
 body.position.set(0,45,-140);body.velocity.set(0,60,0);for(let i=0;i<12;i++)body.step(STEP);assert.ok(body.position.y<45);
});
test('limb IK keeps both segments at their defined lengths across extreme targets',()=>{
 const start=new Vector3(-.3,.6,0);for(const target of [new Vector3(0,8,0),new Vector3(0,-8,3),start.clone(),new Vector3(-.4,1,.3)]){
 const {joint,end}=solveLimb(start,target,new Vector3(-1,0,.2),.39,.37);assert.ok(Math.abs(start.distanceTo(joint)-.39)<1e-7);assert.ok(Math.abs(joint.distanceTo(end)-.37)<1e-7);
 }
});

test('giant titan silhouette has a forgiving matching web-hit volume',()=>{
 const {body,combat}=setup();
 combat.drones.forEach((d,i)=>{if(i)d.hp=0;});
 combat.drones[0].position.set(3,24,-66);combat.drones[0].home.copy(combat.drones[0].position);
 combat.projectiles.push({kind:'web',position:new Vector3(0,24,-60),velocity:new Vector3(0,0,-120),life:1});
 combat.step(.1,body);
 assert.equal(combat.drones[0].hp,2);
});

test('production titan spawns and hit volume match the 40m-class enemy scale',()=>{
 assert.ok(DRONE_SPAWNS[0][1]>=44&&DRONE_SPAWNS[0][1]<=50);
 assert.ok(DRONE_SPAWNS[2][1]>=60&&DRONE_SPAWNS[2][1]<=66);
 assert.ok(DRONE_HIT_RADIUS>=7&&DRONE_HIT_RADIUS<9);
 assert.ok(TITAN_WEB_RADIUS_XZ>=13&&TITAN_WEB_RADIUS_XZ<=15);
});

test('traversal WEB stops on a titan before a building behind it',()=>{
 const {body,combat}=setup();
 combat.drones.forEach((d,i)=>{if(i)d.hp=0;});
 combat.drones[0].position.set(0,30,-72);combat.drones[0].home.copy(combat.drones[0].position);
 const fallback={point:new Vector3(0,35,-115),buildingId:99,score:1};
 const anchor=combat.webAnchor(body.position,forward,fallback);
 assert.equal(anchor.kind,'enemy');assert.equal(anchor.enemyId,0);
 assert.ok(body.position.distanceTo(anchor.point)<body.position.distanceTo(fallback.point));
 body.attach(anchor);assert.equal(body.anchor.enemyId,0);
});

test('enemy traversal anchor follows titan movement and releases if titan is destroyed',()=>{
 const {body,combat}=setup();
 combat.drones.forEach((d,i)=>{if(i)d.hp=0;});
 const anchor=combat.webAnchor(body.position,forward,null);assert.equal(anchor?.kind,'enemy');
 body.attach(anchor);const offset=body.anchor.offset.clone();
 combat.drones[0].position.add(new Vector3(8,3,-5));combat.syncAnchor(body);
 assert.ok(body.anchor.point.distanceTo(combat.drones[0].position.clone().add(offset))<1e-8);
 combat.drones[0].hp=0;assert.equal(combat.syncAnchor(body),false);assert.equal(body.anchor,null);
});

test('active titan patrol covers a visibly larger volume',()=>{
 const {body,combat}=setup();combat.drones.forEach((d,i)=>{if(i)d.hp=0;});
 const start=combat.drones[0].position.clone();
 tick(combat,body,6);const moved=combat.drones[0].position.distanceTo(start);
 assert.ok(moved>8,`expected visible movement, got ${moved}`);
});
