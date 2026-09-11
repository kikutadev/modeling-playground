import {Vector3} from 'three';
export const RING_RADIUS=8;
export const RING_POINTS=[[-6,14,-28],[3,23,-79],[0,28,-142],[-3,24,-184],[3,30,-231],[0,38,-269]].map(p=>new Vector3(...p));
export function crossesRing(from,to,index){
  const center=RING_POINTS[index];if(!center)return false;
  const dz=to.z-from.z;if(Math.abs(dz)<1e-9)return false;
  const t=(center.z-from.z)/dz;if(t<0||t>1)return false;
  const x=from.x+(to.x-from.x)*t-center.x,y=from.y+(to.y-from.y)*t-center.y;
  return x*x+y*y<RING_RADIUS*RING_RADIUS;
}
