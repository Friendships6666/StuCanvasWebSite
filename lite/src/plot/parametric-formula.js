import { LocalizedError } from '../i18n.js';
import { compileExpression } from './formula.js';
import * as stuplotIntervals from './stuplot-interval.js';

function coordinate(source, parameters) {
  if (typeof source !== 'string' || !source.trim()) throw new LocalizedError('error.enterParametric');
  if (/[=＝]/.test(source)) throw new LocalizedError('error.noEquals');
  if (/(?<![a-zA-Z0-9.])\b[xy]+\b(?![a-zA-Z0-9.])/i.test(source)) throw new LocalizedError('error.parametricVariable');
  const bound = { ...parameters };
  delete bound.t;
  return compileExpression(source, bound, 't');
}

export function compileParametric(object, parameters = {}) {
  const tMin = Number(object.tMin);
  const tMax = Number(object.tMax);
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMin > tMax) throw new LocalizedError('error.parametricRange');
  const horizontal = coordinate(object.xSource, parameters);
  const vertical = coordinate(object.ySource, parameters);
  const horizontalBoxes = horizontal.compileInterval(stuplotIntervals);
  const verticalBoxes = vertical.compileInterval(stuplotIntervals);
  return {
    tMin, tMax,
    parameterNames: [...new Set([...horizontal.parameterNames, ...vertical.parameterNames])],
    intervalBoxes: (lower, upper) => ({ x: horizontalBoxes(lower, upper), y: verticalBoxes(lower, upper) }),
    evaluate: parameter => ({ x: horizontal.evaluate(parameter), y: vertical.evaluate(parameter) }),
    derivative: parameter => ({ x: horizontal.derivative(parameter), y: vertical.derivative(parameter) }),
    interval: (lower, upper) => ({ x: horizontal.interval(lower, upper), y: vertical.interval(lower, upper) }),
  };
}
