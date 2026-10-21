// A native CAD dependency node; consumers use the existing circular-arc geometry.
const sourceTypes = new Set(['circle', 'semicircle', 'arc', 'circumArc', 'fillet', 'arcConnection']);
export const isArcSource = object => !!object && sourceTypes.has(object.type);
export const validArcBranch = branch => Number.isInteger(branch) && branch >= 0 && branch < 8;
const signs = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
const tau = 2 * Math.PI;
const positive = angle => (angle % tau + tau) % tau;
const finitePoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function onArc(point, source) {
  if (source.type === 'circle') return true;
  if (!finitePoint(source.arcStart) || !Number.isFinite(source.sweep)) return false;
  const start = Math.atan2(source.arcStart.y - source.first.y, source.arcStart.x - source.first.x);
  const angle = Math.atan2(point.y - source.first.y, point.x - source.first.x);
  const relative = positive(source.sweep >= 0 ? angle - start : start - angle);
  return relative <= Math.abs(source.sweep) + 1e-9 || tau - relative <= 1e-9;
}

export function computeArcConnection(parameters, parents) {
  const radius = parameters?.radius;
  if (!(Number.isFinite(radius) && radius > 0) || !validArcBranch(parameters.branch) || !Array.isArray(parents) || parents.length !== 2 || parents.some(source => !isArcSource(source) || !finitePoint(source.first) || !(Number.isFinite(source.radius) && source.radius > 0))) return null;
  const [a, b] = parents;
  const separation = distance(a.first, b.first);
  const pair = signs[Math.floor(parameters.branch / 2)];
  // Signed offsets also handle a connecting circle enclosing a source circle.
  const offsets = parents.map((source, index) => source.radius + pair[index] * radius);
  const [r1, r2] = offsets.map(Math.abs);
  const scale = Math.max(separation, r1, r2);
  const tolerance = Number.EPSILON * 128 * scale;
  if (!(separation > tolerance) || r1 <= tolerance || r2 <= tolerance || separation > r1 + r2 + tolerance || separation < Math.abs(r1 - r2) - tolerance) return null;
  // Normalize before squaring, and use Heron's product near tangency.
  const d = separation / scale, u = r1 / scale, v = r2 / scale;
  const along = (d * d + (u - v) * (u + v)) / (2 * d) * scale;
  const product = (u + v + d) * (u + v - d) * (d + u - v) * (d - u + v);
  const height = Math.sqrt(Math.max(0, product)) / (2 * d) * scale * (parameters.branch % 2 ? -1 : 1);
  const direction = { x: (b.first.x - a.first.x) / separation, y: (b.first.y - a.first.y) / separation };
  const center = { x: a.first.x + along * direction.x - height * direction.y, y: a.first.y + along * direction.y + height * direction.x };
  const contacts = parents.map((source, index) => ({ x: source.first.x + (center.x - source.first.x) * source.radius / offsets[index], y: source.first.y + (center.y - source.first.y) * source.radius / offsets[index] }));
  if (!finitePoint(center) || contacts.some((point, index) => !finitePoint(point) || !onArc(point, parents[index]))) return null;
  const [arcStart, arcEnd] = contacts;
  const x1 = (arcStart.x - center.x) / radius, y1 = (arcStart.y - center.y) / radius;
  const x2 = (arcEnd.x - center.x) / radius, y2 = (arcEnd.y - center.y) / radius;
  let sweep = Math.atan2(x1 * y2 - y1 * x2, x1 * x2 + y1 * y2);
  if (!Number.isFinite(sweep) || Math.abs(sweep) < 1e-12) return null;
  if (parameters.longArc) sweep += sweep > 0 ? -tau : tau;
  return { first: center, second: arcStart, radius, arcStart, arcEnd, sweep };
}

// Choose a usable starting radius without dialogs. Arc endpoints and midpoints
// supply exact candidate radii, so short source arcs need no arbitrary sampling.
export function arcConnectionParameters(parents, pointer = null) {
  if (parents.length !== 2 || parents.some(source => !isArcSource(source) || !finitePoint(source.first) || !(source.radius > 0))) return null;
  const [a, b] = parents, d = distance(a.first, b.first);
  const radii = new Set([1, Math.max(1e-6, (d - a.radius - b.radius) * .6), d / 2, d, a.radius / 2, b.radius / 2, a.radius + b.radius + d]);
  for (const [source, other] of [[a, b], [b, a]]) {
    if (source.type === 'circle' || !finitePoint(source.arcStart)) continue;
    const start = Math.atan2(source.arcStart.y - source.first.y, source.arcStart.x - source.first.x);
    for (const fraction of [0, .5, 1]) {
      const angle = start + source.sweep * fraction, nx = Math.cos(angle), ny = Math.sin(angle);
      const dx = source.first.x + source.radius * nx - other.first.x, dy = source.first.y + source.radius * ny - other.first.y;
      for (const side of [1, -1]) for (const internal of [1, -1]) {
        const denominator = 2 * (side * (nx * dx + ny * dy) - internal * other.radius);
        const radius = (other.radius ** 2 - dx ** 2 - dy ** 2) / denominator;
        if (Number.isFinite(radius) && radius > 0) for (const factor of [1, .99, 1.01]) radii.add(radius * factor);
      }
    }
  }
  for (const radius of [...radii].filter(value => Number.isFinite(value) && value > 0).sort((x, y) => Math.abs(Math.log(x)) - Math.abs(Math.log(y)))) {
    const candidates = [];
    for (let branch = 0; branch < 8; branch++) {
      const parameters = { tool: 'arcConnection', radius, branch, longArc: false };
      const geometry = computeArcConnection(parameters, parents);
      if (!geometry) continue;
      const angle = Math.atan2(geometry.arcStart.y - geometry.first.y, geometry.arcStart.x - geometry.first.x) + geometry.sweep / 2;
      const middle = { x: geometry.first.x + radius * Math.cos(angle), y: geometry.first.y + radius * Math.sin(angle) };
      candidates.push({ parameters, distance: pointer ? distance(pointer, middle) : branch });
    }
    if (candidates.length) return candidates.sort((x, y) => x.distance - y.distance)[0].parameters;
  }
  return null;
}
