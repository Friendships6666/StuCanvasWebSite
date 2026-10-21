import { add, hull, interval, multiply, nextDown, nextUp, power, subtract, unary } from './plot/interval.js';

export const conicTypes = new Set(['ellipse', 'parabola', 'hyperbola']);
export const isConic = object => !!object && conicTypes.has(object.type);
export const isPolarCurve = object => isConic(object) || object?.type === 'circle';
const period = 2 * Math.PI;
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const average = (first, second) => Math.sign(first) === Math.sign(second) ? first + (second - first) / 2 : (first + second) / 2;
const middle = (first, second) => ({ x: average(first.x, second.x), y: average(first.y, second.y) });
const dot = (first, second) => first.x * second.x + first.y * second.y;
const delta = (first, second) => ({ x: first.x - second.x, y: first.y - second.y });
const magnitude = point => Math.hypot(point.x, point.y);
const directionOf = line => line.direction || delta(line.second, line.first);
const screenPoint = (point, view, width, height) => ({ x: (point.x - view.x) * view.scale + width / 2, y: (view.y - point.y) * view.scale + height / 2 });

export function conicLocal(curve, point) {
  const offset = delta(point, curve.origin);
  return { x: dot(offset, curve.axis) / curve.scale, y: (-offset.x * curve.axis.y + offset.y * curve.axis.x) / curve.scale };
}

export function conicWorld(curve, point) {
  return { x: curve.origin.x + curve.scale * (point.x * curve.axis.x - point.y * curve.axis.y), y: curve.origin.y + curve.scale * (point.x * curve.axis.y + point.y * curve.axis.x) };
}

export function asConic(object) {
  if (isConic(object)) return object;
  if (object?.type !== 'circle' || !(object.radius > 0)) return null;
  return { ...object, type: 'ellipse', origin: object.first, axis: { x: 1, y: 0 }, scale: object.radius, a: object.radius, b: object.radius, coefficients: [1, 0, 1, 0, 0, -1] };
}

export function createConic(type, parents) {
  if (parents.some(parent => !parent)) return null;
  if (type === 'parabola') {
    const [focus, directrix] = parents;
    if (!finitePoint(focus) || !directrix?.first || !directrix?.second) return null;
    const direction = directionOf(directrix);
    const length = magnitude(direction);
    if (!(length > 0)) return null;
    const normal = { x: -direction.y / length, y: direction.x / length };
    const separation = dot(delta(focus, directrix.first), normal);
    if (!separation || !Number.isFinite(separation)) return null;
    const foot = { x: focus.x - normal.x * separation, y: focus.y - normal.y * separation };
    const scale = Math.abs(separation) / 2;
    if (!(scale > 0)) return null;
    return { type, origin: middle(focus, foot), axis: { x: normal.x * Math.sign(separation), y: normal.y * Math.sign(separation) }, scale, p: scale, coefficients: [0, 0, 1, -2, 0, 0] };
  }
  const [first, second, through] = parents;
  if (![first, second, through].every(finitePoint)) return null;
  const focusDelta = delta(second, first);
  const separation = magnitude(focusDelta);
  const firstDistance = magnitude(delta(through, first));
  const secondDistance = magnitude(delta(through, second));
  const focal = separation / 2;
  const major = type === 'ellipse' ? average(firstDistance, secondDistance) : Math.abs(firstDistance - secondDistance) / 2;
  const minor = type === 'ellipse' ? Math.sqrt(major - focal) * Math.sqrt(major + focal) : Math.sqrt(focal - major) * Math.sqrt(focal + major);
  if (!(major > 0) || !(minor > 0) || ![major, minor].every(Number.isFinite)) return null;
  const ratio = minor / major;
  const normalization = Math.max(1, ratio);
  const coefficient = (ratio / normalization) ** 2;
  return { type, origin: middle(first, second), axis: separation ? { x: focusDelta.x / separation, y: focusDelta.y / separation } : { x: 1, y: 0 }, scale: major, a: major, b: minor, coefficients: [coefficient, 0, (type === 'ellipse' ? 1 : -1) / normalization ** 2, 0, 0, -coefficient] };
}

function evaluateLocal(curve, point) {
  const [squareX, mixed, squareY, linearX, linearY, constant] = curve.coefficients;
  return squareX * point.x ** 2 + 2 * mixed * point.x * point.y + squareY * point.y ** 2 + 2 * linearX * point.x + 2 * linearY * point.y + constant;
}

export function conicResidual(curve, point) {
  const local = conicLocal(curve, point);
  const [squareX, mixed, squareY, linearX, linearY] = curve.coefficients;
  const gradient = Math.hypot(2 * (squareX * local.x + mixed * local.y + linearX), 2 * (mixed * local.x + squareY * local.y + linearY));
  return Math.abs(evaluateLocal(curve, local)) / Math.max(gradient, Number.MIN_VALUE) * curve.scale;
}

export function polarLine(point, object) {
  const curve = asConic(object);
  if (!curve || !finitePoint(point)) return null;
  const local = conicLocal(curve, point);
  const [squareX, mixed, squareY, linearX, linearY, constant] = curve.coefficients;
  const normal = { x: squareX * local.x + mixed * local.y + linearX, y: mixed * local.x + squareY * local.y + linearY };
  const offset = linearX * local.x + linearY * local.y + constant;
  const norm = magnitude(normal);
  if (!(norm > 0) || !Number.isFinite(norm)) return null;
  const foot = { x: -(offset / norm) * (normal.x / norm), y: -(offset / norm) * (normal.y / norm) };
  const first = conicWorld(curve, foot);
  const direction = { x: curve.scale * (-normal.y / norm * curve.axis.x - normal.x / norm * curve.axis.y), y: curve.scale * (-normal.y / norm * curve.axis.y + normal.x / norm * curve.axis.x) };
  const second = { x: first.x + direction.x, y: first.y + direction.y };
  return finitePoint(first) && finitePoint(second) ? { first, second, direction, radius: curve.scale } : null;
}

export function polePoint(line, object) {
  const curve = asConic(object);
  if (!curve || !line?.first || !line?.second) return null;
  const direction = directionOf(line);
  const length = magnitude(direction);
  if (!(length > 0)) return null;
  const normal = { x: -direction.y / length, y: direction.x / length };
  const localNormal = { x: dot(normal, curve.axis), y: -normal.x * curve.axis.y + normal.y * curve.axis.x };
  const offset = dot(normal, delta(curve.origin, line.first)) / curve.scale;
  const [squareX, mixed, squareY, linearX, linearY, constant] = curve.coefficients;
  const matrix = [[squareX, mixed, linearX, localNormal.x], [mixed, squareY, linearY, localNormal.y], [linearX, linearY, constant, offset]];
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let row = column + 1; row < 3; row++) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    const divisor = matrix[column][column];
    if (!divisor || !Number.isFinite(divisor)) return null;
    for (let entry = column; entry < 4; entry++) matrix[column][entry] /= divisor;
    for (let row = 0; row < 3; row++) if (row !== column) {
      const factor = matrix[row][column];
      for (let entry = column; entry < 4; entry++) matrix[row][entry] -= factor * matrix[column][entry];
    }
  }
  const weight = matrix[2][3];
  if (!weight) return null;
  const point = conicWorld(curve, { x: matrix[0][3] / weight, y: matrix[1][3] / weight });
  return finitePoint(point) ? point : null;
}

const polyAdd = (first, second, factor = 1) => Array.from({ length: Math.max(first.length, second.length) }, (_, index) => (first[index] || 0) + factor * (second[index] || 0));
function polyMultiply(first, second) {
  const result = new Array(first.length + second.length - 1).fill(0);
  first.forEach((value, firstIndex) => second.forEach((other, secondIndex) => { result[firstIndex + secondIndex] += value * other; }));
  return result;
}
const polyScale = (polynomial, factor) => polynomial.map(value => value * factor);
const polyDerivative = polynomial => polynomial.slice(1).map((value, index) => value * (index + 1));
const polyValue = (polynomial, parameter) => polynomial.reduceRight((value, coefficient) => value * parameter + coefficient, 0);

function realRoots(coefficients) {
  const size = Math.max(...coefficients.map(Math.abs));
  if (!size || !Number.isFinite(size)) return [];
  const polynomial = coefficients.map(value => value / size);
  while (polynomial.length > 1 && polynomial.at(-1) === 0) polynomial.pop();
  if (polynomial.length === 1) return [];
  if (polynomial.length === 2) return [-polynomial[0] / polynomial[1]].filter(Number.isFinite);
  const bound = 1 + Math.max(...polynomial.slice(0, -1).map(value => Math.abs(value / polynomial.at(-1))));
  const critical = realRoots(polyDerivative(polynomial)).filter(value => value > -bound && value < bound);
  const cuts = [-bound, ...critical, bound];
  const roots = [];
  const add = value => { if (!roots.some(root => Math.abs(root - value) <= 128 * Number.EPSILON * Math.max(1, Math.abs(root), Math.abs(value)))) roots.push(value); };
  for (const parameter of cuts) {
    const rounding = polyValue(polynomial.map(Math.abs), Math.abs(parameter)) * Number.EPSILON * 64;
    if (Math.abs(polyValue(polynomial, parameter)) <= rounding) add(parameter);
  }
  for (let index = 1; index < cuts.length; index++) {
    let lower = cuts[index - 1];
    let upper = cuts[index];
    let lowerValue = polyValue(polynomial, lower);
    const upperValue = polyValue(polynomial, upper);
    if (!lowerValue || !upperValue || (lowerValue < 0) === (upperValue < 0)) continue;
    for (let iteration = 0; iteration < 1100; iteration++) {
      const center = average(lower, upper);
      if (center === lower || center === upper) break;
      const value = polyValue(polynomial, center);
      if (!value) { lower = upper = center; break; }
      if ((value < 0) === (lowerValue < 0)) { lower = center; lowerValue = value; }
      else upper = center;
    }
    add(average(lower, upper));
  }
  return roots.sort((first, second) => first - second);
}

function rationalCurve(curve) {
  if (curve.type === 'parabola') return { horizontal: [0, 0, 0.25], vertical: [0, 1], weight: [1] };
  const ratio = curve.b / curve.scale;
  return { horizontal: [1, 0, curve.type === 'ellipse' ? -1 : 1], vertical: [0, 2 * ratio], weight: [1, 0, curve.type === 'ellipse' ? 1 : -1] };
}

function rationalPoint(curve, parameter) {
  const rational = rationalCurve(curve);
  const weight = polyValue(rational.weight, parameter);
  if (!weight) return null;
  return conicWorld(curve, { x: polyValue(rational.horizontal, parameter) / weight, y: polyValue(rational.vertical, parameter) / weight });
}

export function conicParameter(curve, point) {
  const local = conicLocal(curve, point);
  if (curve.type === 'parabola') return local.y;
  if (curve.type === 'hyperbola') return { value: Math.asinh(local.y * curve.scale / curve.b), branch: Math.sign(local.x) || 1 };
  return (Math.atan2(local.y * curve.scale / curve.b, local.x) + period) % period;
}

export function conicPoint(curve, parameter) {
  const value = typeof parameter === 'object' ? parameter.value : parameter;
  let local;
  let derivative;
  if (curve.type === 'parabola') {
    local = { x: value * value / 4, y: value };
    derivative = { x: value / 2, y: 1 };
  } else if (curve.type === 'hyperbola') {
    const branch = parameter?.branch || 1;
    local = { x: branch * Math.cosh(value), y: curve.b / curve.scale * Math.sinh(value) };
    derivative = { x: branch * Math.sinh(value), y: curve.b / curve.scale * Math.cosh(value) };
  } else {
    local = { x: Math.cos(value), y: curve.b / curve.scale * Math.sin(value) };
    derivative = { x: -Math.sin(value), y: curve.b / curve.scale * Math.cos(value) };
  }
  const position = conicWorld(curve, local);
  if (!finitePoint(position)) return null;
  return { ...position, dx: curve.scale * (derivative.x * curve.axis.x - derivative.y * curve.axis.y), dy: curve.scale * (derivative.x * curve.axis.y + derivative.y * curve.axis.x) };
}

export function projectConic(point, curve) {
  const local = conicLocal(curve, point);
  const { horizontal, vertical, weight } = rationalCurve(curve);
  const horizontalOffset = polyAdd(horizontal, polyScale(weight, -local.x));
  const verticalOffset = polyAdd(vertical, polyScale(weight, -local.y));
  const horizontalDerivative = polyAdd(polyMultiply(polyDerivative(horizontal), weight), polyMultiply(horizontal, polyDerivative(weight)), -1);
  const verticalDerivative = polyAdd(polyMultiply(polyDerivative(vertical), weight), polyMultiply(vertical, polyDerivative(weight)), -1);
  const stationary = polyAdd(polyMultiply(horizontalOffset, horizontalDerivative), polyMultiply(verticalOffset, verticalDerivative));
  const candidates = realRoots(stationary).map(parameter => rationalPoint(curve, parameter)).filter(finitePoint);
  if (curve.type !== 'parabola') candidates.push(conicWorld(curve, { x: -1, y: 0 }), conicWorld(curve, { x: 1, y: 0 }));
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const separation = magnitude(delta(candidate, point));
    if (separation < bestDistance) { best = candidate; bestDistance = separation; }
  }
  return best ? { x: best.x, y: best.y, parameter: conicParameter(curve, best) } : null;
}

export function lineConicIntersections(line, curve) {
  const direction = directionOf(line);
  const length = magnitude(direction);
  if (!(length > 0)) return [];
  const local = conicLocal(curve, line.first);
  const tangent = { x: dot(direction, curve.axis) / length, y: (-direction.x * curve.axis.y + direction.y * curve.axis.x) / length };
  if (Math.abs(tangent.x) < Number.EPSILON * 8) tangent.x = 0;
  if (Math.abs(tangent.y) < Number.EPSILON * 8) tangent.y = 0;
  const [squareX, mixed, squareY, linearX, linearY] = curve.coefficients;
  const quadratic = squareX * tangent.x ** 2 + 2 * mixed * tangent.x * tangent.y + squareY * tangent.y ** 2;
  const linear = 2 * ((squareX * local.x + mixed * local.y + linearX) * tangent.x + (mixed * local.x + squareY * local.y + linearY) * tangent.y);
  const constant = evaluateLocal(curve, local);
  let parameters;
  if (quadratic === 0) parameters = linear ? [-constant / linear] : [];
  else {
    const discriminant = linear ** 2 - 4 * quadratic * constant;
    const rounding = Number.EPSILON * 64 * (linear ** 2 + Math.abs(4 * quadratic * constant));
    if (discriminant < -rounding) return [];
    const root = Math.sqrt(discriminant <= rounding ? 0 : discriminant);
    const stable = -0.5 * (linear + (linear < 0 ? -root : root));
    parameters = !root ? [-linear / (2 * quadratic)] : [stable / quadratic, constant / stable];
  }
  return parameters.filter(parameter => {
    const fraction = parameter * (curve.scale / length);
    return Number.isFinite(parameter) && (line.type !== 'segment' && line.type !== 'ray' || fraction >= -1e-9 && (line.type === 'ray' || fraction <= 1 + 1e-9));
  }).map(parameter => conicWorld(curve, { x: local.x + parameter * tangent.x, y: local.y + parameter * tangent.y })).filter(finitePoint);
}

export function conicIntersections(first, second) {
  const firstCurve = asConic(first);
  const secondCurve = asConic(second);
  if (!firstCurve) return secondCurve ? lineConicIntersections(first, secondCurve) : [];
  if (!secondCurve) return lineConicIntersections(second, firstCurve);
  const { horizontal, vertical, weight } = rationalCurve(firstCurve);
  const origin = conicLocal(secondCurve, firstCurve.origin);
  const cosine = dot(firstCurve.axis, secondCurve.axis) * firstCurve.scale / secondCurve.scale;
  const sine = (firstCurve.axis.y * secondCurve.axis.x - firstCurve.axis.x * secondCurve.axis.y) * firstCurve.scale / secondCurve.scale;
  const transformedX = polyAdd(polyAdd(polyScale(horizontal, cosine), polyScale(vertical, -sine)), polyScale(weight, origin.x));
  const transformedY = polyAdd(polyAdd(polyScale(horizontal, sine), polyScale(vertical, cosine)), polyScale(weight, origin.y));
  const [squareX, mixed, squareY, linearX, linearY, constant] = secondCurve.coefficients;
  const polynomial = [
    polyScale(polyMultiply(transformedX, transformedX), squareX),
    polyScale(polyMultiply(transformedX, transformedY), 2 * mixed),
    polyScale(polyMultiply(transformedY, transformedY), squareY),
    polyScale(polyMultiply(transformedX, weight), 2 * linearX),
    polyScale(polyMultiply(transformedY, weight), 2 * linearY),
    polyScale(polyMultiply(weight, weight), constant),
  ].reduce((sum, term) => polyAdd(sum, term), [0]);
  if (polynomial.every(value => Math.abs(value) < Number.EPSILON * 8)) return [];
  const candidates = realRoots(polynomial).map(parameter => rationalPoint(firstCurve, parameter));
  if (firstCurve.type !== 'parabola') candidates.push(conicWorld(firstCurve, { x: -1, y: 0 }));
  const result = [];
  for (const point of candidates) {
    if (!finitePoint(point)) continue;
    const tolerance = 512 * Number.EPSILON * Math.max(firstCurve.scale, secondCurve.scale, Math.abs(point.x), Math.abs(point.y));
    if (conicResidual(secondCurve, point) > tolerance || result.some(other => magnitude(delta(other, point)) <= tolerance)) continue;
    result.push(point);
  }
  return result;
}

export function conicTangents(point, curve) {
  const polar = polarLine(point, curve);
  if (!polar) return [];
  return lineConicIntersections(polar, curve).map(contact => {
    const tangent = polarLine(contact, curve);
    return tangent ? { ...tangent, first: point, second: { x: point.x + tangent.direction.x, y: point.y + tangent.direction.y } } : null;
  }).filter(Boolean);
}

export function conicRanges(curve, view, width, height, margin = 24) {
  const halfWidth = (width / 2 + margin) / view.scale;
  const halfHeight = (height / 2 + margin) / view.scale;
  const corners = [{ x: view.x - halfWidth, y: view.y - halfHeight }, { x: view.x + halfWidth, y: view.y - halfHeight }, { x: view.x + halfWidth, y: view.y + halfHeight }, { x: view.x - halfWidth, y: view.y + halfHeight }];
  const locals = corners.map(point => conicLocal(curve, point));
  const verticalMin = Math.min(...locals.map(point => point.y));
  const verticalMax = Math.max(...locals.map(point => point.y));
  const crossings = corners.flatMap((first, index) => lineConicIntersections({ type: 'segment', first, second: corners[(index + 1) % 4] }, curve));
  const ranges = [];
  for (const branch of curve.type === 'hyperbola' ? [1, -1] : [1]) {
    const limits = curve.type === 'ellipse' ? [0, period] : curve.type === 'parabola' ? [verticalMin, verticalMax] : [Math.asinh(verticalMin * curve.scale / curve.b), Math.asinh(verticalMax * curve.scale / curve.b)];
    const cuts = [...limits];
    if (curve.type === 'ellipse') cuts.push(Math.PI / 2, Math.PI, 1.5 * Math.PI);
    else if (limits[0] < 0 && limits[1] > 0) cuts.push(0);
    for (const point of crossings) {
      const parameter = conicParameter(curve, point);
      if (typeof parameter === 'object' && parameter.branch !== branch) continue;
      const value = typeof parameter === 'object' ? parameter.value : parameter;
      if (value > limits[0] && value < limits[1]) cuts.push(value);
    }
    cuts.sort((first, second) => first - second);
    for (let index = 1; index < cuts.length; index++) {
      const lower = cuts[index - 1];
      const upper = cuts[index];
      if (!(upper > lower) || !Number.isFinite(upper - lower)) continue;
      const pointAt = parameter => conicPoint(curve, curve.type === 'hyperbola' ? { value: parameter, branch } : parameter);
      const center = pointAt(average(lower, upper));
      if (!center) continue;
      const screen = screenPoint(center, view, width, height);
      if (screen.x < -margin - 1 || screen.x > width + margin + 1 || screen.y < -margin - 1 || screen.y > height + margin + 1) continue;
      const at = fraction => {
        const point = pointAt(lower + fraction * (upper - lower));
        return point && { ...point, dx: point.dx * (upper - lower), dy: point.dy * (upper - lower) };
      };
      const start = at(0);
      const finish = at(1);
      if (!start || !finish) continue;
      const length = (magnitude(delta(start, center)) + magnitude(delta(center, finish))) * view.scale;
      const bounds = (first, second) => {
        const parameter = interval(nextDown(lower + first * (upper - lower)), nextUp(lower + second * (upper - lower)));
        const scaled = (range, factor) => multiply(range, interval(factor));
        let horizontal;
        let vertical;
        if (curve.type === 'ellipse') {
          horizontal = scaled(unary('cos', parameter), curve.scale);
          vertical = scaled(unary('sin', parameter), curve.b);
        } else if (curve.type === 'hyperbola') {
          horizontal = scaled(unary('cosh', parameter), branch * curve.scale);
          vertical = scaled(unary('sinh', parameter), curve.b);
        } else {
          horizontal = scaled(power(parameter, 2), curve.scale / 4);
          vertical = scaled(parameter, curve.scale);
        }
        const x = add(interval(curve.origin.x), subtract(scaled(horizontal, curve.axis.x), scaled(vertical, curve.axis.y)));
        const y = add(interval(curve.origin.y), add(scaled(horizontal, curve.axis.y), scaled(vertical, curve.axis.x)));
        return [...hull(x), ...hull(y)];
      };
      ranges.push({ at, length, bounds });
    }
  }
  return ranges;
}

const segmentCache = new WeakMap();
export function conicSegments(curve, view, width, height, tolerance = .18) {
  const key = `${view.x}:${view.y}:${view.scale}:${width}:${height}:${tolerance}`;
  const cached = segmentCache.get(curve);
  if (cached?.key === key) return cached.segments;
  const segments = [];
  for (const range of conicRanges(curve, view, width, height)) {
    const stack = [[0, 1, range.at(0), range.at(1)]];
    while (stack.length) {
      const [lower, upper, first, second] = stack.pop();
      const center = average(lower, upper);
      const through = range.at(center);
      if (!through) continue;
      const start = screenPoint(first, view, width, height);
      const finish = screenPoint(second, view, width, height);
      const sample = screenPoint(through, view, width, height);
      const chord = magnitude(delta(finish, start));
      const error = chord ? Math.abs((sample.x - start.x) * (finish.y - start.y) - (sample.y - start.y) * (finish.x - start.x)) / chord : magnitude(delta(sample, start));
      if ((error > tolerance || chord > 32) && center !== lower && center !== upper) {
        stack.push([center, upper, through, second], [lower, center, first, through]);
      } else if ([start.x, start.y, finish.x, finish.y].every(Number.isFinite)) segments.push({ first, second, start, finish });
    }
  }
  segmentCache.set(curve, { key, segments });
  return segments;
}
