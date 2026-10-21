// JS regions publish JSON values. Geometry consumes them through formulas or
// declarative field bindings; scripts never patch a geometric object directly.
export const SCRIPT_LIMIT = 32768;
export const SCRIPT_OUTPUT_LIMIT = 65536;
export const isJavaScript = object => object?.type === 'javascript';
export const hasScript = object => isJavaScript(object) && object.enabled !== false && !!object.source?.trim();
export const lockedScriptFields = new Set(['id', 'name', 'type', 'parents', 'bindings', 'script', 'source', 'xSource', 'ySource', 'draft', 'invalid', 'error', '__proto__', 'constructor', 'prototype']);
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
export const validVariablePath = path => typeof path === 'string' && /^[a-zA-Z][a-zA-Z0-9]*(?:(?:\.[a-zA-Z][a-zA-Z0-9]*)|(?:\[\d+\]))*$/.test(path) && !path.split(/[.\[\]]/).some(key => forbidden.has(key));
export const variableRoot = path => path.split(/[.\[]/, 1)[0].toLowerCase();
export const pathParts = path => path.replace(/\[(\d+)\]/g, '.$1').split('.');
export const hasBindings = object => !!object.bindings && Object.keys(object.bindings).length > 0;
export const needsReflection = object => hasScript(object) || hasBindings(object);
export const reflectionSource = object => isJavaScript(object) ? object.source : JSON.stringify(object.bindings);

export function jsonValue(value) {
  let size = 0;
  function copy(input, depth = 0) {
    if (depth > 32 || ++size > 8192) throw new Error('Output is too large or too deeply nested');
    if (input === null || typeof input === 'boolean' || typeof input === 'string') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (!input || typeof input !== 'object' || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('Return finite JSON data');
    if (Array.isArray(input)) return Array.from(input, child => copy(child, depth + 1));
    const result = {};
    for (const key of Object.keys(input)) {
      if (forbidden.has(key)) throw new Error(`Unsupported field: ${key}`);
      Object.defineProperty(result, key, { value: copy(input[key], depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return result;
  }
  const result = copy(value);
  if (JSON.stringify(result).length > SCRIPT_OUTPUT_LIMIT) throw new Error('Output is too large');
  return result;
}

export function formulaParameters(objects) {
  const result = {};
  const flatten = (value, path, depth = 0) => {
    if (depth > 32) return;
    if (Number.isFinite(value)) result[path.toLowerCase()] = value;
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      const next = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;
      if (validVariablePath(next)) flatten(child, next, depth + 1);
    }
  };
  for (const object of objects) {
    if (object.type === 'slider' && Number.isFinite(object.value)) result[object.name.toLowerCase()] = object.value;
    else if (isJavaScript(object)) flatten(object.value === undefined ? 0 : object.value, object.name);
  }
  return result;
}

export function variableValue(objects, reference) {
  if (!validVariablePath(reference)) throw new Error(`Invalid variable reference: ${reference}`);
  const [root, ...parts] = pathParts(reference);
  const object = objects.find(item => isJavaScript(item) && item.name.toLowerCase() === root.toLowerCase());
  if (!object) throw new Error(`Variable not found: ${root}`);
  let value = object.value;
  for (const key of parts) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error(`Variable path not found: ${reference}`);
    value = value[key];
  }
  return jsonValue(value);
}

export function bindingPatch(object, read) {
  const result = {};
  for (const [field, reference] of Object.entries(object.bindings || {})) {
    const parts = field.split('.');
    if (!/^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)*$/.test(field) || parts.some(part => forbidden.has(part)) || lockedScriptFields.has(parts[0])) throw new Error(`Unsupported binding field: ${field}`);
    if (!Object.hasOwn(result, parts[0])) result[parts[0]] = structuredClone(object[parts[0]]);
    let target = result;
    for (let index = 0; index < parts.length - 1; index++) {
      const key = parts[index];
      if (!target[key] || typeof target[key] !== 'object') throw new Error(`Binding field not found: ${field}`);
      target = target[key];
    }
    target[parts.at(-1)] = read(reference);
  }
  return result;
}
