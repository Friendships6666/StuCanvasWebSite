import { gridStep, zoomView } from './projection.js';

export const defaultSnapSettings = Object.freeze({
  spacing: 'fixed', stepX: 1, stepY: 1, subdivisions: 1,
  originX: 0, originY: 0, axis: 'both', attraction: 'always', tolerance: 12,
  radialStep: 1, angularStep: 15,
});

export function validSnapSettings(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && ['fixed', 'auto'].includes(value.spacing)
    && ['both', 'x', 'y'].includes(value.axis)
    && ['always', 'nearby'].includes(value.attraction)
    && ['stepX', 'stepY'].every(key => Number.isFinite(value[key]) && value[key] >= 1e-12 && value[key] <= 1e12)
    && [1, 2, 4, 5, 10, 20].includes(value.subdivisions)
    && ['originX', 'originY'].every(key => Number.isFinite(value[key]) && Math.abs(value[key]) <= 1e12)
    && Number.isFinite(value.tolerance) && value.tolerance >= 1 && value.tolerance <= 40
    && (value.radialStep === undefined || Number.isFinite(value.radialStep) && value.radialStep >= 1e-12 && value.radialStep <= 1e12)
    && (value.angularStep === undefined || Number.isFinite(value.angularStep) && value.angularStep >= 1e-6 && value.angularStep <= 180);
}

export function snapSteps(settings, scale) {
  const base = settings.spacing === 'auto' ? gridStep(scale) : null;
  return { x: (base ?? settings.stepX) / settings.subdivisions, y: (base ?? settings.stepY) / settings.subdivisions };
}

export function polarSteps(settings, scale) {
  return { radius: (settings.spacing === 'auto' ? gridStep(scale) : settings.radialStep ?? 1)/settings.subdivisions,
    angle: (settings.angularStep ?? 15)/settings.subdivisions*Math.PI/180 };
}

export function snapToPolarGrid(position, settings, scale) {
  const dx=position.x-settings.originX,dy=position.y-settings.originY;
  let radius=Math.hypot(dx,dy),angle=(Math.atan2(dy,dx)+Math.PI*2)%(Math.PI*2);
  if (!Number.isFinite(radius) || !radius) return {...position};
  const steps=polarSteps(settings,scale),nearby=settings.attraction==='nearby';
  if(settings.axis!=='y'){
    const count=radius/steps.radius;
    if(Number.isFinite(count)&&count<=Number.MAX_SAFE_INTEGER){
      const candidate=Number((Math.round(count)*steps.radius).toPrecision(15));
      if(!nearby||Math.abs(candidate-radius)*scale<=settings.tolerance)radius=candidate;
    }
  }
  if(settings.axis!=='x'){
    // Include the zero ray when an arbitrary degree step does not divide 360.
    const candidate=Math.min(Math.floor(Math.PI*2/steps.angle),Math.round(angle/steps.angle))*steps.angle;
    const delta=a=>Math.abs(Math.atan2(Math.sin(a-angle),Math.cos(a-angle)));
    const nearest=delta(0)<delta(candidate)?0:candidate;
    if(!nearby||2*radius*Math.sin(delta(nearest)/2)*scale<=settings.tolerance)angle=nearest;
  }
  const x=settings.originX+radius*Math.cos(angle),y=settings.originY+radius*Math.sin(angle);
  return Number.isFinite(x)&&Number.isFinite(y)?{...position,x,y}:{...position};
}

export function snapToGrid(position, settings, scale, coordinateSystem='cartesian') {
  if(coordinateSystem==='polar')return snapToPolarGrid(position,settings,scale);
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

export const defaultTouchOffsetPixels = 120;
export const maxTouchOffsetPixels = 300;
export const validTouchOffsetPixels = value => Number.isInteger(value) && value >= 0 && value <= maxTouchOffsetPixels;

export function touchAim(screen, width, height, offset = defaultTouchOffsetPixels) {
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
