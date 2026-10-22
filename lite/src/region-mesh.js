import { shapeContours, simplifyRing, validLoops, triangulate } from './physics-shape.js';

// Flood rows identify the component; only its exterior and hole contours enter
// the display mesh. This cache is independent of pan, zoom, color and opacity.
const meshes = new WeakMap();
export function regionMesh(region) {
  const samples = region.rectangles;
  const cached = meshes.get(samples);
  if (cached) return cached;
  const rectangles = [];
  for (let i = 0; i < samples.length; i += 4) {
    const [left, top, right, bottom] = samples.subarray ? samples.subarray(i, i+4) : samples.slice(i, i+4);
    if (right > left && bottom > top) rectangles.push([left, -bottom, right, -top]);
  }
  const original = shapeContours({ rectangles });
  let triangles = null;
  if (original?.length) {
    let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
    for(const loop of original)for(const p of loop){left=Math.min(left,p.x);right=Math.max(right,p.x);bottom=Math.min(bottom,p.y);top=Math.max(top,p.y);}
    const extent=Math.max(right-left,top-bottom);
    // Removing subpixel stair steps prevents thousands of skinny boundary
    // triangles. Validate topology on every attempt: holes and islands survive.
    const tolerance=Math.min(.375,(region.cell ?? .25)*1.5);
    for(let attempt=0;attempt<8&&!triangles;attempt++){
      const loops=original.map(loop=>simplifyRing(loop,tolerance/2**attempt));
      if(validLoops(loops,original,extent))triangles=triangulate(loops);
    }
    triangles ||= triangulate(original);
  }
  // Keep shared vertices shared when projecting to f32 GPU coordinates. There
  // are no independent strip endpoints or T-junctions inside the filled area.
  const vertices=[],indices=[],lookup=new Map();
  for(const triangle of triangles || [])for(const p of triangle){
    let index=lookup.get(p);
    if(index===undefined){index=vertices.length;lookup.set(p,index);vertices.push({x:p.x,y:-p.y});}
    indices.push(index);
  }
  const mesh={vertices,indices:new Uint32Array(indices)};
  meshes.set(samples,mesh);
  return mesh;
}
