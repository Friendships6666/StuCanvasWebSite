export const DEFAULT_INSTANCE_SUBDIVISIONS = 8;
export const MIN_INSTANCE_SUBDIVISIONS = 1;
export const MAX_INSTANCE_SUBDIVISIONS = 32;
export const validInstanceSubdivisions = value => Number.isInteger(value)
  && value >= MIN_INSTANCE_SUBDIVISIONS && value <= MAX_INSTANCE_SUBDIVISIONS;

// The display grid is independent. This cell size is used only while taking a
// new physics snapshot, at the current zoom and device pixel ratio.
export function instanceCell(object, ratio = 1) {
  const subdivisions = object.instanceSubdivisions ?? DEFAULT_INSTANCE_SUBDIVISIONS;
  return 1 / (subdivisions * Math.max(1, Math.min(4, ratio || 1)));
}
