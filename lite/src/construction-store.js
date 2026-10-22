import { jsonData } from './json-data.js';
import { shapeContours } from './physics-shape.js';
import { ConstructionCache } from './construction-cache.js';

// The store contains immutable INPUTS/operations only. Evaluated arrays stay in
// memory; the JSON graph is collected by following explicit string references.
const nodes = new Map(), keys = new Map();
export const evaluatedConstructions = new ConstructionCache();
export const constructionNode = id => nodes.get(id);
// Geometry is immutable and already shared by the renderer and solver caches.
// Exclude it BEFORE cloning; replacing it afterwards still copies every sample.
export function cloneConstructionValue(value) {
  if (!['physicsBody', 'softBody', 'rope', 'spring', 'liquid'].includes(value?.type)) return structuredClone(value);
  const { shape, mesh, ...state } = value;
  const snapshot = structuredClone(state);
  if (shape) snapshot.shape = shape;
  if (mesh) snapshot.mesh = mesh;
  return snapshot;
}
export function addConstruction(kind, parents = [], parameters = {}) {
  const node = jsonData({ kind, parents, parameters }), key = JSON.stringify(node);
  if (keys.has(key)) return keys.get(key);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < key.length; i++) { a = Math.imul(a ^ key.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ key.charCodeAt(i); }
  const prefix = `g${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
  let id = prefix, index = 0;
  while (nodes.has(id)) id = `${prefix}_${++index}`;
  const stack = [node];
  while (stack.length) {
    const value = stack.pop();
    for (const child of Object.values(value)) if (child && typeof child === 'object') stack.push(child);
    Object.freeze(value);
  }
  nodes.set(id, node); keys.set(key, id); return id;
}
export function rememberConstruction(object, id) {
  object.derivation = id;
  if (object.time === 0 && object.initialState && Object.entries(object.initialState).filter(([key]) => key !== 'derivation').every(([key, value]) => JSON.stringify(value) === JSON.stringify(object[key]))) object.initialState.derivation = id;
  const snapshot = cloneConstructionValue(object);
  evaluatedConstructions.set(id, snapshot);
  return id;
}
export function constructionDefinition(object) {
  const { shape, mesh, nodes, particles, links, initialState, derivation, ...definition } = object;
  return jsonData(definition);
}
export function rememberBodyCreation(body) {
  const loops = shapeContours(body.shape);
  if (!loops) throw new Error('Cannot recover the body contour');
  const shape = addConstruction('contour', [], { loops });
  const { derivation, ...initialState } = body.initialState || { position: body.position || { x: 0, y: 0 }, velocity: body.velocity || { x: 0, y: 0 }, angle: body.angle || 0, angularVelocity: body.angularVelocity || 0 };
  return rememberConstruction(body, addConstruction('rigid', [shape], { definition: constructionDefinition(body), initialState }));
}
export function rememberParticleCreation(object, body, kind, parameters) {
  const parent = body.derivation || rememberBodyCreation(body);
  return rememberConstruction(object, addConstruction(kind, [parent], { ...parameters, position: body.position, definition: constructionDefinition(object) }));
}
export function collectConstructions(roots) {
  const result = {}, active = new Set(), done = new Set();
  const stack = roots.map(id => [id, false]);
  while (stack.length) {
    const [id, leaving] = stack.pop();
    if (done.has(id)) continue;
    if (leaving) { active.delete(id); done.add(id); Object.defineProperty(result, id, { value: nodes.get(id), enumerable: true }); continue; }
    if (active.has(id)) throw new Error(`Construction cycle: ${id}`);
    const node = nodes.get(id); if (!node) throw new Error(`Missing construction: ${id}`);
    active.add(id); stack.push([id, true]);
    for (const parent of [...node.parents].reverse()) stack.push([parent, false]);
  }
  return result;
}
