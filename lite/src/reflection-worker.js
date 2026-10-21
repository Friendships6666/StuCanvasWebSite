import { ReflectionEngine } from './reflection-engine.js';

const engine = new ReflectionEngine();
const send = globalThis.postMessage.bind(globalThis);
globalThis.onmessage = ({ data }) => {
  try {
    const result = engine.evaluate(data.document, data.resolved, data.blocked, id => send({ job: data.job, progress: true, id }));
    send({ job: data.job, ...result });
  } catch (error) { send({ job: data.job, failure: String(error.message || error) }); }
};
