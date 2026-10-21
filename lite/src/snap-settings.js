import { defaultSnapSettings, validSnapSettings } from './grid-snap.js';
import { localizeDOM } from './i18n.js';

export function createSnapSettings(container, changed) {
  let state = { ...defaultSnapSettings };
  const panel = document.createElement('details'); panel.className = 'snap-settings'; panel.id = 'snap-settings';
  const title = document.createElement('summary'); title.dataset.i18n = 'snap.settings'; panel.append(title);
  const controls = new Map();
  for (const [key, caption, options] of [
    ['spacing', 'snap.spacing', ['fixed', 'auto']], ['stepX', 'snap.stepX'], ['stepY', 'snap.stepY'],
    ['subdivisions', 'snap.subdivisions', [1, 2, 4, 5, 10, 20]],
    ['axis', 'snap.axis', ['both', 'x', 'y']], ['originX', 'snap.originX'], ['originY', 'snap.originY'],
    ['attraction', 'snap.attraction', ['always', 'nearby']], ['tolerance', 'snap.tolerance'],
  ]) {
    const row = document.createElement('label'), text = document.createElement('span'); text.dataset.i18n = caption;
    const input = document.createElement(options ? 'select' : 'input');
    input.dataset.snapParameter = key; input.dataset.i18nAriaLabel = caption;
    if (options) for (const value of options) {
      const option = document.createElement('option'); option.value = value;
      if (typeof value === 'number') option.textContent = String(value); else option.dataset.i18n = `snap.${value}`;
      input.append(option);
    }
    else {
      input.type = 'number'; input.step = 'any';
      if (key.startsWith('step')) { input.min = 1e-12; input.max = 1e12; }
      else if (key === 'tolerance') { input.min = 1; input.max = 40; }
      else { input.min = -1e12; input.max = 1e12; }
    }
    input.addEventListener('change', () => {
      const value = input.type === 'number' || key === 'subdivisions' ? Number(input.value) : input.value;
      const next = { ...state, [key]: value };
      if (!input.value.trim() || !validSnapSettings(next)) { input.setAttribute('aria-invalid', 'true'); return; }
      state = next; sync(); changed();
    });
    input.addEventListener('blur', () => { if (input.getAttribute('aria-invalid') === 'true') sync(); });
    row.append(text, input); panel.append(row); controls.set(key, input);
  }
  const note = document.createElement('p'); note.className = 'physics-note'; note.dataset.i18n = 'snap.note'; panel.append(note);
  container.append(panel);
  function sync() {
    for (const [key, input] of controls) {
      input.value = state[key]; input.removeAttribute('aria-invalid');
      input.disabled = key.startsWith('step') && state.spacing === 'auto' || key === 'tolerance' && state.attraction !== 'nearby';
    }
  }
  sync(); localizeDOM(panel);
  return { read: () => ({ ...state }), apply(value) { state = { ...(validSnapSettings(value) ? value : defaultSnapSettings) }; sync(); } };
}
