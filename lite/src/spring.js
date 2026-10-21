import { createRope, rebuildRope, ropePath, ropeDistance } from './rope.js';

export function createSpring(anchors, objects) {
  const spring = createRope(anchors, objects);
  if (!spring) return null;
  Object.assign(spring, {
    type: 'spring', length: spring.length / 1.12, stiffness: .01, damping: .12,
    radius: .025, coilRadius: Math.max(.06, Math.min(.3, spring.length / 24)), turns: 12,
  });
  rebuildRope(spring, objects);
  return spring;
}

// Project a helix onto the deforming axis using arc length, so its turns remain
// evenly distributed as the physical spring bends, stretches and compresses.
export function springPath(spring) {
  const axis = ropePath(spring, 6), lengths = [0];
  for (let i = 1; i < axis.length; i++) lengths.push(lengths.at(-1) + Math.hypot(axis[i].x-axis[i-1].x, axis[i].y-axis[i-1].y));
  const total = lengths.at(-1);
  if (!(total > 1e-12)) return axis;
  const count = spring.turns * 24 + 24, path = [];
  let segment = 1;
  for (let i = 0; i <= count; i++) {
    const u = i / count, distance = total * u;
    while (segment < axis.length-1 && lengths[segment] < distance) segment++;
    const a = axis[segment-1], b = axis[segment], span = lengths[segment]-lengths[segment-1];
    const t = (distance-lengths[segment-1])/(span || 1), dx = (b.x-a.x)/(span || 1), dy = (b.y-a.y)/(span || 1);
    const phase = Math.max(0, Math.min(1, (u-.05)/.9)) * spring.turns * 2*Math.PI;
    const envelope = Math.min(1, Math.max(0, (u-.05)*40), Math.max(0, (.95-u)*40));
    const offset = Math.sin(phase) * spring.coilRadius * envelope;
    const along = (1-Math.cos(phase)) * Math.min(spring.coilRadius*.14, total/spring.turns*.12) * envelope;
    path.push({ x: a.x+(b.x-a.x)*t - dy*offset + dx*along, y: a.y+(b.y-a.y)*t + dx*offset + dy*along });
  }
  return path;
}

export const flexiblePath = (object, steps) => object.type === 'spring' ? springPath(object) : ropePath(object, steps);
export const flexibleDistance = (object, point) => ropeDistance(object, point, flexiblePath(object));
