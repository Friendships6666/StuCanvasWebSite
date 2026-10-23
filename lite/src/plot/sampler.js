import { containsZero, isUnbounded, nextDown, nextUp } from './interval.js';
import { refineLShade } from './lshade.js';
import { normalizeOptions } from './options.js';

const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));
const edgePairs = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [], [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [], [[1, 2]], [[1, 3]], [[0, 1]], [[3, 0]], []];

export class EquationTask {
  constructor(equation, view, width, height, options = {}) {
    this.equation = equation;
    this.view = { ...view };
    this.width = width;
    this.height = height;
    this.options = normalizeOptions(options);
    this.cellSize = this.options.algorithm === 'lshade' ? this.options.lshadeCellSize : this.options.cellSize;
    this.points = [];
    this.bins = new Map();
    this.corners = new Map();
    const intervalDepth = Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / this.cellSize)));
    const marchingDepth = Math.ceil(Math.log2(this.options.marchingBlocks)) + this.options.marchingRefinement;
    const cacheDepth = Math.min(25, intervalDepth + marchingDepth);
    this.cornerResolution = 2 ** cacheDepth;
    this.cornerScaleX = this.cornerResolution / width;
    this.cornerScaleY = this.cornerResolution / height;
    this.binColumns = Math.ceil(width / 16) + 1;
    this.stats = { boxes: 0, pruned: 0, poisoned: 0, evaluations: 0, cacheHits: 0, newtonRoots: 0, refinements: 0, verifications: 0, marchingCells: 0, marchingRefined: 0 };
    this.done = false;
    this.progress = 0;
    this.iterator = this.trace();
  }

  world(screenX, screenY) {
    return { x: this.view.x + (screenX - this.width / 2) / this.view.scale, y: this.view.y - (screenY - this.height / 2) / this.view.scale };
  }

  range(box) {
    const { x, y, scale } = this.view;
    return this.equation.interval(x + (box[0] - this.width / 2) / scale, x + (box[2] - this.width / 2) / scale,
      y - (box[3] - this.height / 2) / scale, y - (box[1] - this.height / 2) / scale);
  }

  verify(screenX, screenY, score) {
    if (!Number.isFinite(score)) return false;
    const { x: worldX, y: worldY } = this.world(screenX, screenY);
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return false;
    const epsilon = this.options.verificationRadius / this.view.scale;
    this.stats.verifications++;
    const range = this.equation.interval(nextDown(worldX - epsilon), nextUp(worldX + epsilon), nextDown(worldY - epsilon), nextUp(worldY + epsilon));
    return containsZero(range) && !isUnbounded(range);
  }

  evaluate(screenX, screenY) {
    this.stats.evaluations++;
    return this.equation.evaluate(this.view.x + (screenX - this.width / 2) / this.view.scale,
      this.view.y - (screenY - this.height / 2) / this.view.scale);
  }

  corner(screenX, screenY) {
    if (!this.cornerResolution) return this.evaluate(screenX, screenY);
    const key = this.cornerKey(screenX, screenY);
    const cached = this.corners.get(key);
    if (cached !== undefined) {
      this.stats.cacheHits++;
      return cached;
    }
    const value = this.evaluate(screenX, screenY);
    if (this.corners.size < 131072) this.corners.set(key, value);
    return value;
  }

  cornerKey(screenX, screenY) {
    return Math.round(screenY * this.cornerScaleY) * (this.cornerResolution + 1) + Math.round(screenX * this.cornerScaleX);
  }

  addPoint(screenX, screenY) {
    const worldX = this.view.x + (screenX - this.width / 2) / this.view.scale;
    const worldY = this.view.y - (screenY - this.height / 2) / this.view.scale;
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;
    const index = this.points.length;
    this.points.push(worldX, worldY);
    const key = Math.floor(screenY / 16) * this.binColumns + Math.floor(screenX / 16);
    let bin = this.bins.get(key);
    if (!bin) this.bins.set(key, bin = []);
    bin.push(index);
  }

  *refine(box) {
    let screenX = (box[0] + box[2]) / 2;
    let screenY = (box[1] + box[3]) / 2;
    for (let iteration = 0; iteration <= this.options.newtonIterations; iteration++) {
      const [value, derivativeX, derivativeY] = this.equation.gradient(this.view.x + (screenX - this.width / 2) / this.view.scale,
        this.view.y - (screenY - this.height / 2) / this.view.scale);
      this.stats.evaluations++;
      if (this.verify(screenX, screenY, Math.abs(value))) {
        this.stats.newtonRoots++;
        this.addPoint(screenX, screenY);
        return;
      }
      yield;
      if (iteration === this.options.newtonIterations) break;
      const gradientX = derivativeX / this.view.scale;
      const gradientY = -derivativeY / this.view.scale;
      const norm = Math.hypot(gradientX, gradientY);
      if (!Number.isFinite(value) || !Number.isFinite(norm) || norm === 0) break;
      const step = value / norm;
      const nextX = clamp(screenX - step * (gradientX / norm), box[0], box[2]);
      const nextY = clamp(screenY - step * (gradientY / norm), box[1], box[3]);
      if (nextX === screenX && nextY === screenY) break;
      screenX = nextX;
      screenY = nextY;
    }
    this.stats.refinements++;
    const seed = this.options.seed ^ Math.imul(Math.round(box[0] * 4096), 73856093) ^ Math.imul(Math.round(box[1] * 4096), 19349663);
    yield* refineLShade((x, y) => this.evaluate(x, y), [[box[0], box[2]], [box[1], box[3]]],
      (position, score) => {
        if (!this.verify(...position, score)) return false;
        this.addPoint(...position);
        return true;
      }, seed, this.options);
  }

  *edge(first, second, firstValue, secondValue) {
    if (firstValue === 0) return first;
    if (secondValue === 0) return second;
    if (!Number.isFinite(firstValue) || !Number.isFinite(secondValue) || (firstValue < 0) === (secondValue < 0)) return null;
    let lower = 0;
    let upper = 1;
    let lowerValue = firstValue;
    let upperValue = secondValue;
    let position;
    for (let iteration = 0; iteration <= this.options.edgeIterations; iteration++) {
      const magnitude = Math.max(Math.abs(lowerValue), Math.abs(upperValue));
      let fraction = Math.abs(lowerValue / magnitude) / (Math.abs(lowerValue / magnitude) + Math.abs(upperValue / magnitude));
      if (iteration % 3 === 2) fraction = 0.5;
      const parameter = lower + (upper - lower) * fraction;
      position = [first[0] + (second[0] - first[0]) * parameter, first[1] + (second[1] - first[1]) * parameter];
      const value = this.evaluate(...position);
      if (!Number.isFinite(value)) return null;
      if (Math.abs(value) <= this.options.tolerance) return position;
      yield;
      if ((value < 0) === (lowerValue < 0)) { lower = parameter; lowerValue = value; }
      else { upper = parameter; upperValue = value; }
    }
    return position;
  }

  *marchValues(box, corners, values) {
    this.stats.marchingCells++;
    let mask = 0;
    for (let index = 0; index < 4; index++) if (values[index] <= 0) mask |= 1 << index;
    let pairs = edgePairs[mask];
    if (mask === 5 || mask === 10) {
      const center = this.evaluate((box[0] + box[2]) / 2, (box[1] + box[3]) / 2);
      pairs = (center <= 0) === (mask === 5) ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
    }
    const crossings = new Array(4);
    for (const pair of pairs) {
      const ends = [];
      for (const edge of pair) {
        if (crossings[edge] === undefined) {
          crossings[edge] = yield* this.edge(corners[edge], corners[(edge + 1) % 4], values[edge], values[(edge + 1) % 4]);
        }
        ends.push(crossings[edge]);
      }
      if (!ends[0] || !ends[1]) continue;
      if (this.segments) {
        const first = this.world(...ends[0]), second = this.world(...ends[1]);
        this.segments.push(first.x, first.y, second.x, second.y);
      }
      const count = Math.max(1, Math.ceil(Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]) / this.options.pointSpacing));
      for (let index = 0; index <= count; index++) this.addPoint(ends[0][0] + (ends[1][0] - ends[0][0]) * index / count, ends[0][1] + (ends[1][1] - ends[0][1]) * index / count);
    }
    if (!pairs.length) for (let index = 0; index < 4; index++) if (values[index] === 0) this.addPoint(...corners[index]);
  }

  *marchCell(box, remaining) {
    const corners = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]];
    const values = corners.map(position => this.corner(position[0], position[1]));
    if (!values.every(Number.isFinite)) return;
    let mask = 0;
    for (let index = 0; index < 4; index++) if (values[index] <= 0) mask |= 1 << index;
    if (mask === 0 || mask === 15) {
      if (values.some(value => value === 0)) yield* this.marchValues(box, corners, values);
      return;
    }
    if (remaining <= 0) {
      yield* this.marchValues(box, corners, values);
      return;
    }
    this.stats.marchingRefined++;
    const middleX = (box[0] + box[2]) / 2;
    const middleY = (box[1] + box[3]) / 2;
    yield* this.marchCell([box[0], box[1], middleX, middleY], remaining - 1);
    yield* this.marchCell([middleX, box[1], box[2], middleY], remaining - 1);
    yield* this.marchCell([middleX, middleY, box[2], box[3]], remaining - 1);
    yield* this.marchCell([box[0], middleY, middleX, box[3]], remaining - 1);
  }

  *march(box) {
    const columns = this.options.marchingBlocks;
    const width = (box[2] - box[0]) / columns;
    const height = (box[3] - box[1]) / columns;
    for (let row = 0; row < columns; row++) {
      for (let column = 0; column < columns; column++) {
        const cell = [box[0] + column * width, box[1] + row * height,
          column === columns - 1 ? box[2] : box[0] + (column + 1) * width,
          row === columns - 1 ? box[3] : box[1] + (row + 1) * height];
        yield* this.marchCell(cell, this.options.marchingRefinement);
        yield;
      }
    }
  }

  *trace() {
    const stack = [[0, 0, this.width, this.height, 0]];
    const refinements = [];
    let cursor = 0;
    while (stack.length || refinements.length) {
      if (stack.length) {
        const box = stack.pop();
        this.stats.boxes++;
        const range = this.range(box);
        if (range.poisoned || !containsZero(range)) {
          if (range.poisoned) this.stats.poisoned++;
          this.stats.pruned++;
          this.progress += 4 ** -box[4];
        } else {
          const middleX = box[0] + (box[2] - box[0]) / 2;
          const middleY = box[1] + (box[3] - box[1]) / 2;
          if (Math.max(box[2] - box[0], box[3] - box[1]) <= this.cellSize || middleX === box[0] || middleX === box[2] || middleY === box[1] || middleY === box[3]) {
            if (this.options.algorithm === 'marching') {
              yield* this.march(box);
              this.progress += 4 ** -box[4];
            } else refinements.push({ iterator: this.refine(box), weight: 4 ** -box[4] });
          } else {
            const depth = box[4] + 1;
            stack.push([middleX, middleY, box[2], box[3], depth], [box[0], middleY, middleX, box[3], depth], [middleX, box[1], box[2], middleY, depth], [box[0], box[1], middleX, middleY, depth]);
          }
        }
      }
      if (refinements.length) {
        cursor %= refinements.length;
        const refinement = refinements[cursor];
        for (let iteration = 0; iteration < 16; iteration++) {
          if (refinement.iterator.next().done) {
            this.progress += refinement.weight;
            const last = refinements.pop();
            if (cursor < refinements.length) refinements[cursor] = last;
            break;
          }
          yield;
        }
        cursor++;
      }
      yield;
    }
    this.corners.clear();
    this.progress = 1;
    this.done = true;
  }

  step() { this.work = (this.work || 0) + 1; return this.iterator.next(); }

  distance(screen, view, width, height, hitRadius = 10) {
    const worldX = view.x + (screen.x - width / 2) / view.scale;
    const worldY = view.y - (screen.y - height / 2) / view.scale;
    const originalX = this.width / 2 + (worldX - this.view.x) * this.view.scale;
    const originalY = this.height / 2 - (worldY - this.view.y) * this.view.scale;
    const radius = hitRadius * this.view.scale / view.scale;
    let minimum = Infinity;
    const check = index => { minimum = Math.min(minimum, Math.hypot((this.points[index] - worldX) * view.scale, (this.points[index + 1] - worldY) * view.scale)); };
    if (radius > 64) for (let index = 0; index < this.points.length; index += 2) check(index);
    else for (let column = Math.max(0, Math.floor((originalX - radius) / 16)); column <= Math.min(this.binColumns - 1, Math.floor((originalX + radius) / 16)); column++) {
      for (let row = Math.max(0, Math.floor((originalY - radius) / 16)); row <= Math.min(Math.floor(this.height / 16), Math.floor((originalY + radius) / 16)); row++) {
        const bin = this.bins.get(row * this.binColumns + column);
        if (bin) for (const index of bin) check(index);
      }
    }
    return minimum;
  }
}
