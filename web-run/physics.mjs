import { Vector3, Box3 } from 'three';

export const STEP = 1 / 120;
export const SPAWN = new Vector3(0, 27, 12);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function makeCity() {
  const buildings = [];
  let seed = 1977;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let x = -4; x <= 4; x++) for (let z = -6; z <= 6; z++) {
    if (x === 0) continue;
    const w = 18 + rand() * 10, d = 20 + rand() * 8, h = (Math.abs(x)===1?76:26) + rand() * (Math.abs(x)===1?30:65);
    const cx = x * 40, cz = z * 42;
    buildings.push({ id: buildings.length, x: cx, z: cz, w, d, h,
      box: new Box3(new Vector3(cx-w/2, 0, cz-d/2), new Vector3(cx+w/2,h,cz+d/2)) });
  }
  // A low launch roof, with a clear avenue ahead.
  buildings.push({ id: buildings.length, x:0,z:22,w:16,d:26,h:24,
    box:new Box3(new Vector3(-8,0,9),new Vector3(8,24,35)) });
  // A traversable sky lobby: the opening is real collision-free space, not a painted facade.
  for (const [x,y,z,w,h,d] of [[0,16,-145,42,2,38],[0,48,-145,42,4,38],[-21,32,-145,2,30,38],[21,32,-145,2,30,38],[-18,7.5,-129,2,15,2],[18,7.5,-129,2,15,2],[-18,7.5,-161,2,15,2],[18,7.5,-161,2,15,2]]) {
    buildings.push({id:buildings.length,x,z,w,h,d,kind:'atrium',
      box:new Box3(new Vector3(x-w/2,y-h/2,z-d/2),new Vector3(x+w/2,y+h/2,z+d/2))});
  }
  return buildings;
}

// Slab intersection also returns the first contacted face for swept collisions.
function sweepBox(a,b,box){
  let near=0,far=1,axis=null,sign=0;
  for(const k of ['x','y','z']){
    const d=b[k]-a[k];
    if(Math.abs(d)<1e-9){if(a[k]<box.min[k]||a[k]>box.max[k])return null;continue;}
    let t0=(box.min[k]-a[k])/d,t1=(box.max[k]-a[k])/d;
    if(t0>t1)[t0,t1]=[t1,t0];
    if(t0>=near){near=t0;axis=k;sign=d>0?-1:1;}
    far=Math.min(far,t1);if(near>far)return null;
  }
  return {t:near,axis,sign};
}
export function segmentHit(a,b,box){return sweepBox(a,b,box)?.t??null;}

/**
 * Selects a visible facade. Callers may supply traversal intent so the same geometry
 * search can prefer an anchor that produces a useful next arc rather than merely a hit.
 */
export function chooseAnchor(position, forward, buildings, previousBuildingId=null, options={}) {
  let best=null, bestScore=-Infinity;
  const desiredDirection=(options.desiredDirection?.clone?.()??forward.clone()).setY(0);
  if(desiredDirection.lengthSq()<1e-6)desiredDirection.copy(forward).setY(0);
  desiredDirection.normalize();
  const idealRopeLength=options.idealRopeLength??42;
  const lateralIntent=clamp(options.lateralIntent??0,-1,1);
  const desiredRight=new Vector3(-desiredDirection.z,0,desiredDirection.x);
  const velocity=options.velocity?.clone?.()??null;

  for (const b of buildings) {
    const lo=b.box.min,hi=b.box.max;
    const aim=position.clone().addScaledVector(desiredDirection,idealRopeLength);
    const y=clamp(position.y+58,lo.y+.2,hi.y-.2);
    // Sample all four actual faces so targeting works equally in every compass direction.
    const candidates=[
      new Vector3(lo.x,y,clamp(aim.z,lo.z,hi.z)),new Vector3(hi.x,y,clamp(aim.z,lo.z,hi.z)),
      new Vector3(clamp(aim.x,lo.x,hi.x),y,lo.z),new Vector3(clamp(aim.x,lo.x,hi.x),y,hi.z),
    ];
    if(lo.y>position.y+5) candidates.push(new Vector3(clamp(aim.x,lo.x,hi.x),lo.y,clamp(aim.z,lo.z,hi.z)));
    for(const p of candidates){
      const d=p.clone().sub(position), distance=d.length();
      if(distance<6 || distance>82 || d.y<4) continue;
      if(position.y>12 && p.y-distance<5) continue;
      const planar=d.clone().setY(0);
      if(planar.lengthSq()<1e-6)continue;
      planar.normalize();
      const alignment=planar.dot(desiredDirection);
      if(alignment<-.08) continue;
      if(buildings.some(other=>{const t=segmentHit(position,p,other.box);return t!==null&&t<1-1e-5;})) continue;
      const distanceQuality=1-clamp(Math.abs(distance-idealRopeLength)/Math.max(idealRopeLength,1),0,1);
      const side=planar.dot(desiredRight);
      const velocityAlignment=velocity&&velocity.lengthSq()>1e-6?planar.dot(velocity.clone().setY(0).normalize()):0;
      const turning=Math.abs(lateralIntent);
      const velocityWeight=.28*(1-turning*.88);
      const score=alignment*1.75+distanceQuality*.72+d.y/distance*.5+side*lateralIntent*.95+velocityAlignment*velocityWeight-(b.id===previousBuildingId ? .24:0);
      if(score>bestScore) {bestScore=score;best={point:p,buildingId:b.id,score};}
    }
  }
  return best;
}

export class SwingBody {
  constructor(buildings) { this.buildings=buildings; this.reset(); }
  reset() {
    this.position=SPAWN.clone(); this.velocity=new Vector3(0,0,-20);
    this.anchor=null; this.webHand=0; this.ropeLength=0; this.grounded=false; this.wall=null;
    this.time=0; this.releaseTime=-10; this.landTime=-10; this.dodgeTime=-10;
    this.lastBuildingId=null; this.outOfBounds=false;this.lastWallTime=-10;this.lastWallNormal=null;
    this.attaches=0; this.releases=0; this.maxSpeed=0; this.distance=0;
    this.zipTime=-10;this.assistedReleaseTime=-10;this.releaseAssist=null;
  }
  attach(target, options={}) {
    if(!target) return false;
    this.anchor={point:target.point.clone(),buildingId:target.buildingId};this.releaseAssist=null;
    const preload=clamp(options.preload??0,0,.18);
    this.ropeLength=this.position.distanceTo(target.point)*(1-preload);
    this.webHand=this.attaches%2; this.attachTime=this.time; this.attaches++; return true;
  }
  release() {
    if(this.anchor) { this.releases++; this.releaseTime=this.time; this.lastBuildingId=this.anchor.buildingId; }
    this.anchor=null;
  }
  get canWallJump(){return !!this.wall||(!this.grounded&&this.time-this.lastWallTime<.2);}
  jump(forward) {
    if(this.canWallJump) {
      this.release(); this.velocity.addScaledVector(this.wall??this.lastWallNormal,15); this.velocity.y=16; this.wall=null;this.lastWallTime=-10;
    } else if(this.grounded) {
      this.velocity.y=16; this.velocity.addScaledVector(forward,7); this.grounded=false;
    }
  }
  respawn(position=SPAWN) {
    this.release(); this.position.copy(position); this.velocity.set(0,0,-16);
    this.wall=null;this.grounded=false;this.outOfBounds=false;this.lastWallTime=-10;
  }
  dodge(direction) {
    if(this.time-this.dodgeTime<.85) return;
    this.dodgeTime=this.time; this.velocity.addScaledVector(direction,12);
  }
  step(dt, input={}) {
    this.time+=dt;
    const prev=this.position.clone(), v=this.velocity;
    const steer=input.steer?.clone() ?? new Vector3();
    if(steer.lengthSq()>1) steer.normalize();
    v.y-= (input.dive ? 38:24)*dt;
    v.addScaledVector(steer,(this.grounded?42:this.anchor?22:13)*dt);
    if(this.wall && input.forward) v.y=Math.max(v.y,9);
    v.multiplyScalar(Math.exp(-(this.grounded?3.5:.09)*dt));
    if(v.length()>58) v.setLength(58);
    this.position.addScaledVector(v,dt);
    if(this.anchor) {
      const liftAssist=this.position.y<8 && this.time-this.attachTime<1.1;
      const reelSpeed=(input.reel||liftAssist) && this.ropeLength>6 ? 12:0;
      this.ropeLength=Math.max(6,this.ropeLength-reelSpeed*dt);
      const offset=this.position.clone().sub(this.anchor.point), length=offset.length();
      if(length>this.ropeLength) {
        offset.divideScalar(length);
        this.position.copy(this.anchor.point).addScaledVector(offset,this.ropeLength);
        const radial=v.dot(offset);
        if(radial>-reelSpeed) v.addScaledVector(offset,-radial-reelSpeed);
      }
    }
    const wasGrounded=this.grounded;
    this.grounded=false; this.wall=null;
    if(this.position.y<1.1) { this.position.y=1.1; v.y=Math.max(0,v.y); this.grounded=true; }
    // Small fixed steps and swept broad phase prevent high-speed facade tunnelling.
    for(const b of this.buildings) {
      const box=b.box.clone().expandByVector(new Vector3(.48,1.05,.48));
      if(!box.containsPoint(this.position) && segmentHit(prev,this.position,box)===null) continue;
      const hit=sweepBox(prev,this.position,box);
      let contact=hit?.axis?[hit.axis,hit.sign===1?box.max[hit.axis]:box.min[hit.axis],hit.sign]:null;
      if(!contact && box.containsPoint(this.position)) {
        contact=['x',box.min.x,-1]; let depth=Infinity;
        for(const k of ['x','y','z']) for(const sign of [-1,1]) {
          const edge=sign===1?box.max[k]:box.min[k], delta=Math.abs(this.position[k]-edge);
          if(delta<depth) {depth=delta;contact=[k,edge,sign];}
        }
      }
      if(!contact) continue;
      const [axis,edge,sign]=contact;
      this.position[axis]=edge+sign*.001;
      if(v[axis]*sign<0) v[axis]=0;
      if(axis==='y' && sign===1) this.grounded=true;
      else if(axis!=='y') { this.wall=new Vector3();this.wall[axis]=sign; }
    }
    if(!this.wall && !this.grounded) {
      for(const b of this.buildings) {
        const box=b.box.clone().expandByVector(new Vector3(.50,1.05,.50));
        if(!box.containsPoint(this.position)) continue;
        for(const k of ['x','z']) for(const sign of [-1,1]) {
          const edge=sign===1?box.max[k]:box.min[k];
          if(Math.abs(this.position[k]-edge)<.035) {this.wall=new Vector3();this.wall[k]=sign;}
        }
      }
    }
    if(this.wall){this.lastWallNormal=this.wall.clone();this.lastWallTime=this.time;}
    if(this.grounded&&!wasGrounded) this.landTime=this.time;
    if(this.anchor) {
      const blocked=this.buildings.some(b=>{const t=segmentHit(this.position,this.anchor.point,b.box);return t!==null && t<1-1e-5;});
      if(blocked || this.position.distanceTo(this.anchor.point)>this.ropeLength+2) this.release();
    }
    this.outOfBounds=this.position.y<-20 || Math.abs(this.position.x)>220 || Math.abs(this.position.z)>295;
    this.distance+=prev.distanceTo(this.position); this.maxSpeed=Math.max(this.maxSpeed,v.length());
  }
}