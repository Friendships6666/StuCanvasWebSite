import { rememberParticleCreation } from './construction-store.js';
export const isLiquid = object => object?.type === 'liquid';
export const DEFAULT_LIQUID_DROPS = 256;
export const MAX_LIQUID_DROPS = 1024;
export const validLiquidDrops = count => Number.isInteger(count) && count >= 1 && count <= MAX_LIQUID_DROPS;
export const liquidState = object => ({ particles: structuredClone(object.particles) });
export const liquidMass = object => object.density * object.volume;

const halton = (index, base) => {
  let result = 0, fraction = 1;
  while (index > 0) { fraction /= base; result += fraction * (index % base); index = Math.floor(index/base); }
  return result;
};

// Sample only the snapshot's occupied rectangles, preserving holes and detached
// areas without random placement or a second expensive shape triangulation.
export function liquidFromBody(body, count = DEFAULT_LIQUID_DROPS) {
  if (!body || !validLiquidDrops(count)) return null;
  const rectangles = body.shape.rectangles, cumulative = [];
  let volume = 0;
  for (const [l,b,r,t] of rectangles) { volume += (r-l)*(t-b); cumulative.push(volume); }
  if (!(volume > 0)) return null;
  const particles = Array.from({length:count},(_,i)=>{
    const area = halton(i+1,2)*volume;
    let low=0,high=rectangles.length-1;
    while(low<high){const mid=(low+high)>>>1;if(cumulative[mid]<=area)low=mid+1;else high=mid;}
    const [l,b,r,t]=rectangles[low];
    return { position:{x:body.position.x+l+(r-l)*halton(i+1,3),y:body.position.y+b+(t-b)*halton(i+1,5)},velocity:{x:0,y:0} };
  });
  const object = {
    type:'liquid',parents:[],particleCount:count,particles,volume,radius:Math.sqrt(volume/count)*.52,
    density:1000,pressure:400,viscosity:.2,cohesion:.08,buoyancy:1,
    gravity:{x:0,y:-9.81},restitution:.05,airFriction:.005,
    collideGeometry:true,collideBodies:true,freeFall:false,ignored:[],
    time:0,duration:0,playbackRate:1,running:false,opacity:.85,
  };
  object.initialState=liquidState(object);
  rememberParticleCreation(object,body,'liquid',{count});
  return object;
}

export function liquidDistance(object,point) {
  let distance=Infinity;
  for(const particle of object.particles) distance=Math.min(distance,Math.hypot(point.x-particle.position.x,point.y-particle.position.y));
  return Math.max(0,distance-object.radius);
}

export function rigidArea(object) {
  return object.shape.rectangles.reduce((sum,[l,b,r,t])=>sum+(r-l)*(t-b),0);
}
