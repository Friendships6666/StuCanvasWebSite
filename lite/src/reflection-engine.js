import { documentKey, parseDocument } from './document.js';
import { resolveObjects } from './geometry.js';
import { bindingPatch, formulaParameters, isJavaScript, jsonValue, needsReflection, pathParts, reflectionSource, variableRoot, variableValue } from './reflection.js';
import { compileEquation } from './plot/formula.js';
import { compileParametric } from './plot/parametric-formula.js';

const metadata = new Set(['id', 'name', 'type', 'parents', 'source', 'enabled', 'bindings']);
const keyOf = value => value === undefined ? 'undefined' : documentKey(value);

// Runs inside a disposable worker. Read tracking records leaves, existence and
// enumeration separately: changing an unrelated field does not rerun a script.
export class ReflectionEngine {
  constructor() { this.cache = new Map(); }

  evaluate(document, previous = [], blocked = [], progress = () => {}) {
    const model = structuredClone(document);
    const byId = new Map(model.objects.map(object => [object.id, object]));
    const indices = new Map(model.objects.map((object, index) => [object.id, index]));
    const variableIds = new Map(model.objects.filter(isJavaScript).map(object => [object.name.toLowerCase(), object.id]));
    const statuses = [], updates = [], states = new Map(), errors = new Map();
    const disabled = new Set(blocked);
    let geometry = new Map(previous), geometryDirty = previous.length ? new Set() : null, reader = null;
    const cloneCache = new Map();
    for (const id of this.cache.keys()) if (!byId.has(id)) this.cache.delete(id);

    const ensureGeometry = (id, seen = new Set()) => {
      if (seen.has(id)) throw new Error(`Dependency cycle: ${id}`);
      seen.add(id);
      const object = byId.get(id);
      if (!object) return;
      ensure(id);
      for (const parent of object.parents || []) ensureGeometry(parent, new Set(seen));
      // Formula parameters are implicit parents too.
      if (['equation', 'parametric', 'tangent'].includes(object.type)) {
        for (const slider of model.objects.filter(item => item.type === 'slider')) ensure(slider.id);
        const plot = object.type === 'tangent' ? byId.get(object.parents[1]) : object;
        try {
          const parameters = formulaParameters(model.objects);
          const compiled = plot?.type === 'parametric' ? compileParametric(plot, parameters) : plot?.type === 'equation' ? compileEquation(plot.source, parameters) : null;
          for (const name of compiled?.parameterNames || []) {
            const parent = variableIds.get(variableRoot(name));
            if (parent) ensureGeometry(parent, new Set(seen));
          }
        } catch (error) { if (/cycle|stopped/.test(error.message)) throw error; }
      }
    };
    const currentGeometry = id => {
      ensureGeometry(id);
      if (geometryDirty === null || geometryDirty.size) {
        geometry = resolveObjects(model.objects, geometry, geometryDirty); geometryDirty = new Set();
      }
      return geometry.get(id);
    };
    const locate = (space, path) => {
      let value;
      if (space === 'json') value = model;
      else if (space === 'vars') {
        if (!path.length) return Object.fromEntries([...variableIds].map(([name, id]) => [name, byId.get(id).value]));
        const id = variableIds.get(String(path[0]).toLowerCase());
        if (id) { ensure(id); value = byId.get(id).value; }
      } else value = currentGeometry(path[0]);
      const parts = space === 'json' ? path : path.slice(1);
      if (space === 'json' && parts[0] === 'objects' && parts.length >= 3 && !metadata.has(parts[2])) {
        const object = model.objects[parts[1]];
        if (object) ensure(object.id);
      }
      for (const key of parts) value = value?.[key];
      return value;
    };
    const signature = (space, path, kind, property) => {
      const value = locate(space, path);
      if (kind === 'keys') return keyOf(value && typeof value === 'object' ? Object.keys(value) : null);
      if (kind === 'has') return String(!!value && Object.hasOwn(value, property));
      if (kind === 'object') return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      return keyOf(value);
    };
    const remember = (space, path, kind, property) => {
      const stamp = signature(space, path, kind, property);
      if (reader) reader.set(JSON.stringify([space, path, kind, property]), { space, path, kind, property, stamp });
    };
    const proxy = (space, path) => {
      const value = locate(space, path);
      if (!value || typeof value !== 'object') { remember(space, path, 'value'); return value; }
      remember(space, path, 'object');
      const cacheKey = JSON.stringify([space, path]);
      if (cloneCache.has(cacheKey)) return cloneCache.get(cacheKey);
      // Empty, extensible targets let a read-only proxy faithfully expose even
      // frozen-looking input without violating Proxy descriptor invariants.
      const result = new Proxy(Array.isArray(value) ? [] : {}, {
        get(target, key) {
          if (typeof key === 'symbol') {
            if (key === Symbol.iterator && Array.isArray(value)) return Array.prototype[Symbol.iterator];
            return undefined;
          }
          const latest = locate(space, path);
          if (Array.isArray(latest) && typeof Array.prototype[key] === 'function') return Array.prototype[key];
          if (['__proto__', 'constructor', 'prototype'].includes(key)) return undefined;
          return proxy(space, [...path, key]);
        },
        has(target, key) { if (typeof key === 'symbol') return false; remember(space, path, 'has', key); return Object.hasOwn(locate(space, path) || {}, key); },
        ownKeys() { remember(space, path, 'keys'); return Object.keys(locate(space, path) || {}).concat(Array.isArray(value) ? ['length'] : []); },
        getOwnPropertyDescriptor(target, key) {
          if (Array.isArray(value) && key === 'length') return Reflect.getOwnPropertyDescriptor(target, key);
          if (!Object.hasOwn(locate(space, path) || {}, key)) return undefined;
          return { configurable: true, enumerable: true, writable: false, value: proxy(space, [...path, key]) };
        },
        set() { throw new Error('Document data is read-only; return the fields to update'); },
        deleteProperty() { throw new Error('Document data is read-only'); },
        defineProperty() { throw new Error('Document data is read-only'); },
        setPrototypeOf() { throw new Error('Document data is read-only'); },
        preventExtensions() { throw new Error('Document data is read-only'); },
      });
      cloneCache.set(cacheKey, result);
      return result;
    };
    const json = proxy('json', []);
    const vars = proxy('vars', []);
    const get = name => {
      if (typeof name !== 'string') throw new Error('get() expects an object ID or name');
      const object = json.objects.find(item => item.id === name) || json.objects.find(item => item.name === name);
      if (!object) throw new Error(`Object not found: ${name}`);
      const id = object.id;
      if (!currentGeometry(id)) throw new Error(`Object is undefined: ${name}`);
      return proxy('resolved', [id]);
    };
    const ensure = id => {
      const object = byId.get(id);
      if (!needsReflection(object)) return;
      if (states.get(id) === 'visiting') throw new Error(`Script dependency cycle: ${object.name || id}`);
      if (states.get(id) === 'done') { if (errors.has(id)) throw new Error(errors.get(id)); return; }
      if (disabled.has(id)) { errors.set(id, 'Execution stopped: edit the script or retry'); states.set(id, 'done'); throw new Error(errors.get(id)); }
      states.set(id, 'visiting');
      const outerReader = reader;
      reader = null;
      progress(id);
      try {
        const source = reflectionSource(object);
        const selfKey = documentKey([object.id, object.name, object.type, object.parents]);
        let cached = this.cache.get(id), patch, reads;
        const reusable = cached?.source === source && cached.selfKey === selfKey && cached.reads.every(read => signature(read.space, read.path, read.kind, read.property) === read.stamp);
        if (reusable) {
          patch = isJavaScript(object) ? cached.patch : bindingPatch(object, reference => variableValue(model.objects, reference));
          reads = cached.reads;
        }
        else {
          reader = new Map();
          if (isJavaScript(object)) {
            let execute;
            // An expression or a function body with return are both accepted.
            try { execute = new Function('json', 'get', 'vars', 'self', `"use strict"; return (${source}\n);`); }
            catch { execute = new Function('json', 'get', 'vars', 'self', `"use strict";\n${source}\n`); }
            const self = Object.freeze({ id: object.id, name: object.name });
            patch = { value: jsonValue(execute(json, get, vars, self)) };
          } else patch = bindingPatch(object, reference => {
            const parts = pathParts(reference);
            if (!variableIds.has(parts[0].toLowerCase())) throw new Error(`Variable not found: ${parts[0]}`);
            parts[0] = parts[0].toLowerCase();
            return jsonValue(proxy('vars', parts));
          });
          reads = [...reader.values()];
        }
        reader = null;
        const candidate = { ...object, ...structuredClone(patch) };
        const index = indices.get(id);
        model.objects[index] = candidate;
        try { parseDocument(JSON.stringify(model)); }
        catch (error) { model.objects[index] = object; throw error; }
        byId.set(id, candidate);
        if (geometryDirty && Object.keys(patch).some(key => keyOf(object[key]) !== keyOf(patch[key]))) geometryDirty.add(id);
        this.cache.set(id, { source, selfKey, patch, reads });
        updates.push({ id, source, patch });
        statuses.push({ id, reads: reads.map(({ space, path }) => `${space}.${path.join('.')}`), cached: reusable, error: '' });
        states.set(id, 'done');
      } catch (error) {
        const message = String(error.message || error).slice(0, 1000);
        errors.set(id, message);
        statuses.push({ id, error: message, reads: [], cached: false });
        states.set(id, 'done');
        this.cache.delete(id);
        throw error;
      } finally { reader = outerReader; progress(null); }
    };
    for (const object of model.objects) if (needsReflection(object)) {
      try { ensure(object.id); } catch { /* Other independent bindings still run. */ }
    }
    // Failed bindings retain their last valid native fields, along with a visible
    // editor error. Only successful patches cross back to the main thread.
    return { updates, statuses };
  }
}
