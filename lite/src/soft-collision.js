// Keep the particle solver, but inscribe every contact disk in the material.
// Boundary disks move inward; the visible mesh remains the source of truth.
const installed=Symbol.for('stucanvas.soft-inscribed-colliders');
const distance=(p,a,b)=>{
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);
};
function refresh(group) {
  const {particles,edges,adjacent,cellSize}=group,grid=new Map(),long=[];
  for(let i=0;i<edges.length;i++){
    const edge=edges[i],a=particles[edge.a].position,b=particles[edge.b].position,c=particles[edge.third].position;
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
    edge.nx=-dy/length;edge.ny=dx/length;
    if(edge.nx*(c.x-a.x)+edge.ny*(c.y-a.y)<0){edge.nx=-edge.nx;edge.ny=-edge.ny;}
    const left=Math.floor(Math.min(a.x,b.x)/cellSize),right=Math.floor(Math.max(a.x,b.x)/cellSize),top=Math.floor(Math.min(a.y,b.y)/cellSize),bottom=Math.floor(Math.max(a.y,b.y)/cellSize);
    if((right-left+1)*(bottom-top+1)>64){long.push(i);continue;}
    for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++){
      const key=`${x}:${y}`;let bucket=grid.get(key);if(!bucket)grid.set(key,bucket=[]);bucket.push(i);
    }
  }
  for(let i=0;i<particles.length;i++){
    const body=particles[i],data=body.softCollider,a=body.position,part=body.parts[1];
    const center={x:a.x,y:a.y};let radius=data.radius;
    if(adjacent[i].length){
      let nx=0,ny=0;
      for(const index of adjacent[i]){nx+=edges[index].nx;ny+=edges[index].ny;}
      const length=Math.hypot(nx,ny)||1;nx/=length;ny/=length;
      let projection=1;for(const index of adjacent[i])projection=Math.min(projection,nx*edges[index].nx+ny*edges[index].ny);
      let inset=projection>1e-6?Math.min(radius/projection,2*radius):0;
      // An acute corner or a thin wall must not send the inset across another
      // boundary, particularly into a hole or a separate material island.
      const nearby=new Set(long),left=Math.floor((a.x-2*radius)/cellSize),right=Math.floor((a.x+2*radius)/cellSize),top=Math.floor((a.y-2*radius)/cellSize),bottom=Math.floor((a.y+2*radius)/cellSize);
      for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++)for(const index of grid.get(`${x}:${y}`)||[])nearby.add(index);
      for(const index of nearby){
        const edge=edges[index];
        if(edge.a===i||edge.b===i)continue;
        const p=particles[edge.a].position,q=particles[edge.b].position,dx=q.x-p.x,dy=q.y-p.y,den=nx*dy-ny*dx;
        if(Math.abs(den)<1e-12)continue;
        const t=((p.x-a.x)*dy-(p.y-a.y)*dx)/den,u=((p.x-a.x)*ny-(p.y-a.y)*nx)/den;
        if(t>1e-8&&u>=0&&u<=1)inset=Math.min(inset,t*.5);
      }
      center.x+=nx*inset;center.y+=ny*inset;
      radius=Math.min(radius,Math.max(.001,inset*projection));
    }
    const left=Math.floor((center.x-radius)/cellSize),right=Math.floor((center.x+radius)/cellSize),top=Math.floor((center.y-radius)/cellSize),bottom=Math.floor((center.y+radius)/cellSize);
    const clip=index=>{const edge=edges[index];radius=Math.min(radius,distance(center,particles[edge.a].position,particles[edge.b].position));};
    for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++)for(const index of grid.get(`${x}:${y}`)||[])clip(index);
    for(const index of long)clip(index);
    radius=Math.max(.001,radius);
    part.position.x=center.x;part.position.y=center.y;
    const bounds=part.bounds;bounds.min.x=bounds.min.y=Infinity;bounds.max.x=bounds.max.y=-Infinity;
    for(let j=0;j<part.vertices.length;j++){
      const vertex=part.vertices[j],unit=data.unit[j];vertex.x=center.x+unit.x*radius;vertex.y=center.y+unit.y*radius;
      bounds.min.x=Math.min(bounds.min.x,vertex.x);bounds.max.x=Math.max(bounds.max.x,vertex.x);
      bounds.min.y=Math.min(bounds.min.y,vertex.y);bounds.max.y=Math.max(bounds.max.y,vertex.y);
    }
    body.bounds.min.x=bounds.min.x;body.bounds.min.y=bounds.min.y;body.bounds.max.x=bounds.max.x;body.bounds.max.y=bounds.max.y;
  }
}
export function createSoftColliders(particles,mesh,multiplier,Matter,scale) {
  const third=new Map(),adjacent=particles.map(()=>[]);
  for(const face of mesh.triangles)for(let i=0;i<3;i++)third.set(`${Math.min(face[i],face[(i+1)%3])}:${Math.max(face[i],face[(i+1)%3])}`,face[(i+2)%3]);
  const edges=mesh.boundary.map(([a,b],i)=>{adjacent[a].push(i);adjacent[b].push(i);return{a,b,third:third.get(`${Math.min(a,b)}:${Math.max(a,b)}`),nx:0,ny:0}});
  const group={particles,edges,adjacent,cellSize:Math.max(.02,...mesh.radii.map(r=>r*multiplier*scale))*2};
  for(let i=0;i<particles.length;i++){
    const body=particles[i],position={...body.position},radius=Math.max(.02,mesh.radii[i]*multiplier*scale);
    const part=Matter.Bodies.polygon(position.x,position.y,20,1,{slop:.005});
    const unit=part.vertices.map(p=>{const x=p.x-position.x,y=p.y-position.y,length=Math.max(1,Math.hypot(x,y));return{x:x/length,y:y/length}});
    part.axes=Matter.Axes.fromVertices(unit);
    Matter.Body.setParts(body,[part],false);Matter.Body.setCentre(body,position);
    body.softRadius=radius;body.softCollider={group,radius,unit};
  }
  refresh(group);
  if(!Matter.Detector[installed]){
    const detect=Matter.Detector.collisions;
    Matter.Detector.collisions=detector=>{
      const groups=new Set();for(const body of detector.bodies)if(body.softCollider)groups.add(body.softCollider.group);
      for(const group of groups)refresh(group);
      return detect(detector);
    };
    Matter.Detector[installed]=true;
  }
}

export function captureSoftBoundary(world) {
  const nodes=[];
  if(!world.bodies.size&&!world.boundaries.size)return nodes;
  for(const entry of world.softBodies.values())if(entry.object.running&&!entry.object.hidden){
    const indices=entry.boundaryIndices||=[...new Set(entry.mesh.boundary.flat())];
    for(const index of indices){const body=entry.particles[index];nodes.push({body,x:body.position.x,y:body.position.y});}
  }
  return nodes;
}

// Distance constraints run after Matter's contact position pass. Project only
// genuinely penetrating/swept boundary vertices at that final pose; this adds
// no contact skin and prevents crossing a thin stroke between solver samples.
export function resolveSoftBoundary(world,nodes,Matter) {
  const obstacles=[...world.bodies.values()].map(e=>e.body).concat([...world.boundaries.values()].flatMap(e=>e.bodies));
  for(const {body,x,y} of nodes)for(const other of obstacles){
    if(!Matter.Detector.canCollide(body.collisionFilter,other.collisionFilter))continue;
    const p=body.position,bounds=other.bounds;
    if(Math.max(x,p.x)<bounds.min.x||Math.min(x,p.x)>bounds.max.x||Math.max(y,p.y)<bounds.min.y||Math.min(y,p.y)>bounds.max.y)continue;
    const parts=other.parts.length>1?other.parts.slice(1):other.parts;
    for(const part of parts){
      const vertices=part.vertices,inside=Matter.Vertices.contains(vertices,p),dx=p.x-x,dy=p.y-y;
      let closest=null,minimum=Infinity,hit=null,earliest=Infinity;
      for(let i=0;i<vertices.length;i++){
        const a=vertices[i],b=vertices[(i+1)%vertices.length],ex=b.x-a.x,ey=b.y-a.y,length=Math.hypot(ex,ey)||1;
        const t=Math.max(0,Math.min(1,((p.x-a.x)*ex+(p.y-a.y)*ey)/(length*length)));
        const q={x:a.x+t*ex,y:a.y+t*ey,nx:ey/length,ny:-ex/length},d=(p.x-q.x)**2+(p.y-q.y)**2;
        if(d<minimum){minimum=d;closest=q;}
        const den=dx*ey-dy*ex;
        if(Math.abs(den)<1e-12)continue;
        const travel=((a.x-x)*ey-(a.y-y)*ex)/den,u=((a.x-x)*dy-(a.y-y)*dx)/den;
        if(travel>=0&&travel<=1&&u>=0&&u<=1&&travel<earliest&&dx*q.nx+dy*q.ny<0){earliest=travel;hit={x:x+travel*dx,y:y+travel*dy,nx:q.nx,ny:q.ny};}
      }
      const contact=hit||(inside?closest:null);if(!contact)continue;
      const v=Matter.Body.getVelocity(body),ov=Matter.Body.getVelocity(other),offset={x:contact.x-other.position.x,y:contact.y-other.position.y},spin=Matter.Body.getAngularVelocity(other);
      const relative={x:v.x-ov.x+offset.y*spin,y:v.y-ov.y-offset.x*spin},normal=relative.x*contact.nx+relative.y*contact.ny;
      Matter.Body.setPosition(body,{x:contact.x+contact.nx*.002,y:contact.y+contact.ny*.002});
      if(normal<0){
        const point={x:contact.x/50,y:-contact.y/50},n={x:contact.nx,y:-contact.ny};
        const restitution=Math.max(body.surfaceRestitutionAt?.(point,{x:-n.x,y:-n.y})??body.restitution,other.surfaceRestitutionAt?.(point,n)??other.restitution);
        const friction=Math.sqrt((body.surfaceFrictionAt?.(point,{x:-n.x,y:-n.y})??0)*(other.surfaceFrictionAt?.(point,n)??0));
        const rotation=offset.x*contact.ny-offset.y*contact.nx,inverse=body.inverseMass+other.inverseMass+other.inverseInertia*rotation**2;
        const impulse=-(1+restitution)*normal/(inverse||1),tx=-contact.ny,ty=contact.nx;
        const tangentRotation=offset.x*ty-offset.y*tx,tangent=-(relative.x*tx+relative.y*ty)/(body.inverseMass+other.inverseMass+other.inverseInertia*tangentRotation**2||1);
        const drag=Math.max(-friction*impulse,Math.min(friction*impulse,tangent)),ix=contact.nx*impulse+tx*drag,iy=contact.ny*impulse+ty*drag;
        Matter.Body.setVelocity(body,{x:v.x+ix*body.inverseMass,y:v.y+iy*body.inverseMass});
        if(!other.isStatic){
          Matter.Body.setVelocity(other,{x:ov.x-ix*other.inverseMass,y:ov.y-iy*other.inverseMass});
          Matter.Body.setAngularVelocity(other,spin-(offset.x*iy-offset.y*ix)*other.inverseInertia);
        }
      }
    }
  }
}
