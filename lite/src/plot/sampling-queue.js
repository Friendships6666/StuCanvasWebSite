// Keep one calculation in flight and only the latest waiting value per object.
// Parameter input must not continually cancel a frame before it can be shown.
export class SamplingQueue {
  constructor(workerFactory = typeof Worker === 'undefined' ? null : () => new Worker(new URL('./sampling-worker.js', import.meta.url), { type: 'module' })) {
    this.workerFactory = workerFactory;
    this.worker = null;
    this.pending = new Map();
    this.active = null;
    this.sequence = 0;
    this.timer = null;
  }

  submit(id, compatibility, task, payload, accept) {
    if (this.active?.id === id && this.active.compatibility !== compatibility) this.cancelActive();
    this.pending.set(id, { id, compatibility, task, payload, accept });
    this.start();
  }

  retain(ids) {
    for (const id of this.pending.keys()) if (!ids.has(id)) this.pending.delete(id);
    if (this.active && !ids.has(this.active.id)) this.cancelActive();
    this.start();
  }

  cancelActive() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.worker && this.active) this.worker.postMessage({ cancel: true, job: this.active.job });
    this.active = null;
  }

  start() {
    if (this.active || !this.pending.size) return;
    const request = this.pending.values().next().value;
    this.pending.delete(request.id);
    request.job = ++this.sequence;
    this.active = request;
    if (!this.worker && this.workerFactory) {
      try {
        this.worker = this.workerFactory();
        this.worker.onmessage = ({ data }) => this.receive(data);
        this.worker.onerror = event => { event.preventDefault?.(); this.fallback(); };
        this.worker.onmessageerror = () => this.fallback();
      } catch { this.workerFactory = null; }
    }
    if (this.worker) {
      try { this.worker.postMessage({ ...request.payload, job: request.job }); }
      catch { this.fallback(); }
    } else this.timer = setTimeout(() => this.run(), 0);
  }

  receive(data) {
    const request = this.active;
    if (!request || request.job !== data.job) return;
    if (data.failed) { this.fallback(); return; }
    if (data.progress !== undefined) { request.task.progress = data.progress; return; }
    Object.assign(request.task, { points: data.points, bins: data.bins, stats: data.stats, work: data.work, progress: 1, done: true, iterator: null });
    if (data.segments) request.task.segments = data.segments;
    this.finish();
  }

  fallback() {
    this.worker?.terminate();
    this.worker = null;
    this.workerFactory = null;
    if (this.active) {
      this.active.task.progress = 0;
      this.timer = setTimeout(() => this.run(), 0);
    }
  }

  run() {
    this.timer = null;
    const request = this.active;
    if (!request) return;
    const deadline = performance.now() + request.task.options.sliceMs;
    do { request.task.step(); } while (!request.task.done && performance.now() < deadline);
    if (request.task.done) this.finish();
    else this.timer = setTimeout(() => this.run(), 0);
  }

  finish() {
    const request = this.active;
    this.active = null;
    request.accept(request.task);
    this.start();
  }

  destroy() {
    this.pending.clear();
    this.cancelActive();
    this.worker?.terminate();
    this.worker = null;
  }
}
