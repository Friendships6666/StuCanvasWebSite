// Semantic colors shared by DOM, SVG labels and the WebGPU renderer.
// Theme extensions inherit all required slots; unknown slots are rejected.
const wine = {
  id: 'wine-light', nameKey: 'theme.wine', mode: 'light',
  tokens: {
    'code-keyword': '#8050a4', 'code-comment': '#77797e', 'code-function': '#9b6020', 'code-variable': '#305e94', 'code-operator': '#a34061', 'code-regex': '#a05429',
    'json-key': '#94405f', 'json-string': '#26724f', 'json-number': '#98600f', 'json-boolean': '#7254a1', 'json-null': '#6c7080', 'json-punctuation': '#7c7379',
    'json-bracket-0': '#a34a68', 'json-bracket-1': '#287d88', 'json-bracket-2': '#966216', 'json-bracket-3': '#7853aa', 'json-bracket-4': '#2b7954', 'json-bracket-5': '#b34e2e',
    'foreground': '#2e2023', 'page-background': '#fffaf9', 'surface': '#fffdfd', 'surface-hover': '#fff0f2', 'surface-selected': '#ffffff', 'input-background': '#ffffff',
    'brand-950': '#3e1019', 'brand-900': '#581321', 'brand-800': '#75182a', 'brand-700': '#a6243b', 'brand-600': '#d43952', 'brand-100': '#ffe9ed', 'brand-050': '#fff6f7',
    'ink-muted': '#7d6469', 'text-secondary': '#687585', 'line': '#ecd8dc', 'border-strong': '#d9aeb5', 'control-border': '#e2b1b8',
    'toolbar-start': '#3e1019', 'toolbar-middle': '#75182a', 'toolbar-end': '#8d1c31', 'toolbar-border': '#3e1019', 'toolbar-foreground': '#ffffff', 'toolbar-action': '#ffe3e7', 'toolbar-divider': '#ffffff36',
    'tool-background': '#fff7f8', 'tool-border': '#f4aeba', 'tool-hover-border': '#ffced5', 'tool-active-border': '#ffd7dd', 'accent-contrast': '#ffffff', 'icon-point': '#f05a70', 'icon-active-point': '#ffb5bf',
    'error': '#b44545', 'success': '#219267', 'warning': '#a7780e', 'progress-track': '#e5e9ef',
    'selection-fill': '#d4395230', 'highlight-fill': '#d4395215', 'hint-background': '#fff8f4e8', 'hint-foreground': '#6f4f55', 'controls-background': '#fff8f9f2', 'overlay-background': '#fffffff5',
    'shadow': '#5b142433', 'shadow-soft': '#5b142422', 'shadow-strong': '#3e101944', 'logo-color': '#fff3e5',
  },
  canvas: { restitutionLow: '#7c3aed', restitutionMiddle: '#c76b0a', restitutionHigh: '#c02686', frictionLow: '#2563eb', frictionMiddle: '#15803d', frictionHigh: '#dc2626', background: '#ffffff', gridMinor: '#edf2f7', gridMajor: '#ccd6e3', axes: '#52647a', text: '#687585', selection: '#ec852a', accent: '#d43d50', pointBorder: '#661426' },
  objects: { softBody: '#a366b2', liquid: '#348ac2', spring: '#788590', rope: '#98613a', physicsMaterial: '#eeeae3', point: '#d43d50', snapPoint: '#ee806e', intersection: '#9f2040', midpoint: '#bf4b64', pole: '#ad3455', ellipse: '#397b7c', parabola: '#756095', hyperbola: '#9a693e', lengthMeasure: '#356f80', angleMeasure: '#946223', areaMeasure: '#9d4261', region: '#e87890', slider: '#d97706', parametric: '#406d79', equation: '#394658', default: '#4e6987' },
};
const cyan = {
  id: 'cyan-dark', nameKey: 'theme.cyan', mode: 'dark',
  tokens: {
    'code-keyword': '#c5a0eb', 'code-comment': '#8c989b', 'code-function': '#e5c58c', 'code-variable': '#92cafa', 'code-operator': '#e69db5', 'code-regex': '#e7ac85',
    'json-key': '#75ddd4', 'json-string': '#a1d99b', 'json-number': '#e5ba7f', 'json-boolean': '#c5a0eb', 'json-null': '#9ca9bd', 'json-punctuation': '#a4acb4',
    'json-bracket-0': '#65e4d7', 'json-bracket-1': '#e5ba7f', 'json-bracket-2': '#c5a0eb', 'json-bracket-3': '#7bbfee', 'json-bracket-4': '#e69db5', 'json-bracket-5': '#a1d99b',
    'foreground': '#e2e2e2', 'page-background': '#0b0b0b', 'surface': '#121212', 'surface-hover': '#1d1d1d', 'surface-selected': '#232323', 'input-background': '#0c0c0c',
    'brand-950': '#090909', 'brand-900': '#c4fffa', 'brand-800': '#a1fff8', 'brand-700': '#62f5eb', 'brand-600': '#39e8db', 'brand-100': '#242424', 'brand-050': '#181818',
    'ink-muted': '#a3abad', 'text-secondary': '#bec5c7', 'line': '#2c2c2c', 'border-strong': '#383838', 'control-border': '#454545',
    'toolbar-start': '#090909', 'toolbar-middle': '#121212', 'toolbar-end': '#191919', 'toolbar-border': '#333333', 'toolbar-foreground': '#e1fffc', 'toolbar-action': '#9ef7ee', 'toolbar-divider': '#ffffff26',
    'tool-background': '#181818', 'tool-border': '#383838', 'tool-hover-border': '#5ceee3', 'tool-active-border': '#b5fff9', 'accent-contrast': '#0b1515', 'icon-point': '#39e8db', 'icon-active-point': '#142323',
    'error': '#ffb4aa', 'success': '#79e8b1', 'warning': '#f4cf7b', 'progress-track': '#303030',
    'selection-fill': '#39e8db35', 'highlight-fill': '#39e8db18', 'hint-background': '#181818ed', 'hint-foreground': '#c0ebe9', 'controls-background': '#181818f2', 'overlay-background': '#0b0b0bf5',
    'shadow': '#00000050', 'shadow-soft': '#00000035', 'shadow-strong': '#00000080', 'logo-color': '#39e8db',
  },
  canvas: { restitutionLow: '#a78bfa', restitutionMiddle: '#fbbf24', restitutionHigh: '#f472b6', frictionLow: '#60a5fa', frictionMiddle: '#4ade80', frictionHigh: '#fb7185', background: '#080808', gridMinor: '#111111', gridMajor: '#232323', axes: '#707779', text: '#aab4b8', selection: '#39e8db', accent: '#39e8db', pointBorder: '#b4fff7' },
  objects: { softBody: '#c099f5', liquid: '#46badb', spring: '#c5cfd9', rope: '#cf9966', physicsMaterial: '#b7c4c7', point: '#39e8db', snapPoint: '#9ff8e7', intersection: '#f4cf7b', midpoint: '#8dc9ff', pole: '#b6afff', ellipse: '#39e8db', parabola: '#39e8db', hyperbola: '#39e8db', lengthMeasure: '#9ad4f5', angleMeasure: '#f4cf7b', areaMeasure: '#b8c3ff', region: '#39e8db', slider: '#f4cf7b', parametric: '#39e8db', equation: '#39e8db', default: '#39e8db' },
};
const freezeTheme = theme => Object.freeze({ ...theme, tokens: Object.freeze({ ...theme.tokens }), canvas: Object.freeze({ ...theme.canvas }), objects: Object.freeze({ ...theme.objects }) });
const registry = new Map([wine, cyan].map(theme => [theme.id, freezeTheme(theme)]));
const listeners = new Set();
const resolvedThemes = new Map();
const storageKey = 'stucanvas.theme';
const preference = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
let selection = 'system';
let overrides = {};
const validColor = color => typeof color === 'string' && /^#[\da-f]{6}([\da-f]{2})?$/i.test(color);
function validatePatch(patch, base) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Invalid theme patch');
  for (const [group, slots] of Object.entries(patch)) {
    if (!['tokens', 'canvas', 'objects'].includes(group) || !slots || typeof slots !== 'object' || Array.isArray(slots)) throw new TypeError(`Invalid theme group: ${group}`);
    for (const [key, color] of Object.entries(slots)) {
      if (!Object.hasOwn(base[group], key) || !validColor(color) || group !== 'tokens' && color.length !== 7) throw new TypeError(`Invalid theme color: ${group}.${key}`);
    }
  }
}
function merge(base, patch) {
  return freezeTheme({ ...base, ...Object.fromEntries(['tokens', 'canvas', 'objects'].map(group => [group, { ...base[group], ...patch?.[group] }])) });
}
function addTheme(definition) {
  if (!definition || !/^[a-z][a-z0-9-]*$/.test(definition.id) || registry.has(definition.id)) throw new TypeError('Theme ID must be unique');
  const base = registry.get(definition.extends || (definition.mode === 'dark' ? 'cyan-dark' : 'wine-light'));
  if (!base || definition.mode && !['light', 'dark'].includes(definition.mode) || typeof definition.name !== 'string' || !definition.name.trim()) throw new TypeError('Invalid theme definition');
  const patch = Object.fromEntries(['tokens', 'canvas', 'objects'].filter(group => definition[group]).map(group => [group, definition[group]]));
  validatePatch(patch, base);
  const result = merge({ ...base, id: definition.id, name: definition.name, nameKey: null, mode: definition.mode || base.mode }, patch);
  registry.set(result.id, result);
  return result;
}
function restore() {
  if (!globalThis.document) return;
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(storageKey) || 'null');
    for (const definition of Array.isArray(saved?.themes) ? saved.themes : []) {
      try { addTheme(definition); } catch {}
    }
    if (saved && (saved.selection === 'system' || registry.has(saved.selection))) selection = saved.selection;
    let migrated = false;
    for (const [id, patch] of Object.entries(saved?.overrides || {})) if (registry.has(id)) {
      // Logo color belongs to the registered theme, never to a user override.
      if (patch?.tokens && Object.hasOwn(patch.tokens, 'logo-color')) {
        delete patch.tokens['logo-color'];
        migrated = true;
      }
      try { validatePatch(patch, registry.get(id)); overrides[id] = patch; } catch {}
    }
    if (migrated) globalThis.localStorage?.setItem(storageKey, JSON.stringify({ ...saved, overrides }));
  } catch {}
}
restore();
export const listThemes = () => [...registry.values()];
export const getThemeSelection = () => selection;
export const getTheme = (id = selection === 'system' ? preference?.matches ? 'cyan-dark' : 'wine-light' : selection) => {
  if (!registry.has(id)) throw new RangeError(`Unknown theme: ${id}`);
  if (!resolvedThemes.has(id)) resolvedThemes.set(id, merge(registry.get(id), overrides[id]));
  return resolvedThemes.get(id);
};
export const rgba = (hex, alpha = 1) => [...[1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255), alpha];
function apply({ persist = true } = {}) {
  resolvedThemes.clear();
  const theme = getTheme();
  const root = globalThis.document?.documentElement;
  if (root) {
    root.dataset.theme = theme.id;
    root.dataset.colorScheme = theme.mode;
    root.style.colorScheme = theme.mode;
    for (const [key, value] of Object.entries(theme.tokens)) root.style.setProperty(`--${key}`, value);
    root.style.setProperty('--canvas-background', theme.canvas.background);
    globalThis.document.body?.setAttribute('theme', theme.mode);
    globalThis.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.tokens['toolbar-start']);
  }
  if (persist && globalThis.document) {
    try { globalThis.localStorage?.setItem(storageKey, JSON.stringify({ selection, overrides, themes: [...registry.values()].filter(theme => !theme.nameKey) })); } catch {}
  }
  for (const callback of listeners) callback(theme);
}
export function setTheme(id, options) {
  if (id !== 'system' && !registry.has(id)) throw new RangeError(`Unknown theme: ${id}`);
  selection = id;
  apply(options);
  return getTheme();
}
export function registerTheme(definition) {
  const result = addTheme(definition);
  apply();
  return result;
}
export function configureTheme(patch, { id = getTheme().id } = {}) {
  const base = registry.get(id);
  if (!base) throw new RangeError(`Unknown theme: ${id}`);
  validatePatch(patch, base);
  if (Object.hasOwn(patch.tokens || {}, 'logo-color')) throw new TypeError('Logo color is defined by the registered theme');
  overrides[id] = Object.fromEntries(['tokens', 'canvas', 'objects'].map(group => [group, { ...overrides[id]?.[group], ...patch[group] }]));
  apply();
  return getTheme(id);
}
export function resetThemeColors(id = getTheme().id) {
  if (!registry.has(id)) throw new RangeError(`Unknown theme: ${id}`);
  delete overrides[id];
  apply();
}
export function onThemeChange(callback) { listeners.add(callback); return () => listeners.delete(callback); }
export const readThemeConfiguration = () => structuredClone({ selection, overrides, themes: [...registry.values()].filter(theme => !theme.nameKey) });
export function validateThemeConfiguration(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.themes) || !value.overrides || typeof value.overrides !== 'object' || Array.isArray(value.overrides)) throw new TypeError('Invalid theme configuration');
  const available = new Map([wine, cyan].map(theme => [theme.id, theme]));
  for (const theme of value.themes) {
    if (!theme || !/^[a-z][a-z0-9-]*$/.test(theme.id) || available.has(theme.id) || !['light', 'dark'].includes(theme.mode) || typeof theme.name !== 'string' || !theme.name.trim()) throw new TypeError('Invalid custom theme');
    const base = available.get(theme.extends || (theme.mode === 'dark' ? 'cyan-dark' : 'wine-light'));
    if (!base) throw new TypeError('Unknown theme base');
    validatePatch(Object.fromEntries(['tokens', 'canvas', 'objects'].filter(group => theme[group]).map(group => [group, theme[group]])), base);
    available.set(theme.id, theme);
  }
  if (value.selection !== 'system' && !available.has(value.selection)) throw new TypeError('Unknown selected theme');
  for (const [id, patch] of Object.entries(value.overrides)) {
    if (!available.has(id)) throw new TypeError('Unknown theme override');
    validatePatch(patch, available.get(id));
    if (Object.hasOwn(patch.tokens || {}, 'logo-color')) throw new TypeError('Logo color belongs to the registered theme');
  }
  return true;
}
export function applyThemeConfiguration(value) {
  validateThemeConfiguration(value);
  for (const id of [...registry.keys()]) if (!['wine-light', 'cyan-dark'].includes(id)) registry.delete(id);
  for (const definition of value.themes) addTheme(definition);
  overrides = structuredClone(value.overrides); selection = value.selection; apply();
}
preference?.addEventListener('change', () => { if (selection === 'system') apply({ persist: false }); });
apply({ persist: false });
export const themeAPI = Object.freeze({ listThemes, getTheme, getThemeSelection, setTheme, registerTheme, configureTheme, resetThemeColors, onThemeChange });
if (globalThis.document) globalThis.StuCanvasTheme = themeAPI;
