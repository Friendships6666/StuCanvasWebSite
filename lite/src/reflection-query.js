const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
export const jsonPointer = parts => parts.length ? '/' + parts.map(key => String(key).replace(/~/g, '~0').replace(/\//g, '~1')).join('/') : '';

// Dot/bracket notation for ordinary keys; JSON Pointer or a key array for keys
// containing dots, slashes, quotes or spaces. Never evaluate a path as code.
export function queryPath(path = []) {
  let parts;
  if (Array.isArray(path)) parts = [...path];
  else if (typeof path !== 'string') throw new Error('Expected a JSON path string or key array');
  else if (!path || path === '$') parts = [];
  else if (path.startsWith('/')) parts = path.slice(1).split('/').map(key => {
    if (/~(?![01])/u.test(key)) throw new Error('Invalid JSON Pointer');
    return key.replace(/~1/g, '/').replace(/~0/g, '~');
  });
  else {
    const source = path.startsWith('$.') ? path.slice(2) : path.startsWith('$[') ? path.slice(1) : path;
    if (!source) throw new Error(`Invalid JSON path: ${path}`);
    parts = []; let offset = 0;
    const token = /(?:^|\.)([A-Za-z_$][\w$]*)|\[(0|[1-9]\d*|"(?:[^"\\]|\\.)*")\]/gy;
    while (offset < source.length) {
      token.lastIndex = offset;
      const match = token.exec(source);
      if (!match) throw new Error(`Invalid JSON path: ${path}`);
      parts.push(match[1] ?? (match[2].startsWith('"') ? JSON.parse(match[2]) : match[2]));
      offset = token.lastIndex;
    }
  }
  if (parts.some(key => !['string', 'number'].includes(typeof key) || typeof key === 'number' && (!Number.isSafeInteger(key) || key < 0) || forbidden.has(String(key)))) throw new Error('Unsupported JSON path key');
  return parts.map(String);
}

// All reads go through the engine's read-only proxies and indexed tokens, so
// helpers share the same dependency tracking as handwritten json/get reads.
export function createQueryAPI({ json, index, definition, resolved, searchable = () => true }) {
  const paths = new Map();
  const partsFor = path => {
    if (typeof path !== 'string') return queryPath(path);
    if (!paths.has(path)) {
      if (paths.size >= 1024) paths.delete(paths.keys().next().value);
      paths.set(path, queryPath(path));
    }
    return paths.get(path);
  };
  const read = (path, fallback, exists = false) => {
    let value = json;
    const parts = partsFor(path);
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      if (!value || typeof value !== 'object' || !(key in value)) return exists ? false : fallback;
      if (exists && i === parts.length - 1) return true;
      value = value[key];
    }
    return exists ? true : value === undefined ? fallback : value;
  };
  const string = value => {
    if (typeof value !== 'string') throw new Error('Expected an object ID, name or type string');
    return value;
  };
  const idFor = reference => {
    const key = typeof reference === 'string' ? reference : reference?.id;
    return index('lookup', string(key));
  };
  const byId = id => {
    const found = index('id', string(id));
    return found ? definition(found) : null;
  };
  const all = () => index('all').map(definition);
  const matches = condition => {
    if (typeof condition === 'function') return condition;
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) throw new Error('Expected a predicate or field/value filter');
    const entries = Object.entries(condition).map(([path, value]) => [partsFor(path), value]);
    return object => entries.every(([parts, expected]) => {
      let value = object;
      for (const key of parts) {
        if (!value || typeof value !== 'object' || !(key in value)) return false;
        value = value[key];
      }
      return Object.is(value, expected);
    });
  };
  const candidates = condition => {
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      if (typeof condition.id === 'string') { const id = index('id', condition.id); return id ? [id] : []; }
      if (typeof condition.name === 'string') return index('name', condition.name);
      if (typeof condition.type === 'string') return index('type', condition.type);
    }
    return index('all');
  };
  const filter = (condition, first = false) => {
    const test = matches(condition), result = [];
    for (const id of candidates(condition)) {
      const object = definition(id);
      if (test(object)) { if (first) return object; result.push(object); }
    }
    return first ? null : result;
  };
  const relatives = (reference, direction, recursive = false) => {
    const id = idFor(reference);
    if (!id) return [];
    const seen = new Set([id]), pending = [...index(direction, id)], result = [];
    for (let i = 0; i < pending.length; i++) {
      const next = pending[i];
      if (seen.has(next)) continue;
      seen.add(next);
      const object = byId(next);
      if (!object) continue;
      result.push(object);
      if (recursive) pending.push(...index(direction, next));
    }
    return result;
  };
  const locate = reference => {
    const id = idFor(reference);
    if (!id) return null;
    const at = index('position', id);
    return { id, index: at, path: ['objects', at], pointer: `/objects/${at}` };
  };
  const search = (condition, root = [], { limit = 100, keys = true, values = true } = {}) => {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error('Search limit must be an integer from 1 to 10000');
    const needle = typeof condition === 'function' ? '' : String(condition).toLocaleLowerCase();
    const test = typeof condition === 'function' ? condition : (value, path) => {
      return keys && path.length && String(path.at(-1)).toLocaleLowerCase().includes(needle)
        || values && (value === null || typeof value !== 'object') && String(value).toLocaleLowerCase().includes(needle);
    };
    const path = [...partsFor(root)], value = read(path, undefined), result = [];
    if (value === undefined) return result;
    const pending = [{ value, path }];
    while (pending.length && result.length < limit) {
      const item = pending.pop();
      if (!searchable(item.path)) continue;
      if ('parent' in item) { item.value = item.parent[item.key]; delete item.parent; delete item.key; }
      const container = item.value && typeof item.value === 'object';
      if (test(item.value, [...item.path])) result.push({ path: item.path, pointer: jsonPointer(item.path),
        type: item.value === null ? 'null' : Array.isArray(item.value) ? 'array' : typeof item.value,
        ...(!container ? { value: item.value } : {}) });
      if (item.value && typeof item.value === 'object') {
        // Store paths, not child values: stop before touching unrelated JS
        // outputs when a match limit was reached (including this script).
        const children = Reflect.ownKeys(item.value).filter(key => typeof key === 'string' && !(Array.isArray(item.value) && key === 'length'));
        for (let i = children.length - 1; i >= 0; i--) pending.push({ parent: item.value, key: children[i], path: [...item.path, children[i]] });
      }
    }
    return result;
  };
  return Object.freeze({
    get: (path, fallback = null) => read(path, fallback), has: path => read(path, undefined, true),
    all, byId,
    byName: name => { const id = index('name', string(name))[0]; return id ? definition(id) : null; },
    byType: type => index('type', string(type)).map(definition),
    find: condition => filter(condition, true), filter: condition => filter(condition),
    exists: reference => !!idFor(reference), resolve: reference => { const id = idFor(reference); return id ? resolved(id) : null; },
    locate, path: reference => locate(reference)?.pointer ?? null,
    parents: (reference, recursive = false) => relatives(reference, 'parents', recursive),
    children: (reference, recursive = false) => relatives(reference, 'children', recursive),
    search,
  });
}
