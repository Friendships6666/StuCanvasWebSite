import earcut, { deviation } from '../node_modules/earcut/src/earcut.js';

const edgeCache = new WeakMap();
export function bodySurfaceEdges(shape) {
  if (edgeCache.has(shape)) return edgeCache.get(shape);
  const horizontal = new Map(), vertical = new Map();
  const add = (map, at, lo, hi, sign) => {
    if (!map.has(at)) map.set(at, []);
    map.get(at).push([lo, sign], [hi, -sign]);
  };
  for (const [left, bottom, right, top] of shape.rectangles) {
    add(horizontal, bottom, left, right, -1); add(horizontal, top, left, right, 1);
    add(vertical, left, bottom, top, -1); add(vertical, right, bottom, top, 1);
  }
  const result = [];
  for (const [map, axis] of [[horizontal, 0], [vertical, 1]]) for (const [at, events] of map) {
    events.sort((a, b) => a[0] - b[0]);
    let sum = 0, start = events[0][0];
    for (let index = 0; index < events.length;) {
      const end = events[index][0];
      if (sum && end > start) result.push({ first: axis ? { x: at, y: start } : { x: start, y: at },
        second: axis ? { x: at, y: end } : { x: end, y: at }, normal: axis ? { x: Math.sign(sum), y: 0 } : { x: 0, y: Math.sign(sum) } });
      do { sum += events[index++][1]; } while (index < events.length && events[index][0] === end);
      start = end;
    }
  }
  edgeCache.set(shape, result);
  return result;
}

export const smoothingLevel = object => object.smoothing ?? 0;
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const key = p => `${p.x},${p.y}`;
const same = (a, b) => a.x === b.x && a.y === b.y;
export const polygonArea = ring => ring.reduce((sum, p, i) => {
  const q = ring[(i + 1) % ring.length]; return sum + p.x * q.y - q.x * p.y;
}, 0) / 2;
export function polygonContains(ring, p) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
const withoutCollinear = ring => ring.filter((p, i) => {
  const a = ring[(i + ring.length - 1) % ring.length], b = ring[(i + 1) % ring.length];
  return !same(a, p) && cross(a, p, b) !== 0;
});
export function shapeContours(shape) {
  const edges = bodySurfaceEdges(shape).map(edge => {
    const reverse = edge.normal.y > 0 || edge.normal.x < 0;
    return { first: reverse ? edge.second : edge.first, second: reverse ? edge.first : edge.second };
  });
  const outgoing = new Map();
  for (const edge of edges) {
    const at = key(edge.first); if (!outgoing.has(at)) outgoing.set(at, []);
    outgoing.get(at).push(edge);
  }
  const visited = new Set(), loops = [];
  for (const initial of edges) {
    if (visited.has(initial)) continue;
    const ring = []; let edge = initial;
    while (edge && !visited.has(edge)) {
      visited.add(edge); ring.push(edge.first);
      if (same(edge.second, initial.first)) break;
      const dx = edge.second.x - edge.first.x, dy = edge.second.y - edge.first.y;
      const options = (outgoing.get(key(edge.second)) || []).filter(next => !visited.has(next));
      options.sort((a,b) => Math.atan2(dx * (b.second.y-b.first.y) - dy * (b.second.x-b.first.x), dx * (b.second.x-b.first.x) + dy * (b.second.y-b.first.y))
        - Math.atan2(dx * (a.second.y-a.first.y) - dy * (a.second.x-a.first.x), dx * (a.second.x-a.first.x) + dy * (a.second.y-a.first.y)));
      edge = options[0];
    }
    if (!edge || !same(edge.second, initial.first)) return null;
    const cleaned = withoutCollinear(ring);
    if (cleaned.length < 3 || polygonArea(cleaned) === 0) return null;
    loops.push(cleaned);
  }
  return loops;
}
function distanceSquared(p, a, b) {
  const x = b.x-a.x, y = b.y-a.y, length = x*x+y*y;
  const t = length ? Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/length)) : 0;
  return (p.x-a.x-t*x)**2+(p.y-a.y-t*y)**2;
}
function simplifyPath(points, tolerance) {
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length-1] = 1;
  const stack = [[0,points.length-1]];
  while (stack.length) {
    const [first,last] = stack.pop(); let farthest = -1, maximum = tolerance*tolerance;
    for (let i = first+1; i < last; i++) {
      const distance = distanceSquared(points[i],points[first],points[last]);
      if (distance > maximum) { maximum = distance; farthest = i; }
    }
    if (farthest !== -1) { keep[farthest] = 1; stack.push([first,farthest],[farthest,last]); }
  }
  return points.filter((_,i)=>keep[i]);
}
export function simplifyRing(ring,tolerance) {
  let pivot = 1, farthest = 0;
  for (let i = 1; i < ring.length; i++) {
    const distance = (ring[i].x-ring[0].x)**2+(ring[i].y-ring[0].y)**2;
    if (distance > farthest) { pivot = i; farthest = distance; }
  }
  return withoutCollinear([...simplifyPath(ring.slice(0,pivot+1),tolerance).slice(0,-1),
    ...simplifyPath([...ring.slice(pivot),ring[0]],tolerance).slice(0,-1)]);
}
function intersect(a,b,c,d) {
  if (Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)
    ||Math.max(a.y,b.y)<Math.min(c.y,d.y)||Math.max(c.y,d.y)<Math.min(a.y,b.y)) return false;
  const p=cross(a,b,c),q=cross(a,b,d),r=cross(c,d,a),s=cross(c,d,b);
  return (p<=0&&q>=0||p>=0&&q<=0)&&(r<=0&&s>=0||r>=0&&s<=0);
}
export function validLoops(loops,original,extent) {
  if (loops.some((loop,i)=>loop.length<3||polygonArea(loop)*polygonArea(original[i])<=0)) return false;
  // Spatial buckets bound topology checks to nearby edge pairs, even for a
  // densely sampled contour. No self-crossings or new hole/outline contacts.
  const buckets=new Map(), cell=extent/64;
  for (let l=0;l<loops.length;l++) for (let i=0;i<loops[l].length;i++) {
    const a=loops[l][i],b=loops[l][(i+1)%loops[l].length],seen=new Set();
    for (let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)
      for(let y=Math.floor(Math.min(a.y,b.y)/cell);y<=Math.floor(Math.max(a.y,b.y)/cell);y++) {
        const id=`${x}:${y}`,entries=buckets.get(id)||[];
        for(const old of entries) {
          const previous=`${old.l}:${old.i}`;
          if(seen.has(previous))continue;seen.add(previous);
          if(old.l===l&&(old.i===i-1||i===loops[l].length-1&&old.i===0))continue;
          if(intersect(a,b,old.a,old.b))return false;
        }
        entries.push({a,b,l,i});buckets.set(id,entries);
      }
  }
  for(let i=0;i<loops.length;i++)for(let j=0;j<loops.length;j++)if(i!==j
    &&polygonContains(loops[j],loops[i][0])!==polygonContains(original[j],original[i][0]))return false;
  return true;
}
export function triangulate(loops) {
  const outers=loops.filter(loop=>polygonArea(loop)>0).map(loop=>({loop,holes:[]}));
  for(const hole of loops.filter(loop=>polygonArea(loop)<0)) {
    const outer=outers.filter(outer=>polygonContains(outer.loop,hole[0])).sort((a,b)=>polygonArea(a.loop)-polygonArea(b.loop))[0];
    if(!outer)return null;outer.holes.push(hole);
  }
  const triangles=[];
  for(const {loop,holes} of outers) {
    const points=[...loop],indices=[];
    for(const hole of holes){indices.push(points.length);points.push(...hole);}
    const data=points.flatMap(p=>[p.x,p.y]),mesh=earcut(data,indices);
    if(!mesh.length||!(deviation(data,indices,2,mesh)<1e-7))return null;
    for(let i=0;i<mesh.length;i+=3) {
      const triangle=[points[mesh[i]],points[mesh[i+1]],points[mesh[i+2]]];
      if(polygonArea(triangle)<0)triangle.reverse();
      if(polygonArea(triangle)>0)triangles.push(triangle);
    }
  }
  return triangles;
}
function mergeConvex(triangles) {
  const polygons=triangles.map(triangle=>triangle.slice());
  for(let pass=0;pass<24;pass++) {
    const edges=new Map();let changed=false;
    for(let i=0;i<polygons.length;i++) {
      const polygon=polygons[i];if(!polygon)continue;
      for(let j=0;j<polygon.length;j++) {
        const a=polygon[j],b=polygon[(j+1)%polygon.length],other=edges.get(`${key(b)}>${key(a)}`);
        if(other&&polygons[other.i]&&other.i!==i) {
          const old=polygons[other.i];
          if(!same(old[other.j],b)||!same(old[(other.j+1)%old.length],a))continue;
          const tail=Array.from({length:old.length-2},(_,k)=>old[(other.j+2+k)%old.length]);
          const merged=withoutCollinear([...polygon.slice(j+1),...polygon.slice(0,j+1),...tail]);
          const expected=polygonArea(polygon)+polygonArea(old);
          if(merged.length<=12&&merged.length>=3&&Math.abs(polygonArea(merged)-expected)<=expected*1e-10
            &&merged.every((p,k)=>cross(p,merged[(k+1)%merged.length],merged[(k+2)%merged.length])>=0)) {
            polygons[other.i]=null;polygons[i]=merged;changed=true;break;
          }
        }
        edges.set(`${key(a)}>${key(b)}`,{i,j});
      }
    }
    if(!changed)break;
  }
  return polygons.filter(Boolean);
}
const shapeCache=new WeakMap();
export function bodyGeometry(object) {
  const shape=object.shape,level=smoothingLevel(object);
  let cache=shapeCache.get(shape);if(!cache){cache=new Map();shapeCache.set(shape,cache);}
  if(cache.has(level))return cache.get(level);
  const raw={rectangles:shape.rectangles,polygons:null,triangles:null,edges:null,applied:false,parts:shape.rectangles.length};
  if(level===0){cache.set(level,raw);return raw;}
  let original=cache.get('contours');
  if(original===undefined){original=shapeContours(shape);cache.set('contours',original);}
  let extent=0;
  if(original) {
    const points=original.flat(),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    extent=Math.max(xs.reduce((a,b)=>Math.max(a,b),-Infinity)-xs.reduce((a,b)=>Math.min(a,b),Infinity),ys.reduce((a,b)=>Math.max(a,b),-Infinity)-ys.reduce((a,b)=>Math.min(a,b),Infinity));
  }
  if(original&&extent>0)for(let attempt=0;attempt<9;attempt++) {
    const tolerance=extent*level/10000/2**attempt,loops=original.map(loop=>simplifyRing(loop,tolerance));
    if(!validLoops(loops,original,extent))continue;
    const triangles=triangulate(loops);if(!triangles)continue;
    const polygons=mergeConvex(triangles),edges=[];
    for(const loop of loops)for(let i=0;i<loop.length;i++) {
      const first=loop[i],second=loop[(i+1)%loop.length],length=Math.hypot(second.x-first.x,second.y-first.y);
      edges.push({first,second,normal:{x:(second.y-first.y)/length,y:-(second.x-first.x)/length}});
    }
    const result={rectangles:null,loops,polygons,triangles,edges,applied:true,parts:polygons.length,tolerance};
    cache.set(level,result);return result;
  }
  cache.set(level,raw);return raw;
}
export function bodyPolygons(object) {
  const geometry=bodyGeometry(object);
  return geometry.polygons || object.shape.rectangles.map(([left,bottom,right,top])=>[
    {x:left,y:bottom},{x:right,y:bottom},{x:right,y:top},{x:left,y:top},
  ]);
}

const renderTriangles=new WeakMap();
export function bodyRenderTriangles(object) {
  const geometry=bodyGeometry(object);
  if(geometry.triangles)return geometry.triangles;
  if(!renderTriangles.has(object.shape)){
    const contours=shapeContours(object.shape);
    const triangles=contours&&triangulate(contours);
    renderTriangles.set(object.shape,triangles||object.shape.rectangles.flatMap(([l,b,r,t])=>[
      [{x:l,y:b},{x:r,y:b},{x:r,y:t}], [{x:l,y:b},{x:r,y:t},{x:l,y:t}],
    ]));
  }
  return renderTriangles.get(object.shape);
}
export function bodyWorldPolygons(object) {
  const c=Math.cos(object.angle),s=Math.sin(object.angle);
  return bodyPolygons(object).map(polygon=>polygon.map(p=>({x:object.position.x+p.x*c-p.y*s,y:object.position.y+p.x*s+p.y*c})));
}
