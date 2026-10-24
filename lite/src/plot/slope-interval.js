// Centered slope enclosures: f(z) = f(c) + sx(z,c)*(x-cx) + sy(z,c)*(y-cy).
// Every center value and slope is an outward-rounded interval. In particular,
// the quotient rule uses q(c), not independent numerator/denominator ranges:
//   sq = (su - q(c)*sv) / v(B).
// This retains first-order cancellation near removable singularities without
// changing the expression or assigning a value at a point outside its domain.
import * as ranges from './interval.js';

const zero = ranges.interval(0), one = ranges.interval(1), minusOne = ranges.interval(-1);
const point = value => ranges.interval(value);
const valid = value => value.continuous && ranges.bounded(value);
const scale = (value, factor) => ranges.isZero(value) || ranges.isZero(factor) ? zero : ranges.multiply(value, factor);
const productSum = (a, b, c, d) => ranges.add(scale(a, b), scale(c, d));

export function intersection(first, second) {
  if (first.poisoned || second.poisoned) return ranges.poisoned();
  const parts = [];
  for (const [a, b] of first.parts) for (const [c, d] of second.parts) {
    const lower = Math.max(a, c), upper = Math.min(b, d);
    if (lower <= upper) parts.push([lower, upper]);
  }
  return { parts, continuous: first.continuous && second.continuous };
}

function record(range, center, sx, sy, supported = true) {
  // Unsupported/discontinuous operations retain their ordinary enclosure.
  // A parent cannot safely recover a slope once a child lost this property.
  return { range, center, sx, sy, supported: supported && valid(range) && valid(center) && valid(sx) && valid(sy) };
}
export const interval = value => record(point(value), point(value), zero, zero);
export function variable(lower, upper, center, axis) {
  return record(ranges.interval(lower, upper), point(center), axis === 0 ? one : zero, axis === 1 ? one : zero);
}
const affine = (first, second, rangeOperation, slopeOperation = rangeOperation) => record(
  rangeOperation(first.range, second.range), rangeOperation(first.center, second.center),
  slopeOperation(first.sx, second.sx), slopeOperation(first.sy, second.sy), first.supported && second.supported);
export const add = (first, second) => affine(first, second, ranges.add);
export const subtract = (first, second) => affine(first, second, ranges.subtract);
export const negate = value => record(ranges.negate(value.range), ranges.negate(value.center), ranges.negate(value.sx), ranges.negate(value.sy), value.supported);

export function multiply(first, second) {
  // u*v - uc*vc = v(B)*(u-uc) + uc*(v-vc).
  return record(ranges.multiply(first.range, second.range), ranges.multiply(first.center, second.center),
    productSum(first.sx, second.range, first.center, second.sx),
    productSum(first.sy, second.range, first.center, second.sy), first.supported && second.supported);
}
export function divide(first, second) {
  const center = ranges.divide(first.center, second.center);
  const slope = axis => ranges.divide(ranges.subtract(first[axis], scale(center, second[axis])), second.range);
  return record(ranges.divide(first.range, second.range), center, slope('sx'), slope('sy'),
    first.supported && second.supported && !ranges.containsZero(second.range));
}
const chain = (value, range, center, derivative) => record(range, center, scale(value.sx, derivative), scale(value.sy, derivative), value.supported);

export function power(value, exponent) {
  const derivative = exponent === 0 ? zero : scale(point(exponent), ranges.power(value.range, exponent - 1));
  const result = chain(value, ranges.power(value.range, exponent), ranges.power(value.center, exponent), derivative);
  // A clipped fractional-power range is not a continuity certificate for the
  // original box. Keep its natural enclosure, but do not use a slope proof.
  if (!Number.isInteger(exponent) && value.range.parts.some(([lower]) => lower < 0)) result.supported = false;
  return result;
}
function derivative(name, value, output) {
  const reciprocal = ranges.reciprocal, square = x => ranges.power(x, 2);
  if (name === 'sin') return ranges.unary('cos', value);
  if (name === 'cos') return ranges.negate(ranges.unary('sin', value));
  if (name === 'tan') return ranges.add(one, square(output));
  if (name === 'log' || name === 'log10' || name === 'log2') return reciprocal(scale(value, point(name === 'log10' ? Math.LN10 : name === 'log2' ? Math.LN2 : 1)));
  if (name === 'exp') return output;
  if (name === 'expm1') return ranges.unary('exp', value);
  if (name === 'sqrt') return reciprocal(scale(output, point(2)));
  if (name === 'cbrt') return reciprocal(scale(square(output), point(3)));
  if (name === 'asin' || name === 'acos') {
    const slope = reciprocal(ranges.unary('sqrt', ranges.subtract(one, square(value))));
    return name === 'acos' ? ranges.negate(slope) : slope;
  }
  if (name === 'atan') return reciprocal(ranges.add(one, square(value)));
  if (name === 'sinh') return ranges.unary('cosh', value);
  if (name === 'cosh') return ranges.unary('sinh', value);
  if (name === 'tanh') return reciprocal(square(ranges.unary('cosh', value)));
  if (name === 'abs') {
    const [lower, upper] = ranges.hull(value);
    return lower >= 0 ? one : upper <= 0 ? minusOne : ranges.interval(-1, 1);
  }
  // Integer-valued functions have zero slope on a single constant branch.
  if (['floor', 'ceil', 'round', 'trunc', 'sign'].includes(name)) {
    const [lower, upper] = ranges.hull(output);
    if (output.continuous && lower === upper) return zero;
  }
  return ranges.entire();
}
export function unary(name, value) {
  const output = ranges.unary(name, value.range);
  return chain(value, output, ranges.unary(name, value.center), derivative(name, value.range, output));
}
export function binary(name, first, second) {
  if (name === 'pow') {
    const [lower, upper] = ranges.hull(second.range);
    if (lower === upper && ranges.isZero(second.sx) && ranges.isZero(second.sy)) return power(first, lower);
    // Positive-base variable exponent: exp(v*log(u)), using slope identities.
    const composed = unary('exp', multiply(second, unary('log', first)));
    return { ...composed, range: ranges.binary(name, first.range, second.range) };
  }
  // The original fmod backend deliberately uses ordinary endpoint arithmetic.
  // Algebraic enclosure intersections need outward rounding here as well:
  // a rounded quotient can straddle a truncation boundary even at a point.
  const remainder = (a,b) => ranges.subtract(a,ranges.multiply(b,ranges.unary('trunc',ranges.divide(a,b))));
  const operation = name === 'fmod' ? remainder : (a,b) => ranges.binary(name,a,b);
  const range = operation(first.range, second.range);
  const center = operation(first.center, second.center);
  let weightFirst = ranges.entire(), weightSecond = ranges.entire();
  if (name === 'min' || name === 'max') {
    // min/max are continuous Lipschitz functions, including their crease.
    weightFirst = weightSecond = ranges.interval(0, 1);
  } else if (name === 'hypot') {
    weightFirst = weightSecond = ranges.interval(-1, 1);
  } else if (name === 'fmod') {
    const quotient = ranges.unary('trunc', ranges.divide(first.range, second.range));
    const [lower, upper] = ranges.hull(quotient);
    if (valid(quotient) && lower === upper) { weightFirst = one; weightSecond = ranges.negate(quotient); }
  }
  return record(range, center,
    productSum(weightFirst, first.sx, weightSecond, second.sx),
    productSum(weightFirst, first.sy, weightSecond, second.sy), first.supported && second.supported);
}
export function enclose(value, x, y) {
  if (!value.supported) return value.range;
  const dx = ranges.subtract(x.range, x.center), dy = ranges.subtract(y.range, y.center);
  const centered = ranges.add(value.center, productSum(value.sx, dx, value.sy, dy));
  return intersection(value.range, centered);
}
