import { isFlexible, ropeNodes } from './rope.js';
import { isLiquid } from './liquid.js';
import { isSoftBody } from './soft-body.js';
import { isPoint } from './geometry.js';
import { objectOpacity } from './object-style.js';
import { isPlot, plotSourceKey } from './plot/types.js';

const scalarFields = ['type', 'x', 'y', 'angle', 'radius', 'sweep', 'scale', 'a', 'b', 'p', 'value', 'angleMode', 'approximate'];
const pointFields = ['position', 'first', 'second', 'third', 'direction', 'arcStart', 'arcEnd', 'origin', 'axis', 'anchor', 'vertex', 'firstUnit', 'secondUnit', 'labelOffset'];

function geometryState(object) {
  const state = {};
  if (object.surfaceFriction) state.surfaceFriction = object.surfaceFriction;
  if (object.surfaceRestitution) state.surfaceRestitution = object.surfaceRestitution;
  for (const key of scalarFields) if (object[key] !== undefined) state[key] = object[key];
  for (const key of pointFields) if (object[key]) state[key] = { x: object[key].x, y: object[key].y };
  if (isFlexible(object)) { state.links = structuredClone(object.links); state.anchorPoints = ropeNodes(object).filter((_,i,a)=>i===0||i===a.length-1); state.length=object.length; state.segments=object.segments; state.radius=object.radius; if(object.type==='spring'){state.coilRadius=object.coilRadius;state.turns=object.turns;} }
  if (isLiquid(object)) state.particles=structuredClone(object.particles);
  if (isSoftBody(object)) {state.mesh=object.mesh;state.nodes=structuredClone(object.nodes);state.showMesh=false;}
  if (object.type === 'physicsBody') { state.shape = object.shape; state.smoothing = object.smoothing; state.material = object.material; }
  if (object.coefficients) state.coefficients = [...object.coefficients];
  return state;
}

function freezeShape(object) {
  const shape = { ...object };
  if (object.plot) shape.plot = { points: Float64Array.from(object.plot.points) };
  if (object.region) shape.region = {
    view: { ...object.region.view }, width: object.region.width, height: object.region.height,
    rectangles: object.region.rectangles.slice(),
    motion: object.region.motion ? structuredClone(object.region.motion) : undefined,
  };
  return shape;
}

export class TraceManager {
  constructor() {
    this.samples = [];
    this.entries = new Map();
  }

  clear() {
    this.samples.length = 0;
    this.entries.clear();
  }

  archive(entry, next = null) {
    if (!entry?.current) return;
    const shape = freezeShape(entry.current);
    this.samples.push(shape);
    if (isPoint(shape) && next && isPoint(next) && (shape.x !== next.x || shape.y !== next.y)) {
      this.samples.push({ type: 'segment', historical: true, first: { x: shape.x, y: shape.y }, second: { x: next.x, y: next.y }, color: shape.color, colorType: shape.colorType, opacity: shape.opacity, strokeWidth: Math.min(shape.strokeWidth || 2.4, 2) });
    }
    entry.current = null;
  }

  sync(objects, resolved, plots, regions) {
    const active = new Set();
    for (const source of objects) {
      if (source.type === 'javascript') continue;
      if (!source.trace) continue;
      active.add(source.id);
      const object = resolved.get(source.id);
      let entry = this.entries.get(source.id);
      if (!entry) {
        entry = { key: null, current: null };
        this.entries.set(source.id, entry);
      }
      if (!object || object.hidden || object.invalid) {
        this.archive(entry);
        entry.key = null;
        continue;
      }
      const state = geometryState(object);
      let key = JSON.stringify(state);
      let payload = null;
      if (isPlot(object)) {
        const plot = plots.entries.get(source.id);
        key = JSON.stringify([object.type, plotSourceKey(object), plot?.dependencyKey]);
        if (plot?.task.points.length) payload = { plot: plot.task };
      } else if (object.type === 'region') {
        const region = regions.entries.get(source.id);
        key = region?.desired?.content ?? JSON.stringify([object.seed, object.parents]);
        if (region?.result?.rectangles.length && (region.result.motion || region.content === region.desired?.content)) payload = { region: region.result };
      } else if (object.type === 'areaMeasure') {
        const region = regions.entries.get(object.parents[0]);
        key = JSON.stringify([region?.desired?.content, object.labelOffset]);
        payload = Number.isFinite(object.value) ? {} : null;
      } else if (object.type === 'slider') {
        payload = Number.isFinite(object.value) ? {} : null;
        Object.assign(state, { type: 'point', x: object.value, y: 0 });
      } else payload = {};
      const current = payload ? { ...state, ...payload, historical: true, color: object.color ?? null, colorType: object.type, opacity: objectOpacity(object) * 0.3, strokeWidth: object.strokeWidth } : null;
      if (entry.key !== key) {
        this.archive(entry, current);
        entry.key = key;
        entry.current = current;
      } else if (current) entry.current = current;
    }
    for (const [id, entry] of this.entries) {
      if (active.has(id)) continue;
      this.archive(entry);
      this.entries.delete(id);
    }
    return this.samples;
  }
}
