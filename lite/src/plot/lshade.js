const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

const multiplyHigh = (first, second) => {
  const lower = (first & 65535) * (second & 65535);
  const middle = (first >>> 16) * (second & 65535) + (lower >>> 16);
  const upper = (first & 65535) * (second >>> 16) + (middle & 65535);
  return (Math.imul(first >>> 16, second >>> 16) + (middle >>> 16) + (upper >>> 16)) >>> 0;
};

class SplitMix64 {
  constructor(seed) {
    this.low = (seed >>> 0) ^ 0x7f4a7c15;
    this.high = 0x9e3779b9;
    this.real();
  }
  real() {
    const previous = this.low >>> 0;
    this.low = (previous + 0x7f4a7c15) >>> 0;
    this.high = ((this.high >>> 0) + 0x9e3779b9 + Number(this.low < previous)) >>> 0;
    let lower = this.low ^ ((this.low >>> 30) | (this.high << 2));
    let upper = this.high ^ (this.high >>> 30);
    upper = (multiplyHigh(lower, 0x1ce4e5b9) + Math.imul(upper, 0x1ce4e5b9) + Math.imul(lower, 0xbf58476d)) >>> 0;
    lower = Math.imul(lower, 0x1ce4e5b9) >>> 0;
    lower ^= (lower >>> 27) | (upper << 5);
    upper ^= upper >>> 27;
    upper = (multiplyHigh(lower, 0x133111eb) + Math.imul(upper, 0x133111eb) + Math.imul(lower, 0x94d049bb)) >>> 0;
    lower = Math.imul(lower, 0x133111eb) >>> 0;
    lower ^= (lower >>> 31) | (upper << 1);
    upper ^= upper >>> 31;
    return ((upper >>> 0) * 2097152 + (lower >>> 11)) * 2 ** -53;
  }
  range(lower, upper) { return lower + this.real() * (upper - lower); }
}

const normal = random => {
  let first = random();
  while (first <= Number.MIN_VALUE) first = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * random());
};
const cauchy = random => Math.tan(Math.PI * (random() - 0.5));

export function* refineLShade(evaluate, bounds, seed = 0, options = {}, initialPosition = null) {
  const initialSize = options.population ?? 100;
  const minimumSize = options.minimumPopulation ?? 4;
  const reductionScale = 150000;
  const historySize = options.memory ?? 6;
  const pBestRatio = options.pBest ?? 0.11;
  const archiveRatio = options.archiveRatio ?? 1.4;
  const randomSource = new SplitMix64(seed);
  const random = () => randomSource.real();
  let evaluations = 0;
  const score = position => {
    evaluations++;
    const value = Math.abs(evaluate(position[0], position[1]));
    return value;
  };
  const population = [];
  const costs = [];
  for (let index = 0; index < initialSize; index++) {
    const position = [randomSource.range(bounds[0][0], bounds[0][1]), randomSource.range(bounds[1][0], bounds[1][1])];
    // Optional Newton warm start occupies one member; the remaining population
    // and the complete optimizer termination criteria stay unchanged.
    if (index === 0 && initialPosition?.length === 2 && initialPosition.every(Number.isFinite)) {
      for (let axis = 0; axis < 2; axis++) position[axis] = clamp(initialPosition[axis], bounds[axis][0], bounds[axis][1]);
    }
    const cost = score(position);
    population.push(position);
    costs.push(cost);
    yield;
  }
  let populationSize = initialSize;
  const archive = [];
  const memoryF = new Float64Array(historySize).fill(0.5);
  const memoryCR = new Float64Array(historySize).fill(0.5);
  let memoryIndex = 0;
  while (true) {
    const nextSize = clamp(Math.round(((minimumSize - initialSize) / reductionScale) * evaluations + initialSize), minimumSize, initialSize);
    if (nextSize < populationSize) {
      const order = [...Array(populationSize).keys()].sort((first, second) => {
        if (Number.isNaN(costs[first])) return 1;
        if (Number.isNaN(costs[second])) return -1;
        return costs[first] - costs[second];
      });
      const selectedPositions = order.slice(0, nextSize).map(index => population[index]);
      const selectedCosts = order.slice(0, nextSize).map(index => costs[index]);
      population.length = 0; costs.length = 0;
      population.push(...selectedPositions); costs.push(...selectedCosts);
      populationSize = nextSize;
      archive.splice(Math.round(populationSize * archiveRatio));
    }
    const order = [...Array(populationSize).keys()].sort((first, second) => {
      if (Number.isNaN(costs[first])) return 1;
      if (Number.isNaN(costs[second])) return -1;
      return costs[first] - costs[second];
    });
    const successF = [];
    const successCR = [];
    const deltaF = [];
    const trial = new Array(populationSize);
    const trialCosts = new Array(populationSize).fill(NaN);
    for (let index = 0; index < populationSize; index++) {
      const memory = Math.floor(random() * historySize);
      const CR = memoryCR[memory] < 0 ? 0 : clamp(memoryCR[memory] + 0.1 * normal(random), 0, 1);
      let F;
      do { F = memoryF[memory] + 0.1 * cauchy(random); } while (F <= 0);
      F = Math.min(F, 1);
      const pBestPool = Math.max(2, Math.round(populationSize * pBestRatio));
      const best = order[Math.floor(random() * pBestPool)];
      let first;
      do { first = Math.floor(random() * populationSize); } while (first === index || first === best);
      const unionSize = populationSize + archive.length;
      let second;
      do { second = Math.floor(random() * unionSize); } while (second === index || second === best || second === first);
      const secondPosition = second < populationSize ? population[second] : archive[second - populationSize];
      const forcedAxis = Math.floor(random() * 2);
      const candidate = population[index].slice();
      for (let axis = 0; axis < 2; axis++) {
        if (axis !== forcedAxis && random() >= CR) continue;
        const value = candidate[axis];
        const mutated = value + F * (population[best][axis] - value) + F * (population[first][axis] - secondPosition[axis]);
        candidate[axis] = clamp(mutated, bounds[axis][0], bounds[axis][1]);
      }
      trial[index] = candidate;
      const trialCost = score(trial[index]);
      trialCosts[index] = trialCost;
      if (Number.isNaN(trialCost)) { yield; continue; }
      if (trialCost < costs[index] || Number.isNaN(costs[index])) {
        successF.push(F); successCR.push(CR);
        deltaF.push(Number.isNaN(costs[index]) ? 1e-5 : Math.abs(costs[index] - trialCost));
      }
      yield;
    }
    for (let index = 0; index < populationSize; index++) {
      if (Number.isNaN(trialCosts[index])) continue;
      if (trialCosts[index] < costs[index] || Number.isNaN(costs[index])) {
        if (archive.length < Math.round(populationSize * archiveRatio)) archive.push(population[index].slice());
        else if (archive.length) archive[Math.floor(random() * archive.length)] = population[index].slice();
        population[index] = trial[index];
        costs[index] = trialCosts[index];
      }
    }
    const sumDelta = deltaF.reduce((sum, value) => sum + value, 0);
    if (successF.length && sumDelta > 0) {
      const fNumerator = successF.reduce((sum, value, index) => sum + deltaF[index] * value * value, 0);
      const fDenominator = successF.reduce((sum, value, index) => sum + deltaF[index] * value, 0);
      const crMean = successCR.reduce((sum, value, index) => sum + deltaF[index] * value, 0) / sumDelta;
      memoryF[memoryIndex] = fDenominator > 0 ? fNumerator / fDenominator : 0.5;
      memoryCR[memoryIndex] = crMean;
      memoryIndex = (memoryIndex + 1) % historySize;
    }
    if (!successF.length) {
      const best = order[0];
      const cost = costs[best];
      const sameCost = Number.isFinite(cost) && costs.every(value => value === cost);
      const samePosition = population.every(position => position[0] === population[best][0] && position[1] === population[best][1]);
      if (sameCost || samePosition) return population[best];
    }
  }
}
