import { documentKey } from './document.js';
import { needsReflection, reflectionSource } from './reflection.js';

export class ReflectionManager {
  constructor({ read, version, resolved, resolvedVersion, apply, changed, workerFactory = () => new Worker(new URL('./reflection-worker.js', import.meta.url), { type: 'module' }) }) {
    Object.assign(this, { read, version, resolved, resolvedVersion, apply, changed, workerFactory });
    this.statuses = new Map(); this.blocked = new Map(); this.worker = null;
    this.key = ''; this.job = 0; this.pending = false; this.timer = null; this.active = [];
  }

  invalidate({ keepCache = false } = {}) {
    if (keepCache) {
      this.key = ''; this.statuses.clear();
      if (this.pending) this.discard = true;
      return;
    }
    this.worker?.terminate(); this.worker = null; clearTimeout(this.timer);
    this.pending = false; this.key = ''; this.active = []; this.job++;
    this.statuses.clear(); this.blocked.clear(); this.discard = false;
  }

  retry(id) { this.blocked.delete(id); this.key = ''; this.sync(); }

  sync() {
    if (this.pending) return; // Completion pulls the newest document; no job queue.
    const version = this.version?.();
    if (this.version && this.key && version === this.seenVersion) return;
    const document = this.read();
    this.seenVersion = version;
    const bindings = document.objects.filter(needsReflection);
    for (const [id, source] of this.blocked) if (!bindings.some(object => object.id === id && reflectionSource(object) === source)) this.blocked.delete(id);
    for (const id of this.statuses.keys()) if (!bindings.some(object => object.id === id)) this.statuses.delete(id);
    if (!bindings.length) { this.key = ''; return; }
    const key = documentKey([document, this.resolvedVersion?.()]);
    if (key === this.key) return;
    this.key = key;
    if (!this.worker) {
      try { this.worker = this.workerFactory(); }
      catch (error) { for (const object of bindings) this.statuses.set(object.id, { error: error.message }); this.changed(); return; }
      this.worker.onmessage = event => this.receive(event.data);
      this.worker.onerror = event => { event.preventDefault?.(); this.stop(event.message || 'Worker failed'); };
    }
    this.pending = true; this.active = []; this.document = document;
    this.worker.postMessage({ job: ++this.job, document, resolved: [...this.resolved()], blocked: [...this.blocked.keys()] });
    this.arm(3000); // Worker/module startup does not consume the execution budget.
  }

  arm(milliseconds) { clearTimeout(this.timer); this.timer = setTimeout(() => this.stop('Script execution timed out (200 ms)'), milliseconds); }

  stop(message) {
    const id = this.active.at(-1);
    if (id) {
      const object = this.document.objects.find(item => item.id === id);
      this.blocked.set(id, reflectionSource(object));
      this.statuses.set(id, { error: message });
    } else for (const object of this.document?.objects.filter(needsReflection) || []) {
      this.blocked.set(object.id, reflectionSource(object)); this.statuses.set(object.id, { error: message });
    }
    this.worker?.terminate(); this.worker = null; this.pending = false; this.active = []; this.discard = false;
    clearTimeout(this.timer); this.key = ''; this.job++; this.changed();
    // Restart independent scripts after terminating a hung one.
    if (this.document.objects.some(object => needsReflection(object) && !this.blocked.has(object.id))) this.sync();
  }

  receive(data) {
    if (!this.pending || data.job !== this.job) return;
    if (data.progress) {
      if (data.id) this.active.push(data.id); else this.active.pop();
      this.arm(this.active.length ? 200 : 3000);
      return;
    }
    clearTimeout(this.timer); this.pending = false; this.active = [];
    if (this.discard) { this.discard = false; this.sync(); return; }
    if (data.failure) { this.stop(data.failure); return; }
    for (const status of data.statuses || []) if (!this.blocked.has(status.id)) this.statuses.set(status.id, status);
    this.apply(data.updates || []);
    this.changed();
    this.sync();
  }
}
