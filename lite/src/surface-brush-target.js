import { nearestSurface, surfaceSegments } from './surface-friction.js';

// Acquisition distance is independent of paint radius. A stroke keeps its
// object and follows its face normal, even if the cursor jitters across a line.
export function findBrushSurface(objects, position, view, width, height, reach = 10, lock = null) {
  let target = null;
  for (const geometry of objects) {
    if (lock && geometry.id !== lock.id) continue;
    const hit = nearestSurface(surfaceSegments(geometry, view, width, height), position, lock?.normal);
    if (!hit || hit.distance * view.scale > reach) continue;
    if (!target || hit.score < target.hit.score) target = { geometry, hit };
  }
  return target;
}
