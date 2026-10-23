import { isPoint, isLinear, isInfiniteLine, arcTypes, linearDirection } from './geometry.js';
import { isConic } from './conics.js';
import { isPlot } from './plot/types.js';

export const transformTypes = new Set(['centralSymmetry', 'axialSymmetry', 'rotation']);
export const isTransform = object => !!object && transformTypes.has(object.type);
export const canTransform = object => !!object && !object.invalid && (isPoint(object) || isLinear(object) || object.type === 'circle' || arcTypes.has(object.type) || isConic(object) || isPlot(object));
export const identity = [1, 0, 0, 1, 0, 0];
export const transformPoint = (matrix, point) => ({ x: matrix[0] * point.x + matrix[2] * point.y + matrix[4], y: matrix[1] * point.x + matrix[3] * point.y + matrix[5] });
export const transformVector = (matrix, point) => ({ x: matrix[0] * point.x + matrix[2] * point.y, y: matrix[1] * point.x + matrix[3] * point.y });
export const composeTransform = (first, second = identity) => {
  const x = transformVector(first, { x: second[0], y: second[1] });
  const y = transformVector(first, { x: second[2], y: second[3] });
  const origin = transformPoint(first, { x: second[4], y: second[5] });
  return [x.x, x.y, y.x, y.y, origin.x, origin.y];
};

export function transformationMatrix(object, reference) {
  let a, b, c, d, x, y;
  if (object.type === 'axialSymmetry') {
    if (!isLinear(reference)) return null;
    const direction = linearDirection(reference);
    const norm = Math.hypot(direction.x, direction.y);
    if (!(norm > 0) || !Number.isFinite(norm)) return null;
    const u = direction.x / norm, v = direction.y / norm;
    a = 2 * u * u - 1; b = c = 2 * u * v; d = 2 * v * v - 1;
    ({ x, y } = reference.first);
  } else {
    if (!isPoint(reference)) return null;
    ({ x, y } = reference);
    const degrees = object.type === 'centralSymmetry' ? 180 : object.angle ?? 90;
    if (!Number.isFinite(degrees)) return null;
    const angle = (degrees % 360) * Math.PI / 180;
    a = d = Math.cos(angle); b = Math.sin(angle); c = -b;
    // Keep quarter turns exact, including zero and negative angles.
    if (degrees % 90 === 0) { a = d = Math.round(a); b = Math.round(b); c = -b; }
  }
  const matrix = [a, b, c, d, x - a * x - c * y, y - b * x - d * y];
  return matrix.every(Number.isFinite) ? matrix : null;
}

export function resolveTransform(object, parents) {
  const [source, reference] = parents;
  if (!canTransform(source) || reference?.invalid) return null;
  const matrix = transformationMatrix(object, reference);
  if (!matrix) return null;
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  const point = value => ({ ...value, ...transformPoint(matrix, value) });
  const result = { ...source, ...object, type: source.type, transformNode: object.type, colorType: source.colorType || source.type };
  // Runtime geometry is derived; only the node and parent IDs are serialized.
  for (const key of ['bindings', 'plot', 'region', 'draft', 'mathInput', 'latex', 'xLatex', 'yLatex', 'trim', 'trims', 'construction']) delete result[key];
  for (const field of ['surfaceFriction', 'surfaceRestitution']) if (source[field]) result[field] = source[field].map(patch => ({ ...patch, center: transformPoint(matrix, patch.center), normal: transformVector(matrix, patch.normal) }));
  if (isPoint(source)) {
    result.type = 'point'; Object.assign(result, transformPoint(matrix, source));
  } else if (isLinear(source)) {
    result.type = isInfiniteLine(source) ? 'line' : source.type === 'ray' ? 'ray' : 'segment';
    result.first = point(source.first); result.second = point(source.second);
    result.direction = transformVector(matrix, linearDirection(source));
  } else if (isConic(source)) {
    result.origin = point(source.origin); result.axis = transformVector(matrix, source.axis);
    result.coefficients = source.coefficients.map((value, index) => index === 1 || index === 4 ? value * determinant : value);
  } else if (isPlot(source)) {
    result.plotTransform = composeTransform(matrix, source.plotTransform);
  } else {
    result.first = point(source.first);
    if (source.second) result.second = point(source.second);
    if (arcTypes.has(source.type)) {
      result.type = source.type === 'fillet' || source.type === 'arcConnection' ? 'arc' : source.type;
      result.arcStart = point(source.arcStart); result.sweep = source.sweep * determinant;
      if (source.arcEnd) result.arcEnd = point(source.arcEnd);
    }
  }
  return result;
}

// Resolve only geometric type information for JSON parent validation. A node
// may reference a later definition, another transform, or form an invalid cycle.
export function transformedDefinition(object, byId, active = new Set()) {
  if (!isTransform(object)) return object;
  if (active.has(object.id)) return null;
  active.add(object.id);
  const source = transformedDefinition(byId.get(object.parents?.[0]), byId, active);
  active.delete(object.id);
  if (!source) return null;
  const type = isPoint(source) ? 'point' : isLinear(source) ? isInfiniteLine(source) ? 'line' : source.type === 'ray' ? 'ray' : 'segment' : ['fillet', 'arcConnection'].includes(source.type) ? 'arc' : source.type;
  return { ...object, type };
}
