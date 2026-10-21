const undefinedValue = -(1 + 0xbaadc0de / 2 ** 32) * 2 ** 300;

const empty = () => ({ parts: [], continuous: false });
const poisoned = () => ({ parts: [], continuous: false, poisoned: true });
const entire = () => ({ parts: [[-Infinity, Infinity]], continuous: false });

export function interval(lower, upper = lower) {
  if (lower === undefinedValue || upper === undefinedValue) return poisoned();
  if (Number.isNaN(lower) || Number.isNaN(upper)) return entire();
  return { parts: [[Math.min(lower, upper), Math.max(lower, upper)]], continuous: true };
}

function normalize(parts, continuous = true) {
  if (parts.some(part => part.includes(undefinedValue))) return poisoned();
  if (parts.some(part => part.some(Number.isNaN))) return entire();
  parts.sort((first, second) => first[0] - second[0]);
  const merged = [];
  for (const [lower, upper] of parts) {
    const previous = merged.at(-1);
    if (previous && lower <= previous[1]) previous[1] = Math.max(previous[1], upper);
    else merged.push([lower, upper]);
  }
  return { parts: merged, continuous: continuous && merged.length > 0 };
}

function map(value, operation) {
  if (value.poisoned) return poisoned();
  const parts = [];
  let continuous = value.continuous;
  for (const bounds of value.parts) {
    const result = operation(...bounds);
    if (result.poisoned) return result;
    parts.push(...result.parts);
    continuous &&= result.continuous;
  }
  return normalize(parts, continuous);
}

function combine(first, second, operation) {
  if (first.poisoned || second.poisoned) return poisoned();
  const parts = [];
  let continuous = first.continuous && second.continuous;
  for (const left of first.parts) for (const right of second.parts) {
    const result = operation(left, right);
    if (result.poisoned) return result;
    parts.push(...result.parts);
    continuous &&= result.continuous;
  }
  return normalize(parts, continuous);
}

export const add = (first, second) => combine(first, second, (left, right) => interval(left[0] + right[0], left[1] + right[1]));
export const subtract = (first, second) => combine(first, second, (left, right) => interval(left[0] - right[1], left[1] - right[0]));
export const negate = value => map(value, (lower, upper) => interval(-upper, -lower));
export const multiply = (first, second) => combine(first, second, (left, right) => {
  const products = [left[0] * right[0], left[0] * right[1], left[1] * right[0], left[1] * right[1]];
  return interval(Math.min(...products), Math.max(...products));
});

export const divide = (first, second) => combine(first, second, ([lower, upper], [start, end]) => {
  if (start > 0 || end < 0) {
    const quotients = [lower / start, lower / end, upper / start, upper / end];
    return interval(Math.min(...quotients), Math.max(...quotients));
  }
  if (start === 0 && end === 0) return entire();
  if (start < 0 && end > 0) {
    if (upper < 0) return normalize([[-Infinity, upper / end], [upper / start, Infinity]], false);
    if (lower > 0) return normalize([[-Infinity, lower / start], [lower / end, Infinity]], false);
    return entire();
  }
  let result;
  if (start === 0) result = upper < 0 ? interval(-Infinity, upper / end) : lower > 0 ? interval(lower / end, Infinity) : entire();
  else result = upper < 0 ? interval(upper / start, Infinity) : lower > 0 ? interval(-Infinity, lower / start) : entire();
  result.continuous = false;
  return result;
});

export function power(value, exponent) {
  if (value.poisoned) return poisoned();
  if (!Number.isInteger(exponent)) return unary('exp', multiply(interval(exponent), unary('log', value)));
  if (exponent === 0) return value.parts.length ? interval(1) : empty();
  if (exponent < 0) return divide(interval(1), power(value, -exponent));
  return map(value, (lower, upper) => {
    const first = lower ** exponent;
    const second = upper ** exponent;
    return exponent % 2 === 0 && lower < 0 && upper > 0 ? interval(0, Math.max(first, second)) : interval(first, second);
  });
}

export function unary(name, value) {
  return map(value, (lower, upper) => {
    if (name === 'floor' || name === 'ceil' || name === 'round') {
      const operation = name === 'round' ? number => number < 0 ? -Math.round(-number) : Math.round(number) : Math[name];
      const first = operation(lower);
      const second = operation(upper);
      if (first === second) return interval(first);
      if (second - first > (name === 'round' ? 64 : 32)) return { ...interval(first, second), continuous: false };
      const parts = [];
      for (let offset = 0; offset <= second - first; offset++) parts.push([first + offset, first + offset]);
      return normalize(parts, false);
    }
    if (name === 'sin' || name === 'cos') {
      const period = 2 * Math.PI;
      if (upper - lower >= period) return interval(-1, 1);
      const includes = position => Math.floor((upper - position) / period) > Math.floor((lower - position) / period);
      let minimum = Math.min(Math[name](lower), Math[name](upper));
      let maximum = Math.max(Math[name](lower), Math[name](upper));
      if (includes(name === 'cos' ? 0 : Math.PI / 2)) maximum = 1;
      if (includes(name === 'cos' ? Math.PI : 3 * Math.PI / 2)) minimum = -1;
      return interval(minimum, maximum);
    }
    if (name === 'tan') {
      if (upper - lower >= Math.PI) return entire();
      const index = Math.floor((lower - Math.PI / 2) / Math.PI);
      const pole = (index + 1) * Math.PI + Math.PI / 2;
      if (upper > pole) return normalize([[-Infinity, Math.tan(upper)], [Math.tan(lower), Infinity]], false);
      return interval(Math.tan(lower), Math.tan(upper));
    }
    if (['log', 'log10', 'log2'].includes(name)) {
      if (upper <= 0) return poisoned();
      return { ...interval(lower <= 0 ? -Infinity : Math[name](lower), Math[name](upper)), continuous: lower > 0 };
    }
    if (name === 'sqrt') {
      if (upper < 0) return poisoned();
      return { ...interval(Math.sqrt(Math.max(0, lower)), Math.sqrt(upper)), continuous: lower >= 0 };
    }
    if (name === 'asin' || name === 'acos') {
      if (lower > 1 || upper < -1) return poisoned();
      return { ...interval(Math[name](Math.max(-1, lower)), Math[name](Math.min(1, upper))), continuous: lower >= -1 && upper <= 1 };
    }
    if (name === 'abs') return interval(lower <= 0 && upper >= 0 ? 0 : Math.min(Math.abs(lower), Math.abs(upper)), Math.max(Math.abs(lower), Math.abs(upper)));
    if (name === 'cosh') return interval(lower <= 0 && upper >= 0 ? 1 : Math.min(Math.cosh(lower), Math.cosh(upper)), Math.max(Math.cosh(lower), Math.cosh(upper)));
    if ((name === 'exp' || name === 'expm1') && Math.abs(lower) === Infinity && Math.abs(upper) === Infinity) return entire();
    const result = interval(Math[name](lower), Math[name](upper));
    if ((name === 'trunc' || name === 'sign') && result.parts[0][0] !== result.parts[0][1]) result.continuous = false;
    return result;
  });
}

export function intersect(value, lower, upper) {
  if (value.poisoned) return value;
  const parts = [];
  for (const bounds of value.parts) {
    const start = Math.max(bounds[0], lower);
    const end = Math.min(bounds[1], upper);
    if (start <= end) parts.push([start, end]);
  }
  return { parts, continuous: value.continuous };
}

export function binary(name, first, second) {
  if (first.poisoned || second.poisoned) return poisoned();
  if (name === 'fmod') {
    const result = subtract(first, multiply(second, unary('trunc', divide(first, second))));
    if (second.parts.some(([lower, upper]) => lower <= 0 && upper >= 0)) return result;
    const maximum = second.parts.reduce((value, bounds) => Math.max(value, Math.abs(bounds[0]), Math.abs(bounds[1])), 0);
    return intersect(result, -maximum, maximum);
  }
  if (name === 'pow') return combine(first, second, (left, right) => right[0] === right[1] && Number.isInteger(right[0]) ? power(interval(...left), right[0]) : unary('exp', multiply(interval(...right), unary('log', interval(...left)))));
  if (name === 'hypot') return combine(first, second, (left, right) => {
    const absolute = bounds => [bounds[0] <= 0 && bounds[1] >= 0 ? 0 : Math.min(Math.abs(bounds[0]), Math.abs(bounds[1])), Math.max(Math.abs(bounds[0]), Math.abs(bounds[1]))];
    const horizontal = absolute(left);
    const vertical = absolute(right);
    return interval(Math.hypot(horizontal[0], vertical[0]), Math.hypot(horizontal[1], vertical[1]));
  });
  return combine(first, second, (left, right) => interval(Math[name](left[0], right[0]), Math[name](left[1], right[1])));
}
