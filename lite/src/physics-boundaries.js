import { arcTypes, isLinear, isPoint, linearBounds, linearDirection } from './geometry.js';
import { cadPrimitives, trimCadSources } from './cad.js';
import { clipLinear, toWorld } from './projection.js';
import { conicSegments, isConic } from './conics.js';
import { isPlot } from './plot/types.js';
import { isPhysicsObject } from './physics.js';

const plotIds = new WeakMap();
let nextPlotId = 0;
const plotId = plot => { if (!plot) return 0; if (!plotIds.has(plot)) plotIds.set(plot, ++nextPlotId); return plotIds.get(plot); };
const point = (x, y) => ({ x, y });
const shapeRadii = new WeakMap();

// Capture the physical scale and bottom once. Camera gestures must never move
// a collider through a body or change the thickness of an existing obstacle.
// Grow sampling coverage in world coordinates as bodies travel offscreen.
export function physicsBoundaryFrame(world, objects, view, width, height) {
  const physical = objects.filter(isPhysicsObject);
  if (!physical.length) { world.boundaryFrame = null; world.boundaryDomain = null; return null; }
  const frame = world.boundaryFrame ||= { view: { ...view }, width, height };
  const scale = frame.view.scale;
  const cell = Math.max(4, frame.width / scale, frame.height / scale);
  const domain = world.boundaryDomain ||= {
    left: frame.view.x - frame.width / scale / 2, right: frame.view.x + frame.width / scale / 2,
    bottom: frame.view.y - frame.height / scale / 2, top: frame.view.y + frame.height / scale / 2,
  };
  const include = (position, radius = 0) => {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
    const margin = radius + 2;
    if (position.x - margin < domain.left) domain.left = Math.floor((position.x - margin) / cell - 1) * cell;
    if (position.x + margin > domain.right) domain.right = Math.ceil((position.x + margin) / cell + 1) * cell;
    if (position.y - margin < domain.bottom) domain.bottom = Math.floor((position.y - margin) / cell - 1) * cell;
    if (position.y + margin > domain.top) domain.top = Math.ceil((position.y + margin) / cell + 1) * cell;
  };
  for (const object of physical) {
    if (object.hidden) continue;
    if (object.shape) {
      if (!shapeRadii.has(object.shape)) {
        let radius = 0;
        for (const [left, bottom, right, top] of object.shape.rectangles) radius = Math.max(radius, Math.hypot(Math.max(Math.abs(left), Math.abs(right)), Math.max(Math.abs(bottom), Math.abs(top))));
        shapeRadii.set(object.shape, radius);
      }
      include(object.position, shapeRadii.get(object.shape));
    } else for (const state of object.nodes || object.particles || object.links || []) include(state.position, object.radius || 0);
  }
  return { view: { x: (domain.left + domain.right) / 2, y: (domain.bottom + domain.top) / 2, scale },
    width: (domain.right - domain.left) * scale, height: (domain.top - domain.bottom) * scale };
}

function fixtures(object, view, width, height) {
  const thickness = Math.max(.012, (object.strokeWidth || 2.4) / view.scale);
  const segment = (first, second) => ({ first, second, thickness });
  if (isPoint(object)) return [{ x: object.x, y: object.y, radius: 5 / view.scale }];
  if (isLinear(object)) {
    const [lower, upper] = linearBounds(object);
    if (Number.isFinite(lower) && Number.isFinite(upper)) {
      if (lower > upper) return [];
      const direction = linearDirection(object);
      const at = t => point(object.first.x + t * direction.x, object.first.y + t * direction.y);
      return [segment(at(lower), at(upper))];
    }
    const clipped = clipLinear(object, view, width, height, 100);
    return clipped ? [segment(toWorld(clipped.first, view, width, height), toWorld(clipped.second, view, width, height))] : [];
  }
  if (isConic(object)) return conicSegments(object, view, width, height).map(item => segment(item.first, item.second));
  if (object.type === 'circle' || arcTypes.has(object.type)) {
    const start = object.type === 'circle' ? 0 : Math.atan2(object.arcStart.y - object.first.y, object.arcStart.x - object.first.x);
    const sweep = object.type === 'circle' ? Math.PI * 2 : object.sweep;
    const count = Math.max(24, Math.min(4096, Math.ceil(Math.abs(sweep) * Math.sqrt(Math.max(1, object.radius * view.scale)) * 2)));
    const at = angle => point(object.first.x + Math.cos(angle) * object.radius, object.first.y + Math.sin(angle) * object.radius);
    const result = [];
    for (let index = 0; index < count; index++) result.push(segment(at(start + sweep * index / count), at(start + sweep * (index + 1) / count)));
    if (object.type === 'sector' || object.type === 'circumSector') result.push(segment(object.first, object.arcStart), segment(object.first, object.arcEnd));
    return result;
  }
  if (isPlot(object)) {
    const result = [], plot = object.plot;
    if (plot?.segments) {
      for (let index = 0; index < plot.segments.length; index += 4) result.push(segment(point(plot.segments[index], plot.segments[index + 1]), point(plot.segments[index + 2], plot.segments[index + 3])));
    } else {
      // Implicit plots are unordered point clouds: never connect unrelated
      // branches (in particular across an asymptote). Overlapping disks follow
      // their actual sampled boundary, including disjoint components.
      const occupied = new Set(), spacing = Math.max(1.2, object.plotOptions?.pointSpacing ?? plot?.options?.pointSpacing ?? 1.5) / view.scale;
      const points = plot?.points || [];
      for (let index = 0; index < points.length; index += 2) {
        const x = points[index], y = points[index + 1];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const key = `${Math.floor((x - view.x) / spacing)}:${Math.floor((y - view.y) / spacing)}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        result.push({ x, y, radius: Math.max(thickness / 2, spacing * .9) });
      }
    }
    return result;
  }
  return [];
}

export function syncPhysicsBoundaries(world, objects, view, width, height) {
  const ids = new Set();
  const frame = physicsBoundaryFrame(world, objects, view, width, height);
  if (!frame) { world.retainBoundaries(ids); return; }
  ({ view, width, height } = frame);
  const grouped = new Map();
  for (const object of trimCadSources(objects).flatMap(cadPrimitives)) {
    if (object.hidden || object.invalid || isPhysicsObject(object) || object.type === 'region') continue;
    if (!isPoint(object) && !isLinear(object) && !isConic(object) && !isPlot(object) && object.type !== 'circle' && !arcTypes.has(object.type)) continue;
    if (!grouped.has(object.id)) grouped.set(object.id, []);
    grouped.get(object.id).push(object);
  }
  for (const [id, primitives] of grouped) {
    ids.add(id);
    const limited = primitives.some(object => isConic(object) || isLinear(object) && linearBounds(object).some(bound => !Number.isFinite(bound)));
    const key = JSON.stringify([limited ? frame : view.scale, primitives.map(({ plot, ...object }) => [object, plotId(plot), plot?.points.length, plot?.segments?.length])]);
    world.syncBoundary(id, key, () => primitives.flatMap(object => fixtures(object, view, width, height)), primitives[0]);
  }
  const id = '$viewportBottom';
  ids.add(id);
  const reference = world.boundaryFrame;
  const bottom = reference.view.y - reference.height / 2 / reference.view.scale;
  world.syncBoundary(id, `${view.x}:${bottom}:${width}:${view.scale}`, () => [{
    first: { x: view.x - width / view.scale / 2 - 100, y: bottom - .05 },
    second: { x: view.x + width / view.scale / 2 + 100, y: bottom - .05 }, thickness: .1,
  }]);
  world.retainBoundaries(ids);
}
