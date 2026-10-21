export const parameters = [
  ['cellSize', 'parameter.cellSize', 32, 1, 64, 1],
  ['lshadeCellSize', 'parameter.lshadeCellSize', 1, 0.25, 64, 0.25],
  ['marchingBlocks', 'parameter.marchingBlocks', 4, 1, 16, 1],
  ['marchingRefinement', 'parameter.marchingRefinement', 1, 0, 4, 1],
  ['tolerance', 'parameter.tolerance', 1e-7, 1e-300, 1e300, 'any'],
  ['verificationRadius', 'parameter.verificationRadius', 0.001, 1e-9, 1, 'any'],
  ['newtonIterations', 'parameter.newtonIterations', 5, 0, 50, 1],
  ['population', 'parameter.population', 100, 4, 256, 1],
  ['minimumPopulation', 'parameter.minimumPopulation', 4, 4, 128, 1],
  ['memory', 'parameter.memory', 6, 1, 32, 1],
  ['pBest', 'parameter.pBest', 0.11, 0.02, 1, 0.01],
  ['archiveRatio', 'parameter.archiveRatio', 1.4, 0, 4, 0.05],
  ['seed', 'parameter.seed', 1, 0, 4294967295, 1],
  ['edgeIterations', 'parameter.edgeIterations', 12, 0, 50, 1],
  ['pointSpacing', 'parameter.pointSpacingMS', 0.75, 0.25, 4, 0.25],
  ['sliceMs', 'parameter.sliceMs', 3, 1, 8, 0.5],
];

export const defaults = Object.fromEntries([['algorithm', 'marching'], ...parameters.map(([key, , value]) => [key, value])]);

const marchingParameters = new Set(['cellSize', 'marchingBlocks', 'marchingRefinement', 'edgeIterations', 'pointSpacing', 'tolerance']);
const lshadeParameters = new Set(['lshadeCellSize', 'newtonIterations', 'population', 'minimumPopulation', 'memory', 'pBest', 'archiveRatio', 'seed', 'verificationRadius']);

export function parameterAppliesToAlgorithm(key, algorithm) {
  return !(algorithm === 'lshade' ? marchingParameters : lshadeParameters).has(key);
}

export function normalizeOptions(input = {}) {
  const options = { ...defaults, algorithm: input.algorithm === 'lshade' ? 'lshade' : 'marching' };
  for (const [key, , fallback, minimum, maximum, step] of parameters) {
    const value = Number(input[key] ?? fallback);
    options[key] = Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, step === 1 ? Math.round(value) : value)) : fallback;
  }
  options.marchingBlocks = 2 ** Math.round(Math.log2(options.marchingBlocks));
  options.minimumPopulation = Math.min(options.minimumPopulation, options.population);
  return options;
}
