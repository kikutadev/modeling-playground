import {Vector3} from 'three';
import {segmentHit} from './physics.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const DRONE_SPAWNS=[[0,58,-82],[-5,68,-170],[4,76,-258]];
export const DRONE_TARGET_RANGE=180;
export const DRONE_KICK_RANGE=48;
export const DRONE_KICK_CONTACT=15;
export const DRONE_HIT_RADIUS=10.5;
const distanceToSegment=(p,a,b)=>{const v=b.clone().sub(a),t=clamp(p.clone().sub(a).dot(v)/Math.max(v.lengthSq(),1e-8),0,1);return a.clone().addScaledVector(v,t).distanceTo(p);};
export class AirCombat {
  constructor(buildings){this.buildings=buildings;this.reset();}
  reset(){
    this.time=0;this.health=3;this.invulnerableUntil=0;this.shotAt=-10;this.kickAt=-10;
    this.kickTarget=null;this.aimPoint=null;this.projectiles=[];this.events=[];
    this.drones=DRONE_SPAWNS.map((p,id)=>({id,home:new Vector3(...p),position:new Vector3(...p),hp:3,stunUntil:0,fireAt:2+id,charge:0,chargeAim:null,hitAt:-10}));
  }
  visible(a,b){return !this.buildings.some(x=>{const t=segmentHit(a,b,x.box);return t!==null&&t<.999;});}
  target(position,forward,range=DRONE_TARGET_RANGE){
    let best=null,score=-Infinity;
    for(const d of this.drones){
      if(d.hp<=0)continue;
      const offset=d.position.clone().sub(position),distance=offset.length();
      const facing=offset.clone().normalize().dot(forward);
      if(distance>range||facing<.28||!this.visible(position,d.position))continue;
      const value=facing*3-distance/range;
      if(value>score){score=value;best=d;}
    }
    return best;
  }
  shoot(body,forward,origin=null){
    if(this.time-this.shotAt<.28)return false;
    const target=this.target(body.position,forward);
    this.shotAt=this.time;
    const start=origin?.clone()??body.position.clone().add(new Vector3(.3,.45,0));
    const goal=target?.position.clone()??start.clone().addScaledVector(forward,150);
    this.aimPoint=goal.clone();
    this.projectiles.push({kind:'web',position:start,velocity:goal.clone().sub(start).normalize().multiplyScalar(118),life:1.8,targetId:target?.id});
    this.events.push({type:'shot',position:start.clone()});return true;
  }
  kick(body,forward){
    if(this.time-this.kickAt<.65)return false;
    const target=this.target(body.position,forward,DRONE_KICK_RANGE);
    if(!target)return false;
    body.release();body.velocity.copy(target.position).sub(body.position).normalize().multiplyScalar(58);
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
      if(d.stunUntil<this.time)d.position.copy(d.home).add(new Vector3(Math.sin(this.time*.42+d.id)*8.0,Math.sin(this.time*.65+d.id)*4.5,Math.cos(this.time*.34+d.id)*4.0));
      if(d.stunUntil>this.time||body.position.distanceTo(d.position)>135||!this.visible(d.position,body.position)) {d.charge=0;d.chargeAim=null;continue;}
      if(this.time>=d.fireAt){
        if(!d.chargeAim)d.chargeAim=body.position.clone();
        d.charge+=dt;
        // Tracking stops before firing: dodging has a readable window.
        if(d.charge<.8)d.chargeAim.copy(body.position);
        if(d.charge>=1.2){
          this.projectiles.push({kind:'bolt',position:d.position.clone(),velocity:d.chargeAim.clone().sub(d.position).normalize().multiplyScalar(38),life:2.8});
          d.charge=0;d.chargeAim=null;d.fireAt=this.time+3.8;
        }
      }
    }
    for(const p of this.projectiles){
      const old=p.position.clone();p.life-=dt;
      const target=this.drones[p.targetId];
      if(p.kind==='web'&&target?.hp>0)p.velocity.copy(target.position).sub(p.position).normalize().multiplyScalar(118);
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
