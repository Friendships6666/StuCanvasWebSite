import { documentKey, objectDefinition, parseDocument } from './document.js';
import { resolveObjects } from './geometry.js';
import { bindingPatch, formulaParameters, isJavaScript, jsonValue, needsReflection, pathParts, reflectionSource, variableRoot, variableValue } from './reflection.js';
import { compileEquation } from './plot/formula.js';
import { compileParametric } from './plot/parametric-formula.js';

const metadata = new Set(['id', 'name', 'type', 'parents', 'source', 'enabled', 'bindings']);
const keyOf = value => value === undefined ? 'undefined' : documentKey(value);

// Runs inside a disposable worker. Read tracking records leaves, existence and
// enumeration separately: changing an unrelated field does not rerun a script.
export class ReflectionEngine {
  constructor() { this.cache = new Map(); this.compiled = new Map(); }

  evaluate(document, previous = [], blocked = [], progress = () => {}) {
    const model = structuredClone(document);
    const byId = new Map(model.objects.map(object => [object.id, object]));
    const byName = new Map();
    for (const object of model.objects) if (!byName.has(object.name)) byName.set(object.name, object.id);
    const indices = new Map(model.objects.map((object, index) => [object.id, index]));
    const variableIds = new Map(model.objects.filter(isJavaScript).map(object => [object.name.toLowerCase(), object.id]));
    const parameterIds = new Map(model.objects.filter(object => isJavaScript(object) || object.type === 'slider').map(object => [object.name.toLowerCase(), object.id]));
    const statuses = [], updates = [], states = new Map(), errors = new Map();
    const disabled = new Set(blocked);
    let geometry = new Map(previous), geometryDirty = previous.length ? new Set() : null, reader = null;
    const spaces = new Map(), readyGeometry = new Set();
    const plots = model.objects.filter(object => ['equation', 'parametric'].includes(object.type) && !object.draft);
    let parameterNames = plots.length ? keyOf(Object.keys(formulaParameters(model.objects))) : '';
    let revision = 0;
    for (const id of this.cache.keys()) if (!byId.has(id)) this.cache.delete(id);
    for (const id of this.compiled.keys()) if (!byId.has(id)) this.compiled.delete(id);

    const ensureGeometry = (id, seen = new Set()) => {
      if (seen.has(id)) throw new Error(`Dependency cycle: ${id}`);
      if (readyGeometry.has(id)) return;
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
      readyGeometry.add(id);
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
      if (space === 'lookup') return byId.has(path[0]) ? path[0] : byName.get(path[0]);
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
    // Intern access paths once per evaluation. Hot reads then reuse the value,
    // proxy, dependency token and signature until a successful patch changes it.
    const nodeAt = (space, path) => {
      if (!spaces.has(space)) spaces.set(space, { space, path: [], children: new Map(), tokens: new Map(), revision: -1 });
      let node = spaces.get(space);
      for (const key of path) {
        if (!node.children.has(key)) node.children.set(key, { space, path: [...node.path, key], children: new Map(), tokens: new Map(), revision: -1 });
        node = node.children.get(key);
      }
      return node;
    };
    const valueAt = node => {
      if (node.revision !== revision) {
        const value = locate(node.space, node.path);
        node.value = value; node.revision = revision;
      }
      return node.value;
    };
    const signature = (node, kind, property) => {
      const value = valueAt(node);
      if (kind === 'keys') return keyOf(value && typeof value === 'object' ? Object.keys(value) : null);
      if (kind === 'has') return String(!!value && Object.hasOwn(value, property));
      if (kind === 'object') return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      return keyOf(value);
    };
    const tokenAt = (node, kind, property) => {
      if (!node.tokens.has(kind)) node.tokens.set(kind, new Map());
      const tokens = node.tokens.get(kind);
      if (!tokens.has(property)) tokens.set(property, { space: node.space, path: node.path, kind, property, revision: -1 });
      const token = tokens.get(property);
      if (token.revision !== revision) {
        token.stamp = signature(node, kind, property); token.revision = revision;
      }
      return token;
    };
    const remember = (node, kind, property) => {
      if (!reader) return;
      const token = tokenAt(node, kind, property);
      if (!reader.has(token)) {
        const { space, path, stamp } = token;
        reader.set(token, { space, path, kind, property, stamp });
      }
    };
    const proxy = node => {
      const value = valueAt(node);
      if (!value || typeof value !== 'object') { remember(node, 'value'); return value; }
      remember(node, 'object');
      if (node.proxy) return node.proxy;
      const { space, path } = node;
      // Empty, extensible targets let a read-only proxy faithfully expose even
      // frozen-looking input without violating Proxy descriptor invariants.
      const result = new Proxy(Array.isArray(value) ? [] : {}, {
        get(target, key) {
          if (typeof key === 'symbol') {
            if (key === Symbol.iterator && Array.isArray(value)) return Array.prototype[Symbol.iterator];
            return undefined;
          }
          const latest = valueAt(node);
          if (Array.isArray(latest) && typeof Array.prototype[key] === 'function') return Array.prototype[key];
          if (['__proto__', 'constructor', 'prototype'].includes(key)) return undefined;
          let child = node.children.get(key);
          if (!child) child = nodeAt(space, [...path, key]);
          return proxy(child);
        },
        has(target, key) { if (typeof key === 'symbol') return false; remember(node, 'has', key); return Object.hasOwn(valueAt(node) || {}, key); },
        ownKeys() { remember(node, 'keys'); return Object.keys(valueAt(node) || {}).concat(Array.isArray(value) ? ['length'] : []); },
        getOwnPropertyDescriptor(target, key) {
          if (Array.isArray(value) && key === 'length') return Reflect.getOwnPropertyDescriptor(target, key);
          if (!Object.hasOwn(valueAt(node) || {}, key)) return undefined;
          return { configurable: true, enumerable: true, writable: false, value: proxy(nodeAt(space, [...path, key])) };
        },
        set() { throw new Error('Document data is read-only; return the fields to update'); },
        deleteProperty() { throw new Error('Document data is read-only'); },
        defineProperty() { throw new Error('Document data is read-only'); },
        setPrototypeOf() { throw new Error('Document data is read-only'); },
        preventExtensions() { throw new Error('Document data is read-only'); },
      });
      node.proxy = result;
      return result;
    };
    const json = proxy(nodeAt('json', []));
    const vars = proxy(nodeAt('vars', []));
    const get = name => {
      if (typeof name !== 'string') throw new Error('get() expects an object ID or name');
      const lookup = nodeAt('lookup', [name]);
      remember(lookup, 'value');
      const id = valueAt(lookup);
      if (!id) throw new Error(`Object not found: ${name}`);
      const node = nodeAt('resolved', [id]);
      if (!valueAt(node)) throw new Error(`Object is undefined: ${name}`);
      return proxy(node);
    };
    const validatePatch = (object, candidate) => {
      if (isJavaScript(object)) {
        // jsonValue already checked the only writable JS field. A changed set
        // of numeric variable paths can also invalidate existing formulas.
        if (!plots.length) return;
        const parameters = formulaParameters(model.objects), names = keyOf(Object.keys(parameters));
        if (names === parameterNames) return;
        for (const plot of plots) {
          if (plot.type === 'parametric') compileParametric(plot, parameters);
          else compileEquation(plot.source, parameters);
        }
        parameterNames = names;
        return;
      }
      // Bindings cannot change identity, parents, source or references. Validate
      // the changed native object and its dependency closure, without copying
      // unrelated JSON data, construction history or every other native object.
      const selected = new Map();
      let parameters;
      const include = id => {
        if (selected.has(id)) return;
        let definition = id === object.id ? candidate : byId.get(id);
        if (!definition) return;
        if (definition.derivation && geometry.get(id)) definition = objectDefinition({ ...geometry.get(id), ...definition });
        selected.set(id, definition);
        for (const parent of definition.parents || []) include(parent);
        for (const reference of Object.values(definition.bindings || {})) include(variableIds.get(variableRoot(reference)));
        if (['equation', 'parametric'].includes(definition.type) && !definition.draft) {
          parameters ||= formulaParameters(model.objects);
          const compiled = definition.type === 'parametric' ? compileParametric(definition, parameters) : compileEquation(definition.source, parameters);
          for (const name of compiled.parameterNames) include(parameterIds.get(variableRoot(name)));
        }
      };
      include(object.id);
      parseDocument(JSON.stringify({ format: model.format, version: model.version, objects: [...selected.values()] }));
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
        const reusable = cached?.source === source && cached.selfKey === selfKey && cached.reads.every(read => tokenAt(nodeAt(read.space, read.path), read.kind, read.property).stamp === read.stamp);
        if (reusable) {
          patch = isJavaScript(object) ? cached.patch : bindingPatch(object, reference => variableValue(model.objects, reference));
          reads = cached.reads;
        }
        else {
          reader = new Map();
          if (isJavaScript(object)) {
            let compiled = this.compiled.get(id);
            // An expression or a function body with return are both accepted.
            if (compiled?.source !== source) {
              let execute;
              try { execute = new Function('json', 'get', 'vars', 'self', `"use strict"; return (${source}\n);`); }
              catch { execute = new Function('json', 'get', 'vars', 'self', `"use strict";\n${source}\n`); }
              compiled = { source, execute }; this.compiled.set(id, compiled);
            }
            const self = Object.freeze({ id: object.id, name: object.name });
            const execute = compiled.execute;
            patch = { value: jsonValue(execute(json, get, vars, self)) };
          } else patch = bindingPatch(object, reference => {
            const parts = pathParts(reference);
            if (!variableIds.has(parts[0].toLowerCase())) throw new Error(`Variable not found: ${parts[0]}`);
            parts[0] = parts[0].toLowerCase();
            return jsonValue(proxy(nodeAt('vars', parts)));
          });
          reads = [...reader.values()];
        }
        reader = null;
        if (Object.keys(patch).some(key => keyOf(object[key]) !== keyOf(patch[key]))) {
          const candidate = { ...object, ...structuredClone(patch) };
          const index = indices.get(id);
          model.objects[index] = candidate;
          try { validatePatch(object, candidate); }
          catch (error) { model.objects[index] = object; throw error; }
          byId.set(id, candidate); revision++;
          if (geometryDirty) geometryDirty.add(id);
        }
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
