import { isFlexible } from './rope.js';
import { isLiquid } from './liquid.js';
import { isSoftBody, softTriangles, softDistance } from './soft-body.js';
import { flexiblePath as ropePath } from './spring.js';
import { isPhysicsBody, bodyRectangles, bodyContains } from './physics.js';
import { bodyGeometry, bodyWorldPolygons } from './physics-shape.js';
import { toWorld } from './projection.js';
import { arcTypes, isLinear, isPoint } from './geometry.js';
import { cadPrimitives, trimCadSources } from './cad.js';
import { clipLinear, toScreen } from './projection.js';
import { regionScreenBounds } from './regions.js';
import { isPlot } from './plot/types.js';
import { conicSegments, isConic } from './conics.js';
import { isMeasurement, measurementLayout } from './measurements.js';

export function screenBox(first, second) {
  return { left: Math.min(first.x, second.x), top: Math.min(first.y, second.y), right: Math.max(first.x, second.x), bottom: Math.max(first.y, second.y) };
}

export const insideBox = (point, box) => point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;

function segmentInBox(first, second, box) {
  let lower = 0;
  let upper = 1;
  for (const [start, change, minimum, maximum] of [[first.x, second.x - first.x, box.left, box.right], [first.y, second.y - first.y, box.top, box.bottom]]) {
    if (change === 0) { if (start < minimum || start > maximum) return false; }
    else {
      const firstParameter = (minimum - start) / change;
      const secondParameter = (maximum - start) / change;
      lower = Math.max(lower, Math.min(firstParameter, secondParameter));
      upper = Math.min(upper, Math.max(firstParameter, secondParameter));
      if (lower > upper) return false;
    }
  }
  return true;
}

export function objectsInBox(objects, view, width, height, box) {
  const selected = new Set();
  for (const object of trimCadSources(objects).flatMap(cadPrimitives)) {
    if (object.hidden || object.invalid || object.type === 'slider') continue;
    let hit = false;
    if (isMeasurement(object)) {
      const layout = measurementLayout(object, view, width, height);
      hit = !!layout && (layout.box.left <= box.right && layout.box.right >= box.left && layout.box.top <= box.bottom && layout.box.bottom >= box.top || layout.segments.some(segment => segmentInBox(segment.first, segment.second, box)));
    } else if (isSoftBody(object)) {
      hit=softTriangles(object).some(triangle=>{const p=triangle.map(p=>toScreen(p,view,width,height));return p.some(p=>insideBox(p,box))||p.some((a,i)=>segmentInBox(a,p[(i+1)%3],box));})||softDistance(object,toWorld({x:box.left,y:box.top},view,width,height))===0;
    } else if (isLiquid(object)) {
      const r=object.radius*view.scale;
      hit=object.particles.some(p=>{const s=toScreen(p.position,view,width,height);return s.x+r>=box.left&&s.x-r<=box.right&&s.y+r>=box.top&&s.y-r<=box.bottom;});
    } else if (isFlexible(object)) {
      const points=ropePath(object).map(p=>toScreen(p,view,width,height));
      const padded={left:box.left-object.radius*view.scale,right:box.right+object.radius*view.scale,top:box.top-object.radius*view.scale,bottom:box.bottom+object.radius*view.scale};
      hit=points.some((p,i)=>i&&segmentInBox(points[i-1],p,padded));
    } else if (isPhysicsBody(object)) {
      if (bodyGeometry(object).polygons) hit = bodyWorldPolygons(object).some(polygon => {
        const points = polygon.map(point => toScreen(point, view, width, height));
        return points.some(point => insideBox(point, box)) || points.some((point, index) => segmentInBox(point, points[(index + 1) % points.length], box));
      }) || bodyContains(object, toWorld({ x: box.left, y: box.top }, view, width, height));
      else hit = bodyRectangles(object).some(rectangle => {
        const cosine = Math.cos(rectangle.angle), sine = Math.sin(rectangle.angle);
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => toScreen({
          x: rectangle.x + x * rectangle.width / 2 * cosine - y * rectangle.height / 2 * sine,
          y: rectangle.y + x * rectangle.width / 2 * sine + y * rectangle.height / 2 * cosine,
        }, view, width, height));
        return corners.some(corner => insideBox(corner, box)) || corners.some((corner, index) => segmentInBox(corner, corners[(index + 1) % 4], box));
      }) || bodyContains(object, toWorld({ x: box.left, y: box.top }, view, width, height));
    } else if (isPoint(object)) hit = insideBox(toScreen(object, view, width, height), box);
    else if (isPlot(object)) {
      const points = object.plot?.points || [];
      for (let index = 0; index < points.length; index += 2) {
        if (insideBox(toScreen({ x: points[index], y: points[index + 1] }, view, width, height), box)) { hit = true; break; }
      }
    } else if (object.type === 'region') {
      const region = object.region;
      if (region) {
        for (let index = 0; index < region.rectangles.length; index += 4) {
          const [left, top, right, bottom] = regionScreenBounds(region, index, view, width, height);
          if (left <= box.right && right >= box.left && top <= box.bottom && bottom >= box.top) { hit = true; break; }
        }
      }
    } else if (isConic(object)) {
      hit = conicSegments(object, view, width, height).some(segment => segmentInBox(segment.start, segment.finish, box));
    } else if (isLinear(object)) {
      const clipped = clipLinear(object, view, width, height);
      hit = clipped && segmentInBox(clipped.first, clipped.second, box);
    } else if (object.type === 'circle') {
      const center = toScreen(object.first, view, width, height);
      const radius = object.radius * view.scale;
      const nearest = Math.hypot(center.x - Math.max(box.left, Math.min(box.right, center.x)), center.y - Math.max(box.top, Math.min(box.bottom, center.y)));
      const farthest = Math.hypot(Math.max(Math.abs(center.x - box.left), Math.abs(center.x - box.right)), Math.max(Math.abs(center.y - box.top), Math.abs(center.y - box.bottom)));
      hit = nearest <= radius && farthest >= radius;
    } else if (arcTypes.has(object.type)) {
      const center = toScreen(object.first, view, width, height);
      const radius = object.radius * view.scale;
      const start = Math.atan2(object.arcStart.y - object.first.y, object.arcStart.x - object.first.x);
      const steps = Math.max(16, Math.ceil(Math.abs(object.sweep) * Math.min(radius, width + height) / 4));
      let previous = null;
      for (let index = 0; index <= steps; index++) {
        const angle = start + object.sweep * index / steps;
        const point = { x: center.x + radius * Math.cos(angle), y: center.y - radius * Math.sin(angle) };
        if (previous && segmentInBox(previous, point, box)) { hit = true; break; }
        previous = point;
      }
      if (!hit && (object.type === 'sector' || object.type === 'circumSector')) hit = [start, start + object.sweep].some(angle => segmentInBox(center, { x: center.x + Math.cos(angle) * radius, y: center.y - Math.sin(angle) * radius }, box));
    }
    if (hit) selected.add(object.id);
  }
  return selected;
}
