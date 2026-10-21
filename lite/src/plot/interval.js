const floats = new Float64Array(1);
const words = new Uint32Array(floats.buffer);
floats[0] = 1;
const lowWord = words[0] === 0 ? 0 : 1;
const highWord = 1 - lowWord;
const TAU = 2 * Math.PI;

export function nextUp(value) {
  if (Number.isNaN(value) || value === Infinity) return value;
  if (value === 0) return Number.MIN_VALUE;
  floats[0] = value;
  if (value > 0) {
    words[lowWord]++;
    if (words[lowWord] === 0) words[highWord]++;
  } else {
    if (words[lowWord] === 0) words[highWord]--;
    words[lowWord]--;
  }
  return floats[0];
}

export const nextDown = value => -nextUp(-value);
export const empty = () => ({ parts: [], continuous: false });
export const poisoned = () => ({ parts: [], continuous: false, poisoned: true });
export const entire = () => ({ parts: [[-Infinity, Infinity]], continuous: false });
export const interval = (lower, upper = lower) => Number.isNaN(lower) || Number.isNaN(upper) || lower > upper ? poisoned() : ({ parts: [[lower, upper]], continuous: true });
export const containsZero = value => {
  if (value.poisoned) return false;
  for (const part of value.parts) if (part[0] <= 0 && part[1] >= 0) return true;
  return false;
};
export const bounded = value => !value.poisoned && value.parts.length > 0 && value.parts.every(bounds => bounds.every(Number.isFinite));
export const isUnbounded = value => !value.poisoned && value.parts.some(([lower, upper]) => Math.abs(lower) === Infinity && Math.abs(upper) === Infinity);
export const hull = value => value.parts.length ? [value.parts[0][0], value.parts.at(-1)[1]] : [Infinity, -Infinity];
export const isZero = value => !value.poisoned && value.continuous && value.parts.length === 1 && value.parts[0][0] === 0 && value.parts[0][1] === 0;

function pack(parts, continuous = true) {
  if (parts.length === 1) {
    const [lower, upper] = parts[0];
    if (Number.isNaN(lower) || Number.isNaN(upper) || lower > upper) return empty();
    return { parts: [[lower, upper]], continuous };
  }
  const valid = parts.filter(([lower, upper]) => !Number.isNaN(lower) && !Number.isNaN(upper) && lower <= upper);
  valid.sort((first, second) => first[0] - second[0]);
  const merged = [];
  for (const part of valid) {
    const previous = merged.at(-1);
    if (previous && part[0] <= previous[1]) previous[1] = Math.max(previous[1], part[1]);
    else merged.push([...part]);
  }
  return { parts: merged, continuous: continuous && merged.length > 0 };
}

function rounded(lower, upper) {
  if (Number.isNaN(lower) || Number.isNaN(upper)) return [-Infinity, Infinity];
  return [nextDown(lower), nextUp(upper)];
}

function combine(first, second, operation) {
  if (first.poisoned || second.poisoned) return poisoned();
  if (first.parts.length === 1 && second.parts.length === 1) return pack([operation(first.parts[0], second.parts[0])], first.continuous && second.continuous);
  const parts = [];
  for (const left of first.parts) for (const right of second.parts) parts.push(operation(left, right));
  return pack(parts, first.continuous && second.continuous);
}

export function add(first, second) {
  if (isZero(first)) return second;
  if (isZero(second)) return first;
  return combine(first, second, (left, right) => rounded(left[0] + right[0], left[1] + right[1]));
}

export const negate = value => value.poisoned ? poisoned() : pack(value.parts.map(([lower, upper]) => [-upper, -lower]), value.continuous);
export const subtract = (first, second, outward = true) => outward ? add(first, negate(second)) : combine(first, second, (left, right) => {
  const lower = left[0] - right[1];
  const upper = left[1] - right[0];
  return Number.isNaN(lower) || Number.isNaN(upper) ? [-Infinity, Infinity] : [lower, upper];
});

export function multiply(first, second, outward = true) {
  return combine(first, second, (left, right) => {
    const lowerLower = left[0] * right[0];
    const lowerUpper = left[0] * right[1];
    const upperLower = left[1] * right[0];
    const upperUpper = left[1] * right[1];
    if (Number.isNaN(lowerLower) || Number.isNaN(lowerUpper) || Number.isNaN(upperLower) || Number.isNaN(upperUpper)) return [-Infinity, Infinity];
    const lower = Math.min(lowerLower, lowerUpper, upperLower, upperUpper);
    const upper = Math.max(lowerLower, lowerUpper, upperLower, upperUpper);
    return outward ? rounded(lower, upper) : [lower, upper];
  });
}

export function reciprocal(value) {
  if (value.poisoned) return poisoned();
  if (value.parts.length === 1 && value.parts[0][0] === 0 && value.parts[0][1] === 0) return entire();
  const parts = [];
  let continuous = value.continuous;
  for (const [lower, upper] of value.parts) {
    if (lower <= 0 && upper >= 0) {
      continuous = false;
      if (lower < 0) parts.push([-Infinity, nextUp(1 / lower)]);
      if (upper > 0) parts.push([nextDown(1 / upper), Infinity]);
    } else parts.push(rounded(1 / upper, 1 / lower));
  }
  return pack(parts, continuous);
}

export const divide = (first, second) => multiply(first, reciprocal(second));

function stuplotDivide(first, second) {
  const parts = [];
  let continuous = first.continuous && second.continuous;
  for (const [lowerFirst, upperFirst] of first.parts) for (const [lowerSecond, upperSecond] of second.parts) {
    if (lowerSecond > 0 || upperSecond < 0) {
      const quotients = [lowerFirst / lowerSecond, lowerFirst / upperSecond, upperFirst / lowerSecond, upperFirst / upperSecond];
      parts.push(quotients.some(Number.isNaN) ? [-Infinity, Infinity] : [Math.min(...quotients), Math.max(...quotients)]);
    } else {
      continuous = false;
      if (lowerSecond === 0 && upperSecond === 0) parts.push([-Infinity, Infinity]);
      else if (lowerSecond < 0 && upperSecond > 0) {
        if (upperFirst < 0) parts.push([-Infinity, upperFirst / upperSecond], [upperFirst / lowerSecond, Infinity]);
        else if (lowerFirst > 0) parts.push([-Infinity, lowerFirst / lowerSecond], [lowerFirst / upperSecond, Infinity]);
        else parts.push([-Infinity, Infinity]);
      } else if (lowerSecond === 0) {
        if (upperFirst < 0) parts.push([-Infinity, upperFirst / upperSecond]);
        else if (lowerFirst > 0) parts.push([lowerFirst / upperSecond, Infinity]);
        else parts.push([-Infinity, Infinity]);
      } else {
        if (upperFirst < 0) parts.push([upperFirst / lowerSecond, Infinity]);
        else if (lowerFirst > 0) parts.push([-Infinity, lowerFirst / lowerSecond]);
        else parts.push([-Infinity, Infinity]);
      }
    }
  }
  return pack(parts, continuous);
}

export function power(value, exponent) {
  if (value.poisoned) return poisoned();
  if (!Number.isInteger(exponent)) {
    if (exponent < 0) return reciprocal(power(value, -exponent));
    return pack(value.parts.filter(([, upper]) => upper >= 0).map(([lower, upper]) => {
      lower = Math.max(0, lower);
      return [lower === 0 ? 0 : nextDown(lower ** exponent), nextUp(upper ** exponent)];
    }), value.continuous);
  }
  if (exponent === 0) return value.parts.length ? interval(1) : empty();
  if (exponent < 0) return reciprocal(power(value, -exponent));
  const even = exponent % 2 === 0;
  return pack(value.parts.map(([lower, upper]) => {
    const values = [lower ** exponent, upper ** exponent];
    const minimum = even && lower <= 0 && upper >= 0 ? 0 : Math.min(...values);
    return [minimum === 0 ? 0 : nextDown(minimum), nextUp(Math.max(...values))];
  }), value.continuous);
}

function periodic(lower, upper, cosine) {
  if (!Number.isFinite(lower + upper) || upper - lower >= TAU || Math.max(Math.abs(lower), Math.abs(upper)) > 1e14) return [-1, 1];
  const operation = cosine ? Math.cos : Math.sin;
  let minimum = Math.min(operation(lower), operation(upper));
  let maximum = Math.max(operation(lower), operation(upper));
  const peak = cosine ? 0 : Math.PI / 2;
  if (Math.ceil((lower - peak) / TAU) <= Math.floor((upper - peak) / TAU)) maximum = 1;
  if (Math.ceil((lower - peak - Math.PI) / TAU) <= Math.floor((upper - peak - Math.PI) / TAU)) minimum = -1;
  return [Math.max(-1, nextDown(minimum)), Math.min(1, nextUp(maximum))];
}

export function unary(name, value) {
  if (value.poisoned) return poisoned();
  const parts = [];
  let continuous = value.continuous;
  for (let [lower, upper] of value.parts) {
    if (name === 'floor' || name === 'ceil') {
      const first = Math[name](lower);
      const second = Math[name](upper);
      if (first === second) parts.push([first, first]);
      else {
        continuous = false;
        if (second - first > 32) parts.push([first, second]);
        else for (let offset = 0; offset <= second - first; offset++) {
          const integer = offset === 0 ? first : first + offset;
          parts.push([integer, integer]);
        }
      }
    } else if (name === 'abs') {
      parts.push([lower <= 0 && upper >= 0 ? 0 : Math.min(Math.abs(lower), Math.abs(upper)), Math.max(Math.abs(lower), Math.abs(upper))]);
    } else if (name === 'sin' || name === 'cos') {
      parts.push(periodic(lower, upper, name === 'cos'));
    } else if (name === 'tan') {
      if (!Number.isFinite(lower + upper) || upper - lower >= Math.PI || Math.max(Math.abs(lower), Math.abs(upper)) > 1e14) return entire();
      const pole = Math.ceil((lower - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
      if (pole >= lower && pole <= upper) {
        continuous = false;
        if (lower < pole) parts.push([nextDown(Math.tan(lower)), Infinity]);
        if (upper > pole) parts.push([-Infinity, nextUp(Math.tan(upper))]);
      } else parts.push(rounded(Math.tan(lower), Math.tan(upper)));
    } else {
      if (name === 'sqrt' || name === 'log' || name === 'log10' || name === 'log2') {
        const positive = name !== 'sqrt';
        if (positive ? upper <= 0 : upper < 0) return poisoned();
        if (positive ? lower <= 0 : lower < 0) continuous = false;
        lower = Math.max(0, lower);
      }
      if (name === 'asin' || name === 'acos') {
        if (upper < -1 || lower > 1) return poisoned();
        if (lower < -1 || upper > 1) continuous = false;
        lower = Math.max(-1, lower);
        upper = Math.min(1, upper);
      }
      if (name === 'cosh') {
        parts.push([lower <= 0 && upper >= 0 ? 1 : nextDown(Math.min(Math.cosh(lower), Math.cosh(upper))), nextUp(Math.max(Math.cosh(lower), Math.cosh(upper)))]);
        continue;
      }
      const operation = name === 'sign' ? Math.sign : Math[name];
      if (!operation) return entire();
      const first = operation(lower);
      const second = operation(upper);
      if (['round', 'trunc', 'sign'].includes(name)) {
        if (first !== second) continuous = false;
        parts.push([Math.min(first, second), Math.max(first, second)]);
      } else parts.push(rounded(Math.min(first, second), Math.max(first, second)));
    }
  }
  return pack(parts, continuous);
}

export function binary(name, first, second) {
  if (first.poisoned || second.poisoned) return poisoned();
  if (name === 'fmod') {
    const result = subtract(first, multiply(second, unary('trunc', stuplotDivide(first, second)), false), false);
    if (containsZero(second)) return result;
    let maximum = 0;
    for (const [lower, upper] of second.parts) maximum = Math.max(maximum, Math.abs(lower), Math.abs(upper));
    return pack(result.parts.map(([lower, upper]) => [Math.max(lower, -maximum), Math.min(upper, maximum)]), result.continuous);
  }
  if (name === 'min' || name === 'max') return combine(first, second, (left, right) => [Math[name](left[0], right[0]), Math[name](left[1], right[1])]);
  if (name === 'hypot') return unary('sqrt', add(power(first, 2), power(second, 2)));
  if (name === 'pow') {
    if (second.parts.length === 1 && second.parts[0][0] === second.parts[0][1]) return power(first, second.parts[0][0]);
    if (first.parts.some(([lower]) => lower < 0)) return entire();
    const result = unary('exp', multiply(second, unary('log', first)));
    if (containsZero(first) && second.parts.some(([, upper]) => upper > 0)) return pack([...result.parts, [0, 0]], result.continuous);
    return result;
  }
  return entire();
}
