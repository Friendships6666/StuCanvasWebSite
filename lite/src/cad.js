import { computeArcConnection } from './arc-connection.js';

export const cadTools = new Set(['fillet', 'chamfer', 'arcConnection']);
export const isCad = object => !!object && cadTools.has(object.type);
export const cornerSides = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
export const validCornerSides = sides => Array.isArray(sides) && sides.length === 2 && [1, -1].includes(sides[0]) && [1, -1].includes(sides[1]);
const cross = (a, b) => a.x * b.y - a.y * b.x;
const dot = (a, b) => a.x * b.x + a.y * b.y;
const finitePoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const direction = line => line?.direction || line?.first && line?.second && { x: line.second.x - line.first.x, y: line.second.y - line.first.y };
const unit = vector => {
  const length = vector && Math.hypot(vector.x, vector.y);
  return length > 0 && Number.isFinite(length) ? { x: vector.x / length, y: vector.y / length } : null;
};
const along = (point, vector, length) => ({ x: point.x + vector.x * length, y: point.y + vector.y * length });

export function lineCorner(parents) {
  if (!Array.isArray(parents) || parents.length !== 2 || parents.some(parent => !finitePoint(parent?.first) || !direction(parent))) return null;
  const firstUnit = unit(direction(parents[0]));
  const secondUnit = unit(direction(parents[1]));
  if (!firstUnit || !secondUnit) return null;
  const denominator = cross(firstUnit, secondUnit);
  if (Math.abs(denominator) <= Number.EPSILON * 32) return null;
  const offset = { x: parents[1].first.x - parents[0].first.x, y: parents[1].first.y - parents[0].first.y };
  const vertex = along(parents[0].first, firstUnit, cross(offset, secondUnit) / denominator);
  return finitePoint(vertex) ? { vertex, firstUnit, secondUnit } : null;
}

function onSource(point, line) {
  if (line.type !== 'segment' && line.type !== 'chamfer' && line.type !== 'ray') return true;
  const vector = direction(line);
  const length = Math.hypot(vector.x, vector.y);
  const parameter = ((point.x - line.first.x) * (vector.x / length) + (point.y - line.first.y) * (vector.y / length)) / length;
  const tolerance = Number.EPSILON * 64 * Math.max(1, Math.abs(parameter));
  return parameter >= -tolerance && (line.type === 'ray' || parameter <= 1 + tolerance);
}

export function computeCadCorner(parameters, parents) {
  if (parameters?.tool === 'arcConnection') return computeArcConnection(parameters, parents);
  if (!parameters || !cadTools.has(parameters.tool) || !validCornerSides(parameters.sides)) return null;
  const corner = lineCorner(parents);
  const size = parameters.tool === 'fillet' ? parameters.radius : parameters.size;
  if (!corner || !Number.isFinite(size) || size <= 0) return null;
  const { vertex } = corner;
  const firstUnit = { x: corner.firstUnit.x * parameters.sides[0], y: corner.firstUnit.y * parameters.sides[0] };
  const secondUnit = { x: corner.secondUnit.x * parameters.sides[1], y: corner.secondUnit.y * parameters.sides[1] };
  if (parameters.tool === 'chamfer') {
    const first = along(vertex, firstUnit, size);
    const second = along(vertex, secondUnit, size);
    const radius = Math.hypot(second.x - first.x, second.y - first.y);
    if (![first, second].every(finitePoint) || !onSource(first, parents[0]) || !onSource(second, parents[1]) || !(radius > 0)) return null;
    return { vertex, first, second, radius };
  }
  const sine = Math.abs(cross(firstUnit, secondUnit));
  const tangentDistance = size * (1 + dot(firstUnit, secondUnit)) / sine;
  const first = along(vertex, firstUnit, tangentDistance);
  const second = along(vertex, secondUnit, tangentDistance);
  const center = { x: vertex.x + (firstUnit.x + secondUnit.x) * (size / sine), y: vertex.y + (firstUnit.y + secondUnit.y) * (size / sine) };
  if (![first, second, center].every(finitePoint) || !onSource(first, parents[0]) || !onSource(second, parents[1])) return null;
  const start = { x: first.x - center.x, y: first.y - center.y };
  const end = { x: second.x - center.x, y: second.y - center.y };
  const sweep = Math.atan2(cross(start, end), dot(start, end));
  if (!Number.isFinite(sweep) || Math.abs(sweep) === 0) return null;
  return { vertex, first: center, second: first, radius: size, arcStart: first, arcEnd: second, sweep };
}

// CAD definitions retain their own identity and source-line dependencies.
export function resolveCadCorner(object, parents) {
  if (!isCad(object)) return null;
  const geometry = computeCadCorner({ ...object, tool: object.type }, parents);
  return geometry ? { ...object, ...geometry } : null;
}

// Rendering and selection consume existing arc/segment geometry. These are
// transient views of a resolved node, never additional document objects.
export function cadPrimitives(object) {
  if (object.type === 'fillet' || object.type === 'arcConnection') return [{ ...object, type: 'arc', colorType: object.colorType || object.type }];
  if (object.type === 'chamfer') return [{ ...object, type: 'segment', colorType: object.colorType || object.type }];
  return [object];
}

// Source definitions stay intact for the dependency graph. Their visible and
// pickable extents come from the CAD nodes, so deleting/undoing a node restores
// the source and moving it recomputes the cut without accumulating mutations.
export function trimCadSources(objects) {
  const byId = new Map(objects.map(object => [object.id, object]));
  const ranges = new Map();
  for (const object of objects) {
    if (!isCad(object) || object.type === 'arcConnection' || object.hidden || object.invalid || object.historical || object.trim === false || !object.parents) continue;
    const cuts = object.type === 'fillet' ? [object.arcStart, object.arcEnd] : [object.first, object.second];
    if (!cuts.every(finitePoint) || !validCornerSides(object.sides)) continue;
    object.parents.forEach((id, index) => {
      const source = byId.get(id);
      const vector = direction(source);
      const length = vector && Math.hypot(vector.x, vector.y);
      if (!finitePoint(source?.first) || !(length > 0)) return;
      const parameter = ((cuts[index].x - source.first.x) * (vector.x / length) + (cuts[index].y - source.first.y) * (vector.y / length)) / length;
      if (!Number.isFinite(parameter)) return;
      const finite = source.type === 'segment' || source.type === 'chamfer';
      const range = ranges.get(id) || [...(source.parameterRange || [finite || source.type === 'ray' ? 0 : -Infinity, finite ? 1 : Infinity])];
      if (object.sides[index] > 0) range[0] = Math.max(range[0], parameter);
      else range[1] = Math.min(range[1], parameter);
      ranges.set(id, range);
    });
  }
  return objects.map(object => ranges.has(object.id) ? { ...object, parameterRange: ranges.get(object.id) } : object);
}
