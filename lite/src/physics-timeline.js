import { isFlexible } from './rope.js';
import { isLiquid } from './liquid.js';
import { isSoftBody } from './soft-body.js';
import { PHYSICS_STEP, bodyState, isPhysicsObject } from './physics.js';

import { defaultTimeline, MAX_TIMELINE_TIME } from './timeline-state.js';
export { defaultTimeline } from './timeline-state.js';
const bodies = objects => objects.filter(isPhysicsObject);
const poses = objects => bodies(objects).map(object => ({ id: object.id, ...bodyState(object), time: object.time, running: object.running }));
const motionKey = states => JSON.stringify(states.map(({ running, ...state }) => state));
const mask = (objects, world) => JSON.stringify({ active: bodies(objects).map(object => [object.id, object.running]), drag: world.drag });
function applyInput(input, objects, world) {
  const value = JSON.parse(input), active = new Map(value?.active || []);
  for (const object of bodies(objects)) object.running = active.get(object.id) || false;
  world.drag = value?.drag ? structuredClone(value.drag) : null;
}
const shapeKeys = new WeakMap();
const shapeKey = shape => { if (!shapeKeys.has(shape)) shapeKeys.set(shape, JSON.stringify(shape)); return shapeKeys.get(shape); };

// One clock coordinates the existing per-body clocks. A frame contains the
// entire coupled world: a collision partner can never be replayed separately.
export class PhysicsTimeline {
  constructor(world, state = defaultTimeline(), { maxFrames = 12000, maxBytes = 32 * 1024 * 1024, maxFrameBytes = 32 * 1024 * 1024 } = {}) {
    this.world = world; this.state = state; this.maxFrames = Math.max(2,maxFrames); this.maxBytes = maxBytes; this.maxFrameBytes = maxFrameBytes; this.frameBytes = 0;
    this.frames = new Map(); this.checkpoints = new Map(); this.bytes = 0;
    this.inputs = new Map(); this.edits = new Map(); this.shapes = new Map(); this.nextShape = 0;
    this.frame = Math.round(state.time / PHYSICS_STEP); this.engineFrame = null;
    this.lastFrame = null; this.accumulator = 0; this.signature = null;
    this.stats = { hits: 0, steps: 0, restores: 0 };
  }
  setState(state) {
    this.state = state; this.frame = Math.round(state.time / PHYSICS_STEP);
    this.clear(); this.signature = null; this.resetClock();
  }
  resetClock() { this.lastFrame = null; this.accumulator = 0; }
  clear() { this.frames.clear(); this.checkpoints.clear(); this.inputs.clear(); this.edits.clear(); this.frameBytes = 0; this.bytes = 0; this.engineFrame = null; }
  configuration(objects) {
    const ids = new Set();
    const shapeToken = (object,shape=object.shape) => {
      ids.add(object.id);
      let previous = this.shapes.get(object.id);
      if (previous?.shape !== shape) {
        const key = shapeKey(shape);
        previous = { shape, key, token: previous?.key === key ? previous.token : ++this.nextShape };
        this.shapes.set(object.id, previous);
      }
      return previous.token;
    };
    const result = JSON.stringify([bodies(objects).map(object => [object.id, isSoftBody(object) ? [shapeToken(object,object.mesh),object.stretchStiffness,object.shearStiffness,object.bendStiffness,object.areaStiffness,object.damping,object.collisionRadius,object.selfCollision,object.collideGeometry,object.collideBodies] : isLiquid(object) ? [object.particleCount,object.radius,object.volume,object.density,object.pressure,object.viscosity,object.cohesion,object.buoyancy,object.collideGeometry,object.collideBodies] : isFlexible(object) ? [object.type, object.anchors, object.length, object.segments, object.radius, object.coilRadius, object.stiffness, object.damping, object.collideGeometry, object.collideBodies] : shapeToken(object), object.smoothing ?? 0,
      object.mass, object.gravity, object.restitution, object.airFriction, object.surfaceFriction, object.surfaceRestitution,
      object.freeFall, object.ignored, object.hidden, object.duration, object.playbackRate, object.initialState]),
    [...this.world.boundaries].map(([id, entry]) => [id, entry.key])]);
    for (const id of this.shapes.keys()) if (!ids.has(id)) this.shapes.delete(id);
    return result;
  }
  apply(states, objects, stopped = false) {
    const byId = new Map(states.map(state => [state.id, state]));
    for (const object of bodies(objects)) {
      const state = byId.get(object.id); if (!state) continue;
      const { id, ...values } = state; Object.assign(object, structuredClone(values));
      if (stopped) object.running = false;
    }
  }
  dropFrame(key) {
    const frame = this.frames.get(key); if (!frame) return;
    this.frameBytes -= frame.bytes; this.frames.delete(key);
    const checkpoint = this.checkpoints.get(key);
    if (checkpoint) { this.bytes -= checkpoint.bytes; this.checkpoints.delete(key); }
  }
  remember(objects, inputs = null) {
    const states = poses(objects), key = motionKey(states);
    const bytes = 128 + states.reduce((sum,state)=>sum+1+(state.links?.length||0)+(state.particles?.length||0)+(state.nodes?.length||0),0)*384 + key.length*2 + (inputs?.length || 0)*2;
    this.dropFrame(this.frame);
    this.frames.set(this.frame, { states, key, inputs, bytes }); this.frameBytes += bytes;
    // Keep the branch origin, so evicted frames can be regenerated with their
    // recorded per-body controls. Storage has both a frame and a byte cap.
    const origin = Math.min(...this.checkpoints.keys());
    while (this.frames.size > this.maxFrames || this.frameBytes > this.maxFrameBytes) {
      const key = [...this.frames.keys()].find(key => key !== this.frame && key !== origin && !this.checkpoints.has(key))
        ?? [...this.frames.keys()].find(key => key !== this.frame && key !== origin);
      if (key === undefined) break; this.dropFrame(key);
    }
  }
  checkpoint(objects) {
    this.world.syncBodies(objects);
    const snapshot = this.world.checkpoint();
    const old = this.checkpoints.get(this.frame); if (old) this.bytes -= old.bytes;
    this.checkpoints.delete(this.frame);
    // An unusually large solver remains usable without retaining a huge copy.
    if (snapshot.bytes > this.maxBytes) return;
    this.checkpoints.set(this.frame, snapshot); this.bytes += snapshot.bytes;
    while (this.bytes > this.maxBytes || this.checkpoints.size > 32) {
      const first = this.checkpoints.keys().next().value;
      const key = [...this.checkpoints.keys()].find(key => key !== first) ?? first, entry = this.checkpoints.get(key);
      this.bytes -= entry.bytes; this.checkpoints.delete(key);
    }
    this.engineFrame = this.frame;
  }
  truncate() {
    for (const key of this.inputs.keys()) if (key > this.frame) this.inputs.delete(key);
    for (const key of this.edits.keys()) if (key >= this.frame) this.edits.delete(key);
    for (const key of this.frames.keys()) if (key >= this.frame) this.dropFrame(key);
    for (const [key, value] of this.checkpoints) if (key >= this.frame) { this.bytes -= value.bytes; this.checkpoints.delete(key); }
    this.engineFrame = null;
  }
  // Called after static geometry has been synchronized. Definitions changing at
  // the playhead form a new branch; previous physics must never leak into it.
  sync(objects) {
    const signature = this.configuration(objects), states = poses(objects);
    if (signature !== this.signature) {
      this.clear(); this.signature = signature;
      this.world.syncBodies(objects); this.remember(objects); this.checkpoint(objects);
    } else if (!this.frames.has(this.frame) || this.frames.get(this.frame).key !== motionKey(states)) {
      this.truncate(); this.edits.set(this.frame, poses(objects)); this.world.syncBodies(objects); this.remember(objects); this.checkpoint(objects);
    }
  }
  ensureEngine(objects) {
    if (this.engineFrame === this.frame) return;
    const drag = this.world.drag;
    const wanted = poses(objects), current = this.frame;
    const nearest = [...this.checkpoints.keys()].filter(key => key <= current && this.frames.has(key)).sort((a,b) => b-a)[0];
    if (nearest !== undefined) {
      this.apply(this.frames.get(nearest).states, objects);
      this.world.restore(this.checkpoints.get(nearest), objects); this.stats.restores++;
      for (let i=nearest+1;i<=current;i++) {
        const frame = this.frames.get(i);
        applyInput(frame?.inputs ?? this.inputAt(i), objects, this.world);
        this.world.syncBodies(objects); this.world.step(); this.stats.steps++;
        if (this.edits.has(i)) this.apply(this.edits.get(i), objects);
      }
    } else {
      // No retained checkpoint: rebuild at the displayed state. Normally only
      // reached after edits or when a very large solver exceeds the cache cap.
      for (const entry of [...this.world.bodies.values(),...this.world.ropes.values(),...this.world.liquids.values()]) entry.key = null;
    }
    this.world.drag = drag;
    this.apply(wanted, objects); this.world.syncBodies(objects); this.engineFrame = current;
  }
  inputAt(frame) {
    const key = [...this.inputs.keys()].filter(key => key <= frame).sort((a,b)=>b-a)[0];
    return key === undefined ? null : this.inputs.get(key);
  }
  advance(objects) {
    this.sync(objects);
    const inputs = mask(objects, this.world), next = this.frames.get(this.frame+1);
    const recorded = this.inputAt(this.frame+1);
    if (recorded !== inputs) {
      for (const key of this.inputs.keys()) if (key > this.frame) this.inputs.delete(key);
      for (const key of this.edits.keys()) if (key > this.frame) this.edits.delete(key);
      this.inputs.set(this.frame+1, inputs);
      for (const key of this.frames.keys()) if (key > this.frame) this.dropFrame(key);
      for (const [key,value] of this.checkpoints) if (key > this.frame) { this.bytes -= value.bytes; this.checkpoints.delete(key); }
    }
    if (next?.inputs === inputs && recorded === inputs) {
      this.frame++; this.apply(next.states, objects); this.stats.hits++;
    } else {
      this.ensureEngine(objects);
      if (next) { const at=this.frame; this.frame++; this.truncate(); this.frame=at; }
      this.world.syncBodies(objects); this.world.step(); this.stats.steps++;
      this.frame++; this.engineFrame = this.frame;
      if (this.edits.has(this.frame)) this.apply(this.edits.get(this.frame), objects);
      this.remember(objects, inputs);
      if (this.frame % 60 === 0) this.checkpoint(objects);
    }
    this.state.time = this.frame * PHYSICS_STEP;
    return new Set(bodies(objects).map(object => object.id));
  }
  tick(now, objects) {
    this.sync(objects);
    const playing = bodies(objects).some(object => object.running && !object.hidden);
    this.state.running = playing;
    if (!playing) { this.resetClock(); return new Set(); }
    if (this.lastFrame === null) this.lastFrame = now;
    this.accumulator += Math.min(.1, Math.max(0, (now-this.lastFrame)/1000)) * this.state.playbackRate;
    this.lastFrame = now;
    const changed = new Set();
    while (this.accumulator + 1e-12 >= PHYSICS_STEP) {
      if (this.state.duration > 0 && (this.frame+1)*PHYSICS_STEP > this.state.duration + 1e-9) {
        for (const object of bodies(objects)) object.running = false;
        this.state.running = false; this.resetClock(); break;
      }
      for (const id of this.advance(objects)) changed.add(id);
      this.accumulator -= PHYSICS_STEP;
      if (!bodies(objects).some(object=>object.running&&!object.hidden)) { this.state.running=false; this.resetClock(); break; }
    }
    return changed;
  }
  play(objects) {
    for (const object of bodies(objects)) object.running = !object.hidden && (!object.duration || object.time < object.duration);
    this.state.running = bodies(objects).some(object=>object.running); this.resetClock();
  }
  pause(objects) {
    this.world.endDrag();
    for (const object of bodies(objects)) object.running = false;
    this.state.running = false; this.resetClock();
  }
  reset(objects) {
    this.world.endDrag();
    for (const object of bodies(objects)) Object.assign(object, structuredClone(object.initialState), { time: 0, running: false });
    this.frame = 0; this.state.time = 0; this.state.running = false; this.resetClock();
    this.engineFrame = null;
  }
  async seek(seconds, objects, { cancelled = () => false, yieldControl = () => new Promise(resolve=>setTimeout(resolve,0)) } = {}) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_TIMELINE_TIME) throw new RangeError('Invalid timeline time');
    this.sync(objects);
    const limit = this.state.duration > 0 ? Math.floor((this.state.duration+1e-9)/PHYSICS_STEP) : Infinity;
    const target = Math.min(Math.round(Math.max(0,seconds)/PHYSICS_STEP),limit);
    const cached = this.frames.get(target);
    if (cached) {
      this.frame = target; this.apply(cached.states, objects, true); this.engineFrame = null; this.stats.hits++;
    } else {
      const nearest = [...this.frames.keys()].filter(key=>key<=target).sort((a,b)=>b-a)[0];
      if (nearest !== undefined) {
        this.frame = nearest; this.apply(this.frames.get(nearest).states, objects); this.engineFrame = null;
      } else { this.reset(objects); this.play(objects); this.sync(objects); }
      let ticks=0;
      while (this.frame < target) {
        if (cancelled()) { this.pause(objects); return false; }
        // Continue the recorded active set; initial/reset states start all bodies.
        const recorded = this.inputAt(this.frame+1);
        if (recorded !== null) {
          applyInput(recorded, objects, this.world);
        } else if (!bodies(objects).some(object=>object.running)) this.play(objects);
        this.advance(objects);
        if (++ticks%120===0) await yieldControl();
      }
      this.pause(objects);
    }
    this.world.endDrag();
    this.state.time = this.frame*PHYSICS_STEP; this.state.running = false; this.resetClock();
    return true;
  }
}
