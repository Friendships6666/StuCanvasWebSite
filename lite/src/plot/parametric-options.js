export const parametricParameters = [
  ['pointSpacing', 'parameter.pointSpacing', 0.75, 0.15, 4, 'any'],
  ['error', 'parameter.error', 0.25, 0.01, 2, 'any'],
  ['segmentLength', 'parameter.segmentLength', 8, 1, 64, 'any'],
  ['initialSegments', 'parameter.initialSegments', 32, 1, 1024, 1],
  ['maxRecursionDepth', 'parameter.maxRecursionDepth', 20, 0, 1024, 1],
  ['sliceMs', 'parameter.sliceMs', 3, 1, 8, 'any'],
];

export const parametricDefaults = Object.fromEntries([['algorithm', 'adaptive'], ...parametricParameters.map(([key, , value]) => [key, value])]);

export function normalizeParametricOptions(input = {}) {
  const options = { ...parametricDefaults, algorithm: input.algorithm === 'interval' ? 'interval' : 'adaptive' };
  for (const [key, , fallback, minimum, maximum, step] of parametricParameters) {
    const value = Number(input[key] ?? fallback);
    options[key] = Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, step === 1 ? Math.round(value) : value)) : fallback;
  }
  return options;
}

export function parametricParameterApplies(key, algorithm) {
  return algorithm === 'adaptive' ? key !== 'maxRecursionDepth' : ['pointSpacing', 'maxRecursionDepth', 'sliceMs'].includes(key);
}
