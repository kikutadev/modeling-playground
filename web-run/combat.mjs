import {Vector3} from 'three';
import {segmentHit} from './physics.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const DRONE_SPAWNS=[[0,46,-88],[-5,54,-178],[4,62,-270]];
export const DRONE_TARGET_RANGE=150;
export const DRONE_KICK_RANGE=40;
export const DRONE_KICK_CONTACT=10;
export const DRONE_HIT_RADIUS=7.2;
export const TITAN_WEB_RADIUS_XZ=14;
export const TITAN_WEB_RADIUS_Y=20;
export const TITAN_SHOT_RANGE=105;
export const TITAN_THREAT_RANGE=115;
const distanceToSegment=(p,a,b)=>{const v=b.clone().sub(a),t=clamp(p.clone().sub(a).dot(v)/Math.max(v.lengthSq(),1e-8),0,1);return a.clone().addScaledVector(v,t).distanceTo(p);};

function ellipsoidSurface(center,toward,rx=TITAN_WEB_RADIUS_XZ,ry=TITAN_WEB_RADIUS_Y,rz=TITAN_WEB_RADIUS_XZ){
  const direction=toward.clone().sub(center);
  if(direction.lengthSq()<1e-8)return center.clone().add(new Vector3(0,0,rz));
  direction.normalize();
  const scale=1/Math.sqrt(direction.x*direction.x/(rx*rx)+direction.y*direction.y/(ry*ry)+direction.z*direction.z/(rz*rz));
  return center.clone().addScaledVector(direction,scale);
}

function segmentEllipsoidHit(a,b,center,rx=TITAN_WEB_RADIUS_XZ,ry=TITAN_WEB_RADIUS_Y,rz=TITAN_WEB_RADIUS_XZ){
  const d=b.clone().sub(a),m=a.clone().sub(center);
  const dx=d.x/rx,dy=d.y/ry,dz=d.z/rz,mx=m.x/rx,my=m.y/ry,mz=m.z/rz;
  const A=dx*dx+dy*dy+dz*dz,B=2*(mx*dx+my*dy+mz*dz),C=mx*mx+my*my+mz*mz-1;
  const disc=B*B-4*A*C;if(A<1e-10||disc<0)return null;
  const root=Math.sqrt(disc),t0=(-B-root)/(2*A),t1=(-B+root)/(2*A);
  if(t0>=0&&t0<=1)return t0;if(t1>=0&&t1<=1)return t1;return null;
}

export class AirCombat {
  constructor(buildings){this.buildings=buildings;this.reset();}
  reset(){
    this.time=0;this.health=3;this.invulnerableUntil=0;this.shotAt=-10;this.kickAt=-10;
    this.kickTarget=null;this.aimPoint=null;this.projectiles=[];this.events=[];
    this.drones=DRONE_SPAWNS.map((p,id)=>({id,home:new Vector3(...p),position:new Vector3(...p),hp:3,stunUntil:0,fireAt:2+id,charge:0,chargeAim:null,hitAt:-10,motionVelocity:new Vector3(),phase:id*2.17}));
  }
  visible(a,b){return !this.buildings.some(x=>{const t=segmentHit(a,b,x.box);return t!==null&&t<.999;});}
  target(position,forward,range=DRONE_TARGET_RANGE){
    let best=null,score=-Infinity;
    for(const d of this.drones){
      if(d.hp<=0)continue;
      const offset=d.position.clone().sub(position),distance=offset.length();
      const facing=offset.clone().normalize().dot(forward);
      if(distance>range||facing<.22||!this.visible(position,d.position))continue;
      const value=facing*3-distance/range;
      if(value>score){score=value;best=d;}
    }
    return best;
  }
  /**
   * Web traversal anchor. A titan blocks a building anchor behind it, and a clearly aimed titan
   * can be used directly even if no building is behind it. The returned offset follows movement.
   */
  webAnchor(position,forward,fallback=null,range=145){
    let blocked=null,blockedT=Infinity;
    if(fallback?.point){
      for(const d of this.drones){
        if(d.hp<=0)continue;
        const center=d.position.clone().add(new Vector3(0,3,0));
        const hit=segmentEllipsoidHit(position,fallback.point,center);
        if(hit!==null&&hit<blockedT&&hit<.985){blockedT=hit;blocked={drone:d,point:position.clone().lerp(fallback.point,hit)};}
      }
      if(blocked){
        const {drone,point}=blocked;
        return {point,enemyId:drone.id,kind:'enemy',offset:point.clone().sub(drone.position),score:(fallback.score??0)+5};
      }
    }
    const target=this.target(position,forward,range);
    if(!target)return fallback;
    const center=target.position.clone().add(new Vector3(0,3,0));
    const offset=center.clone().sub(position),distance=offset.length();
    const facing=offset.normalize().dot(forward);
    if(facing<.58)return fallback;
    const point=ellipsoidSurface(center,position);
    const candidate={point,enemyId:target.id,kind:'enemy',offset:point.clone().sub(target.position),score:2.5+facing-distance/range};
    if(!fallback)return candidate;
    if(distance<115&&facing>.82)return candidate;
    const buildingDistance=position.distanceTo(fallback.point);
    return distance<buildingDistance+18&&facing>.68?candidate:fallback;
  }
  syncAnchor(body){
    if(body.anchor?.enemyId===null||body.anchor?.enemyId===undefined)return true;
    const target=this.drones[body.anchor.enemyId];
    if(!target||target.hp<=0){body.release();return false;}
    body.anchor.point.copy(target.position).add(body.anchor.offset??new Vector3());
    return true;
  }
  shoot(body,forward,origin=null){
    if(this.time-this.shotAt<.28)return false;
    const target=this.target(body.position,forward);
    this.shotAt=this.time;
    const start=origin?.clone()??body.position.clone().add(new Vector3(.3,.45,0));
    const goal=target?.position.clone()??start.clone().addScaledVector(forward,132);
    this.aimPoint=goal.clone();
    this.projectiles.push({kind:'web',position:start,velocity:goal.clone().sub(start).normalize().multiplyScalar(112),life:1.6,targetId:target?.id});
    this.events.push({type:'shot',position:start.clone()});return true;
  }
  kick(body,forward){
    if(this.time-this.kickAt<.65)return false;
    const target=this.target(body.position,forward,DRONE_KICK_RANGE);
    if(!target)return false;
    body.release();body.velocity.copy(target.position).sub(body.position).normalize().multiplyScalar(54);
    this.kickTarget=target.id;this.kickAt=this.time;this.aimPoint=target.position.clone();
    this.events.push({type:'lunge',position:body.position.clone()});return true;
  }
  hitDrone(drone,damage,kind){
    drone.hp=Math.max(0,drone.hp-damage);drone.stunUntil=this.time+3.2;drone.hitAt=this.time;
    drone.charge=0;drone.chargeAim=null;drone.fireAt=this.time+4.2;
    this.events.push({type:drone.hp===0?'destroy':'hit',kind,position:drone.position.clone()});
  }
  step(dt,body){
    this.time+=dt;
    for(const d of this.drones){
      if(d.hp<=0)continue;
      if(d.stunUntil<this.time){
        const phase=this.time*.52+d.phase;
        const desired=d.home.clone().add(new Vector3(
          Math.sin(phase)*20+Math.sin(phase*.47+1.2)*5,
          Math.sin(phase*.73)*8+Math.cos(phase*.31)*2.5,
          Math.cos(phase*.62)*12
        ));
        if(body){
          const near=body.position.distanceTo(d.position)<175;
          if(near){
            desired.x+=clamp(body.position.x-d.home.x,-32,32)*.24;
            desired.z+=clamp(body.position.z-d.home.z,-42,42)*.16;
            desired.y+=clamp(body.position.y-d.home.y,-18,18)*.12;
          }
        }
        const before=d.position.clone(),blend=1-Math.exp(-dt*1.35);
        d.position.lerp(desired,blend);
        d.motionVelocity.copy(d.position).sub(before).divideScalar(Math.max(dt,1e-5));
      }else d.motionVelocity.set(0,0,0);
      if(d.stunUntil>this.time||body.position.distanceTo(d.position)>125||!this.visible(d.position,body.position)) {d.charge=0;d.chargeAim=null;continue;}
      if(this.time>=d.fireAt){
        if(!d.chargeAim)d.chargeAim=body.position.clone();
        d.charge+=dt;
        if(d.charge<.8)d.chargeAim.copy(body.position);
        if(d.charge>=1.2){
          this.projectiles.push({kind:'bolt',position:d.position.clone(),velocity:d.chargeAim.clone().sub(d.position).normalize().multiplyScalar(40),life:3});
          d.charge=0;d.chargeAim=null;d.fireAt=this.time+3.8;
        }
      }
    }
    for(const p of this.projectiles){
      const old=p.position.clone();p.life-=dt;
      const target=this.drones[p.targetId];
      if(p.kind==='web'&&target?.hp>0)p.velocity.copy(target.position).sub(p.position).normalize().multiplyScalar(112);
      p.position.addScaledVector(p.velocity,dt);
      const wallT=this.buildings.reduce((nearest,b)=>{const t=segmentHit(old,p.position,b.box);return t===null?nearest:Math.min(nearest,t);},1);
      const end=old.clone().lerp(p.position,wallT);
      if(p.kind==='web'){
        for(const d of this.drones){if(d.hp>0&&distanceToSegment(d.position,old,end)<DRONE_HIT_RADIUS){this.hitDrone(d,1,'web');p.life=0;break;}}
      }else if(this.health>0&&distanceToSegment(body.position,old,end)<.85){
        p.life=0;
        if(this.time>=this.invulnerableUntil&&body.time-body.dodgeTime>.4){
          this.health--;this.invulnerableUntil=this.time+1.2;
          body.velocity.addScaledVector(p.velocity.clone().normalize(),4);
          this.events.push({type:'hurt',position:body.position.clone()});
        }
      }
      if(wallT<1)p.life=0;
    }
    this.projectiles=this.projectiles.filter(p=>p.life>0);
    if(this.kickTarget!==null){
      const d=this.drones[this.kickTarget];
      if(d.hp>0&&body.position.distanceTo(d.position)<DRONE_KICK_CONTACT){
        this.hitDrone(d,2,'kick');this.kickTarget=null;body.velocity.y=Math.max(12,body.velocity.y);body.velocity.multiplyScalar(.8);
      }else if(this.time-this.kickAt>.85)this.kickTarget=null;
    }
  }
  get defeated(){return this.drones.filter(d=>d.hp===0).length;}
  drainEvents(){return this.events.splice(0);}
}
