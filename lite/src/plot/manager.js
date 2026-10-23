import { compileEquation } from './formula.js';
import { EquationTask } from './sampler.js';
import { defaults, normalizeOptions } from './options.js';
import { compileParametric } from './parametric-formula.js';
import { normalizeParametricOptions } from './parametric-options.js';
import { ParametricTask } from './parametric-sampler.js';
import { isPlot, plotSourceKey } from './types.js';
import { formulaParameters } from '../reflection.js';
import { SamplingQueue } from './sampling-queue.js';

export class PlotManager {
  constructor(onChange, workerFactory) {
    this.onChange = onChange;
    this.options = { ...defaults };
    this.entries = new Map();
    this.key = '';
    this.timer = null;
    this.lastPaint = 0;
    this.cursor = 0;
    this.viewportKey = '';
    this.sampling = new SamplingQueue(workerFactory);
  }

  configure(options) {
    this.options = normalizeOptions(options);
    this.key = '';
  }

  sync(objects, view, width, height) {
    const equations = objects.filter(object => isPlot(object) && !object.hidden && !object.invalid);
    const parameters = formulaParameters(objects);
    const parameterKey = JSON.stringify(parameters);
    const parameterNamesKey = JSON.stringify(Object.keys(parameters).sort());
    const viewportKey = JSON.stringify([view, width, height]);
    const viewportChanged = viewportKey !== this.viewportKey;
    const configurations = equations.map(object => object.type === 'parametric' ? normalizeParametricOptions(object.plotOptions) : normalizeOptions({ ...this.options, ...object.plotOptions }));
    const key = JSON.stringify([viewportKey, parameterKey, equations.map((object, index) => [object.id, plotSourceKey(object), configurations[index]])]);
    if (key === this.key) return;
    this.key = key;
    this.viewportKey = viewportKey;
    const entries = new Map();
    const backgroundIds = new Set();
    let restarted = false;
    for (const [index, object] of equations.entries()) {
      const old = this.entries.get(object.id);
      const source = plotSourceKey(object);
      const configurationKey = JSON.stringify(configurations[index]);
      const unchangedParameters = old?.parameterNamesKey === parameterNamesKey && old.dependencyKey === JSON.stringify(old.compiled.parameterNames.map(name => [name, parameters[name]]));
      const compiled = old?.source === source && unchangedParameters ? old.compiled : object.type === 'parametric' ? compileParametric(object, parameters) : compileEquation(object, parameters);
      const dependencyKey = JSON.stringify(compiled.parameterNames.map(name => [name, parameters[name]]));
      if (old?.source === source && old.configurationKey === configurationKey && old.dependencyKey === dependencyKey && this.covers(old.task, view, width, height)) {
        old.parameterNamesKey = parameterNamesKey;
        entries.set(object.id, old);
        if (old.background) backgroundIds.add(object.id);
        continue;
      }
      const padding = Math.min(160, Math.max(64, Math.round(Math.min(width, height) * 0.15)));
      const previous = old?.source === source ? this.display(old) : null;
      const Task = object.type === 'parametric' ? ParametricTask : EquationTask;
      const task = new Task(compiled, view, width + padding * 2, height + padding * 2, configurations[index]);
      const background = object.type === 'parametric' || compiled.parameterNames.length > 0;
      const compatibility = JSON.stringify([source, configurationKey, task.view, task.width, task.height]);
      entries.set(object.id, {
        source, compiled, parameterNamesKey, dependencyKey, configurationKey, background, compatibility,
        previous: previous?.points.length ? previous : null,
        task,
      });
      if (background) {
        backgroundIds.add(object.id);
        // Only source/bounds are sent; unrelated object data and runtime state
        // never become part of the worker payload or document representation.
        const definition = object.type === 'parametric'
          ? { type: object.type, xSource: object.xSource, ySource: object.ySource, tMin: object.tMin, tMax: object.tMax }
          : { type: object.type, source: object.source };
        if (object.plotTransform) definition.plotTransform = object.plotTransform;
        this.sampling.submit(object.id, compatibility, task, {
          object: definition, parameters, view: task.view, width: task.width, height: task.height, options: task.options,
        }, completed => {
          const entry = this.entries.get(object.id);
          if (entry?.compatibility !== compatibility) return;
          entry.previous = entry.task === completed ? null : completed;
          this.onChange();
        });
      }
      restarted = true;
    }
    this.entries = entries;
    this.sampling.retain(backgroundIds);
    if (!entries.size || restarted) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (entries.size && this.timer === null && [...entries.values()].some(entry => !entry.background && !entry.task.done)) {
      this.timer = setTimeout(() => this.run(), viewportChanged ? 40 : 0);
    }
  }

  covers(task, view, width, height) {
    if (task.view.scale !== view.scale) return false;
    const offsetX = Math.abs((view.x - task.view.x) * view.scale);
    const offsetY = Math.abs((view.y - task.view.y) * view.scale);
    return offsetX + width / 2 <= task.width / 2 - 24 && offsetY + height / 2 <= task.height / 2 - 24;
  }

  display(entry) {
    const streaming = entry.task.options.algorithm === 'lshade' || (['adaptive', 'interval'].includes(entry.task.options.algorithm) && !entry.previous);
    return entry.task.done || (streaming && entry.task.points.length) ? entry.task : entry.previous || entry.task;
  }

  get(id) {
    const entry = this.entries.get(id);
    return entry ? this.display(entry) : null;
  }

  equation(id) {
    return this.entries.get(id)?.compiled;
  }

  status(id) {
    const task = this.entries.get(id)?.task;
    return task ? { task, progress: task.progress, done: task.done, algorithm: task.options.algorithm } : null;
  }

  run() {
    this.timer = null;
    const active = [...this.entries.values()].filter(entry => !entry.background && !entry.task.done);
    if (!active.length) return;
    const deadline = performance.now() + Math.min(this.options.sliceMs, ...active.map(entry => entry.task.options.sliceMs));
    let completed = false;
    do {
      const entry = active[this.cursor++ % active.length];
      entry.task.step();
      if (entry.previous && entry.task.options.algorithm === 'lshade' && entry.task.points.length) entry.previous = null;
      if (entry.task.done) {
        entry.previous = null;
        completed = true;
        active.splice(active.indexOf(entry), 1);
      }
    } while (active.length && performance.now() < deadline);
    if (completed || (performance.now() - this.lastPaint > 50 && active.some(entry => this.display(entry) === entry.task && entry.task.points.length))) {
      this.lastPaint = performance.now();
      this.onChange();
    }
    if (active.length) this.timer = setTimeout(() => this.run(), 0);
  }

  destroy() {
    clearTimeout(this.timer);
    this.timer = null;
    this.sampling.destroy();
    this.entries.clear();
  }
}
