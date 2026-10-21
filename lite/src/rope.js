import { bodyGeometry, polygonArea } from './physics-shape.js';
import { isSoftBody, softCenter, softRestPoint, softWorldPoint } from './soft-body.js';

export const isRope = object => object?.type === 'rope';
export const isFlexible = object => isRope(object) || object?.type === 'spring';
export const ropeParents = rope => [...new Set(rope.anchors.map(anchor=>anchor.objectId).filter(Boolean))];
export const ropeState = rope => ({ links: structuredClone(rope.links) });
const rotate = (p,a) => ({x:p.x*Math.cos(a)-p.y*Math.sin(a),y:p.x*Math.sin(a)+p.y*Math.cos(a)});
export function centerOfMass(object) {
  const geometry=bodyGeometry(object);let area=0,x=0,y=0;
  if(geometry.polygons)for(const polygon of geometry.polygons){
    const a=polygonArea(polygon);area+=a;
    for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],cross=p.x*q.y-q.x*p.y;x+=(p.x+q.x)*cross/6;y+=(p.y+q.y)*cross/6;}
  }else for(const [l,b,r,t]of object.shape.rectangles){const a=(r-l)*(t-b);area+=a;x+=(l+r)/2*a;y+=(b+t)/2*a;}
  return {x:x/area,y:y/area};
}
export function ropeAnchor(object, world, precise=false) {
  if(isSoftBody(object))return{objectId:object.id,point:softRestPoint(object,precise?world:softCenter(object))};
  if(object?.type==='physicsBody'){
    const p=rotate({x:world.x-object.position.x,y:world.y-object.position.y},-object.angle);
    return {objectId:object.id,point:precise?p:centerOfMass(object)};
  }
  if(object&&Number.isFinite(object.x)&&Number.isFinite(object.y))return {objectId:object.id,point:precise?{x:world.x-object.x,y:world.y-object.y}:{x:0,y:0}};
  return {objectId:null,point:{...world}};
}
export function anchorWorld(anchor, objects) {
  if(!anchor.objectId)return {...anchor.point};
  const object=objects.get(anchor.objectId);if(!object)return null;
  if(isSoftBody(object))return softWorldPoint(object,anchor.point);
  if(object.type==='physicsBody'){
    const local=rotate(anchor.point,object.angle);return{x:object.position.x+local.x,y:object.position.y+local.y};
  }
  if(Number.isFinite(object.x)&&Number.isFinite(object.y))return{x:object.x+anchor.point.x,y:object.y+anchor.point.y};
  return null;
}
export function createRope(anchors, objects) {
  const points=anchors.map(anchor=>anchorWorld(anchor,objects));if(points.some(p=>!p))return null;
  const distance=Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);if(distance<.001 || distance*1.12>100000)return null;
  const rope={type:'rope',anchors:structuredClone(anchors),parents:[],length:distance*1.12,segments:24,radius:.035,
    mass:.4,stiffness:.8,damping:.12,restitution:.1,airFriction:.01,gravity:{x:0,y:-9.81},
    collideGeometry:true,collideBodies:true,freeFall:false,ignored:[...new Set(anchors.map(a=>a.objectId).filter(id=>objects.get(id)?.type==='physicsBody'||isSoftBody(objects.get(id))))],
    time:0,duration:0,playbackRate:1,running:false,opacity:1,links:[]};
  rebuildRope(rope,objects);return rope;
}
export const ropeBuildKey = rope => JSON.stringify([rope.anchors,rope.length,rope.segments]);
export function rebuildRope(rope,objects) {
  const [a,b]=rope.anchors.map(anchor=>anchorWorld(anchor,objects));if(!a||!b)return;
  const at=(t,sag)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t-4*sag*t*(1-t)});
  const arcLength=sag=>{let length=0,previous=a;for(let i=1;i<=256;i++){const p=at(i/256,sag);length+=Math.hypot(p.x-previous.x,p.y-previous.y);previous=p;}return length;};
  let low=0,high=rope.type==='spring'?0:rope.length;for(let i=0;i<40;i++){const m=(low+high)/2;if(arcLength(m)<rope.length)low=m;else high=m;}
  // Equal arc-length intervals distribute mass evenly, including steep ropes.
  const samples=Array.from({length:257},(_,i)=>at(i/256,(low+high)/2)),cumulative=[0];
  for(let i=1;i<samples.length;i++)cumulative.push(cumulative[i-1]+Math.hypot(samples[i].x-samples[i-1].x,samples[i].y-samples[i-1].y));
  let cursor=1;
  const nodes=Array.from({length:rope.segments+1},(_,i)=>{
    const target=cumulative.at(-1)*i/rope.segments;while(cursor<256&&cumulative[cursor]<target)cursor++;
    const t=(target-cumulative[cursor-1])/(cumulative[cursor]-cumulative[cursor-1]||1),p=samples[cursor-1],q=samples[cursor];
    return{x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t};
  });
  rope.links=nodes.slice(1).map((b,i)=>{const a=nodes[i];return{position:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},angle:Math.atan2(b.y-a.y,b.x-a.x),velocity:{x:0,y:0},angularVelocity:0};});
  rope.parents=ropeParents(rope);rope.time=0;rope.running=false;rope.initialState=ropeState(rope);
}
export function resolveRope(rope,objects) {
  const anchorPoints=rope.anchors.map(anchor=>anchorWorld(anchor,objects));
  return anchorPoints.every(Boolean)?{...rope,anchorPoints}:null;
}
export function ropeNodes(rope) {
  const half=rope.length/rope.segments/2;
  const ends=rope.links.map(link=>{const dx=Math.cos(link.angle)*half,dy=Math.sin(link.angle)*half;return[{x:link.position.x-dx,y:link.position.y-dy},{x:link.position.x+dx,y:link.position.y+dy}];});
  if(!ends.length)return[];
  const nodes=[ends[0][0],...ends.slice(1).map((pair,i)=>({x:(ends[i][1].x+pair[0].x)/2,y:(ends[i][1].y+pair[0].y)/2})),ends.at(-1)[1]];
  if(rope.anchorPoints){nodes[0]=rope.anchorPoints[0];nodes[nodes.length-1]=rope.anchorPoints[1];}
  return nodes;
}
// Rounded corner interpolation stays inside adjacent link triangles: no cubic
// overshoot away from the physical rope. Used for drawing and picking alike.
export function ropePath(rope, steps=4) {
  const nodes=ropeNodes(rope);if(nodes.length<3)return nodes;
  const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2}),result=[nodes[0]];
  let start=nodes[0];
  for(let i=1;i<nodes.length-1;i++){
    const control=nodes[i],end=i===nodes.length-2?nodes.at(-1):mid(nodes[i],nodes[i+1]);
    for(let j=1;j<=steps;j++){const t=j/steps,u=1-t;result.push({x:u*u*start.x+2*u*t*control.x+t*t*end.x,y:u*u*start.y+2*u*t*control.y+t*t*end.y});}
    start=end;
  }
  return result;
}
export function ropeDistance(rope,p,points=ropePath(rope)) {
  let minimum=Infinity;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],x=b.x-a.x,y=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y||1)));
    minimum=Math.min(minimum,Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y));
  }
  return Math.max(0,minimum-rope.radius);
}
