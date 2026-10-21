import { createDocument, documentKey, objectDefinition, parseDocument, setConstructionCodec } from './document.js';
import { jsonData } from './json-data.js';
import { addConstruction, constructionNode, evaluatedConstructions, rememberConstruction, rememberBodyCreation, constructionDefinition, collectConstructions } from './construction-store.js';
import { PhysicsWorld, bodyState, instantiateRegion, isPhysicsObject } from './physics.js';
import { softFromBody } from './soft-body.js';
import { liquidFromBody } from './liquid.js';
import { isFlexible, rebuildRope, anchorWorld } from './rope.js';
import { resolveObjects } from './geometry.js';
import { findRegion } from './regions.js';
import { trimCadSources, cadPrimitives } from './cad.js';
import { syncPhysicsBoundaries } from './physics-boundaries.js';
import { isPlot } from './plot/types.js';
import { compileEquation } from './plot/formula.js';
import { compileParametric } from './plot/parametric-formula.js';
import { EquationTask } from './plot/sampler.js';
import { ParametricTask } from './plot/parametric-sampler.js';
import { formulaParameters } from './reflection.js';
import { LocalizedError } from './i18n.js';
import { ConstructionCache } from './construction-cache.js';

const values = new ConstructionCache(), simulationValues = new ConstructionCache(), sceneValues = new ConstructionCache({ maxEntries: 8 });
const sampleField = object => object.type === 'softBody' ? 'nodes' : object.type === 'liquid' ? 'particles' : isFlexible(object) ? 'links' : null;
const fail = path => { throw new LocalizedError('error.documentValue', { path }); };
const clone = value => {
  const next = structuredClone(value);
  if (isPhysicsObject(value)) for (const key of ['shape', 'mesh']) if (value[key]) next[key] = value[key];
  return next;
};
const stripRef = state => { const { derivation, ...rest } = state; return rest; };
const same = (a, b) => documentKey(a) === documentKey(b);
function finish(iterator) { let next; do { next = iterator.next(); } while (!next.done); return next.value; }

function shapeFromLoops(loops) {
  if (!Array.isArray(loops) || !loops.length || loops.some(loop => !Array.isArray(loop) || loop.length < 3 || loop.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)))) fail('construction.contour');
  const edges = loops.flatMap(loop => loop.map((p, i) => [p, loop[(i + 1) % loop.length]]));
  if (edges.some(([a, b]) => a.x !== b.x && a.y !== b.y)) fail('construction.contour.axis');
  const ys = [...new Set(loops.flat().map(p => p.y))].sort((a, b) => a - b), rectangles = [];
  for (let i = 1; i < ys.length; i++) {
    const low = ys[i - 1], high = ys[i], y = (low + high) / 2;
    const xs = edges.filter(([a, b]) => a.x === b.x && Math.min(a.y, b.y) < y && Math.max(a.y, b.y) > y).map(([a]) => a.x).sort((a, b) => a - b);
    if (xs.length % 2) fail('construction.contour.closed');
    for (let j = 0; j < xs.length; j += 2) if (xs[j] < xs[j + 1]) rectangles.push([xs[j], low, xs[j + 1], high]);
  }
  if (!rectangles.length) fail('construction.contour.empty');
  return { rectangles };
}

function geometricObjects(definitions, plotRecipes = {}, fullPlots = false) {
  const objects = [...resolveObjects(definitions).values()], parameters = formulaParameters(definitions);
  return trimCadSources(objects).flatMap(cadPrimitives).map(object => {
    if (!isPlot(object) || object.invalid) return object;
    const compiled = object.type === 'parametric' ? compileParametric(object, parameters) : compileEquation(object.source, parameters);
    const recipe = plotRecipes[object.id];
    if (!fullPlots || !recipe) return { ...object, plot: object.type === 'parametric' ? { curve: compiled } : { equation: compiled } };
    if (!Number.isFinite(recipe.view?.x) || !Number.isFinite(recipe.view?.y) || !Number.isFinite(recipe.view?.scale) || recipe.view.scale <= 0 || !Number.isFinite(recipe.width) || recipe.width <= 0 || !Number.isFinite(recipe.height) || recipe.height <= 0 || !Number.isSafeInteger(recipe.work) || recipe.work < 0) fail(`construction.scene.plots.${object.id}`);
    const Task = object.type === 'parametric' ? ParametricTask : EquationTask;
    const task = new Task(compiled, recipe.view, recipe.width, recipe.height, recipe.options);
    for (let i = 0; i < recipe.work && !task.done; i++) task.step();
    return { ...object, plot: task };
  });
}

// Freeze a region's defining DAG and the exact sampling frame, never its flood
// pixels. The snapshot survives later source edits/deletion without live links.
export function rememberRegionConstruction(object, source, definitions, region, mode, instance = { view: region.view, width: region.width, height: region.height }) {
  const all = new Map(definitions.map(item => [item.id, item]));
  const ids = new Set(definitions.filter(item => ['slider', 'javascript'].includes(item.type)).map(item => item.id));
  function visit(id) { if (ids.has(id)) return; ids.add(id); for (const parent of all.get(id)?.parents || []) visit(parent); }
  visit(source.id);
  const snapshot = createDocument(definitions.filter(item => ids.has(item.id) && !isPhysicsObject(item)));
  const regionNode = addConstruction('region', [], { document: snapshot, regionId: source.id,
    seed: region.seed, mode: source.mode, view: region.view, width: region.width, height: region.height, cell: region.cell, instance });
  const bodyNode = addConstruction('rigid', [regionNode], { definition: mode === 'rigid' ? constructionDefinition(object) : {} });
  const id = mode === 'rigid' ? bodyNode : addConstruction(mode, [bodyNode], { definition: constructionDefinition(object),
    ...(mode === 'soft' ? { subdivisions: object.mesh.subdivisions } : { count: object.particleCount }) });
  rememberConstruction(object, id);
}

function offsets(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length || !before.length) return null;
  const delta = {};
  for (const field of ['position', 'velocity']) {
    delta[field] = { x: after[0][field].x - before[0][field].x, y: after[0][field].y - before[0][field].y };
    if (before.some((item, i) => ['x', 'y'].some(axis => Math.abs(after[i][field][axis] - item[field][axis] - delta[field][axis]) > 1e-9))) return null;
  }
  for (const field of ['angle', 'angularVelocity']) if (Object.hasOwn(before[0], field)) {
    delta[field] = after[0][field] - before[0][field];
    if (before.some((item, i) => Math.abs(after[i][field] - item[field] - delta[field]) > 1e-9)) return null;
  }
  return delta;
}
function translate(states, delta) {
  return states.map(item => {
    const next = clone(item);
    for (const field of ['position', 'velocity']) for (const axis of ['x', 'y']) next[field][axis] += delta[field][axis];
    for (const field of ['angle', 'angularVelocity']) if (Object.hasOwn(delta, field)) next[field] += delta[field];
    return next;
  });
}

export function captureConstruction(object, objects = []) {
  let id = object.derivation, before = evaluatedConstructions.get(id);
  if (!before && id && constructionNode(id)) {
    before = expandDocument({ objects: [{ id: object.id, type: object.type, derivation: id }], constructionGraph: collectConstructions([id]) }).objects[0];
  }
  if (!before) {
    if (object.type === 'physicsBody') { rememberBodyCreation(object); id = object.derivation; before = evaluatedConstructions.get(id); }
    else if (isFlexible(object)) {
      const byId = new Map(objects.map(item => [item.id, item]));
      const positions = object.anchors.map(anchor => anchorWorld(anchor, byId));
      if (positions.some(p => !p)) fail(`${object.id}.anchors`);
      id = addConstruction('rope', [], { definition: constructionDefinition(object), positions });
      // Existing ropes may have evolved. Only accept a reproducible initial
      // shape here; newer ropes always acquire a source before simulation.
      const rebuilt = clone(object); rebuildRope(rebuilt, new Map(byId));
      if (!same(rebuilt.links, object.links)) throw new LocalizedError('project.missingRecipe', { id: object.id });
      rememberConstruction(object, id); before = evaluatedConstructions.get(id);
    } else throw new LocalizedError('project.missingRecipe', { id: object.id });
  }
  const a = { ...before }, b = { ...object }; delete a.derivation; delete b.derivation;
  if (same(a, b)) return id;
  const field = sampleField(object), parameters = { definition: constructionDefinition(object) }, parents = [id];
  if (field && !same(before[field], object[field])) {
    parameters.motion = offsets(before[field], object[field]);
    if (!parameters.motion) {
      // Rebuilding a rope is a fresh construction rather than particle edits.
      if (isFlexible(object)) { const fresh = { ...object }; delete fresh.derivation; const ref = captureConstruction(fresh, objects); return rememberConstruction(object, ref); }
      throw new LocalizedError('project.missingRecipe', { id: object.id });
    }
  }
  if (field && !same(stripRef(before.initialState), stripRef(object.initialState))) {
    const initialRef = object.initialState.derivation;
    if (initialRef && constructionNode(initialRef)) {
      parents.push(initialRef); parameters.initialFrom = 1;
      const base = evaluatedConstructions.get(initialRef);
      if (base && !same(base[field], object.initialState[field])) {
        parameters.initialMotion = offsets(base[field], object.initialState[field]);
        if (!parameters.initialMotion) throw new LocalizedError('project.missingRecipe', { id: object.id });
      }
    }
    else if (same(object.initialState[field], before[field])) parameters.resetInitial = true;
    else { parameters.initialMotion = offsets(before.initialState[field], object.initialState[field]); if (!parameters.initialMotion) throw new LocalizedError('project.missingRecipe', { id: object.id }); }
  }
  if (!field) {
    parameters.initialState = stripRef(object.initialState);
    if (!same(object.shape, before.shape)) { const fresh = { ...object }; delete fresh.derivation; rememberBodyCreation(fresh); return rememberConstruction(object, fresh.derivation); }
  }
  return rememberConstruction(object, addConstruction('edit', parents, parameters));
}

export function compactDocument(document) {
  const roots = [];
  const objects = document.objects.map(object => {
    if (!isPhysicsObject(object)) {
      const { plot, rectangles, region, ...definition } = object;
      return jsonData(definition);
    }
    const derivation = captureConstruction(object, document.objects); roots.push(derivation);
    return { ...constructionDefinition(object), derivation };
  });
  const { constructionGraph, ...rest } = document;
  return jsonData({ ...rest, objects, ...(roots.length ? { constructionGraph: collectConstructions(roots) } : {}) });
}

// A simulation step is one operation on a WORLD, so collisions and force drags
// replay together. No particle state, solver cache or contact back-reference is
// stored. References in timeline snapshots allow seeking/branching this DAG.
export function recordConstructionStep(world, objects, scene, seconds) {
  const physical = objects.filter(isPhysicsObject);
  const inputs = physical.map(object => captureConstruction(object, [...scene.definitions, ...objects]));
  const context = addConstruction('scene', [], scene);
  const previous = world.constructionPrevious;
  const parents = [context, ...inputs];
  const parameters = { seconds, ids: physical.map(object => object.id), drag: world.drag ? jsonData(world.drag) : null };
  if (previous && constructionNode(previous)) { parameters.previous = parents.length; parents.push(previous); }
  const step = addConstruction('simulate', parents, parameters);
  return () => {
    const outputs = new Map();
    for (const object of physical) {
      const ref = addConstruction('result', [step], { id: object.id });
      rememberConstruction(object, ref); outputs.set(object.id, clone(object));
    }
    simulationValues.set(step, outputs); world.constructionPrevious = step;
  };
}

// Pausing, changing an obstacle, or creating another object can synchronize the
// solver between steps. Record those transitions too: static/dynamic changes
// reset Matter's integration state even when no elapsed time is advanced.
export function recordConstructionSync(world, objects, scene) {
  const physical = objects.filter(isPhysicsObject);
  if (!physical.length) { world.constructionPrevious = null; world.constructionSyncKey = null; return; }
  const inputs = physical.map(object => captureConstruction(object, [...scene.definitions, ...objects]));
  const context = addConstruction('scene', [], scene);
  const key = JSON.stringify([context, inputs]);
  if (world.constructionSyncKey === key) return;
  const parents = [context, ...inputs], parameters = { ids: physical.map(object => object.id) };
  if (world.constructionPrevious && constructionNode(world.constructionPrevious)) {
    parameters.previous = parents.length; parents.push(world.constructionPrevious);
  }
  world.constructionPrevious = addConstruction('synchronize', parents, parameters);
  world.constructionSyncKey = key;
}

function checkedGraph(graph) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) fail('constructionGraph');
  const kinds = new Set(['contour', 'region', 'rigid', 'soft', 'liquid', 'rope', 'edit', 'scene', 'synchronize', 'simulate', 'result']);
  const entries = Object.entries(graph), counts = new Map(), children = new Map(entries.map(([id]) => [id, []]));
  for (const [id, node] of entries) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || !node || !kinds.has(node.kind) || !Array.isArray(node.parents) || !node.parameters || typeof node.parameters !== 'object' || Array.isArray(node.parameters)) fail(`constructionGraph.${id}`);
    counts.set(id, new Set(node.parents).size);
    for (const parent of new Set(node.parents)) { if (typeof parent !== 'string' || !children.has(parent)) fail(`constructionGraph.${id}.parents`); children.get(parent).push(id); }
  }
  const order = entries.filter(([id]) => counts.get(id) === 0).map(([id]) => id);
  for (let i = 0; i < order.length; i++) for (const child of children.get(order[i])) { counts.set(child, counts.get(child) - 1); if (!counts.get(child)) order.push(child); }
  if (order.length !== entries.length) throw new LocalizedError('error.documentCycle', { ids: entries.filter(([id]) => counts.get(id)).map(([id]) => id).join(', ') });
  const mapping = new Map();
  for (const id of order) { const node = graph[id]; mapping.set(id, addConstruction(node.kind, node.parents.map(parent => mapping.get(parent)), node.parameters)); }
  return mapping;
}

export function expandDocument(document) {
  if (!document.constructionGraph) return document;
  const mapping = checkedGraph(document.constructionGraph);
  const sessionWorlds = new Map();
  function evaluate(id) {
    if (evaluatedConstructions.has(id)) return clone(evaluatedConstructions.get(id));
    if (values.has(id)) return clone(values.get(id));
    const node = constructionNode(id); if (!node) fail(`constructionGraph.${id}`);
    const p = node.parameters; let value;
    if (node.kind === 'contour') value = { shape: shapeFromLoops(p.loops), position: { x: 0, y: 0 } };
    else if (node.kind === 'region') {
      const source = parseDocument(JSON.stringify(p.document));
      if (source.constructionGraph || source.objects.some(isPhysicsObject)) fail('construction.region.document');
      const region = source.objects.find(object => object.id === p.regionId && object.type === 'region');
      if (!region || !Number.isFinite(p.cell) || p.cell <= 0 || p.cell > 1 || !Number.isFinite(p.view?.scale) || p.view.scale <= 0 || !Number.isFinite(p.width) || p.width <= 0 || !Number.isFinite(p.height) || p.height <= 0) fail('construction.region');
      const geometry = geometricObjects(source.objects);
      const area = finish(findRegion(geometry.filter(item => region.parents.includes(item.id)), p.seed || region.seed, p.view, p.width, p.height, p.mode || region.mode, null, p.cell));
      if (!area) fail('construction.region.closed');
      const frame = p.instance || p;
      if (!Number.isFinite(frame.view?.x) || !Number.isFinite(frame.view?.y) || !Number.isFinite(frame.view?.scale) || frame.view.scale <= 0 || !Number.isFinite(frame.width) || !Number.isFinite(frame.height)) fail('construction.region.instance');
      value = instantiateRegion(area, frame.view, frame.width, frame.height);
    } else if (node.kind === 'rigid') {
      if (node.parents.length !== 1) fail('construction.rigid.parents');
      const input = evaluate(node.parents[0]);
      const template = instantiateRegion({ rectangles: [-.5, -.5, .5, .5], view: { x: 0, y: 0, scale: 1 }, width: 0, height: 0 }, { x: 0, y: 0, scale: 1 }, 0, 0);
      value = { ...template, ...input, ...clone(p.definition) };
      delete value.derivation; value.initialState = p.initialState ? clone(p.initialState) : stripRef(bodyState(value));
    } else if (node.kind === 'soft' || node.kind === 'liquid') {
      if (node.parents.length !== 1) fail(`construction.${node.kind}.parents`);
      const body = evaluate(node.parents[0]);
      if (p.position) body.position = clone(p.position);
      value = node.kind === 'soft' ? softFromBody(body, p.subdivisions) : liquidFromBody(body, p.count);
      if (!value) fail(`construction.${node.kind}`);
      Object.assign(value, clone(p.definition)); delete value.derivation;
    } else if (node.kind === 'rope') {
      value = clone(p.definition);
      if (!Array.isArray(p.positions) || p.positions.length !== 2) fail('construction.rope.positions');
      const anchors = value.anchors;
      value.anchors = p.positions.map(point => ({ objectId: null, point })); rebuildRope(value, new Map());
      Object.assign(value, clone(p.definition)); value.anchors = anchors;
    } else if (node.kind === 'edit') {
      if (!node.parents.length) fail('construction.edit.parents');
      value = { ...evaluate(node.parents[0]), ...clone(p.definition) };
      const field = sampleField(value);
      if (field && p.motion) value[field] = translate(value[field], p.motion);
      if (p.initialFrom !== undefined) value.initialState = stripRef(bodyState(evaluate(node.parents[p.initialFrom])));
      else if (p.resetInitial) value.initialState = stripRef(bodyState(evaluate(node.parents[0])));
      else if (p.initialState) value.initialState = clone(p.initialState);
      if (field && p.initialMotion) value.initialState = { [field]: translate(value.initialState[field], p.initialMotion) };
    } else if (node.kind === 'result') {
      if (node.parents.length !== 1) fail('construction.result.parents');
      value = clone(simulate(node.parents[0]).outputs.get(p.id)); if (!value) fail('construction.result.id');
    } else fail(`constructionGraph.${id}.kind`);
    if (isPhysicsObject(value)) rememberConstruction(value, id);
    else values.set(id, clone(value));
    return clone(value);
  }
  function sceneFor(id, objects) {
    if (!sceneValues.has(id)) {
      const node = constructionNode(id); if (node?.kind !== 'scene') fail('construction.simulate.scene');
      const p = node.parameters;
      if (!Array.isArray(p.definitions) || p.definitions.some(isPhysicsObject) || !Number.isFinite(p.view?.x) || !Number.isFinite(p.view?.y) || !Number.isFinite(p.view?.scale) || p.view.scale <= 0 || !Number.isFinite(p.width) || !Number.isFinite(p.height)) fail('construction.scene');
      parseDocument(JSON.stringify({ format: 'stucanvas-lite', version: 1, objects: p.definitions }));
      sceneValues.set(id, { ...p, geometry: geometricObjects(p.definitions, p.plots, true) });
    }
    return sceneValues.get(id);
  }
  function simulate(id, needWorld = false) {
    if (!needWorld && simulationValues.has(id)) return { outputs: simulationValues.get(id) };
    const node = constructionNode(id); if (!['simulate', 'synchronize'].includes(node?.kind)) fail('construction.simulate');
    const p = node.parameters;
    if (!Array.isArray(p.ids) || node.parents.length < p.ids.length + 1) fail('construction.simulate.parameters');
    const chain = [];
    let cursor = id, session = null;
    while (cursor) {
      const existing = sessionWorlds.get(cursor);
      if (existing?.last === cursor) { session = existing; break; }
      const current = constructionNode(cursor);
      if (!['simulate', 'synchronize'].includes(current?.kind)) fail('construction.simulate.previous');
      chain.push([cursor, current]);
      cursor = current.parameters.previous === undefined ? null : current.parents[current.parameters.previous];
    }
    session ||= { world: new PhysicsWorld(), last: null };
    for (const [stepId, current] of chain.reverse()) {
      const input = current.parameters;
      if (current.kind === 'simulate' && (!Number.isFinite(input.seconds) || input.seconds <= 0 || input.seconds > 1)) fail('construction.simulate.seconds');
      if (!Array.isArray(input.ids) || current.parents.length < input.ids.length + 1) fail('construction.simulate.parameters');
      const objects = input.ids.map((name, index) => ({ ...evaluate(current.parents[index + 1]), id: name }));
      const scene = sceneFor(current.parents[0], objects);
      session.world.anchors = resolveObjects([...scene.definitions, ...objects]);
      syncPhysicsBoundaries(session.world, [...scene.geometry, ...objects], scene.view, scene.width, scene.height);
      session.world.syncBodies(objects);
      if (current.kind === 'simulate') { session.world.drag = clone(input.drag); session.world.step(input.seconds); }
      const outputs = new Map(current.kind === 'simulate' ? objects.map(object => [object.id, clone(object)]) : []);
      simulationValues.set(stepId, outputs); session.last = stepId; sessionWorlds.set(stepId, session);
    }
    return { session, outputs: simulationValues.get(id) };
  }
  // Evaluate in topological order so long recordings never consume the JS call
  // stack. The same order checks all recipes, including unused imported nodes.
  for (const id of mapping.values()) {
    const kind = constructionNode(id).kind;
    if (kind === 'simulate' || kind === 'synchronize') simulate(id);
    else if (kind !== 'scene') evaluate(id);
  }

  const { constructionGraph, ...rest } = document;
  const objects = document.objects.map(object => {
    if (!isPhysicsObject(object)) return object;
    const id = mapping.get(object.derivation); if (!id) fail(`${object.id}.derivation`);
    const state = evaluate(id);
    if (state.type !== object.type) fail(`${object.id}.type`);
    return { ...state, ...object, derivation: id };
  });
  return { ...rest, objects };
}

setConstructionCodec({
  parse(document) {
    const expanded = expandDocument(document);
    const validated = parseDocument(JSON.stringify(expanded));
    return { ...document, timeline: validated.timeline, objects: validated.objects.map((object, index) => isPhysicsObject(object)
      ? { ...constructionDefinition(object), derivation: document.objects[index].derivation } : object) };
  },
});
