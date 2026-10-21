import { t } from './i18n.js';
export const measurementTypes = new Set(['lengthMeasure', 'angleMeasure', 'areaMeasure']);
export const isMeasurement = object => !!object && measurementTypes.has(object.type);
const finitePoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const average = (first, second) => Math.sign(first) === Math.sign(second) ? first + (second - first) / 2 : (first + second) / 2;
const screenPoint = (point, view, width, height) => ({ x: (point.x - view.x) * view.scale + width / 2, y: (view.y - point.y) * view.scale + height / 2 });
const cross = (first, second) => first.x * second.y - first.y * second.x;
const unitDirection = direction => {
  const length = Math.hypot(direction.x, direction.y);
  return length > 0 && Number.isFinite(length) ? { x: direction.x / length, y: direction.y / length } : null;
};
const lineDirection = object => object.direction || { x: object.second.x - object.first.x, y: object.second.y - object.first.y };

export function resolveMeasurement(object, parents) {
  if (parents.some(parent => !parent)) return null;
  if (object.type === 'areaMeasure') {
    const region = parents[0];
    return parents.length === 1 && region?.type === 'region' ? { ...object, anchor: region.seed } : null;
  }
  if (object.type === 'lengthMeasure') {
    const first = parents.length === 1 && parents[0].type === 'segment' ? parents[0].first : parents[0];
    const second = parents.length === 1 && parents[0].type === 'segment' ? parents[0].second : parents[1];
    if (!finitePoint(first) || !finitePoint(second)) return null;
    const value = Math.hypot(second.x - first.x, second.y - first.y);
    return Number.isFinite(value) ? { ...object, value, first, second, anchor: { x: average(first.x, second.x), y: average(first.y, second.y) } } : null;
  }
  let vertex;
  let firstUnit;
  let secondUnit;
  if (parents.length === 3 && parents.every(finitePoint)) {
    vertex = parents[1];
    firstUnit = unitDirection({ x: parents[0].x - vertex.x, y: parents[0].y - vertex.y });
    secondUnit = unitDirection({ x: parents[2].x - vertex.x, y: parents[2].y - vertex.y });
  } else if (parents.length === 2 && parents.every(parent => parent.first && parent.second)) {
    firstUnit = unitDirection(lineDirection(parents[0]));
    secondUnit = unitDirection(lineDirection(parents[1]));
    if (!firstUnit || !secondUnit) return null;
    const denominator = cross(firstUnit, secondUnit);
    if (Math.abs(denominator) <= Number.EPSILON * 16) return null;
    const offset = { x: parents[1].first.x - parents[0].first.x, y: parents[1].first.y - parents[0].first.y };
    const parameter = cross(offset, secondUnit) / denominator;
    vertex = { x: parents[0].first.x + parameter * firstUnit.x, y: parents[0].first.y + parameter * firstUnit.y };
  }
  if (!finitePoint(vertex) || !firstUnit || !secondUnit) return null;
  const turn = Math.atan2(cross(firstUnit, secondUnit), firstUnit.x * secondUnit.x + firstUnit.y * secondUnit.y);
  const inner = Math.abs(turn);
  const orientation = turn < 0 ? -1 : 1;
  const start = Math.atan2(firstUnit.y, firstUnit.x);
  const sweep = object.angleMode === 'reflex' ? -orientation * (2 * Math.PI - inner) : object.angleMode === 'supplementary' ? orientation * (Math.PI - inner) : turn;
  const arcStart = object.angleMode === 'supplementary' ? start + turn : start;
  const value = Math.abs(sweep) * 180 / Math.PI;
  return { ...object, value, vertex, anchor: vertex, arcStart, sweep, firstUnit, secondUnit };
}

const regionMetricsCache = new WeakMap();
export function regionMeasurement(region, boundaries) {
  if (!region?.rectangles?.length || !(region.view?.scale > 0)) return null;
  let metrics = regionMetricsCache.get(region.rectangles);
  if (!metrics) {
    let area = 0;
    let horizontal = 0;
    let vertical = 0;
    for (let index = 0; index < region.rectangles.length; index += 4) {
      const [left, top, right, bottom] = region.rectangles.subarray(index, index + 4);
      const weight = (right - left) * (bottom - top);
      area += weight;
      horizontal += weight * ((left + right - region.width) / 2);
      vertical += weight * ((region.height - top - bottom) / 2);
    }
    if (!(area > 0)) return null;
    metrics = { value: area / region.view.scale / region.view.scale, anchor: { x: region.view.x + horizontal / area / region.view.scale, y: region.view.y + vertical / area / region.view.scale }, approximate: true };
    regionMetricsCache.set(region.rectangles, metrics);
  }
  let result = { ...metrics, anchor: { ...metrics.anchor } };
  if (region.motion) {
    const { from, to } = region.motion;
    const scaleX = to.spanX / from.spanX;
    const scaleY = to.spanY / from.spanY;
    result = { ...result, value: result.value * Math.abs(scaleX) * Math.abs(scaleY), anchor: { x: to.x + (result.anchor.x - from.x) * scaleX, y: to.y + (result.anchor.y - from.y) * scaleY } };
  }
  if (boundaries.length === 1) {
    const curve = boundaries[0];
    if (curve.type === 'circle') result = { value: Math.PI * curve.radius * curve.radius, anchor: curve.first, approximate: false };
    else if (curve.type === 'ellipse') result = { value: Math.PI * curve.a * curve.b, anchor: curve.origin, approximate: false };
    else if (curve.type === 'sector' || curve.type === 'circumSector') result = { ...result, value: Math.abs(curve.sweep) / 2 * curve.radius * curve.radius, approximate: false };
  }
  return Number.isFinite(result.value) && finitePoint(result.anchor) ? result : null;
}

export function measurementText(object, includeName = false) {
  if (!Number.isFinite(object.value)) return t('common.computing');
  const numeric = object.value === 0 ? '0' : Number(object.value.toPrecision(6)).toString();
  const value = `${numeric}${object.type === 'angleMeasure' ? '°' : ''}`;
  return object.type === 'areaMeasure' ? `${includeName ? object.name : 'S'} ${object.approximate ? '≈' : '='} ${value}` : includeName ? `${object.name} = ${value}` : value;
}

export function measurementLayout(object, view, width, height) {
  if (!isMeasurement(object) || !Number.isFinite(object.value) || !finitePoint(object.anchor)) return null;
  const segments = [];
  const offset = object.labelOffset || { x: 0, y: 0 };
  const value = measurementText(object);
  const labelWidth = Math.max(36, [...value].length * 7.5 + 14);
  let label;
  const add = (first, second, weak = false) => {
    if (finitePoint(first) && finitePoint(second)) segments.push({ first, second, weak });
  };
  if (object.type === 'lengthMeasure') {
    const first = screenPoint(object.first, view, width, height);
    const second = screenPoint(object.second, view, width, height);
    const tangent = unitDirection({ x: second.x - first.x, y: second.y - first.y }) || { x: 1, y: 0 };
    const normal = { x: tangent.y, y: -tangent.x };
    const shift = { x: normal.x * 28 + offset.x, y: normal.y * 28 + offset.y };
    const start = { x: first.x + shift.x, y: first.y + shift.y };
    const finish = { x: second.x + shift.x, y: second.y + shift.y };
    const center = { x: average(start.x, finish.x), y: average(start.y, finish.y) };
    label = { x: center.x, y: center.y - 5 };
    for (const [endpoint, projected] of [[first, start], [second, finish]]) {
      add(endpoint, projected, true);
      add({ x: projected.x - normal.x * 5, y: projected.y - normal.y * 5 }, { x: projected.x + normal.x * 5, y: projected.y + normal.y * 5 });
    }
    add(start, finish);
  } else if (object.type === 'angleMeasure') {
    const vertex = screenPoint(object.vertex, view, width, height);
    const radius = object.angleMode === 'inner' || !object.angleMode ? 36 : object.angleMode === 'reflex' ? 48 : 60;
    const at = angle => ({ x: vertex.x + Math.cos(angle) * radius, y: vertex.y - Math.sin(angle) * radius });
    const count = Math.max(1, Math.ceil(Math.abs(object.sweep) * radius / 5));
    for (let index = 0; index < count; index++) add(at(object.arcStart + object.sweep * index / count), at(object.arcStart + object.sweep * (index + 1) / count));
    for (const angle of [object.arcStart, object.arcStart + object.sweep]) add(vertex, at(angle), true);
    const middle = object.arcStart + object.sweep / 2;
    label = { x: vertex.x + Math.cos(middle) * (radius + 22) + offset.x, y: vertex.y - Math.sin(middle) * (radius + 22) + offset.y + 4 };
  } else {
    const anchor = screenPoint(object.anchor, view, width, height);
    label = { x: anchor.x + 20 + labelWidth / 2 + offset.x, y: anchor.y - 20 + offset.y };
    add(anchor, { x: label.x - labelWidth / 2 + 4, y: label.y + 4 }, true);
  }
  if (!finitePoint(label)) return null;
  return { segments, label: { ...label, value }, box: { left: label.x - labelWidth / 2, right: label.x + labelWidth / 2, top: label.y - 17, bottom: label.y + 5 } };
}

export function measurementDistance(layout, position) {
  if (!layout) return Infinity;
  const { box } = layout;
  let best = Math.hypot(Math.max(box.left - position.x, 0, position.x - box.right), Math.max(box.top - position.y, 0, position.y - box.bottom));
  for (const { first, second } of layout.segments) {
    const horizontal = second.x - first.x;
    const vertical = second.y - first.y;
    const length = Math.hypot(horizontal, vertical);
    const parameter = length ? Math.max(0, Math.min(length, (position.x - first.x) * horizontal / length + (position.y - first.y) * vertical / length)) : 0;
    const distance = Math.hypot(position.x - first.x - (length ? horizontal / length * parameter : 0), position.y - first.y - (length ? vertical / length * parameter : 0));
    best = Math.min(best, distance);
  }
  return best;
}
