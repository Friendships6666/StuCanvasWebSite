const finitePosition = position => Number.isFinite(position?.x) && Number.isFinite(position?.y);
const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
export const intersectionKey = object => JSON.stringify([...(object.parents || [])].sort());
export const intersectionContext = (...parents) => JSON.stringify(parents.map(parent => [parent.id, parent.type, parent.first?.x, parent.first?.y, parent.second?.x, parent.second?.y, parent.direction?.x, parent.direction?.y, parent.radius, parent.arcStart?.x, parent.arcStart?.y, parent.arcEnd?.x, parent.arcEnd?.y, parent.sweep, parent.source, parent.xSource, parent.ySource, parent.tMin, parent.tMax, parent.origin?.x, parent.origin?.y, parent.axis?.x, parent.axis?.y, parent.scale, parent.a, parent.b, parent.p, parent.coefficients, parent.plotTransform]).sort((first, second) => String(first[0]).localeCompare(String(second[0]))));

function assignCandidates(rows, candidates) {
  if (!rows.length || !candidates.length) return [];
  const columns = candidates.length + rows.length;
  const rowPotential = new Float64Array(rows.length + 1);
  const columnPotential = new Float64Array(columns + 1);
  const assigned = new Int32Array(columns + 1);
  const path = new Int32Array(columns + 1);
  for (let row = 1; row <= rows.length; row++) {
    assigned[0] = row;
    const minimum = new Float64Array(columns + 1).fill(Infinity);
    const used = new Uint8Array(columns + 1);
    let column = 0;
    do {
      used[column] = 1;
      const current = assigned[column];
      let delta = Infinity;
      let next = 0;
      for (let index = 1; index <= columns; index++) {
        if (used[index]) continue;
        const cost = index <= candidates.length ? rows[current - 1].costs[index - 1] : 1e6;
        const reduced = cost - rowPotential[current] - columnPotential[index];
        if (reduced < minimum[index]) { minimum[index] = reduced; path[index] = column; }
        if (minimum[index] < delta) { delta = minimum[index]; next = index; }
      }
      for (let index = 0; index <= columns; index++) {
        if (used[index]) { rowPotential[assigned[index]] += delta; columnPotential[index] -= delta; }
        else minimum[index] -= delta;
      }
      column = next;
    } while (assigned[column]);
    do {
      const before = path[column];
      assigned[column] = assigned[before];
      column = before;
    } while (column);
  }
  const result = [];
  for (let index = 1; index <= candidates.length; index++) {
    if (assigned[index] && rows[assigned[index] - 1].costs[index - 1] < 1e6) result.push({ object: rows[assigned[index] - 1].object, index: index - 1 });
  }
  return result;
}

export class IntersectionTracker {
  constructor() {
    this.tracks = new Map();
    this.contexts = new Map();
  }

  retain(objects) {
    const points = new Map(objects.filter(object => object.type === 'intersection').map(object => [object.id, object]));
    const reset = new Set();
    for (const [id, track] of this.tracks) {
      const object = points.get(id);
      if (!object || object !== track.object || intersectionKey(object) !== track.key) {
        this.tracks.delete(id);
        reset.add(id);
      }
    }
    const keys = new Set([...points.values()].map(intersectionKey));
    for (const key of this.contexts.keys()) if (!keys.has(key)) this.contexts.delete(key);
    return reset;
  }

  seed(object, position, time = performance.now()) {
    if (!finitePosition(position)) return;
    this.tracks.set(object.id, { object, key: intersectionKey(object), samples: [{ x: position.x, y: position.y, time }], separation: Infinity });
  }

  match(objects, positions, { previous = new Map(), scale = 1, complete = true, unambiguous = false, context, time = performance.now() } = {}) {
    const candidates = positions.filter(finitePosition);
    const matches = new Map();
    const rows = [];
    const initial = [];
    const pixel = 1 / scale;
    let normalizer = pixel;
    for (const object of objects) {
      const track = this.tracks.get(object.id);
      if (track) normalizer = Math.max(normalizer, Number.isFinite(track.separation) ? track.separation : 0, track.radius || 0);
    }
    const key = objects.length ? intersectionKey(objects[0]) : '';
    const moving = context !== undefined && this.contexts.get(key) !== context;
    if (context !== undefined) this.contexts.set(key, context);
    for (const object of objects) {
      let track = this.tracks.get(object.id);
      if (track?.key !== intersectionKey(object)) {
        this.tracks.delete(object.id);
        track = null;
      }
      if (!track && finitePosition(previous.get(object.id))) {
        this.seed(object, previous.get(object.id), time);
        track = this.tracks.get(object.id);
      }
      if (!track) {
        initial.push(object);
        continue;
      }
      track.radius ??= 24 * pixel;
      const last = track.samples.at(-1);
      const before = track.samples.at(-2);
      const recent = before && time - last.time < 250;
      const movement = recent ? distance(before, last) : 0;
      const horizon = moving && recent ? Math.min(1, Math.max(0, (time - last.time) / Math.max(1, last.time - before.time))) : 0;
      const limit = Number.isFinite(track.localSeparation) ? track.localSeparation * 0.1 : track.radius * 0.1;
      const factor = movement ? Math.min(horizon, limit / movement) : 0;
      const target = { x: last.x + (before ? last.x - before.x : 0) * factor, y: last.y + (before ? last.y - before.y : 0) * factor };
      const radius = Math.max(Number.isFinite(track.separation) ? track.separation * 0.6 : 0, track.radius, movement * 2);
      const costs = candidates.map(candidate => {
        const offset = distance(last, candidate);
        if (offset > radius && !moving && !(unambiguous && candidates.length === 1)) return 1e9;
        return Math.min(1e5, (offset + distance(target, candidate) * 0.05) / Math.max(normalizer, Number.MIN_VALUE));
      });
      rows.push({ object, costs });
      if (!complete) matches.set(object.id, { x: last.x, y: last.y });
    }
    const used = new Set();
    const accept = (object, index) => {
      const position = candidates[index];
      let track = this.tracks.get(object.id);
      if (!track) {
        this.seed(object, position, time);
        track = this.tracks.get(object.id);
      }
      track.radius ??= 24 * pixel;
      const last = track.samples.at(-1);
      if (position.x !== last.x || position.y !== last.y) {
        track.samples.push({ x: position.x, y: position.y, time });
        if (track.samples.length > 2) track.samples.shift();
      }
      let separation = Infinity;
      for (const [other, candidate] of candidates.entries()) {
        if (other !== index) separation = Math.min(separation, distance(position, candidate));
      }
      if (Number.isFinite(separation) && separation > 0) track.separation = Number.isFinite(track.separation) ? Math.max(track.separation, separation) : separation;
      track.localSeparation = separation;
      matches.set(object.id, position);
      used.add(index);
    };
    for (const edge of assignCandidates(rows, candidates)) accept(edge.object, edge.index);
    for (const object of initial) {
      if (candidates[object.branch] && !used.has(object.branch)) accept(object, object.branch);
    }
    return matches;
  }
}
