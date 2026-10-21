import { bodyGeometry, bodySurfaceEdges } from './physics-shape.js';
import { isSoftBody, softEdges } from './soft-body.js';
export { bodySurfaceEdges } from './physics-shape.js';
import { arcTypes, isLinear, isPoint } from './geometry.js';
import { isConic, conicSegments } from './conics.js';
import { isPlot } from './plot/types.js';
import { clipLinear, toWorld } from './projection.js';
import { getTheme, rgba } from './themes.js';

export const DEFAULT_SURFACE_FRICTION = 0;
export const supportsSurfaceFriction = object => !!object && (isSoftBody(object) || object.type === 'physicsBody' || isLinear(object) || isPoint(object) || isConic(object) || isPlot(object) || object.type === 'circle' || arcTypes.has(object.type));
const dot = (a, b) => a.x * b.x + a.y * b.y;
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export function surfaceFrame(object) {
  if(isSoftBody(object))return{soft:object,origin:{x:0,y:0},angle:0,scale:1};
  if (object.type === 'physicsBody') return { origin: object.position, angle: object.angle, scale: 1 };
  if (isConic(object)) return { origin: object.origin, angle: Math.atan2(object.axis.y, object.axis.x), scale: object.scale };
  if (isLinear(object)) {
    const d = object.direction || { x: object.second.x - object.first.x, y: object.second.y - object.first.y };
    return { origin: object.first, angle: Math.atan2(d.y, d.x), scale: Math.hypot(d.x, d.y) || 1 };
  }
  return { origin: object.first || (isPoint(object) ? object : { x: 0, y: 0 }), angle: 0, scale: object.radius || 1 };
}
export function surfaceLocal(frame, point, vector = false) {
  const x = point.x - (vector ? 0 : frame.origin.x), y = point.y - (vector ? 0 : frame.origin.y);
  const cosine = Math.cos(frame.angle), sine = Math.sin(frame.angle), scale = vector ? 1 : frame.scale;
  return { x: (x * cosine + y * sine) / scale+(vector?0:frame.localOrigin?.x||0), y: (-x * sine + y * cosine) / scale+(vector?0:frame.localOrigin?.y||0) };
}
export function surfaceWorld(frame, point, vector = false) {
  const cosine = Math.cos(frame.angle), sine = Math.sin(frame.angle), scale = vector ? 1 : frame.scale;
  const x=point.x-(vector?0:frame.localOrigin?.x||0),y=point.y-(vector?0:frame.localOrigin?.y||0);
  return { x: (vector ? 0 : frame.origin.x) + (x * cosine - y * sine) * scale,
    y: (vector ? 0 : frame.origin.y) + (x * sine + y * cosine) * scale };
}
export function contactSurfaceFrame(object,point,frame=surfaceFrame(object),edge=null) {
  if(!frame.soft)return frame;
  const material=frame.soft;
  edge||=nearestSurface(softEdges(material),point);
  if(!edge)return frame;
  const [a,b]=edge.indices.map(i=>material.mesh.vertices[i]);
  return{origin:edge.first,localOrigin:a,angle:Math.atan2(edge.second.y-edge.first.y,edge.second.x-edge.first.x)-Math.atan2(b.y-a.y,b.x-a.x),scale:Math.max(1e-12,Math.hypot(edge.second.x-edge.first.x,edge.second.y-edge.first.y)/Math.hypot(b.x-a.x,b.y-a.y))};
}
export function surfaceValueAtLocal(object, point, normal, field) {
  const patches = object[field] || [];
  for (let index = patches.length - 1; index >= 0; index--) {
    const patch = patches[index];
    if (dot(normal, patch.normal) > .25 && Math.hypot(point.x - patch.center.x, point.y - patch.center.y) <= patch.radius) return patch.coefficient;
  }
  return null;
}
export const frictionAtLocal = (object, point, normal) => surfaceValueAtLocal(object, point, normal, 'surfaceFriction');
export function frictionAt(object, point, normal, frame = surfaceFrame(object)) {
  frame=contactSurfaceFrame(object,point,frame);
  return frictionAtLocal(object, surfaceLocal(frame, point), surfaceLocal(frame, normal, true)) ?? DEFAULT_SURFACE_FRICTION;
}
export function paintSurface(object, point, normal, radius, coefficient, frame = surfaceFrame(object), field = 'surfaceFriction') {
  frame=contactSurfaceFrame(object,point,frame);
  const patch = { center: surfaceLocal(frame, point), normal: surfaceLocal(frame, normal, true), radius: radius / frame.scale, coefficient };
  const previous = object[field] || [];
  // Fully covered brush dabs on the same surface are redundant (last paint wins).
  object[field] = [...previous.filter(old => !(dot(old.normal, patch.normal) > .9999
    && Math.hypot(old.center.x - patch.center.x, old.center.y - patch.center.y) + old.radius <= patch.radius + 1e-12)), patch];
  delete object.friction;
}

// Geometry shared by brush hit-testing and the colored edge overlay. Body
// internal rectangle joins are cancelled before any edge becomes paintable.
export function surfaceSegments(object, view, width, height) {
  if (object.hidden || object.invalid || !supportsSurfaceFriction(object)) return [];
  if(isSoftBody(object))return softEdges(object);
  const result = [];
  const line = (first, second, outward) => {
    const dx = second.x - first.x, dy = second.y - first.y, length = Math.hypot(dx, dy);
    if (!(length > 0) || !Number.isFinite(length)) return;
    const normal = outward || { x: -dy / length, y: dx / length };
    result.push({ first, second, normal });
    if (!outward) result.push({ first, second, normal: { x: -normal.x, y: -normal.y } });
  };
  if (object.type === 'physicsBody') {
    const frame = surfaceFrame(object);
    const geometry = bodyGeometry(object);
    const edges = geometry.edges || bodySurfaceEdges(object.shape);
    return edges.map(edge => ({ first: surfaceWorld(frame, edge.first), second: surfaceWorld(frame, edge.second), normal: surfaceWorld(frame, edge.normal, true) }));
  }
  if (isLinear(object)) {
    const clipped = clipLinear(object, view, width, height, 24);
    if (clipped) line(toWorld(clipped.first, view, width, height), toWorld(clipped.second, view, width, height));
  } else if (isConic(object)) {
    for (const edge of conicSegments(object, view, width, height, .05)) line(edge.first, edge.second);
  } else if (isPlot(object)) {
    const segments = object.plot?.segments;
    if (segments) for (let i = 0; i < segments.length; i += 4) line({ x: segments[i], y: segments[i + 1] }, { x: segments[i + 2], y: segments[i + 3] });
    else {
      const points = object.plot?.points || [], equation = object.plot?.equation;
      for (let i = 0; i < points.length; i += 2) {
        const x = points[i], y = points[i + 1];
        if (!equation || !Number.isFinite(x) || !Number.isFinite(y)) continue;
        const [, gx, gy] = equation.gradient(x, y), norm = Math.hypot(gx, gy);
        if (!(norm > 0) || !Number.isFinite(norm)) continue;
        const half = Math.max(.5, object.plot?.options?.pointSpacing || .75) / view.scale;
        line({ x: x - gy / norm * half, y: y + gx / norm * half }, { x: x + gy / norm * half, y: y - gx / norm * half });
      }
    }
  } else {
    const center = object.first || object, radius = object.radius || 5 / view.scale;
    const start = object.arcStart ? Math.atan2(object.arcStart.y - center.y, object.arcStart.x - center.x) : 0;
    const sweep = object.sweep ?? Math.PI * 2;
    const count = Math.max(16, Math.min(16384, Math.ceil(Math.abs(sweep) * radius * view.scale / 2)));
    const at = angle => ({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
    for (let i = 0; i < count; i++) line(at(start + sweep * i / count), at(start + sweep * (i + 1) / count));
    if (object.type === 'sector' || object.type === 'circumSector') { line(center, object.arcStart); line(center, object.arcEnd); }
  }
  return result;
}
export function nearestSurface(segments, point, preferredNormal = null) {
  let best = null;
  for (const edge of segments) {
    if (preferredNormal && dot(edge.normal, preferredNormal) < -.25) continue;
    const dx = edge.second.x - edge.first.x, dy = edge.second.y - edge.first.y;
    const t = Math.max(0, Math.min(1, ((point.x - edge.first.x) * dx + (point.y - edge.first.y) * dy) / (dx * dx + dy * dy)));
    const position = mix(edge.first, edge.second, t);
    const offset = { x: point.x - position.x, y: point.y - position.y };
    const distance = Math.hypot(offset.x, offset.y);
    // At coincident two-sided boundaries the cursor selects the approached face.
    const score = distance + (dot(offset, edge.normal) < -1e-12 ? 1e-8 : 0);
    if (!best || score < best.score) best = { ...edge, position, distance, score };
  }
  return best;
}
export function frictionColor(value) {
  return surfaceColor(value, 'friction');
}
export function surfaceColor(value, property) {
  const palette = getTheme().canvas;
  const stops = [palette[`${property}Low`], palette[`${property}Middle`], palette[`${property}High`]];
  const t = Math.max(0, Math.min(1, value)) * 2, i = Math.min(1, Math.floor(t)), a = rgba(stops[i]), b = rgba(stops[i + 1]);
  return a.map((channel, index) => channel + (b[index] - channel) * (t - i));
}
export function paintedSurfaceSegments(object, segments, field = 'surfaceFriction') {
  const result = [], patches = object[field] || [];
  for (const edge of segments) {
    const frame=contactSurfaceFrame(object,edge.first,surfaceFrame(object),edge);
    const first = surfaceLocal(frame, edge.first), second = surfaceLocal(frame, edge.second), normal = surfaceLocal(frame, edge.normal, true);
    const dx = second.x - first.x, dy = second.y - first.y, length2 = dx * dx + dy * dy;
    const cuts = [0, 1];
    for (const patch of patches) {
      if (dot(normal, patch.normal) <= .25) continue;
      const x = first.x - patch.center.x, y = first.y - patch.center.y;
      const b = 2 * (x * dx + y * dy), c = x * x + y * y - patch.radius ** 2;
      const discriminant = b * b - 4 * length2 * c;
      if (!(discriminant > 0)) continue;
      for (const t of [(-b - Math.sqrt(discriminant)) / (2 * length2), (-b + Math.sqrt(discriminant)) / (2 * length2)]) if (t > 0 && t < 1) cuts.push(t);
    }
    cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] - cuts[i - 1] < 1e-10) continue;
      const coefficient = surfaceValueAtLocal(object, mix(first, second, (cuts[i] + cuts[i - 1]) / 2), normal, field);
      if (coefficient !== null) result.push({ first: mix(edge.first, edge.second, cuts[i - 1]), second: mix(edge.first, edge.second, cuts[i]), normal: edge.normal, coefficient });
    }
  }
  return result;
}
