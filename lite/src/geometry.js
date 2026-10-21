import { isFlexible, resolveRope } from './rope.js';
import { IntersectionTracker, intersectionContext, intersectionKey } from './intersection-tracker.js';
import { compileEquation } from './plot/formula.js';
import { compileParametric } from './plot/parametric-formula.js';
import { isPlot, plotSourceKey } from './plot/types.js';
import { conicIntersections, conicPoint, conicTangents, createConic, isConic, polarLine, polePoint, projectConic } from './conics.js';
import { isMeasurement, resolveMeasurement } from './measurements.js';
import { isCad, resolveCadCorner } from './cad.js';
import { formulaParameters, isJavaScript, variableRoot } from './reflection.js';

export const EPSILON = 1e-9;
export const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
export const isPoint = object => !!object && ['point', 'snapPoint', 'intersection', 'midpoint', 'ratioPoint', 'pole'].includes(object.type);
export const derivedLineTypes = new Set(['parallel', 'perpendicular', 'tangent']);
export const bisectorTypes = new Set(['innerBisector', 'outerBisector']);
export const linearTypes = new Set(['line', 'segment', 'chamfer', 'ray', 'polar', 'perpendicularBisector', ...derivedLineTypes, ...bisectorTypes]);
export const isLinear = object => !!object && linearTypes.has(object.type);
export const isInfiniteLine = object => object.type === 'line' || object.type === 'polar' || object.type === 'perpendicularBisector' || derivedLineTypes.has(object.type) || bisectorTypes.has(object.type);
const middle = (first, second) => Math.sign(first) === Math.sign(second) ? first + (second - first) / 2 : (first + second) / 2;
export const midpoint = (first, second) => ({ x: middle(first.x, second.x), y: middle(first.y, second.y) });
export const validDivisionRatio = ratio => Array.isArray(ratio) && ratio.length === 2 && ratio.every(value => Number.isFinite(value) && value > 0);
export function ratioPoint(parents, ratio) {
  const endpoints = parents.length === 1 && parents[0]?.type === 'segment' ? [parents[0].first, parents[0].second] : parents;
  if (endpoints.length !== 2 || !endpoints.every(isPoint) || !validDivisionRatio(ratio)) return null;
  const [first, second] = endpoints;
  if (![first.x, first.y, second.x, second.y].every(Number.isFinite)) return null;
  // Normalize before adding weights, and avoid subtracting opposite huge coordinates.
  const scale = Math.max(...ratio);
  const m = ratio[0] / scale;
  const n = ratio[1] / scale;
  const t = m / (m + n);
  const u = n / (m + n);
  const interpolate = (a, b) => Math.sign(a) === Math.sign(b)
    ? t <= 0.5 ? a + (b - a) * t : b + (a - b) * u
    : a * u + b * t;
  return { x: interpolate(first.x, second.x), y: interpolate(first.y, second.y) };
}
const cross = (first, second) => first.x * second.y - first.y * second.x;
const plotDependencyCache = new WeakMap();
const difference = (first, second) => ({ x: first.x - second.x, y: first.y - second.y });
export const linearDirection = object => object.direction || difference(object.second, object.first);
export const linearBounds = object => object.parameterRange || [isInfiniteLine(object) ? -Infinity : 0, isInfiniteLine(object) || object.type === 'ray' ? Infinity : 1];
const within = (object, parameter) => {
  const [lower, upper] = linearBounds(object);
  return parameter >= lower - EPSILON && parameter <= upper + EPSILON;
};
export const arcTypes = new Set(['semicircle', 'arc', 'circumArc', 'sector', 'circumSector', 'fillet', 'arcConnection']);
export const isTangentCurve = object => !!object && (isConic(object) || object.type === 'circle' || arcTypes.has(object.type) || object.type === 'equation');
const positiveAngle = angle => (angle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
const tangentEquationCache = new WeakMap();

function compileTangentEquation(object, parameters) {
  const key = JSON.stringify([object.source, parameters]);
  const cached = tangentEquationCache.get(object);
  if (cached?.key === key) return cached.compiled;
  let compiled = null;
  try { compiled = compileEquation(object.source, parameters); }
  catch {}
  tangentEquationCache.set(object, { key, compiled });
  return compiled;
}

function lineThrough(first, direction) {
  const radius = Math.hypot(direction.x, direction.y);
  if (!(radius > 0) || ![first.x, first.y, radius].every(Number.isFinite)) return null;
  return { first, second: { x: first.x + direction.x, y: first.y + direction.y }, direction, radius };
}

export function perpendicularBisector(parents) {
  const endpoints = parents.length === 1 && parents[0]?.type === 'segment'
    ? [parents[0].first, parents[0].second] : parents;
  if (endpoints.length !== 2 || !endpoints.every(isPoint)) return null;
  const [first, second] = endpoints;
  if (![first.x, first.y, second.x, second.y].every(Number.isFinite)) return null;
  let dx = second.x - first.x;
  let dy = second.y - first.y;
  // Halving both differences avoids overflow for opposite, very large coordinates.
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    dx = second.x / 2 - first.x / 2;
    dy = second.y / 2 - first.y / 2;
  }
  const scale = Math.max(Math.abs(dx), Math.abs(dy));
  if (!(scale > 0)) return null;
  return lineThrough(midpoint(first, second), { x: -dy / scale, y: dx / scale });
}

export function angleBisector(type, parents) {
  if (!bisectorTypes.has(type) || parents.some(parent => !parent)) return null;
  let vertex;
  let firstDirection;
  let secondDirection;
  if (parents.length === 3 && parents.every(isPoint)) {
    vertex = parents[1];
    firstDirection = difference(parents[0], vertex);
    secondDirection = difference(parents[2], vertex);
  } else if (parents.length === 2 && parents.every(isLinear)) {
    vertex = intersections({ ...parents[0], type: 'line' }, { ...parents[1], type: 'line' })[0];
    if (!vertex) return null;
    firstDirection = linearDirection(parents[0]);
    secondDirection = linearDirection(parents[1]);
  } else return null;
  const firstLength = Math.hypot(firstDirection.x, firstDirection.y);
  const secondLength = Math.hypot(secondDirection.x, secondDirection.y);
  if (!(firstLength > 0) || !(secondLength > 0) || ![firstLength, secondLength].every(Number.isFinite)) return null;
  const firstUnit = { x: firstDirection.x / firstLength, y: firstDirection.y / firstLength };
  const secondUnit = { x: secondDirection.x / secondLength, y: secondDirection.y / secondLength };
  const halfAngle = Math.atan2(cross(firstUnit, secondUnit), firstUnit.x * secondUnit.x + firstUnit.y * secondUnit.y) / 2;
  const cosine = Math.cos(halfAngle);
  const sine = Math.sin(halfAngle);
  const direction = { x: firstUnit.x * cosine - firstUnit.y * sine, y: firstUnit.x * sine + firstUnit.y * cosine };
  const extent = Math.min(firstLength, secondLength);
  const oriented = type === 'outerBisector' ? { x: -direction.y, y: direction.x } : direction;
  return lineThrough(vertex, { x: oriented.x * extent, y: oriented.y * extent });
}

export function derivedLines(type, point, reference, equation = null) {
  if (!point || !reference || !isPoint(point)) return [];
  if (type === 'parallel' || type === 'perpendicular') {
    if (!isLinear(reference)) return [];
    const direction = linearDirection(reference);
    const line = lineThrough(point, type === 'parallel' ? direction : { x: -direction.y, y: direction.x });
    return line ? [line] : [];
  }
  if (type !== 'tangent' || !isTangentCurve(reference)) return [];
  if (isConic(reference)) return conicTangents(point, reference);
  if (reference.type === 'equation') {
    if (!equation || reference.invalid) return [];
    const attached = point.type === 'snapPoint' && point.parents?.includes(reference.id);
    let position = { x: point.x, y: point.y };
    const tolerance = Math.max(1, Math.abs(point.x), Math.abs(point.y)) * Number.EPSILON * 64;
    for (let iteration = 0; iteration < 12; iteration++) {
      const [value, gradientX, gradientY] = equation.gradient(position.x, position.y);
      const norm = Math.hypot(gradientX, gradientY);
      if (![value, norm].every(Number.isFinite) || norm === 0) return [];
      const error = value / norm;
      if (Math.abs(error) <= tolerance) {
        const line = lineThrough(position, { x: -gradientY / norm, y: gradientX / norm });
        return line ? [line] : [];
      }
      if (!attached) return [];
      position = { x: position.x - error * (gradientX / norm), y: position.y - error * (gradientY / norm) };
    }
    return [];
  }
  const offset = difference(point, reference.first);
  const separation = Math.hypot(offset.x, offset.y);
  const tolerance = Number.EPSILON * 32 * Math.max(separation, reference.radius);
  if (!(separation > 0) || !(reference.radius > 0) || separation < reference.radius - tolerance) return [];
  const onCircle = Math.abs(separation - reference.radius) <= tolerance;
  const ratio = onCircle ? 1 : Math.min(1, reference.radius / separation);
  const height = Math.sqrt(Math.max(0, (1 - ratio) * (1 + ratio)));
  const radial = { x: offset.x / separation, y: offset.y / separation };
  return [1, -1].map((sign, branch) => {
    if (branch && onCircle) return null;
    const contact = {
      x: reference.first.x + reference.radius * (ratio * radial.x - sign * height * radial.y),
      y: reference.first.y + reference.radius * (ratio * radial.y + sign * height * radial.x),
    };
    if (arcTypes.has(reference.type) && !pointOnArc(contact, reference)) return null;
    return lineThrough(point, {
      x: (-height * radial.x - sign * ratio * radial.y) * separation,
      y: (-height * radial.y + sign * ratio * radial.x) * separation,
    });
  });
}

function circumcenter(first, second, third) {
  const denominator = 2 * (first.x * (second.y - third.y) + second.x * (third.y - first.y) + third.x * (first.y - second.y));
  if (Math.abs(denominator) < EPSILON) return null;
  const firstSquared = first.x ** 2 + first.y ** 2;
  const secondSquared = second.x ** 2 + second.y ** 2;
  const thirdSquared = third.x ** 2 + third.y ** 2;
  return {
    x: (firstSquared * (second.y - third.y) + secondSquared * (third.y - first.y) + thirdSquared * (first.y - second.y)) / denominator,
    y: (firstSquared * (third.x - second.x) + secondSquared * (first.x - third.x) + thirdSquared * (second.x - first.x)) / denominator,
  };
}

export function createCircularCurve(type, points, construction) {
  if (type === 'fillet' || type === 'arcConnection') return null;
  if (type !== 'circle' && !arcTypes.has(type)) return null;
  const required = type === 'circle' ? construction === 'three-point' || points.length === 3 ? 3 : 2 : type === 'semicircle' ? 2 : 3;
  if (points.length !== required || !points.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
  let curve;
  if (type === 'circle') {
    const center = required === 3 ? circumcenter(...points) : points[0];
    if (!center) return null;
    curve = { first: center, second: points[required === 3 ? 0 : 1], radius: distance(center, points[required === 3 ? 0 : 1]) };
  } else curve = arcFromPoints(type, points, construction);
  return curve && [curve.first.x, curve.first.y, curve.radius].every(Number.isFinite) && curve.radius > (type === 'circle' ? 0 : EPSILON) ? { type, ...curve } : null;
}

function arcFromPoints(type, points, construction) {
  if (type === 'semicircle') {
    const center = midpoint(points[0], points[1]);
    return { first: center, second: points[0], radius: distance(center, points[0]), arcStart: points[0], arcEnd: points[1], sweep: Math.PI };
  }
  if (construction === 'three-point' || type === 'circumArc' || type === 'circumSector') {
    const center = circumcenter(points[0], points[1], points[2]);
    if (!center) return null;
    const startAngle = Math.atan2(points[0].y - center.y, points[0].x - center.x);
    const endAngle = Math.atan2(points[2].y - center.y, points[2].x - center.x);
    const counterClockwise = positiveAngle(endAngle - startAngle);
    const through = positiveAngle(Math.atan2(points[1].y - center.y, points[1].x - center.x) - startAngle);
    const sweep = through <= counterClockwise ? counterClockwise : counterClockwise - 2 * Math.PI;
    return { first: center, second: points[0], radius: distance(center, points[0]), arcStart: points[0], arcEnd: points[2], sweep };
  }
  const center = points[0];
  const start = points[1];
  const end = points[2];
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const sweep = positiveAngle(Math.atan2(end.y - center.y, end.x - center.x) - startAngle);
  return { first: center, second: start, radius: distance(center, start), arcStart: start, arcEnd: end, sweep };
}

export function resolveObjects(objects, previous = new Map(), changed = null, intersectionTracker = new IntersectionTracker()) {
  const resolved = new Map();
  const byId = new Map(objects.map(object => [object.id, object]));
  const dependents = new Map(objects.map(object => [object.id, []]));
  const incoming = new Map(objects.map(object => [object.id, 0]));
  const intersectionGroups = new Map();
  const intersectionMatches = new Map();
  const tangentEquations = new Map();
  const parameters = formulaParameters(objects);
  const parameterIds = new Map(objects.filter(object => object.type === 'slider' || isJavaScript(object)).map(object => [object.name.toLowerCase(), object.id]));
  const parameterNamesKey = JSON.stringify(Object.keys(parameters));
  for (const object of objects) {
    if (object.type !== 'intersection') continue;
    const key = intersectionKey(object);
    if (!intersectionGroups.has(key)) intersectionGroups.set(key, []);
    intersectionGroups.get(key).push(object);
  }
  for (const object of objects) {
    const parents = [...(object.parents || [])];
    if (isPlot(object) && !object.invalid) {
      try {
        const key = JSON.stringify([plotSourceKey(object), parameterNamesKey]);
        let dependencies = plotDependencyCache.get(object);
        if (dependencies?.key !== key) {
          const compiled = object.type === 'parametric' ? compileParametric(object, parameters) : compileEquation(object.source, parameters);
          dependencies = { key, names: compiled.parameterNames };
          plotDependencyCache.set(object, dependencies);
        }
        for (const name of dependencies.names) {
          const parent = parameterIds.get(variableRoot(name));
          if (parent && !parents.includes(parent)) parents.push(parent);
        }
      } catch { /* Invalid formula edits keep their existing UI error. */ }
    }
    const reference = object.type === 'tangent' && byId.get(parents[1]);
    if (reference?.type === 'equation') {
      if (!tangentEquations.has(reference.id)) tangentEquations.set(reference.id, compileTangentEquation(reference, parameters));
      for (const name of tangentEquations.get(reference.id)?.parameterNames || []) {
        const parent = parameterIds.get(variableRoot(name));
        if (parent && !parents.includes(parent)) parents.push(parent);
      }
    }
    for (const reference of Object.values(object.bindings || {})) {
      const parent = parameterIds.get(variableRoot(reference));
      if (parent && !parents.includes(parent)) parents.push(parent);
    }
    for (const parent of parents) {
      if (!byId.has(parent)) continue;
      incoming.set(object.id, incoming.get(object.id) + 1);
      dependents.get(parent).push(object.id);
    }
  }
  const dirty = changed ? new Set(changed) : new Set(objects.map(object => object.id));
  const queue = objects.filter(object => incoming.get(object.id) === 0).map(object => object.id);
  let processed = 0;
  while (queue.length) {
    const id = queue.shift();
    const object = byId.get(id);
    if (!object) continue;
    processed++;
    const parents = object.parents || [];
    const mustResolve = dirty.has(id) || !previous.has(id);
    if (!mustResolve) resolved.set(id, previous.get(id));
    else if (object.type === 'point' || isPlot(object) || object.type === 'slider' || isJavaScript(object) || object.type === 'physicsBody' || object.type === 'liquid' || object.type === 'softBody') resolved.set(id, { ...object });
    else if (isMeasurement(object)) {
      const measurement = resolveMeasurement(object, parents.map(parent => resolved.get(parent)));
      const prior = previous.get(id);
      if (measurement?.type === 'areaMeasure' && Number.isFinite(prior?.value)) Object.assign(measurement, { value: prior.value, anchor: prior.anchor, approximate: prior.approximate });
      if (measurement) resolved.set(id, measurement);
    } else if (isFlexible(object)) {
      const rope = resolveRope(object, resolved); if (rope) resolved.set(id, rope);
    } else if (object.type === 'region') {
      if (parents.length && parents.every(parent => resolved.has(parent) && !resolved.get(parent).invalid)) resolved.set(id, { ...object });
    } else if (isCad(object)) {
      const corner = resolveCadCorner(object, parents.map(parent => resolved.get(parent)));
      if (corner) resolved.set(id, corner);
    } else if (object.type === 'ratioPoint') {
      const position = ratioPoint(parents.map(parent => resolved.get(parent)), object.ratio);
      if (position) resolved.set(id, { ...object, ...position });
    } else if (object.type === 'midpoint') {
      const parent = resolved.get(parents[0]);
      const first = parents.length === 1 && parent?.type === 'segment' ? parent.first : parent;
      const second = parents.length === 1 && parent?.type === 'segment' ? parent.second : resolved.get(parents[1]);
      if (first && second && isPoint(first) && isPoint(second) && [first.x, first.y, second.x, second.y].every(Number.isFinite)) {
        resolved.set(id, { ...object, ...midpoint(first, second) });
      }
    }
    else if (object.type === 'snapPoint') {
      const parent = resolved.get(parents[0]);
      const position = parent && pointAtObjectParameter(parent, object.parameter);
      if (position) resolved.set(id, { ...object, ...position });
      else if (isPlot(parent) && Number.isFinite(object.x) && Number.isFinite(object.y)) resolved.set(id, { ...object });
    }
    else if (object.type === 'intersection') {
      const first = resolved.get(parents[0]);
      const second = resolved.get(parents[1]);
      const key = intersectionKey(object);
      if (first && second && !isPlot(first) && !isPlot(second) && !intersectionMatches.has(key)) {
        const unambiguous = isLinear(first) && isLinear(second);
        intersectionMatches.set(key, intersectionTracker.match(intersectionGroups.get(key), intersections(first, second), { previous, unambiguous, context: intersectionContext(first, second) }));
      }
      const position = intersectionMatches.get(key)?.get(id);
      if (position) resolved.set(id, { ...object, ...position });
      else if (first && second && (isPlot(first) || isPlot(second)) && previous.has(id)) resolved.set(id, previous.get(id));
    } else if (isConic(object)) {
      const curve = createConic(object.type, parents.map(parent => resolved.get(parent)));
      if (curve) resolved.set(id, { ...object, ...curve });
    } else if (object.type === 'polar' || object.type === 'pole') {
      const first = resolved.get(parents[0]);
      const curve = resolved.get(parents[1]);
      const result = object.type === 'polar' ? polarLine(first, curve) : polePoint(first, curve);
      if (result) resolved.set(id, { ...object, ...result });
    } else if (object.type === 'perpendicularBisector') {
      const line = perpendicularBisector(parents.map(parent => resolved.get(parent)));
      if (line) resolved.set(id, { ...object, ...line });
    } else if (bisectorTypes.has(object.type)) {
      const line = angleBisector(object.type, parents.map(parent => resolved.get(parent)));
      if (line) resolved.set(id, { ...object, ...line });
    } else if (derivedLineTypes.has(object.type)) {
      const point = resolved.get(parents[0]);
      const reference = resolved.get(parents[1]);
      const line = derivedLines(object.type, point, reference, tangentEquations.get(reference?.id))[object.branch || 0];
      if (line) resolved.set(id, { ...object, ...line });
    } else if (object.type === 'circle' || arcTypes.has(object.type)) {
      const points = parents.map(parent => resolved.get(parent));
      const curve = createCircularCurve(object.type, points, object.construction);
      if (curve) resolved.set(id, { ...object, ...curve });
    } else {
      const first = resolved.get(parents[0]);
      const second = resolved.get(parents[1]);
      if (first && second && distance(first, second) !== 0) {
        const radius = distance(first, second);
        resolved.set(id, { ...object, first, second, radius });
      }
    }
    if (mustResolve) for (const dependent of dependents.get(id)) dirty.add(dependent);
    for (const dependent of dependents.get(id)) {
      incoming.set(dependent, incoming.get(dependent) - 1);
      if (incoming.get(dependent) === 0) queue.push(dependent);
    }
  }
  return resolved;
}

export function intersections(first, second) {
  const firstCurve = arcTypes.has(first.type);
  const secondCurve = arcTypes.has(second.type);
  const originalFirst = first;
  const originalSecond = second;
  if (firstCurve) first = { ...first, type: 'circle' };
  if (secondCurve) second = { ...second, type: 'circle' };
  if (isConic(first) || isConic(second)) {
    return conicIntersections(first, second).filter(point => (!firstCurve || pointOnArc(point, originalFirst)) && (!secondCurve || pointOnArc(point, originalSecond)));
  }
  const firstDirection = first.type !== 'circle' && linearDirection(first);
  const secondDirection = second.type !== 'circle' && linearDirection(second);
  const origin = first.first;
  const scale = Math.max(
    distance(first.first, second.first),
    first.type === 'circle' ? first.radius : Math.hypot(firstDirection.x, firstDirection.y),
    second.type === 'circle' ? second.radius : Math.hypot(secondDirection.x, secondDirection.y),
  );
  if (!Number.isFinite(scale) || scale === 0) return [];
  const normalizePoint = point => ({ x: (point.x - origin.x) / scale, y: (point.y - origin.y) / scale });
  const normalize = object => {
    if (object.type === 'circle') return { ...object, first: normalizePoint(object.first), radius: object.radius / scale };
    const direction = linearDirection(object);
    return { ...object, first: normalizePoint(object.first), second: normalizePoint(object.second), direction: { x: direction.x / scale, y: direction.y / scale } };
  };
  const points = intersectLocal(normalize(first), normalize(second)).map(point => ({ x: origin.x + point.x * scale, y: origin.y + point.y * scale }));
  return points.filter(point => (!firstCurve || pointOnArc(point, originalFirst)) && (!secondCurve || pointOnArc(point, originalSecond)));
}

function arcParameter(angle, start, sweep) {
  const relative = positiveAngle(sweep >= 0 ? angle - start : start - angle);
  // A rounded tangent at the start can wrap from zero to almost 2π.
  return (relative >= 2 * Math.PI - EPSILON ? 0 : relative) * (sweep >= 0 ? 1 : -1);
}

const withinArc = (parameter, sweep) => parameter >= Math.min(0, sweep) - EPSILON && parameter <= Math.max(0, sweep) + EPSILON;

function pointOnArc(position, object) {
  const angle = Math.atan2(position.y - object.first.y, position.x - object.first.x);
  const start = Math.atan2(object.arcStart.y - object.first.y, object.arcStart.x - object.first.x);
  return withinArc(arcParameter(angle, start, object.sweep), object.sweep);
}

export function pointAtObjectParameter(object, parameter = 0) {
  if (isPlot(object)) return null;
  if (!object) return null;
  if (isConic(object)) return conicPoint(object, parameter);
  if (object.type === 'circle' || arcTypes.has(object.type)) {
    const angle = arcTypes.has(object.type) ? Math.atan2(object.arcStart.y - object.first.y, object.arcStart.x - object.first.x) + parameter : parameter;
    if (arcTypes.has(object.type) && !withinArc(arcParameter(parameter, 0, object.sweep), object.sweep)) return null;
    return { x: object.first.x + Math.cos(angle) * object.radius, y: object.first.y + Math.sin(angle) * object.radius };
  }
  if (!isLinear(object) || !object.first || !object.second) return null;
  if (object.parameterRange && !within(object, parameter)) return null;
  const direction = linearDirection(object);
  return { x: object.first.x + direction.x * parameter, y: object.first.y + direction.y * parameter };
}

export function projectPointOnObject(position, object) {
  if (!object) return null;
  if (isConic(object)) return projectConic(position, object);
  if (object.type === 'circle' || arcTypes.has(object.type)) {
    let angle = Math.atan2(position.y - object.first.y, position.x - object.first.x);
    if (arcTypes.has(object.type)) {
      const start = Math.atan2(object.arcStart.y - object.first.y, object.arcStart.x - object.first.x);
      let relative = arcParameter(angle, start, object.sweep);
      const outside = !withinArc(relative, object.sweep);
      if (outside) relative = distance(position, object.arcStart) <= distance(position, object.arcEnd) ? 0 : object.sweep;
      angle = start + relative;
      return { parameter: relative, ...pointAtObjectParameter(object, relative) };
    }
    return { parameter: angle, ...pointAtObjectParameter(object, angle) };
  }
  if (!isLinear(object) || !object.first || !object.second) return null;
  const direction = linearDirection(object);
  const length = Math.hypot(direction.x, direction.y);
  if (!(length > 0)) return null;
  let parameter = (((position.x - object.first.x) * (direction.x / length) + (position.y - object.first.y) * (direction.y / length)) / length);
  const [lower, upper] = linearBounds(object);
  if (lower > upper) return null;
  parameter = Math.max(lower, Math.min(upper, parameter));
  return { parameter, ...pointAtObjectParameter(object, parameter) };
}

function intersectLocal(first, second) {
  if (first.type === 'circle' && second.type !== 'circle') return intersectLocal(second, first);
  if (first.type === 'circle' && second.type === 'circle') {
    const delta = difference(second.first, first.first);
    const separation = Math.hypot(delta.x, delta.y);
    if (separation < EPSILON || separation > first.radius + second.radius + EPSILON || separation < Math.abs(first.radius - second.radius) - EPSILON) return [];
    const along = (first.radius ** 2 - second.radius ** 2 + separation ** 2) / (2 * separation);
    const height = Math.sqrt(Math.max(0, first.radius ** 2 - along ** 2));
    const center = { x: first.first.x + along * delta.x / separation, y: first.first.y + along * delta.y / separation };
    const positions = [1, -1].map(sign => ({ x: center.x - sign * height * delta.y / separation, y: center.y + sign * height * delta.x / separation }));
    return height < EPSILON ? positions.slice(0, 1) : positions;
  }
  const direction = linearDirection(first);
  if (second.type === 'circle') {
    const offset = difference(first.first, second.first);
    const quadratic = direction.x ** 2 + direction.y ** 2;
    if (quadratic < EPSILON ** 2) return [];
    const linear = 2 * (offset.x * direction.x + offset.y * direction.y);
    const constant = offset.x ** 2 + offset.y ** 2 - second.radius ** 2;
    const discriminant = linear ** 2 - 4 * quadratic * constant;
    if (discriminant < -EPSILON) return [];
    const rounding = Number.EPSILON * 16 * (linear ** 2 + Math.abs(4 * quadratic * constant));
    const root = Math.sqrt(discriminant <= rounding ? 0 : discriminant);
    const parameters = root < EPSILON ? [-linear / (2 * quadratic)] : [(-linear - root) / (2 * quadratic), (-linear + root) / (2 * quadratic)];
    return parameters.filter(parameter => within(first, parameter)).map(parameter => ({ x: first.first.x + parameter * direction.x, y: first.first.y + parameter * direction.y }));
  }
  const otherDirection = linearDirection(second);
  const denominator = cross(direction, otherDirection);
  if (Math.abs(denominator) < EPSILON) return [];
  const offset = difference(second.first, first.first);
  const parameter = cross(offset, otherDirection) / denominator;
  const otherParameter = cross(offset, direction) / denominator;
  if (!within(first, parameter) || !within(second, otherParameter)) return [];
  return [{ x: first.first.x + parameter * direction.x, y: first.first.y + parameter * direction.y }];
}

export function distanceToObject(position, object) {
  if (isPoint(object)) return distance(position, object);
  if (isConic(object)) {
    const projection = projectConic(position, object);
    return projection ? distance(position, projection) : Infinity;
  }
  if (object.type === 'circle') return Math.abs(distance(position, object.first) - object.radius);
  if (arcTypes.has(object.type)) {
    const radial = Math.abs(distance(position, object.first) - object.radius);
    const angle = Math.atan2(position.y - object.first.y, position.x - object.first.x);
    const start = Math.atan2(object.arcStart.y - object.first.y, object.arcStart.x - object.first.x);
    if (withinArc(arcParameter(angle, start, object.sweep), object.sweep)) return radial;
    return Math.min(distance(position, object.arcStart), distance(position, object.arcEnd));
  }
  if (!isLinear(object)) return Infinity;
  const projection = projectPointOnObject(position, object);
  return projection ? distance(position, projection) : Infinity;
}
