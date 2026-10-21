import { localizeDOM, onLocaleChange, t } from './i18n.js';
import { getTheme, onThemeChange } from './themes.js';

export function createSurfaceBrush(container, onChange, property = 'friction') {
  const toolKey = property === 'friction' ? 'tool.frictionBrush' : 'tool.restitutionBrush';
  const state = { coefficient: .5, radius: 12, reach: 10, erase: false };
  const panel = document.createElement('div'); panel.className = 'friction-brush'; panel.hidden = true;
  panel.dataset.surfaceProperty = property;
  panel.setAttribute('role', 'region'); panel.dataset.i18nAriaLabel = toolKey;
  const title = document.createElement('strong'); title.dataset.i18n = toolKey; panel.append(title);
  const row = (key, minimum, maximum, step, caption) => {
    const label = document.createElement('label'), text = document.createElement('span'), input = document.createElement('input');
    text.dataset.i18n = caption;
    input.type = 'number'; input.min = minimum; input.max = maximum; input.step = step; input.value = state[key];
    input.dataset.brushParameter = key; input.dataset.i18nAriaLabel = caption;
    input.addEventListener('input', () => {
      const value = input.valueAsNumber, valid = Number.isFinite(value) && value >= minimum && value <= maximum;
      input.setAttribute('aria-invalid', String(!valid));
      if (valid) { state[key] = value; onChange(); }
    });
    input.addEventListener('blur', () => { input.value = state[key]; input.setAttribute('aria-invalid', 'false'); });
    label.append(text, input); panel.append(label); return input;
  };
  const coefficient = row('coefficient', 0, 1, .01, `${property}.coefficient`);
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = 0; slider.max = 1; slider.step = .01; slider.value = state.coefficient;
  slider.dataset.brushParameter = 'coefficientSlider'; slider.dataset.i18nAriaLabel = `${property}.coefficient`;
  slider.addEventListener('input', () => {
    coefficient.value = slider.value; coefficient.dispatchEvent(new Event('input'));
  });
  coefficient.addEventListener('input', () => { slider.value = state.coefficient; });
  panel.append(slider);
  row('radius', 2, 80, 1, 'friction.radius');
  row('reach', 2, 40, 1, 'friction.reach');
  const eraseLabel = document.createElement('label'), erase = document.createElement('input'), eraseText = document.createElement('span');
  erase.type = 'checkbox'; erase.dataset.brushParameter = 'erase'; eraseText.dataset.i18n = 'friction.erase';
  erase.addEventListener('change', () => { state.erase = erase.checked; coefficient.disabled = slider.disabled = state.erase; onChange(); });
  eraseLabel.append(eraseText, erase); panel.append(eraseLabel);
  const gradient = document.createElement('div'); gradient.className = 'friction-gradient'; gradient.setAttribute('role', 'img');
  gradient.dataset.i18nAriaLabel = `${property}.legend`;
  const ticks = document.createElement('div'); ticks.className = 'friction-ticks';
  for (const value of [0, .25, .5, .75, 1]) { const tick = document.createElement('span'); tick.textContent = value; ticks.append(tick); }
  const note = document.createElement('p'); note.className = 'physics-note'; note.dataset.i18n = `${property}.note`;
  panel.append(gradient, ticks, note); container.append(panel);
  const theme = () => { const colors = getTheme().canvas; gradient.style.background = `linear-gradient(to right, ${colors[`${property}Low`]}, ${colors[`${property}Middle`]}, ${colors[`${property}High`]})`; };
  theme(); onThemeChange(theme);
  onLocaleChange(() => localizeDOM(panel)); localizeDOM(panel);
  return { state, show(visible) { panel.hidden = !visible; if (visible) panel.setAttribute('aria-label', t(toolKey)); } };
}
