import { linearBounds, linearDirection } from './geometry.js';

export const MIN_SCALE = Number.MIN_VALUE;
export const MAX_SCALE = Number.MAX_VALUE;

export function f64Ulp(value) {
  const magnitude = Math.abs(value);
  if (!Number.isFinite(magnitude)) return Infinity;
  return magnitude === 0 ? Number.MIN_VALUE : Math.max(Number.MIN_VALUE, magnitude * Number.EPSILON);
}

export function scaleBounds(view, width, height) {
  const halfExtent = Math.max(width, height) * 0.5;
  const centerMagnitude = Math.max(Math.abs(view.x), Math.abs(view.y), 1);
  const precisionScale = 1 / (8 * f64Ulp(centerMagnitude));
  const availableMagnitude = Number.MAX_VALUE / 16 - centerMagnitude;
  const rangeScale = availableMagnitude > 0 ? halfExtent / availableMagnitude : Number.MAX_VALUE;
  return { minimum: Math.max(MIN_SCALE, rangeScale), maximum: Math.min(MAX_SCALE, precisionScale) };
}

export function toScreen(point, view, width, height) {
  return { x: width / 2 + (point.x - view.x) * view.scale, y: height / 2 - (point.y - view.y) * view.scale };
}

export function toWorld(point, view, width, height) {
  return { x: view.x + (point.x - width / 2) / view.scale, y: view.y - (point.y - height / 2) / view.scale };
}

export function zoomView(view, factor, anchor, width, height) {
  const requested = view.scale * factor;
  let scale = requested;
  let next = view;
  for (let iteration = 0; iteration < 3; iteration++) {
    next = {
      x: view.x + (anchor.x - width / 2) * (1 / view.scale - 1 / scale),
      y: view.y - (anchor.y - height / 2) * (1 / view.scale - 1 / scale),
      scale,
    };
    const bounds = scaleBounds(next, width, height);
    scale = Math.max(bounds.minimum, Math.min(bounds.maximum, requested));
  }
  return { ...next, scale };
}

export function gridStep(scale) {
  const rough = 65 / scale;
  const power = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 5, 10].find(value => value * power >= rough) * power;
}

export function gridTicks(center, scale, extent, step, inverted = false) {
  const sign = inverted ? -1 : 1;
  const remainder = center % step;
  const base = center - remainder;
  const anchor = extent / 2 - sign * remainder * scale;
  const pixels = step * scale;
  const ticks = [];
  for (let index = Math.ceil(-anchor / pixels); index <= Math.floor((extent - anchor) / pixels); index++) {
    ticks.push({ screen: anchor + index * pixels, value: base + sign * index * step });
  }
  return ticks;
}

export function clipLinear(object, view, width, height, margin = 12) {
  const { x: deltaX, y: deltaY } = linearDirection(object);
  const length = Math.hypot(deltaX, deltaY);
  if (!length) return null;
  const direction = { x: deltaX / length, y: -deltaY / length };
  const relativeX = object.first.x - view.x;
  const relativeY = -(object.first.y - view.y);
  const perpendicular = (relativeX * -direction.y + relativeY * direction.x) * view.scale;
  const anchor = { x: width / 2 - direction.y * perpendicular, y: height / 2 + direction.x * perpendicular };
  const firstAlong = (relativeX * direction.x + relativeY * direction.y) * view.scale;
  const [minimum, maximum] = linearBounds(object);
  if (minimum > maximum) return null;
  const along = parameter => parameter === 0 ? firstAlong : firstAlong + parameter * length * view.scale;
  let lower = minimum === -Infinity ? -Infinity : along(minimum);
  let upper = maximum === Infinity ? Infinity : along(maximum);
  for (const [start, change, maximum] of [[anchor.x, direction.x, width], [anchor.y, direction.y, height]]) {
    if (Math.abs(change) < 1e-15) {
      if (start < -margin || start > maximum + margin) return null;
    } else {
      const first = (-margin - start) / change;
      const second = (maximum + margin - start) / change;
      lower = Math.max(lower, Math.min(first, second));
      upper = Math.min(upper, Math.max(first, second));
    }
  }
  if (lower > upper) return null;
  return { first: { x: anchor.x + lower * direction.x, y: anchor.y + lower * direction.y }, second: { x: anchor.x + upper * direction.x, y: anchor.y + upper * direction.y } };
}

export function projectCircle(object, view, width, height) {
  const relativeX = view.x - object.first.x;
  const relativeY = -(view.y - object.first.y);
  const separation = Math.hypot(relativeX, relativeY);
  const offset = (separation - object.radius) * view.scale;
  const diagonal = Math.hypot(width, height) / 2 + 16;
  if (Math.abs(offset) > diagonal) return null;
  const radius = object.radius * view.scale;
  if (radius <= Math.max(width, height) * 4) {
    const center = toScreen(object.first, view, width, height);
    return { kind: 2, geometry: [center.x, center.y, 0, 0], radius };
  }
  const inverseRadius = 1 / radius;
  return { kind: 3, geometry: [relativeX / object.radius, relativeY / object.radius, offset * (2 + offset * inverseRadius), inverseRadius], radius: 0 };
}
