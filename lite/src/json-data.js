import { LocalizedError } from './i18n.js';

// Reject actual back-references; sharing the same immutable value in separate
// branches is valid JSON. Never silently discard a cycle or non-JSON data.
export function jsonData(value) {
  const active = new WeakSet();
  function copy(input, path, depth) {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (input === undefined) return undefined;
    if (!input || typeof input !== 'object' || depth > 256) throw new LocalizedError('error.documentValue', { path });
    if (active.has(input)) throw new LocalizedError('error.documentCycle', { ids: path });
    if (![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(input))) throw new LocalizedError('error.documentValue', { path });
    active.add(input);
    let output;
    if (Array.isArray(input)) output = input.map((item, index) => copy(item, `${path}[${index}]`, depth + 1) ?? null);
    else {
      output = {};
      for (const [key, child] of Object.entries(input)) {
        const next = copy(child, `${path}.${key}`, depth + 1);
        if (next !== undefined) Object.defineProperty(output, key, { value: next, enumerable: true, writable: true, configurable: true });
      }
    }
    active.delete(input); return output;
  }
  return copy(value, '$', 0);
}
