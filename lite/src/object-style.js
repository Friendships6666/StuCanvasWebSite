import { getTheme } from './themes.js';

export const objectOpacity = object => Math.max(0, Math.min(1, Number.isFinite(object.opacity) ? object.opacity : object.type === 'region' ? 0.28 : 1));

// A missing/null color inherits the current theme; explicit hex colors stay exact.
export function objectColor(object) {
  const colors = getTheme().objects;
  // Division points inherit the intersection slot, including future theme overrides.
  const type = object.colorType || object.type;
  return object.color || colors[type === 'ratioPoint' ? 'intersection' : type] || colors.default;
}
