import { arcTypes, distance, distanceToObject } from './geometry.js';
import { clipLinear, toWorld } from './projection.js';
import { add, bounded, containsZero, hull, interval, multiply, nextDown, nextUp, unary } from './plot/interval.js';
import { conicRanges, isConic } from './conics.js';

function curveRanges(object, view, width, height) {
  if (isConic(object)) return conicRanges(object, view, width, height);
  if (!arcTypes.has(object.type) && object.type !== 'circle') {
    const clipped = clipLinear(object, view, width, height, 24);
    if (!clipped) return [];
    const first = toWorld(clipped.first, view, width, height);
    const second = toWorld(clipped.second, view, width, height);
    const delta = { x: second.x - first.x, y: second.y - first.y };
    const at = parameter => ({ x: first.x + parameter * delta.x, y: first.y + parameter * delta.y, dx: delta.x, dy: delta.y });
    const bounds = (lower, upper) => {
      const a = at(lower);
      const b = at(upper);
      return [nextDown(Math.min(a.x, b.x)), nextUp(Math.max(a.x, b.x)), nextDown(Math.min(a.y, b.y)), nextUp(Math.max(a.y, b.y))];
    };
    return [{ length: distance(clipped.first, clipped.second), at, bounds }];
  }
  const { radius, first: center } = object;
  if (!(radius > 0)) return [];
  const start = arcTypes.has(object.type) ? Math.atan2(object.arcStart.y - center.y, object.arcStart.x - center.x) : 0;
  const sweep = arcTypes.has(object.type) ? object.sweep : 2 * Math.PI;
  if (!sweep) return [];
  const halfWidth = (width / 2 + 24) / view.scale;
  const halfHeight = (height / 2 + 24) / view.scale;
  const viewport = [view.x - halfWidth, view.x + halfWidth, view.y - halfHeight, view.y + halfHeight];
  const cuts = [0, 1];
  const addAngle = angle => {
    const period = 2 * Math.PI;
    const offset = sweep > 0 ? ((angle - start) % period + period) % period : -(((start - angle) % period + period) % period);
    const parameter = offset / sweep;
    if (parameter > 0 && parameter < 1) cuts.push(parameter);
  };
  for (const boundary of viewport.slice(0, 2)) {
    const value = (boundary - center.x) / radius;
    if (Math.abs(value) <= 1) { addAngle(Math.acos(value)); addAngle(-Math.acos(value)); }
  }
  for (const boundary of viewport.slice(2)) {
    const value = (boundary - center.y) / radius;
    if (Math.abs(value) <= 1) { addAngle(Math.asin(value)); addAngle(Math.PI - Math.asin(value)); }
  }
  cuts.sort((first, second) => first - second);
  const at = parameter => {
    const angle = start + sweep * parameter;
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle), dx: -radius * sweep * Math.sin(angle), dy: radius * sweep * Math.cos(angle) };
  };
  const ranges = [];
  for (let index = 1; index < cuts.length; index++) {
    const lower = cuts[index - 1];
    const span = cuts[index] - lower;
    const position = at(lower + span / 2);
    if (position.x < viewport[0] || position.x > viewport[1] || position.y < viewport[2] || position.y > viewport[3] || !span) continue;
    const bounds = (first, second) => {
      const angles = [start + sweep * (lower + first * span), start + sweep * (lower + second * span)];
      const angle = interval(nextDown(Math.min(...angles)), nextUp(Math.max(...angles)));
      const coordinate = (name, center) => hull(add(interval(center), multiply(interval(radius), unary(name, angle))));
      return [...coordinate('cos', center.x), ...coordinate('sin', center.y)];
    };
    ranges.push({ bounds, length: Math.min(radius * Math.abs(sweep) * span * view.scale, 8 * (width + height)), at: parameter => {
      const point = at(lower + parameter * span);
      return { ...point, dx: point.dx * span, dy: point.dy * span };
    } });
  }
  return ranges;
}

export function equationGeometryIntersections(equation, object, view, width, height) {
  const roots = [];
  const pixel = 1 / view.scale;
  const polish = (sample, epsilon) => {
    const speed = Math.hypot(sample.dx, sample.dy);
    const tx = sample.dx / speed;
    const ty = sample.dy / speed;
    let best = sample;
    while (best.value !== 0) {
      const norm = Math.hypot(best.gradientX, best.gradientY);
      const slope = best.gradientX / norm * tx + best.gradientY / norm * ty;
      let step = -(best.value / norm) / slope;
      if (!Number.isFinite(step) || Math.abs(step) > epsilon) break;
      let improved = false;
      while (step) {
        // Update coordinates directly: recomputing a large translated circle
        // from its angle can discard the small x coordinate near an asymptote.
        const x = best.x + tx * step;
        const y = best.y + ty * step;
        if (x === best.x && y === best.y) break;
        const [value, gradientX, gradientY] = equation.gradient(x, y);
        const range = equation.interval(nextDown(Math.min(x, best.x)), nextUp(Math.max(x, best.x)), nextDown(Math.min(y, best.y)), nextUp(Math.max(y, best.y)));
        if (Number.isFinite(value) && Math.abs(value) < Math.abs(best.value) && bounded(range) && range.continuous && distance(sample, { x, y }) <= epsilon) {
          best = { ...best, x, y, value, gradientX, gradientY };
          improved = true;
          break;
        }
        step /= 2;
      }
      if (!improved) break;
    }
    return distanceToObject(best, object) <= epsilon ? best : sample;
  };
  const accept = (sample, stationary = false) => {
    const { x, y, value, gradientX, gradientY } = sample;
    if (![x, y, value].every(Number.isFinite)) return false;
    const norm = Math.hypot(gradientX, gradientY);
    const epsilon = Math.max(pixel * 1e-6, Math.abs(x) * Number.EPSILON * 4, Math.abs(y) * Number.EPSILON * 4);
    if (value !== 0 && (!Number.isFinite(norm) || norm === 0 || Math.abs(value) / norm > epsilon)) return false;
    const rounding = Math.max(Math.abs(x) * Number.EPSILON * 4, Math.abs(y) * Number.EPSILON * 4, Number.MIN_VALUE * 4);
    if (value !== 0) {
      const speed = Math.hypot(sample.dx, sample.dy);
      const slope = Math.abs(gradientX / norm * (sample.dx / speed) + gradientY / norm * (sample.dy / speed));
      // Distance to the equation alone is insufficient near a tangency. Bound
      // the correction along the other curve, or require rounding-level error
      // at a stationary point. This keeps two close roots from merging early.
      if (!(Math.abs(value) / norm <= (stationary ? rounding : epsilon * slope))) return false;
    }
    // A small residual divided by a large gradient is also possible next to a
    // pole. Require a bounded neighbourhood, shrinking it to isolate the root
    // from any nearby singularity rather than accepting a sign jump as a root.
    let radius = stationary ? rounding : epsilon;
    for (;;) {
      const range = equation.interval(nextDown(x - radius), nextUp(x + radius), nextDown(y - radius), nextUp(y + radius));
      if (!containsZero(range)) return false;
      if (bounded(range) && (range.continuous || value === 0)) break;
      const smaller = radius / 2;
      if (!smaller || smaller === radius || x - smaller === x && x + smaller === x && y - smaller === y && y + smaller === y) return false;
      radius = smaller;
    }
    const refined = polish(sample, epsilon);
    const position = { x: refined.x, y: refined.y };
    if (!roots.some(root => distance(root, position) < Math.max(pixel * 1e-4, epsilon * 2))) roots.push(position);
    return true;
  };
  for (const curve of curveRanges(object, view, width, height)) {
    const sample = parameter => {
      const point = curve.at(parameter);
      const [value, gradientX, gradientY] = equation.gradient(point.x, point.y);
      return { ...point, parameter, value, gradientX, gradientY, derivative: gradientX * point.dx + gradientY * point.dy };
    };
    const refine = (first, second, stationary) => {
      let lower = first;
      let upper = second;
      const component = stationary ? 'derivative' : 'value';
      let best = Math.abs(lower[component]) < Math.abs(upper[component]) ? lower : upper;
      for (;;) {
        let parameter = lower.parameter + (upper.parameter - lower.parameter) / 2;
        if (!stationary && best.derivative) {
          const estimate = best.parameter - best.value / best.derivative;
          const margin = (upper.parameter - lower.parameter) * 0.1;
          if (estimate > lower.parameter + margin && estimate < upper.parameter - margin) parameter = estimate;
        }
        if (parameter === lower.parameter || parameter === upper.parameter) break;
        const current = sample(parameter);
        if (!Number.isFinite(current[component])) return false;
        if (Math.abs(current[component]) < Math.abs(best[component])) best = current;
        if (current[component] === 0) { best = current; break; }
        if ((current[component] < 0) === (lower[component] < 0)) lower = current;
        else upper = current;
      }
      return accept(best, stationary);
    };
    const opposite = (first, second, component) => Number.isFinite(first[component]) && Number.isFinite(second[component]) && (first[component] < 0) !== (second[component] < 0);
    const count = Math.max(1, Math.ceil(curve.length / 4));
    let previous = sample(0);
    for (let index = 1; index <= count; index++) {
      const current = sample(index / count);
      const stack = [[previous, current]];
      while (stack.length) {
        const [first, second] = stack.pop();
        const box = curve.bounds(first.parameter, second.parameter);
        const range = equation.interval(...box);
        if (!containsZero(range)) continue;
        const parameter = first.parameter + (second.parameter - first.parameter) / 2;
        const middle = sample(parameter);
        const continuous = range.continuous && bounded(range);
        let found = false;
        if (continuous) {
          found = accept(first) || found;
          found = accept(middle) || found;
          found = accept(second) || found;
          for (const [a, b] of [[first, middle], [middle, second]]) {
            if (opposite(a, b, 'value')) found = refine(a, b, false) || found;
            if (opposite(a, b, 'derivative')) found = refine(a, b, true) || found;
          }
        }
        const size = Math.max(box[1] - box[0], box[3] - box[2]);
        const accuracy = Math.max(pixel * 1e-6, ...box.map(value => Math.abs(value) * Number.EPSILON * 8));
        const stalled = parameter === first.parameter || parameter === second.parameter || [first, second].every(point => point.x === middle.x && point.y === middle.y);
        if (stalled || continuous && (found || size <= accuracy)) {
          if (!continuous) { accept(first); accept(middle); accept(second); }
          continue;
        }
        // Equal endpoint signs do not exclude a root: a nearby pole, a tangent,
        // or two roots can all hide inside the original four-pixel segment.
        stack.push([middle, second], [first, middle]);
      }
      previous = current;
    }
  }
  return roots.sort((first, second) => first.x - second.x || first.y - second.y);
}
