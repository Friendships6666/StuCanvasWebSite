import { arcTypes, isLinear } from './geometry.js';
import { clipLinear, toScreen } from './projection.js';
import { intersectionContext } from './intersection-tracker.js';
import { isPlot } from './plot/types.js';
import { conicSegments, isConic } from './conics.js';
import { RegionGrid } from './region-grid.js';
import { EquationTask } from './plot/sampler.js';
import { ParametricTask } from './plot/parametric-sampler.js';

export const REGION_CELL = .25;
export const SNAPSHOT_CELL = .125;

export const isBoundary = object => !!object && !object.hidden && !object.invalid && (isConic(object) || isLinear(object) || object.type === 'circle' || isPlot(object) || arcTypes.has(object.type));

const plotFrames = new WeakMap();

function geometryBounds(objects) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const include = (horizontal, vertical) => {
    if (!Number.isFinite(horizontal) || !Number.isFinite(vertical)) return;
    bounds[0] = Math.min(bounds[0], horizontal);
    bounds[1] = Math.min(bounds[1], vertical);
    bounds[2] = Math.max(bounds[2], horizontal);
    bounds[3] = Math.max(bounds[3], vertical);
  };
  for (const object of objects) {
    if (isPlot(object)) continue;
    if (isConic(object)) {
      const horizontal = object.type === 'parabola' ? object.scale : object.a;
      const vertical = object.type === 'parabola' ? object.scale : object.b;
      const extentX = Math.hypot(horizontal * object.axis.x, vertical * object.axis.y);
      const extentY = Math.hypot(horizontal * object.axis.y, vertical * object.axis.x);
      include(object.origin.x - extentX, object.origin.y - extentY);
      include(object.origin.x + extentX, object.origin.y + extentY);
      continue;
    }
    if (object.first) include(object.first.x, object.first.y);
    if (object.second) include(object.second.x, object.second.y);
    if (object.radius && !isLinear(object)) {
      include(object.first.x - object.radius, object.first.y - object.radius);
      include(object.first.x + object.radius, object.first.y + object.radius);
    }
  }
  return bounds;
}

function frameFromBounds(bounds) {
  const spanX = bounds[2] - bounds[0];
  const spanY = bounds[3] - bounds[1];
  if (![...bounds, spanX, spanY].every(Number.isFinite)) return null;
  return { x: bounds[0] / 2 + bounds[2] / 2, y: bounds[1] / 2 + bounds[3] / 2, spanX: spanX || spanY || 1, spanY: spanY || spanX || 1 };
}

function* boundaryFrame(objects) {
  const bounds = geometryBounds(objects);
  for (const object of objects) {
    if (!isPlot(object) || !object.plot) continue;
    const points = object.plot.points;
    let cached = plotFrames.get(object.plot);
    if (!cached || cached.length !== points.length) {
      const extent = [Infinity, Infinity, -Infinity, -Infinity];
      for (let index = 0; index < points.length; index += 2) {
        if (Number.isFinite(points[index]) && Number.isFinite(points[index + 1])) {
          extent[0] = Math.min(extent[0], points[index]);
          extent[1] = Math.min(extent[1], points[index + 1]);
          extent[2] = Math.max(extent[2], points[index]);
          extent[3] = Math.max(extent[3], points[index + 1]);
        }
        if (index % 4096 === 0) yield;
      }
      cached = { length: points.length, extent };
      plotFrames.set(object.plot, cached);
    }
    bounds[0] = Math.min(bounds[0], cached.extent[0]);
    bounds[1] = Math.min(bounds[1], cached.extent[1]);
    bounds[2] = Math.max(bounds[2], cached.extent[2]);
    bounds[3] = Math.max(bounds[3], cached.extent[3]);
  }
  return frameFromBounds(bounds);
}

function transport(position, from, to) {
  if (!from || !to) return position;
  return { x: to.x + (position.x - from.x) / from.spanX * to.spanX, y: to.y + (position.y - from.y) / from.spanY * to.spanY };
}

function outsideView(region, target) {
  if (!region) return false;
  for (let index = 0; index < region.rectangles.length; index += 4) {
    const [left, top, right, bottom] = regionScreenBounds(region, index, target.view, target.width, target.height);
    if (left < 0 || top < 0 || right > target.width || bottom > target.height) return true;
  }
  return false;
}

function regionPosition(region, horizontal, vertical) {
  return { x: region.view.x + (horizontal - region.width / 2) / region.view.scale, y: region.view.y - (vertical - region.height / 2) / region.view.scale };
}

function seedCandidates(region, frame, relocate) {
  const move = position => relocate ? transport(position, region.frame, frame) : position;
  const candidates = [move(region.seed)];
  if (!relocate) return candidates;
  const rectangles = region.rectangles;
  let area = 0;
  for (let index = 0; index < rectangles.length; index += 4) area += (rectangles[index + 2] - rectangles[index]) * (rectangles[index + 3] - rectangles[index + 1]);
  let accumulated = 0;
  let target = area / 12;
  for (let index = 0; index < rectangles.length && candidates.length <= 6; index += 4) {
    accumulated += (rectangles[index + 2] - rectangles[index]) * (rectangles[index + 3] - rectangles[index + 1]);
    if (accumulated >= target) {
      candidates.push(move(regionPosition(region, (rectangles[index] + rectangles[index + 2]) / 2, (rectangles[index + 1] + rectangles[index + 3]) / 2)));
      target += area / 6;
    }
  }
  return candidates.filter(position => Number.isFinite(position?.x) && Number.isFinite(position?.y));
}

export function* findRegion(objects, seed, view, width, height, mode = 'multiple', tracking = null, cell = REGION_CELL) {
  const frame = yield* boundaryFrame(objects.filter(isBoundary));
  if (tracking) tracking.frame = frame;
  const candidates = tracking?.region?.seed ? seedCandidates(tracking.region, frame, tracking.relocate) : [seed];
  const margin = 32;
  const columns = Math.ceil((width + margin * 2) / cell);
  const rows = Math.ceil((height + margin * 2) / cell);
  let grid = new RegionGrid(columns, rows);
  const curves = objects.filter(isBoundary);
  const stamp = (screenX, screenY, radius, owner) => {
    const centerX = (screenX + margin) / cell;
    const centerY = (screenY + margin) / cell;
    // This is geometric subdivision, independent of stroke width or opacity.
    // A connected, deterministic subpixel barrier leaves at most ~2 cells gap.
    grid.stamp(centerX, centerY, 1.05, owner);
  };
  function* stroke(first, second, radius, owner) {
    const steps = Math.max(1, Math.ceil(Math.hypot(second.x - first.x, second.y - first.y) / (cell * 0.6)));
    for (let index = 0; index <= steps; index++) {
      const parameter = index / steps;
      stamp(first.x + (second.x - first.x) * parameter, first.y + (second.y - first.y) * parameter, radius, owner);
      if (index % 1024 === 0) yield;
    }
  }
  function* drawBoundary(object, owner) {
    const radius = (object.strokeWidth || 2.4) / 2;
    if (isPlot(object)) {
      // Re-sample the formula deterministically; display samples can be sparse
      // or stochastic and must not dictate the snapshot's edge accuracy.
      const compiled = object.plot?.curve || object.plot?.equation;
      if (compiled) {
        const Task = object.type === 'parametric' ? ParametricTask : EquationTask;
        const task = new Task(compiled, view, width + 2 * margin, height + 2 * margin,
          object.type === 'parametric'
            ? { ...object.plot?.options, algorithm: 'adaptive', error: Math.max(.01, cell / 8), segmentLength: 1, pointSpacing: .15 }
            : { algorithm: 'marching', cellSize: 4, marchingBlocks: 4, marchingRefinement: Math.min(4, Math.ceil(Math.log2(1 / cell))), edgeIterations: 24 });
        task.segments = [];
        yield* task.iterator;
        for (let index = 0; index < task.segments.length; index += 4) {
          yield* stroke(toScreen({ x: task.segments[index], y: task.segments[index + 1] }, view, width, height),
            toScreen({ x: task.segments[index + 2], y: task.segments[index + 3] }, view, width, height), radius, owner);
        }
      } else {
        // Imported/test plot data may provide explicit, already verified segments.
        const segments = object.plot?.segments || [];
        for (let index = 0; index < segments.length; index += 4) yield* stroke(
          toScreen({ x: segments[index], y: segments[index + 1] }, view, width, height),
          toScreen({ x: segments[index + 2], y: segments[index + 3] }, view, width, height), radius, owner);
        const points = object.plot?.points || [];
        for (let index = 0; index < points.length; index += 2) {
          const position = toScreen({ x: points[index], y: points[index + 1] }, view, width, height);
          if (Number.isFinite(position.x) && Number.isFinite(position.y)) stamp(position.x, position.y, radius, owner);
          if (index % 2048 === 0) yield;
        }
      }
    } else if (isConic(object)) {
      for (const segment of conicSegments(object, view, width, height, cell / 8)) yield* stroke(segment.start, segment.finish, radius, owner);
    } else if (isLinear(object)) {
      const clipped = clipLinear(object, view, width, height, margin);
      if (clipped) yield* stroke(clipped.first, clipped.second, radius, owner);
    } else {
      const center = toScreen(object.first, view, width, height);
      const circleRadius = object.radius * view.scale;
      const start = object.type === 'circle' ? 0 : Math.atan2(object.arcStart.y - object.first.y, object.arcStart.x - object.first.x);
      const sweep = object.type === 'circle' ? 2 * Math.PI : object.sweep;
      for (let row = 0; row < rows; row++) {
        const screenY = (row + 0.5) * cell - margin;
        const relativeY = (center.y - screenY) / circleRadius;
        if (Math.abs(relativeY) <= 1) {
          const along = circleRadius * Math.sqrt(Math.max(0, (1 - relativeY) * (1 + relativeY)));
          for (const sign of [-1, 1]) {
            const screenX = center.x + sign * along;
            const angle = Math.atan2(center.y - screenY, screenX - center.x);
            const relative = sweep >= 0 ? ((angle - start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) : -(((start - angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI));
            if (object.type === 'circle' || (sweep >= 0 ? relative <= sweep : relative >= sweep)) stamp(screenX, screenY, radius, owner);
          }
        }
        if (row % 256 === 0) yield;
      }
      for (let column = 0; column < columns; column++) {
        const screenX = (column + 0.5) * cell - margin;
        const relativeX = (screenX - center.x) / circleRadius;
        if (Math.abs(relativeX) <= 1) {
          const along = circleRadius * Math.sqrt(Math.max(0, (1 - relativeX) * (1 + relativeX)));
          for (const sign of [-1, 1]) {
            const screenY = center.y - sign * along;
            const angle = Math.atan2(center.y - screenY, screenX - center.x);
            const relative = sweep >= 0 ? ((angle - start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) : -(((start - angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI));
            if (object.type === 'circle' || (sweep >= 0 ? relative <= sweep : relative >= sweep)) stamp(screenX, screenY, radius, owner);
          }
        }
        if (column % 256 === 0) yield;
      }
      if (object.type === 'sector' || object.type === 'circumSector') {
        for (const angle of [start, start + sweep]) yield* stroke(center, { x: center.x + Math.cos(angle) * circleRadius, y: center.y - Math.sin(angle) * circleRadius }, radius, owner);
      }
    }
  }
  function* flood(position) {
    const seedX = Math.floor((width / 2 + (position.x - view.x) * view.scale + margin) / cell);
    const seedY = Math.floor((height / 2 - (position.y - view.y) * view.scale + margin) / cell);
    if (seedX <= 0 || seedY <= 0 || seedX >= columns - 1 || seedY >= rows - 1) return null;
    const result = yield* grid.flood(seedX, seedY, cell, margin);
    return result ? { ...result, parents: result.parents.map(owner => curves[owner - 1].id), view: { ...view }, width, height, cell, seed: { ...position } } : null;
  }
  function* locate() {
    for (const position of candidates) {
      const result = yield* flood(position);
      if (result && (!tracking?.region || (result.parents.length === tracking.region.parents.length && tracking.region.parents.every(parent => result.parents.includes(parent))))) return result;
    }
    return null;
  }
  let best = null;
  if (mode === 'single') {
    for (let index = 0; index < curves.length; index++) {
      grid = new RegionGrid(columns, rows);
      yield* drawBoundary(curves[index], index + 1);
      yield* grid.prepare();
      const result = yield* locate();
      if (result && (!best || result.area < best.area)) best = result;
      yield;
    }
  } else {
    for (let index = 0; index < curves.length; index++) yield* drawBoundary(curves[index], index + 1);
    yield* grid.prepare();
    best = yield* locate();
  }
  if (best) best.frame = yield* boundaryFrame(curves.filter(object => best.parents.includes(object.id)));
  return best;
}

export function regionContains(region, position) {
  if (!region) return false;
  if (region.motion) position = transport(position, region.motion.to, region.motion.from);
  const screen = toScreen(position, region.view, region.width, region.height);
  for (let index = 0; index < region.rectangles.length; index += 4) {
    if (screen.x >= region.rectangles[index] && screen.x <= region.rectangles[index + 2] && screen.y >= region.rectangles[index + 1] && screen.y <= region.rectangles[index + 3]) return true;
  }
  return false;
}

export function regionScreenBounds(region, index, view, width, height) {
  if (region.motion) {
    const { from, to } = region.motion;
    const horizontal = coordinate => width / 2 + ((to.x - view.x) + ((coordinate - region.width / 2) / region.view.scale + (region.view.x - from.x)) / from.spanX * to.spanX) * view.scale;
    const vertical = coordinate => height / 2 - ((to.y - view.y) + ((region.height / 2 - coordinate) / region.view.scale + (region.view.y - from.y)) / from.spanY * to.spanY) * view.scale;
    return [horizontal(region.rectangles[index]), vertical(region.rectangles[index + 1]), horizontal(region.rectangles[index + 2]), vertical(region.rectangles[index + 3])];
  }
  const horizontal = coordinate => width / 2 + ((coordinate - region.width / 2) / region.view.scale + (region.view.x - view.x)) * view.scale;
  const vertical = coordinate => height / 2 + ((coordinate - region.height / 2) / region.view.scale - (region.view.y - view.y)) * view.scale;
  return [horizontal(region.rectangles[index]), vertical(region.rectangles[index + 1]), horizontal(region.rectangles[index + 2]), vertical(region.rectangles[index + 3])];
}

export class RegionManager {
  constructor(onChange) {
    this.onChange = onChange;
    this.entries = new Map();
    this.queries = new Set();
    this.timer = null;
    this.cursor = 0;
  }

  request(objects, seed, view, width, height, mode, tracking = null, cell = REGION_CELL) {
    return new Promise(resolve => {
      this.queries.add({ iterator: findRegion(objects, seed, view, width, height, mode, tracking, cell), resolve });
      this.schedule();
    });
  }

  async refine(id, cell = SNAPSHOT_CELL, { publish = true } = {}) {
    const entry = this.entries.get(id), target = entry?.desired;
    if (!target?.ready) return null;
    const tracking = { region: entry.lastGood || entry.result, relocate: entry.content !== target.content };
    // Refine the whole previous component even when zooming has moved its
    // boundary off screen. Subdividing just the visible crop would open it.
    let sampleView = target.view, sampleWidth = target.width, sampleHeight = target.height;
    const previous = entry.result || entry.lastGood;
    if (previous?.rectangles.length) {
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (let index = 0; index < previous.rectangles.length; index += 4) {
        const bounds = regionScreenBounds(previous, index, target.view, target.width, target.height);
        left = Math.min(left, bounds[0]); top = Math.min(top, bounds[1]);
        right = Math.max(right, bounds[2]); bottom = Math.max(bottom, bounds[3]);
      }
      if ([left, top, right, bottom].every(Number.isFinite)) {
        sampleWidth = Math.ceil(right - left + 16); sampleHeight = Math.ceil(bottom - top + 16);
        sampleView = { ...target.view,
          x: target.view.x + ((left + right) / 2 - target.width / 2) / target.view.scale,
          y: target.view.y - ((top + bottom) / 2 - target.height / 2) / target.view.scale };
      }
    }
    const result = await this.request(target.boundaries, target.seed, sampleView, sampleWidth, sampleHeight, target.mode, tracking, cell);
    if (!result || this.entries.get(id) !== entry || entry.desired?.key !== target.key) return null;
    if (publish) {
      entry.iterator = null;
      entry.result = entry.lastGood = result;
      entry.content = target.content;
      entry.attempted = target.key;
      this.onChange();
    }
    return result;
  }

  cancelQueries() {
    for (const query of this.queries) query.resolve(null);
    this.queries.clear();
  }

  sync(objects, view, width, height, plots) {
    const byId = new Map(objects.map(object => [object.id, object]));
    const measuredRegions = new Set(objects.filter(object => object.type === 'areaMeasure' && !object.hidden).map(object => object.parents[0]));
    const ids = new Set();
    for (const object of objects) {
      if (object.type !== 'region' || object.hidden && !measuredRegions.has(object.id)) continue;
      ids.add(object.id);
      const parents = object.parents.map(id => byId.get(id)).map(parent => measuredRegions.has(object.id) && parent?.hidden ? { ...parent, hidden: false } : parent);
      if (!parents.length || parents.some(parent => !parent || parent.hidden)) { this.entries.delete(object.id); continue; }
      if (!parents.every(isBoundary)) {
        const entry = this.entries.get(object.id);
        if (entry) { entry.result = null; entry.iterator = null; entry.desired = null; entry.attempted = null; }
        continue;
      }
      const content = JSON.stringify([intersectionContext(...parents), object.seed, object.mode, object.subdivision ?? REGION_CELL, parents.map(parent => [parent.strokeWidth, plots.entries.get(parent.id)?.dependencyKey, plots.entries.get(parent.id)?.configurationKey])]);
      const key = JSON.stringify([content, view, width, height]);
      const entry = this.entries.get(object.id) || { result: null };
      if (!entry.lastGood && entry.result) entry.lastGood = entry.result;
      const ready = parents.every(parent => !isPlot(parent) || plots.status(parent.id)?.done);
      if (entry.desired?.key !== key || entry.desired.ready !== ready) {
        // Retain the last complete fill while replacing obsolete work. An old
        // pan/geometry job must never flash its result into the latest view.
        if (entry.job?.key !== key) entry.iterator = null;
        const boundaries = parents.map(parent => isPlot(parent) ? { ...parent, plot: plots.entries.get(parent.id)?.task || plots.get(parent.id) } : parent);
        entry.desired = { key, content, ready, boundaries, seed: object.seed, mode: object.mode, cell: object.subdivision ?? REGION_CELL, view: { ...view }, width, height, frame: parents.every(parent => !isPlot(parent)) ? frameFromBounds(geometryBounds(parents)) : null };
      }
      this.preview(entry);
      this.start(entry);
      this.entries.set(object.id, entry);
    }
    for (const id of this.entries.keys()) if (!ids.has(id)) this.entries.delete(id);
    this.schedule();
  }

  get(id) { return this.entries.get(id)?.result; }

  preview(entry) {
    const base = entry.result && entry.lastGood;
    const target = entry.desired;
    if (base?.frame && target?.frame && entry.content !== target.content) entry.result = { ...base, motion: { from: base.frame, to: target.frame } };
    else if (entry.result?.motion) entry.result = entry.lastGood;
  }

  start(entry) {
    const target = entry.desired;
    if (entry.iterator || !target?.ready || entry.attempted === target.key) return;
    const region = entry.lastGood?.parents.length === target.boundaries.length && entry.lastGood.parents.every(parent => target.boundaries.some(boundary => boundary.id === parent)) ? entry.lastGood : null;
    const tracking = { region, relocate: entry.content !== target.content };
    entry.job = { ...target, tracking };
    entry.attempted = target.key;
    entry.iterator = findRegion(target.boundaries, target.seed, target.view, target.width, target.height, target.mode, tracking, target.cell);
  }

  schedule() {
    if (this.timer !== null || (!this.queries.size && ![...this.entries.values()].some(entry => entry.iterator))) return;
    this.timer = setTimeout(() => this.run(), 0);
  }

  run() {
    this.timer = null;
    const jobs = [...this.queries, ...[...this.entries.values()].filter(entry => entry.iterator)];
    const deadline = performance.now() + 4;
    let changed = false;
    while (jobs.length && performance.now() < deadline) {
      const index = this.cursor++ % jobs.length;
      const job = jobs[index];
      const step = job.iterator.next();
      if (step.done) {
        if (job.resolve) { this.queries.delete(job); job.resolve(step.value); }
        else {
          const completed = job.job;
          job.iterator = null;
          if (completed.key === job.desired?.key && completed.tracking.frame) job.desired.frame = completed.tracking.frame;
          if (step.value && completed.key === job.desired?.key) {
            job.result = job.lastGood = step.value;
            job.content = completed.content;
          } else if (completed.key === job.desired?.key && completed.content !== job.content) {
            this.preview(job);
            if (!outsideView(job.result, completed)) job.result = null;
          }
          this.preview(job);
          this.start(job);
          changed = true;
        }
        jobs.splice(index, 1);
      }
    }
    if (changed) this.onChange();
    this.schedule();
  }
}
