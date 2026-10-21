// Generated samples are expendable caches. Only the small construction graph
// is permanent; long recordings must not retain every particle snapshot.
export const snapshotBytes = value => {
  if (value instanceof Map) return 128 + [...value.values()].reduce((sum, item) => sum + snapshotBytes(item), 0);
  if (value?.geometry) return 1024 + value.geometry.reduce((sum, item) => sum + snapshotBytes(item) + (item.plot?.points?.length || 0) * 16, 0);
  return 1024 + (value?.shape?.rectangles?.length || 0) * 64 + (value?.mesh?.vertices?.length || 0) * 256 + ['nodes', 'particles', 'links'].reduce((sum, key) => sum + ((value?.[key]?.length || 0) + (value?.initialState?.[key]?.length || 0)) * 192, 0);
};

export class ConstructionCache extends Map {
  constructor({ maxBytes = 32 * 1024 * 1024, maxEntries = 4096, weight = snapshotBytes } = {}) {
    super(); this.maxBytes = maxBytes; this.maxEntries = maxEntries; this.weight = weight;
    this.bytes = 0; this.costs = new Map();
  }
  get(key) {
    if (!super.has(key)) return undefined;
    const value = super.get(key); super.delete(key); super.set(key, value); return value;
  }
  set(key, value) {
    this.delete(key); const cost = this.weight(value); super.set(key, value);
    this.costs.set(key, cost); this.bytes += cost;
    while (this.size > 1 && (this.bytes > this.maxBytes || this.size > this.maxEntries)) this.delete(this.keys().next().value);
    return this;
  }
  delete(key) {
    this.bytes -= this.costs.get(key) || 0; this.costs.delete(key); return super.delete(key);
  }
  clear() { super.clear(); this.costs.clear(); this.bytes = 0; }
}
