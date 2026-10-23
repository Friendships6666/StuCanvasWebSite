import { getTheme } from './themes.js';

export const objectOpacity = object => Math.max(0, Math.min(1, Number.isFinite(object.opacity) ? object.opacity : object.type === 'region' ? 0.28 : 1));

export function randomObjectColor() {
  const hue = Math.random() * 360;
  const lightness = getTheme().mode === 'dark' ? 0.66 : 0.42;
  const amplitude = 0.68 * Math.min(lightness, 1 - lightness);
  const channel = offset => {
    const position = (offset + hue / 30) % 12;
    return Math.round(255 * (lightness - amplitude * Math.max(-1, Math.min(position - 3, 9 - position, 1)))).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

// A missing/null color inherits the current theme; explicit hex colors stay exact.
export function objectColor(object) {
  const colors = getTheme().objects;
  // Division points inherit the intersection slot, including future theme overrides.
  const type = object.colorType || object.type;
  return object.color || colors[type === 'ratioPoint' ? 'intersection' : type] || colors.default;
}
