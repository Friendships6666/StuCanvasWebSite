import { createCircularCurve, distance } from './geometry.js';

// The cursor supplies only the next missing point; it never enters the document.
export function circularPreview(tool, fixedPoints, cursor) {
  if (!cursor || !fixedPoints.length || fixedPoints.some(point => !point)) return [];
  const points = [...fixedPoints, cursor];
  const type = tool.shapeType || tool.id;
  const required = tool.requiredPoints || 2;
  const guide = (first, second) => distance(first, second) > 0 ? [{ type: 'segment', first, second, preview: true }] : [];
  if (points.length < required) {
    // A center and a moving radius already describe a useful supporting circle.
    if ((type === 'arc' || type === 'sector') && tool.construction !== 'three-point') {
      const circle = createCircularCurve('circle', points);
      if (circle) return [{ ...circle, preview: true }, ...guide(points[0], cursor)];
    }
    return guide(points.at(-2), cursor);
  }
  const curve = createCircularCurve(type, points, tool.construction);
  if (curve) return [{ ...curve, preview: true }];
  // Collinear/coincident points do not define a circle. Keep the moving guides,
  // so there is immediate feedback and no stale curve while crossing that case.
  return points.slice(1).flatMap((point, index) => guide(points[index], point));
}
