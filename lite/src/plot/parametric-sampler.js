import { EquationTask } from './sampler.js';
import { hull, isUnbounded } from './interval.js';
import { intersect } from './stuplot-interval.js';
import { normalizeParametricOptions } from './parametric-options.js';
import { clipLinear } from '../projection.js';

const mix = (lower, upper, fraction) => Math.sign(lower) === Math.sign(upper) ? lower + (upper - lower) * fraction : lower * (1 - fraction) + upper * fraction;
const finitePoint = point => Number.isFinite(point.x) && Number.isFinite(point.y);

export class ParametricTask extends EquationTask {
  constructor(curve, view, width, height, options = {}) {
    super(curve, view, width, height, options);
    this.options = normalizeParametricOptions(options);
    this.curve = curve;
    this.segments = [];
    this.pointKeys = new Set();
    this.stats.leaves = 0;
    this.stats.unboundedLeaves = 0;
    this.lattice = new Map();
    this.boxLimit = Math.min(1048576, Math.max(65536, Math.ceil((width + height) * 64)));
    this.iterator = this.trace();
  }

  sample(parameter) {
    this.stats.evaluations++;
    const world = this.curve.evaluate(parameter);
    return { world, x: this.width / 2 + (world.x - this.view.x) * this.view.scale, y: this.height / 2 - (world.y - this.view.y) * this.view.scale, parameter };
  }

  addWorldPoint(point) {
    if (!finitePoint(point)) return;
    const horizontal = this.width / 2 + (point.x - this.view.x) * this.view.scale;
    const vertical = this.height / 2 - (point.y - this.view.y) * this.view.scale;
    if (!Number.isFinite(horizontal) || !Number.isFinite(vertical) || horizontal < -4 || vertical < -4 || horizontal > this.width + 4 || vertical > this.height + 4) return;
    const key = `${Math.round(horizontal * 8)}:${Math.round(vertical * 8)}`;
    if (this.pointKeys.has(key)) return;
    this.pointKeys.add(key);
    const index = this.points.length;
    this.points.push(point.x, point.y);
    const binKey = Math.floor(vertical / 16) * this.binColumns + Math.floor(horizontal / 16);
    let bin = this.bins.get(binKey);
    if (!bin) this.bins.set(binKey, bin = []);
    bin.push(index);
  }

  *connect(first, second) {
    const clipped = clipLinear({ type: 'segment', first: first.world, second: second.world }, this.view, this.width, this.height, 2);
    if (!clipped) { this.addWorldPoint(first.world); return; }
    const steps = Math.max(1, Math.ceil(Math.hypot(clipped.second.x - clipped.first.x, clipped.second.y - clipped.first.y) / this.options.pointSpacing));
    const world = point => ({ x: this.view.x + (point.x - this.width / 2) / this.view.scale, y: this.view.y - (point.y - this.height / 2) / this.view.scale });
    const start = world(clipped.first);
    const end = world(clipped.second);
    this.segments.push(start.x, start.y, end.x, end.y);
    for (let index = 0; index <= steps; index++) {
      const fraction = index / steps;
      this.addWorldPoint({ x: mix(start.x, end.x, fraction), y: mix(start.y, end.y, fraction) });
      if (index % 32 === 0) yield;
    }
  }

  addLatticePoint(column, row, spacing) {
    const point = { x: column * spacing, y: row * spacing };
    const key = `${point.x}:${point.y}`;
    if (this.pointKeys.has(key)) return;
    this.pointKeys.add(key);
    const index = this.points.length;
    this.points.push(point.x, point.y);
    const horizontal = this.width / 2 + (point.x - this.view.x) * this.view.scale;
    const vertical = this.height / 2 - (point.y - this.view.y) * this.view.scale;
    const binKey = Math.floor(vertical / 16) * this.binColumns + Math.floor(horizontal / 16);
    let bin = this.bins.get(binKey);
    if (!bin) this.bins.set(binKey, bin = []);
    bin.push(index);
    for (const [offsetX, offsetY] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
      const neighbor = this.lattice.get(`${column + offsetX}:${row + offsetY}`);
      if (neighbor && Math.hypot((point.x - neighbor.x) * this.view.scale, (point.y - neighbor.y) * this.view.scale) <= this.options.pointSpacing * 1.5) this.segments.push(point.x, point.y, neighbor.x, neighbor.y);
    }
    this.lattice.set(`${column}:${row}`, point);
  }

  *sortPoints() {
    let source = this.points.slice();
    let target = new Array(source.length);
    let operations = 0;
    for (let stride = 2; stride < source.length; stride *= 2) {
      for (let start = 0; start < source.length; start += stride * 2) {
        const middle = Math.min(start + stride, source.length);
        const end = Math.min(start + stride * 2, source.length);
        let left = start;
        let right = middle;
        for (let destination = start; destination < end; destination += 2) {
          const takeLeft = left < middle && (right >= end || source[left] < source[right] || source[left] === source[right] && source[left + 1] <= source[right + 1]);
          const selected = takeLeft ? left : right;
          target[destination] = source[selected];
          target[destination + 1] = source[selected + 1];
          if (takeLeft) left += 2;
          else right += 2;
          if (++operations % 1024 === 0) yield;
        }
      }
      [source, target] = [target, source];
    }
    this.points = source;
    this.bins.clear();
    for (let index = 0; index < source.length; index += 2) {
      const horizontal = this.width / 2 + (source[index] - this.view.x) * this.view.scale;
      const vertical = this.height / 2 - (source[index + 1] - this.view.y) * this.view.scale;
      const key = Math.floor(vertical / 16) * this.binColumns + Math.floor(horizontal / 16);
      let bin = this.bins.get(key);
      if (!bin) this.bins.set(key, bin = []);
      bin.push(index);
      if (index % 2048 === 0) yield;
    }
    this.lattice.clear();
  }

  *traceInterval() {
    const viewport = [this.view.x - this.width / 2 / this.view.scale, this.view.x + this.width / 2 / this.view.scale,
      this.view.y - this.height / 2 / this.view.scale, this.view.y + this.height / 2 / this.view.scale];
    const intersects = (range, lower, upper) => !range.poisoned && range.parts.some(bounds => !(bounds[0] > upper || bounds[1] < lower));
    const stack = [[this.curve.tMin, this.curve.tMax, 0]];
    const leaves = [];
    const spacing = this.options.pointSpacing / this.view.scale;
    // Once both coordinates stay in one lattice cell, every deeper leaf would
    // emit the same point. Retain the grid result without visiting duplicates.
    const sameCell = (range, lower, upper) => range.continuous && range.parts.length === 1
      && range.parts[0].every(Number.isFinite)
      && range.parts[0][0] >= lower && range.parts[0][1] <= upper
      && Math.floor(range.parts[0][0] / spacing) === Math.floor(range.parts[0][1] / spacing);
    let completed = 0;
    while (stack.length) {
      if (this.stats.boxes >= this.boxLimit) { this.stats.limited = true; return; }
      const [lower, upper, depth] = stack.pop();
      const range = this.curve.intervalBoxes(lower, upper);
      this.stats.boxes++;
      if (!intersects(range.x, viewport[0], viewport[1]) || !intersects(range.y, viewport[2], viewport[3])) {
        this.stats.pruned++;
        if (range.x.poisoned || range.y.poisoned) this.stats.poisoned++;
        completed += 2 ** -depth;
      } else if (depth < this.options.maxRecursionDepth && mix(lower, upper, .5) !== lower && mix(lower, upper, .5) !== upper
        && !(sameCell(range.x, viewport[0], viewport[1]) && sameCell(range.y, viewport[2], viewport[3]))) {
        const middle = mix(lower, upper, .5);
        stack.push([lower, middle, depth + 1], [middle, upper, depth + 1]);
      } else {
        leaves.push(lower, upper);
        this.stats.leaves++;
        completed += 2 ** -depth;
      }
      this.progress = Math.min(.5, completed * .5);
      yield;
    }
    for (let index = 0; index < leaves.length; index += 2) {
      const range = this.curve.intervalBoxes(leaves[index], leaves[index + 1]);
      if (isUnbounded(range.x) || isUnbounded(range.y)) this.stats.unboundedLeaves++;
      else {
        const horizontal = intersect(range.x, viewport[0], viewport[1]);
        const vertical = intersect(range.y, viewport[2], viewport[3]);
        for (const [left, right] of horizontal.parts) for (const [bottom, top] of vertical.parts) {
          let startX = Math.ceil(left / spacing);
          let endX = Math.floor(right / spacing);
          let startY = Math.ceil(bottom / spacing);
          let endY = Math.floor(top / spacing);
          if (startX > endX) startX = endX = Math.floor((left + right) * .5 / spacing);
          if (startY > endY) startY = endY = Math.floor((bottom + top) * .5 / spacing);
          for (let column = 0; column <= endX - startX; column++) {
            for (let row = 0; row <= endY - startY; row++) {
              this.addLatticePoint(startX + column, startY + row, spacing);
              if (row % 32 === 0) yield;
            }
            yield;
          }
        }
      }
      this.progress = .5 + .49 * (index + 2) / leaves.length;
      yield;
    }
    yield* this.sortPoints();
  }

  *traceAdaptive() {
    const { tMin, tMax } = this.curve;
    const count = this.options.initialSegments;
    const stack = [];
    for (let index = count - 1; index >= 0; index--) stack.push({ lower: mix(tMin, tMax, index / count), upper: mix(tMin, tMax, (index + 1) / count), weight: 1 / count });
    let completed = 0;
    while (stack.length) {
      // Undefined intermediate input and unresolved singularities must not
      // expand a binary tree until floating-point exhaustion.
      if (this.stats.boxes >= this.boxLimit) { this.stats.limited = true; break; }
      const box = stack.pop();
      this.stats.boxes++;
      const range = this.curve.interval(box.lower, box.upper);
      const horizontal = hull(range.x);
      const vertical = hull(range.y);
      const left = this.width / 2 + (horizontal[0] - this.view.x) * this.view.scale;
      const right = this.width / 2 + (horizontal[1] - this.view.x) * this.view.scale;
      const top = this.height / 2 - (vertical[1] - this.view.y) * this.view.scale;
      const bottom = this.height / 2 - (vertical[0] - this.view.y) * this.view.scale;
      if (range.x.poisoned || range.y.poisoned || !range.x.parts.length || !range.y.parts.length || right < -3 || left > this.width + 3 || bottom < -3 || top > this.height + 3) {
        this.stats.pruned++;
        completed += box.weight;
      } else {
        const middle = mix(box.lower, box.upper, .5);
        const terminal = middle === box.lower || middle === box.upper;
        let accepted = false;
        if (range.x.continuous && range.y.continuous && Number.isFinite(right - left) && Number.isFinite(bottom - top) && Math.max(right - left, bottom - top) <= this.options.segmentLength) {
          const samples = [0, .25, .5, .75, 1].map(fraction => this.sample(mix(box.lower, box.upper, fraction)));
          if (samples.every(finitePoint)) {
            const first = samples[0];
            const last = samples[4];
            const error = Math.max(...samples.slice(1, 4).map((sample, index) => Math.hypot(sample.x - mix(first.x, last.x, (index + 1) / 4), sample.y - mix(first.y, last.y, (index + 1) / 4))));
            if (error <= this.options.error) {
              accepted = true;
              yield* this.connect(first, last);
            }
          }
        }
        if (accepted || terminal) {
          if (terminal && !accepted) this.addWorldPoint(this.sample(box.lower).world);
          completed += box.weight;
        } else {
          stack.push({ lower: middle, upper: box.upper, weight: box.weight / 2 }, { lower: box.lower, upper: middle, weight: box.weight / 2 });
        }
      }
      this.progress = Math.max(this.progress, Math.min(.999, completed));
      yield;
    }
  }

  *trace() {
    if (this.options.algorithm === 'interval') yield* this.traceInterval();
    else yield* this.traceAdaptive();
    this.done = true;
    this.progress = 1;
  }
}
