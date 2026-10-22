import { gridStep, zoomView } from './projection.js';

export const defaultSnapSettings = Object.freeze({
  spacing: 'fixed', stepX: 1, stepY: 1, subdivisions: 1,
  originX: 0, originY: 0, axis: 'both', attraction: 'always', tolerance: 12,
});

export function validSnapSettings(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && ['fixed', 'auto'].includes(value.spacing)
    && ['both', 'x', 'y'].includes(value.axis)
    && ['always', 'nearby'].includes(value.attraction)
    && ['stepX', 'stepY'].every(key => Number.isFinite(value[key]) && value[key] >= 1e-12 && value[key] <= 1e12)
    && [1, 2, 4, 5, 10, 20].includes(value.subdivisions)
    && ['originX', 'originY'].every(key => Number.isFinite(value[key]) && Math.abs(value[key]) <= 1e12)
    && Number.isFinite(value.tolerance) && value.tolerance >= 1 && value.tolerance <= 40;
}

export function snapSteps(settings, scale) {
  const base = settings.spacing === 'auto' ? gridStep(scale) : null;
  return { x: (base ?? settings.stepX) / settings.subdivisions, y: (base ?? settings.stepY) / settings.subdivisions };
}

export function snapToGrid(position, settings, scale) {
  const steps = snapSteps(settings, scale);
  const result = { ...position };
  for (const axis of ['x', 'y']) {
    if (settings.axis !== 'both' && settings.axis !== axis) continue;
    const origin = settings[axis === 'x' ? 'originX' : 'originY'];
    const step = steps[axis];
    const cell = (position[axis] - origin) / step;
    if (!Number.isFinite(cell) || Math.abs(cell) > Number.MAX_SAFE_INTEGER) continue;
    const nearest = origin + Math.round(cell) * step;
    if (!Number.isFinite(nearest)) continue;
    if (settings.attraction === 'nearby' && Math.abs(nearest - position[axis]) * scale > settings.tolerance) continue;
    // Remove arithmetic tails such as 0.30000000000000004 without rounding
    // coordinates beyond the precision supported by their grid cell.
    const rounded = Number(nearest.toPrecision(15));
    result[axis] = Math.abs(rounded - nearest) <= step * 1e-6 ? rounded : nearest;
  }
  return result;
}

export function touchAim(screen, width, height, offset = 120) {
  const clamp = (value, size) => Math.max(Math.min(12, size / 2), Math.min(Math.max(size - 12, size / 2), value));
  const above = { x: clamp(screen.x, width), y: clamp(screen.y - offset, height) };
  if (offset <= 0) return above;
  // Clamping at the top must not put the reticle back underneath the finger.
  // Slide sideways continuously as the available vertical gap shrinks.
  const horizontal = Math.sqrt(Math.max(0, offset ** 2 - (above.y - screen.y) ** 2));
  const direction = screen.x <= width / 2 ? 1 : -1;
  above.x = clamp(screen.x + direction * horizontal, width);
  const distance = point => Math.hypot(point.x - screen.x, point.y - screen.y);
  if (distance(above) >= offset - 1e-6) return above;
  // Very narrow viewports can have more usable space below the finger.
  const below = { x: clamp(screen.x, width), y: clamp(screen.y + offset, height) };
  return distance(below) > distance(above) ? below : above;
}

// Preserve the world point under the original midpoint, then translate it to
// the moving midpoint. Both pinch zoom and two-finger pan share this transform.
export function pinchView(initial, first, second, width, height) {
  const midpoint = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
  const length = points => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  const start = midpoint(first), current = midpoint(second);
  const next = zoomView(initial, Math.max(1, length(second)) / Math.max(1, length(first)), start, width, height);
  return { ...next, x: next.x - (current.x - start.x) / next.scale, y: next.y + (current.y - start.y) / next.scale };
}
