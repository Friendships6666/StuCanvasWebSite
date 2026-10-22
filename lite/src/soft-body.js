import { bodyGeometry, polygonArea, simplifyRing, validLoops, triangulate } from './physics-shape.js';
import { rememberParticleCreation } from './construction-store.js';

export const isSoftBody = object => object?.type === 'softBody';
export const DEFAULT_SOFT_SUBDIVISIONS = 10;
export const DEFAULT_SOFT_SMOOTHING = 30;
export const MAX_SOFT_SUBDIVISIONS = 24;
export const MAX_SOFT_NODES = 4096;
export const validSoftSubdivisions = value => Number.isInteger(value) && value >= 3 && value <= MAX_SOFT_SUBDIVISIONS;
export const softState = object => ({ nodes: structuredClone(object.nodes) });
const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const edgeKey = (a,b) => a<b ? `${a}:${b}` : `${b}:${a}`;

// Triangulate the actual occupied contour (including holes and islands), then
// bisect shared longest edges. Every split is conforming: no cracks or hanging
// vertices. This mesh is a snapshot and never retains the region's live state.
export function softFromBody(body, subdivisions = DEFAULT_SOFT_SUBDIVISIONS, smoothing = 0) {
  if (!body || !validSoftSubdivisions(subdivisions) || !Number.isFinite(smoothing) || smoothing < 0 || smoothing > 100) return null;
  const geometry = bodyGeometry({ ...body, smoothing: Math.max(100/subdivisions, smoothing) });
  if (!geometry.triangles?.length) return null;
  const mesh = softMesh(geometry.triangles, subdivisions);
  if (!mesh) return null;
  const object={type:'softBody',parents:[],mesh,
    nodes:mesh.vertices.map(p=>({position:{x:body.position.x+p.x,y:body.position.y+p.y},velocity:{x:0,y:0}})),
    smoothing,mass:1,stretchStiffness:.65,shearStiffness:.45,bendStiffness:.08,areaStiffness:.6,damping:.12,collisionRadius:1,selfCollision:false,
    gravity:{x:0,y:-9.81},restitution:.2,airFriction:.01,collideGeometry:true,collideBodies:true,freeFall:false,ignored:[],
    running:false,time:0,duration:0,playbackRate:1,opacity:1,showMesh:false};
  object.initialState=softState(object);rememberParticleCreation(object,body,'soft',{subdivisions,smoothing});return object;
}

function softMesh(triangles, subdivisions) {
  const vertices=[],indices=new Map(),faces=new Map(),edges=new Map(),heap=[];
  const vertex=p=>{const key=`${p.x}:${p.y}`;if(!indices.has(key)){indices.set(key,vertices.length);vertices.push({...p});}return indices.get(key);};
  const push = value => {
    let i=heap.length;heap.push(value);
    while(i){const p=(i-1)>>1;if(heap[p].length>=value.length)break;heap[i]=heap[p];i=p;}heap[i]=value;
  };
  const pop = () => {
    const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].length>heap[j].length)j++;if(heap[j].length<=last.length)break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;
  };
  let nextFace=0;
  const addFace = face => {
    if(cross(...face.map(i=>vertices[i]))<0)[face[1],face[2]]=[face[2],face[1]];
    const id=nextFace++;faces.set(id,face);
    for(let i=0;i<3;i++){
      const a=face[i],b=face[(i+1)%3],key=edgeKey(a,b);let edge=edges.get(key);
      if(!edge){edge={a,b,key,faces:new Set(),length:Math.hypot(vertices[a].x-vertices[b].x,vertices[a].y-vertices[b].y)};edges.set(key,edge);push(edge);}
      edge.faces.add(id);
    }
  };
  const removeFace = id => {
    const face=faces.get(id);faces.delete(id);
    for(let i=0;i<3;i++){const key=edgeKey(face[i],face[(i+1)%3]),edge=edges.get(key);edge.faces.delete(id);if(!edge.faces.size)edges.delete(key);}
  };
  for(const triangle of triangles)addFace(triangle.map(vertex));
  if(vertices.length>MAX_SOFT_NODES)return null;
  const extent=Math.max(...vertices.map(p=>p.x))-Math.min(...vertices.map(p=>p.x));
  const height=Math.max(...vertices.map(p=>p.y))-Math.min(...vertices.map(p=>p.y));
  const spacing=Math.max(extent,height)/subdivisions;
  while(heap.length){
    const edge=pop();if(edges.get(edge.key)!==edge)continue;
    if(edge.length<=spacing*(1+1e-10))break;
    if(vertices.length>=MAX_SOFT_NODES)return null;
    const a=vertices[edge.a],b=vertices[edge.b],mid=vertices.length;vertices.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
    const adjacent=[...edge.faces].map(id=>({id,face:faces.get(id)}));
    for(const {id}of adjacent)removeFace(id);
    for(const {face}of adjacent){const c=face.find(i=>i!==edge.a&&i!==edge.b);addFace([edge.a,mid,c]);addFace([mid,edge.b,c]);}
  }
  const meshTriangles=[...faces.values()],boundary=[],links=[],weights=vertices.map(()=>0),radii=vertices.map(()=>Infinity);
  for(const face of meshTriangles){const area=polygonArea(face.map(i=>vertices[i]));for(const i of face)weights[i]+=area/3;}
  for(const edge of edges.values()){
    links.push({a:edge.a,b:edge.b,length:edge.length,kind:edge.faces.size===1?'stretch':'shear'});
    if(edge.faces.size===1){
      const face=faces.get([...edge.faces][0]),i=face.indexOf(edge.a),forward=face[(i+1)%3]===edge.b;
      boundary.push(forward?[edge.a,edge.b]:[edge.b,edge.a]);
    }
    radii[edge.a]=Math.min(radii[edge.a],edge.length);radii[edge.b]=Math.min(radii[edge.b],edge.length);
    if(edge.faces.size===2){
      const [one,two]=[...edge.faces].map(id=>faces.get(id).find(i=>i!==edge.a&&i!==edge.b));
      links.push({a:one,b:two,length:Math.hypot(vertices[one].x-vertices[two].x,vertices[one].y-vertices[two].y),kind:'bend'});
    }
  }
  const total=weights.reduce((a,b)=>a+b,0);
  if(!(total>0)||radii.some(r=>!(r>0)))return null;
  return {vertices,triangles:meshTriangles,boundary,links,weights:weights.map(w=>w/total),radii:radii.map(r=>r*.48),area:total,subdivisions};
}

const smoothingMeshes = new WeakMap();
const boundaryLoops = mesh => {
  const next = new Map(mesh.boundary.map(([a,b])=>[a,b])), loops=[];
  while(next.size){
    const first=next.keys().next().value,loop=[];let index=first;
    do { if(!next.has(index))return null;loop.push(mesh.vertices[index]);const to=next.get(index);next.delete(index);index=to; } while(index!==first);
    loops.push(loop);
  }
  return loops;
};

// Rebuild from the original material contour, never from an already simplified
// mesh. Interpolation carries the current deformation and velocity to new nodes.
export function smoothSoftBody(object, level, originalMesh = object.mesh) {
  if (!Number.isFinite(level) || level < 0 || level > 100) return false;
  let cache=smoothingMeshes.get(originalMesh);
  if(!cache){cache=new Map([[0,originalMesh]]);smoothingMeshes.set(originalMesh,cache);}
  let mesh=cache.get(level);
  if(!mesh){
    const loops=boundaryLoops(originalMesh);if(!loops)return false;
    const xs=originalMesh.vertices.map(p=>p.x),ys=originalMesh.vertices.map(p=>p.y);
    const extent=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
    for(let attempt=0;attempt<9&&!mesh;attempt++){
      const simplified=loops.map(loop=>simplifyRing(loop,extent*level/10000/2**attempt));
      if(!validLoops(simplified,loops,extent))continue;
      const triangles=triangulate(simplified);
      if(triangles)mesh=softMesh(triangles,originalMesh.subdivisions);
    }
    if(!mesh)mesh=originalMesh;
    cache.set(level,mesh);
    while(cache.size>9)cache.delete([...cache.keys()].find(key=>key!==0&&key!==level));
  }
  if(mesh!==object.mesh){
    const coordinates=mesh.vertices.map(point=>softCoordinates(object,point,true));
    if(coordinates.some(value=>!value))return false;
    const transfer=states=>coordinates.map(({indices,weights})=>{
      const state={position:{x:0,y:0},velocity:{x:0,y:0}};
      for(let i=0;i<3;i++)for(const field of ['position','velocity'])for(const axis of ['x','y'])state[field][axis]+=states[indices[i]][field][axis]*weights[i];
      return state;
    });
    object.nodes=transfer(object.nodes);
    object.initialState={nodes:transfer(object.initialState.nodes)};
    object.mesh=mesh;
  }
  object.smoothing=level;
  return true;
}

export function softCenter(object) {
  return object.nodes.reduce((sum,node,i)=>({x:sum.x+node.position.x*object.mesh.weights[i],y:sum.y+node.position.y*object.mesh.weights[i]}),{x:0,y:0});
}
export function softVelocity(object) {
  return object.nodes.reduce((sum,node,i)=>({x:sum.x+node.velocity.x*object.mesh.weights[i],y:sum.y+node.velocity.y*object.mesh.weights[i]}),{x:0,y:0});
}
export const softTriangles = object => object.mesh.triangles.map(face=>face.map(i=>object.nodes[i].position));
export function softEdges(object) {
  return object.mesh.boundary.map(([a,b])=>{
    const first=object.nodes[a].position,second=object.nodes[b].position,dx=second.x-first.x,dy=second.y-first.y,length=Math.hypot(dx,dy)||1;
    return {first,second,normal:{x:dy/length,y:-dx/length},indices:[a,b]};
  });
}
export function softDistance(object,point) {
  for(const triangle of softTriangles(object)){
    if(cross(...triangle)===0)continue;
    const signs=triangle.map((a,i)=>cross(a,triangle[(i+1)%3],point));
    if(signs.every(s=>s>=0)||signs.every(s=>s<=0))return 0;
  }
  let distance=Infinity;
  for(const {first:a,second:b}of softEdges(object)){
    const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    distance=Math.min(distance,Math.hypot(point.x-a.x-dx*t,point.y-a.y-dy*t));
  }
  return distance;
}
// Material coordinates keep attachments on the same triangle while it deforms.
// Points outside the material project to its nearest triangle, including holes.
export function softCoordinates(object,point,rest=false) {
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
  const positions=rest?object.mesh.vertices:object.nodes.map(n=>n.position);let best=null,minimum=Infinity;
  for(const face of object.mesh.triangles){
    const [a,b,c]=face.map(i=>positions[i]),den=cross(a,b,c);
    if(Math.abs(den)<1e-20)continue;
    const weights=[cross(point,b,c)/den,cross(a,point,c)/den,cross(a,b,point)/den];
    if(weights.every(w=>w>=-1e-10))return{indices:face,weights};
    for(let j=0;j<3;j++){
      const p=positions[face[j]],q=positions[face[(j+1)%3]],dx=q.x-p.x,dy=q.y-p.y;
      const t=Math.max(0,Math.min(1,((point.x-p.x)*dx+(point.y-p.y)*dy)/(dx*dx+dy*dy||1)));
      const distance=(point.x-p.x-dx*t)**2+(point.y-p.y-dy*t)**2;
      if(distance<minimum){minimum=distance;const w=[0,0,0];w[j]=1-t;w[(j+1)%3]=t;best={indices:face,weights:w};}
    }
  }
  return best;
}
const interpolate=(coordinates,positions)=>coordinates?.indices.reduce((sum,index,i)=>({x:sum.x+positions[index].x*coordinates.weights[i],y:sum.y+positions[index].y*coordinates.weights[i]}),{x:0,y:0});
export const softRestPoint = (object,point) => interpolate(softCoordinates(object,point),object.mesh.vertices);
export const softWorldPoint = (object,point) => interpolate(softCoordinates(object,point,true),object.nodes.map(n=>n.position));
