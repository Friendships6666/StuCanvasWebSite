import { nextDown, nextUp, containsZero, isUnbounded, bounded } from './interval.js';

const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const spacing = value => Math.max(nextUp(value) - value, value - nextDown(value));
const extent = range => [Math.min(...range.parts.map(part => part[0])), Math.max(...range.parts.map(part => part[1]))];
// Newton requires zero inclusion without a whole-real component. After the
// completed L-SHADE search, whole-real enclosures are retained as well.
export const acceptsRange = (range, allowWhole = true) => containsZero(range) && (allowWhole || !isUnbounded(range));

// Expansion conflicts only when the enlarged enclosure no longer contains
// zero. Unbounded components are eligible at every verification radius.
export function adaptiveVerification(evaluateRange, x, y, base, cellWorld, options) {
  const ulp = Math.max(spacing(x), spacing(y), Number.MIN_VALUE);
  if (!Number.isFinite(ulp) || !(cellWorld > 0) || !Number.isFinite(cellWorld)) return { accepted: true, conflict: false };
  const weight = options.verificationScale;
  const cap = Math.max(ulp, Math.exp(weight * Math.log(ulp) + (1 - weight) * Math.log(cellWorld)));
  const rangeAt = (px, py, radius = 0) => evaluateRange(nextDown(px - radius), nextUp(px + radius), nextDown(py - radius), nextUp(py + radius));
  let conflict = false;
  for (let radius = ulp; ;) {
    if (!acceptsRange(rangeAt(x, y, radius))) { conflict = true; break; }
    if (radius >= cap) break;
    // Small growth factors can round a subnormal radius back to itself.
    radius = Math.min(Math.max(radius * options.verificationGrowth, nextUp(radius)), cap);
  }
  if (!conflict) return { accepted: true, conflict: false };

  const magnitudes = [];
  for (const [dx, dy] of directions) {
    const range = rangeAt(x + dx * cap, y + dy * cap);
    if (!bounded(range)) continue;
    const [lower, upper] = extent(range);
    magnitudes.push(Math.max(Math.abs(lower), Math.abs(upper)));
  }
  // With insufficient finite observations, retain the candidate.
  if (magnitudes.length < directions.length / 2) return { accepted: true, conflict: true };
  magnitudes.sort((first, second) => first - second);
  const localScale = magnitudes[Math.floor(magnitudes.length / 2)];
  const [lower, upper] = extent(base);
  const width = upper - lower;
  const ratio = localScale > 0 ? width / localScale : width === 0 ? 0 : Infinity;
  return { accepted: !(ratio > options.verificationThreshold), conflict: true };
}
