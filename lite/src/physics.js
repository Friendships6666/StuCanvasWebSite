import { isFlexible, ropeState } from './rope.js';
import { isSoftBody, softState } from './soft-body.js';
import { syncSoftBodies, applySoftForces, readSoftBodies, bindSoftSurface } from './soft-physics.js';
import { isLiquid, liquidState, liquidFromBody } from './liquid.js';
import { syncLiquids, applyLiquidForces, readLiquids } from './liquid-physics.js';
import { startDrag, dragGuide, applyDrag } from './physics-drag.js';
import { syncRopes, readRopes } from './rope-physics.js';
import { regionScreenBounds } from './regions.js';
import { frictionAt } from './surface-friction.js';
import { restitutionAt } from './surface-restitution.js';
import { installContactFriction } from './physics-contact-friction.js';
import { defaultPhysicsMaterial } from './physics-material.js';
import { bodyGeometry, polygonContains } from './physics-shape.js';
import { rememberBodyCreation } from './construction-store.js';

const Matter = globalThis.Matter || (await import('../node_modules/matter-js/build/matter.js')).default;
const { Engine, Bodies, Body, Composite, Detector, Pairs, Vertices } = Matter;
installContactFriction(Matter);
// A fixed engine scale keeps simulation independent of canvas zoom and DPI.
const SCALE = 50;
export const PHYSICS_STEP = 1 / 120;
export const isPhysicsBody = object => object?.type === 'physicsBody';
export const isPhysicsObject = object => isPhysicsBody(object) || isFlexible(object) || isLiquid(object) || isSoftBody(object);
const bodyKey = object => JSON.stringify([object.position, object.angle, object.velocity, object.angularVelocity, object.mass, object.restitution, object.airFriction, object.running, object.hidden, object.playbackRate]);
export const bodyState = object => ({ ...(isSoftBody(object) ? softState(object) : isLiquid(object) ? liquidState(object) : isFlexible(object) ? ropeState(object) : structuredClone({ position: object.position, velocity: object.velocity, angle: object.angle, angularVelocity: object.angularVelocity })), ...(object.derivation ? { derivation: object.derivation } : {}) });

// Matter's standard filter remains authoritative. The extra IDs allow arbitrary
// exclusions without the engine's 32 collision-category limit.
const ropeAllowsCollision = (rope, other) => !['rope','liquid','soft'].includes(rope.kind) || (['body','rope','liquid','soft'].includes(other.kind) ? rope.collideBodies : rope.collideGeometry);
const canCollide = Detector.canCollide;
Detector.canCollide = (first, second) => canCollide(first, second)
  && !first.ignored?.includes(second.objectId) && !second.ignored?.includes(first.objectId)
  && !(first.kind === 'rope' && second.kind === 'rope' && first.objectId === second.objectId)
  && !(first.kind === 'liquid' && second.kind === 'liquid')
  && !(first.kind === 'soft' && second.kind === 'soft' && first.objectId === second.objectId && (!first.selfCollision || first.neighbors.includes(second.node)))
  && ropeAllowsCollision(first, second) && ropeAllowsCollision(second, first)
  && !(first.freeFall && second.objectId === '$viewportBottom')
  && !(second.freeFall && first.objectId === '$viewportBottom');

export function instantiateRegion(region, view, width, height) {
  if (!region?.rectangles.length) return null;
  const rectangles = [];
  let area = 0, x = 0, y = 0;
  for (let index = 0; index < region.rectangles.length; index += 4) {
    const [left, top, right, bottom] = regionScreenBounds(region, index, view, width, height);
    const rectangle = [view.x + (left - width / 2) / view.scale, view.y + (height / 2 - bottom) / view.scale,
      view.x + (right - width / 2) / view.scale, view.y + (height / 2 - top) / view.scale];
    const weight = (rectangle[2] - rectangle[0]) * (rectangle[3] - rectangle[1]);
    if (!(weight > 0) || !rectangle.every(Number.isFinite)) continue;
    area += weight; x += (rectangle[0] + rectangle[2]) / 2 * weight; y += (rectangle[1] + rectangle[3]) / 2 * weight;
    rectangles.push(rectangle);
  }
  if (!area) return null;
  const position = { x: x / area, y: y / area };
  const object = {
    type: 'physicsBody', parents: [],
    shape: { rectangles: rectangles.map(([left, bottom, right, top]) => [left - position.x, bottom - position.y, right - position.x, top - position.y]) },
    position, smoothing: 0, angle: 0, velocity: { x: 0, y: 0 }, angularVelocity: 0,
    gravity: { x: 0, y: -9.81 }, mass: 1, surfaceFriction: [], surfaceRestitution: [], restitution: 0, airFriction: 0,
    freeFall: false, ignored: [], running: false, time: 0, duration: 0, playbackRate: 1, opacity: 1,
    material: defaultPhysicsMaterial(),
  };
  object.initialState = bodyState(object);
  rememberBodyCreation(object);
  return object;
}

export function bodyContains(object, point) {
  const x = point.x - object.position.x, y = point.y - object.position.y;
  const cosine = Math.cos(object.angle), sine = Math.sin(object.angle);
  const localX = x * cosine + y * sine, localY = -x * sine + y * cosine;
  const geometry = bodyGeometry(object);
  if (geometry.polygons) return geometry.polygons.some(polygon => polygonContains(polygon, { x: localX, y: localY }));
  return object.shape.rectangles.some(([left, bottom, right, top]) => localX >= left && localX <= right && localY >= bottom && localY <= top);
}

export function bodyRectangles(object) {
  const cosine = Math.cos(object.angle), sine = Math.sin(object.angle);
  return object.shape.rectangles.map(([left, bottom, right, top]) => ({
    x: object.position.x + (left + right) / 2 * cosine - (bottom + top) / 2 * sine,
    y: object.position.y + (left + right) / 2 * sine + (bottom + top) / 2 * cosine,
    width: right - left, height: top - bottom, angle: object.angle,
  }));
}

export class PhysicsWorld {
  constructor() {
    this.engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 }, positionIterations: 10, velocityIterations: 8, constraintIterations: 8, enableSleeping: false });
    this.bodies = new Map();
    this.ropes = new Map();
    this.liquids = new Map();
    this.softBodies = new Map();
    this.anchors = new Map();
    this.boundaries = new Map();
    this.accumulator = 0;
    this.lastFrame = null;
    this.drag = null;
  }
  beginDrag(id, point) { return startDrag(this, id, point, SCALE); }
  moveDrag(point) { if (this.drag) this.drag.target = { ...point }; }
  endDrag() { this.drag = null; }
  dragGuide() { return dragGuide(this, SCALE); }
  invalidate() {
    this.constructionPrevious = null;
    this.constructionSyncKey = null;
    this.endDrag();
    Composite.clear(this.engine.world, false);
    Engine.clear(this.engine);
    this.bodies.clear(); this.ropes.clear(); this.liquids.clear(); this.softBodies.clear(); this.boundaries.clear();
    this.lastFrame = null; this.accumulator = 0;
  }
  syncBodies(objects) {
    const ids = new Set();
    for (const object of objects.filter(isPhysicsBody)) {
      ids.add(object.id);
      let entry = this.bodies.get(object.id);
      const geometry = bodyGeometry(object);
      if (!entry || entry.geometry !== geometry) {
        if (entry) { Composite.remove(this.engine.world, entry.body); Pairs.clear(this.engine.pairs); }
        const parts = geometry.polygons ? geometry.polygons.map(polygon => {
          const vertices = Vertices.clockwiseSort(polygon.map(point => ({ x: point.x * SCALE, y: -point.y * SCALE })));
          return Body.create({ position: Vertices.centre(vertices), vertices, slop: .005 });
        }) : object.shape.rectangles.map(([left, bottom, right, top]) => Bodies.rectangle(
          (left + right) / 2 * SCALE, -(bottom + top) / 2 * SCALE, (right - left) * SCALE, (top - bottom) * SCALE,
          { chamfer: null, slop: .005 }));
        const body = Body.create({ parts, frictionAir: 0, slop: .005 });
        // Local shape coordinates may be edited in JSON; preserve their origin.
        entry = { body, shape: object.shape, geometry, center: { ...body.position }, key: null };
        this.bindSurface(entry);
        this.bodies.set(object.id, entry);
        Composite.add(this.engine.world, body);
      }
      const key = bodyKey(object);
      const body = entry.body;
      body.collisionFilter.mask = object.hidden ? 0 : 0xFFFFFFFF;
      body.collisionFilter.objectId = object.id;
      body.collisionFilter.kind = 'body';
      body.collisionFilter.ignored = object.ignored;
      body.collisionFilter.freeFall = object.freeFall;
      if (entry.key !== key) {
        Body.setStatic(body, false);
        Body.setMass(body, object.mass);
        for (const part of body.parts) {
          part.friction = 0; part.frictionStatic = 0;
          part.restitution = object.restitution; part.frictionAir = object.airFriction;
        }
        Body.setAngle(body, -object.angle);
        const cosine = Math.cos(-object.angle), sine = Math.sin(-object.angle);
        Body.setPosition(body, { x: object.position.x * SCALE + entry.center.x * cosine - entry.center.y * sine, y: -object.position.y * SCALE + entry.center.x * sine + entry.center.y * cosine });
        Body.setVelocity(body, { x: object.velocity.x * SCALE / 60, y: -object.velocity.y * SCALE / 60 });
        Body.setAngularVelocity(body, -object.angularVelocity / 60);
        body.timeScale = object.playbackRate;
        if (!object.running || object.hidden) Body.setStatic(body, true);
        entry.key = key;
      }
      entry.object = object;
      if(!entry.buoyancySamples) {
        const samples=liquidFromBody({...object,position:{x:0,y:0}},48);
        entry.buoyancyVolume=samples.volume;
        entry.buoyancySamples=samples.particles.map(p=>({x:p.position.x*SCALE-entry.center.x,y:-p.position.y*SCALE-entry.center.y,volume:samples.volume/48}));
      }
    }
    for (const [id, entry] of this.bodies) if (!ids.has(id)) { Composite.remove(this.engine.world, entry.body); this.bodies.delete(id); }
    syncSoftBodies(this, objects, Matter, SCALE);
    syncRopes(this, objects, Matter, SCALE);
    syncLiquids(this, objects, Matter, SCALE);
    this.recordSync?.(objects);
  }
  bindSurface(entry) {
    const body = entry.body;
    const contactFrame = () => {
      const c = Math.cos(body.angle), s = Math.sin(body.angle), center = entry.center;
      return { origin: { x: (body.position.x - center.x * c + center.y * s) / SCALE,
        y: -(body.position.y - center.x * s - center.y * c) / SCALE }, angle: -body.angle, scale: 1 };
    };
    body.surfaceFrictionAt = (point, normal) => frictionAt(entry.object, point, normal, contactFrame());
    body.surfaceRestitutionAt = (point, normal) => restitutionAt(entry.object, point, normal, contactFrame());
  }
  // Clone the complete solver graph, including warm contacts, previous poses,
  // compound vertices and integration deltas. Definitions/meshes stay shared.
  checkpoint() {
    const external = new Set();
    for (const entry of [...this.bodies.values(), ...this.ropes.values(), ...this.liquids.values(), ...this.softBodies.values()]) for (const key of ['object', 'shape', 'geometry', 'mesh', 'buoyancySamples']) external.add(entry[key]);
    return cloneSolver({ engine: this.engine, bodies: this.bodies, ropes: this.ropes, liquids: this.liquids, softBodies: this.softBodies, boundaries: this.boundaries, constructionPrevious: this.constructionPrevious, constructionSyncKey: this.constructionSyncKey }, external);
  }
  restore(checkpoint, objects) {
    const external = new Set();
    for (const entry of [...checkpoint.value.bodies.values(), ...checkpoint.value.ropes.values(), ...checkpoint.value.liquids.values(), ...checkpoint.value.softBodies.values()]) for (const key of ['object', 'shape', 'geometry', 'mesh', 'buoyancySamples']) external.add(entry[key]);
    const { value } = cloneSolver(checkpoint.value, external);
    this.engine = value.engine; this.bodies = value.bodies; this.ropes = value.ropes; this.liquids = value.liquids; this.softBodies = value.softBodies; this.boundaries = value.boundaries;
    this.constructionPrevious = value.constructionPrevious;
    this.constructionSyncKey = value.constructionSyncKey;
    const byId = new Map(objects.map(object => [object.id, object]));
    for (const [id, entry] of this.bodies) { entry.object = byId.get(id); this.bindSurface(entry); }
    for (const [id, entry] of this.ropes) entry.object = byId.get(id);
    for (const [id, entry] of this.liquids) entry.object = byId.get(id);
    for (const [id, entry] of this.softBodies) {entry.object = byId.get(id);bindSoftSurface(entry,SCALE);}
    this.lastFrame = null; this.accumulator = 0;
  }
  // Cached static fixtures are replaced only when their geometry/view changes.
  syncBoundary(id, key, fixtures, surface = null) {
    const previous = this.boundaries.get(id);
    if (previous?.key === key) return;
    if (previous) Composite.remove(this.engine.world, previous.bodies);
    const bodies = fixtures().map(fixture => {
      const options = { isStatic: true, friction: 0, frictionStatic: 0, restitution: 0, slop: .005, collisionFilter: { objectId: id } };
      if (fixture.radius) return Bodies.circle(fixture.x * SCALE, -fixture.y * SCALE, fixture.radius * SCALE, options, 10);
      const { first, second, thickness } = fixture;
      const dx = second.x - first.x, dy = second.y - first.y;
      return Bodies.rectangle((first.x + second.x) / 2 * SCALE, -(first.y + second.y) / 2 * SCALE,
        Math.hypot(dx, dy) * SCALE + thickness * SCALE, thickness * SCALE, { ...options, angle: -Math.atan2(dy, dx) });
    });
    for (const body of bodies) {
      body.surfaceFrictionAt = surface ? (point, normal) => frictionAt(surface, point, normal) : () => 0;
      body.surfaceRestitutionAt = surface ? (point, normal) => restitutionAt(surface, point, normal) : () => 0;
    }
    Composite.add(this.engine.world, bodies);
    this.boundaries.set(id, { key, bodies });
    // Removed fixtures must not retain cached contacts on the next tick.
    Pairs.clear(this.engine.pairs);
  }
  retainBoundaries(ids) {
    for (const [id, entry] of this.boundaries) if (!ids.has(id)) {
      Composite.remove(this.engine.world, entry.bodies); this.boundaries.delete(id); Pairs.clear(this.engine.pairs);
    }
  }
  step(seconds = PHYSICS_STEP) {
    const rigid = [...this.bodies.values()].filter(entry => entry.object.running && !entry.object.hidden);
    const active = [...rigid, ...[...this.ropes.values()].filter(entry=>entry.object.running&&!entry.disabled).flatMap(entry=>entry.links.map(body=>({body,object:entry.object}))),
      ...[...this.liquids.values(),...this.softBodies.values()].filter(entry=>entry.object.running&&!entry.object.hidden).flatMap(entry=>entry.particles.map(body=>({body,object:entry.object})))];
    if (!active.length) return new Set();
    const finishRecording = this.recordStep?.(seconds);
    // Adaptive subdivision reduces tunnelling through thin geometric strokes.
    const travel = Math.max(...active.map(({ body, object }) => {
      const speed=(Math.hypot(body.velocity.x,body.velocity.y)+Math.abs(body.angularVelocity)*Math.hypot(body.bounds.max.x-body.bounds.min.x,body.bounds.max.y-body.bounds.min.y)/2)*60*body.timeScale;
      // Droplets have a finite collision radius. Advancing by half that radius
      // avoids repeating neighbor searches at the rigid stroke's .5 px scale.
      const distance=isLiquid(object)?Math.max(.5,object.radius*SCALE*.5):.5;
      return speed*seconds/distance;
    }));
    const substeps = Math.min(128, Math.max(1, Math.ceil(travel)));
    for (let index = 0; index < substeps; index++) {
      for (const { body, object } of active) {
        body.force.x += body.mass * object.gravity.x * SCALE / 1e6;
        body.force.y -= body.mass * object.gravity.y * SCALE / 1e6;
      }
      applyDrag(this, Matter, SCALE);
      applySoftForces(this, SCALE);
      applyLiquidForces(this, Matter, SCALE, seconds/substeps);
      Engine.update(this.engine, seconds * 1000 / substeps);
    }
    const changed = new Set();
    for (const entry of rigid) {
      const { body, object, center } = entry;
      const cosine = Math.cos(body.angle), sine = Math.sin(body.angle);
      object.position = { x: (body.position.x - center.x * cosine + center.y * sine) / SCALE, y: -(body.position.y - center.x * sine - center.y * cosine) / SCALE };
      object.angle = -body.angle;
      const velocity = Body.getVelocity(body);
      object.velocity = { x: velocity.x * 60 / SCALE, y: -velocity.y * 60 / SCALE };
      object.angularVelocity = -Body.getAngularVelocity(body) * 60;
      object.time += seconds * object.playbackRate;
      if (object.duration > 0 && object.time >= object.duration) { object.time = object.duration; object.running = false; }
      entry.key = object.running ? bodyKey(object) : null;
      changed.add(object.id);
    }
    readRopes(this, seconds, Matter, SCALE, changed);
    readLiquids(this, seconds, Matter, SCALE, changed);
    readSoftBodies(this, seconds, Matter, SCALE, changed);
    finishRecording?.();
    return changed;
  }
  tick(now, objects) {
    this.syncBodies(objects);
    if (!objects.some(object => isPhysicsObject(object) && object.running && !object.hidden)) { this.lastFrame = null; this.accumulator = 0; return new Set(); }
    if (this.lastFrame === null) this.lastFrame = now;
    this.accumulator += Math.min(.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const changed = new Set();
    while (this.accumulator >= PHYSICS_STEP) {
      for (const id of this.step()) changed.add(id);
      this.accumulator -= PHYSICS_STEP;
      this.syncBodies(objects);
    }
    return changed;
  }
}

function cloneSolver(root, external) {
  const seen = new Map(); let bytes = 0;
  function clone(value) {
    if (!value || typeof value !== 'object' || external.has(value)) return value;
    if (seen.has(value)) return seen.get(value);
    const result = value instanceof Map ? new Map() : Array.isArray(value) ? [] : {};
    seen.set(value, result); bytes += 64;
    if (value instanceof Map) for (const [key, item] of value) { result.set(key, clone(item)); bytes += 32; }
    else for (const key of Object.keys(value)) { result[key] = clone(value[key]); bytes += 24 + key.length * 2; }
    return result;
  }
  return { value: clone(root), bytes };
}
