import { compileEquation } from './formula.js';
import { compileParametric } from './parametric-formula.js';
import { EquationTask } from './sampler.js';
import { ParametricTask } from './parametric-sampler.js';

let current = null;
const channel = new MessageChannel();
channel.port1.onmessage = () => current?.run?.();
globalThis.onmessage = ({ data }) => {
  if (data.cancel) {
    if (current?.job === data.job) current = null;
    return;
  }
  const { job, object, parameters, view, width, height, options } = data;
  const state = current = { job };
  try {
    const parametric = object.type === 'parametric';
    const compiled = parametric ? compileParametric(object, parameters) : compileEquation(object, parameters);
    const task = new (parametric ? ParametricTask : EquationTask)(compiled, view, width, height, options);
    let lastProgress = performance.now();
    const run = () => {
      if (current !== state) return;
      try {
        const deadline = performance.now() + 8;
        do { task.step(); } while (!task.done && performance.now() < deadline);
        if (task.done) {
          const points = new Float64Array(task.points);
          const segments = task.segments ? new Float64Array(task.segments) : undefined;
          const transfer = segments ? [points.buffer, segments.buffer] : [points.buffer];
          globalThis.postMessage({ job, points, segments, bins: task.bins, stats: task.stats, work: task.work }, transfer);
          current = null;
        } else {
          if (performance.now() - lastProgress >= 50) {
            globalThis.postMessage({ job, progress: task.progress });
            lastProgress = performance.now();
          }
          channel.port2.postMessage(null);
        }
      } catch { current = null; globalThis.postMessage({ job, failed: true }); }
    };
    state.run = run;
    run();
  } catch { current = null; globalThis.postMessage({ job, failed: true }); }
};
