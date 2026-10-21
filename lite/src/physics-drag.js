// Mouse forces use world units and a rotating local grab point. Keeping this
// input separate from object definitions lets the timeline replay actual forces.
export function dragBody(world, drag) {
  if (!drag) return null;
  if(drag.softNode!==undefined)return world.softBodies.get(drag.id)?.particles[drag.softNode];
  return drag.particle !== undefined ? world.liquids.get(drag.id)?.particles[drag.particle] : drag.link === null ? world.bodies.get(drag.id)?.body : world.ropes.get(drag.id)?.links[drag.link];
}

export function startDrag(world, id, point, scale) {
  const rigid = world.bodies.get(id);
  const links = world.ropes.get(id)?.links;
  let link = null, body = rigid?.body;
  let particle;
  let softNode;
  const soft=world.softBodies.get(id)?.particles;
  if(soft?.length){let minimum=Infinity;for(let i=0;i<soft.length;i++){const d=Math.hypot(point.x*scale-soft[i].position.x,-point.y*scale-soft[i].position.y);if(d<minimum){minimum=d;softNode=i;body=soft[i];}}}
  const droplets=world.liquids.get(id)?.particles;
  if(droplets?.length) {
    let minimum=Infinity;
    for(let i=0;i<droplets.length;i++) {
      const distance=Math.hypot(point.x*scale-droplets[i].position.x,-point.y*scale-droplets[i].position.y);
      if(distance<minimum){minimum=distance;particle=i;body=droplets[i];}
    }
  }
  if (!body && links?.length) {
    let minimum = Infinity;
    for (let i = 0; i < links.length; i++) {
      const candidate = links[i], dx = point.x*scale-candidate.position.x, dy = -point.y*scale-candidate.position.y;
      const c = Math.cos(candidate.angle), s = Math.sin(candidate.angle);
      const x = dx*c+dy*s, y = -dx*s+dy*c;
      const half = world.ropes.get(id).object.length/links.length*scale/2;
      const distance = Math.hypot(Math.max(0,Math.abs(x)-half),y);
      if (distance < minimum) { minimum = distance; link = i; body = candidate; }
    }
  }
  if (!body || body.isStatic) return false;
  const dx = point.x-body.position.x/scale, dy = point.y+body.position.y/scale;
  const angle = -body.angle, c = Math.cos(angle), s = Math.sin(angle);
  world.drag = { id, link, local: { x: dx*c+dy*s, y: -dx*s+dy*c }, target: { ...point } };
  if(particle!==undefined)world.drag.particle=particle;
  if(softNode!==undefined)world.drag.softNode=softNode;
  return true;
}

export function dragGuide(world, scale) {
  const drag = world.drag, body = dragBody(world,drag);
  if (!body) return null;
  const angle = -body.angle, c = Math.cos(angle), s = Math.sin(angle);
  return { anchor: { x: body.position.x/scale+drag.local.x*c-drag.local.y*s,
    y: -body.position.y/scale+drag.local.x*s+drag.local.y*c }, target: drag.target };
}

export function applyDrag(world, Matter, scale) {
  const drag = world.drag, body = dragBody(world,drag);
  if (!body || body.isStatic) return;
  const guide = dragGuide(world,scale), anchor = { x:guide.anchor.x*scale, y:-guide.anchor.y*scale };
  const velocity = Matter.Body.getVelocity(body), spin = Matter.Body.getAngularVelocity(body);
  const vx = (velocity.x-spin*(anchor.y-body.position.y))*60/scale;
  const vy = -(velocity.y+spin*(anchor.x-body.position.x))*60/scale;
  // N/m and N·s/m, with a finite 200 N pull to keep remote cursor jumps stable.
  // Mass and inertia remain part of Matter's force/torque integration.
  const damping = 2*Math.sqrt(60*body.mass)*.65;
  let fx = 60*(drag.target.x-guide.anchor.x)-damping*vx;
  let fy = 60*(drag.target.y-guide.anchor.y)-damping*vy;
  const factor = Math.min(1,200/(Math.hypot(fx,fy)||1));
  Matter.Body.applyForce(body,anchor,{x:fx*factor*scale/1e6,y:-fy*factor*scale/1e6});
}
