import { t, getLocale, languages, onLocaleChange } from './i18n.js';
import { MathfieldElement } from '/node_modules/mathlive/mathlive.min.mjs';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;
MathfieldElement.strings = Object.fromEntries(languages.map(language => [language.id.toLowerCase(), Object.fromEntries(Object.entries(language.messages).filter(([key]) => key.startsWith('mathlive.')).map(([key, value]) => [key.slice('mathlive.'.length), value]))]));
function localizeMathControls(field) {
  for (const control of field.shadowRoot?.querySelectorAll('[data-l10n-tooltip]') || []) {
    const text = t(`mathlive.${control.getAttribute('data-l10n-tooltip')}`);
    control.setAttribute('aria-label', text);
    for (const icon of control.querySelectorAll('svg[aria-label]')) icon.setAttribute('aria-label', text);
  }
}

const updateMathLocale = () => {
  MathfieldElement.locale = getLocale().toLowerCase();
  for (const field of document.querySelectorAll('math-field')) localizeMathControls(field);
};
updateMathLocale();
onLocaleChange(updateMathLocale);

export { latexToSource } from './math-source.js';

export function focusMathInput(field) {
  if (!field?.isConnected) return;
  HTMLElement.prototype.focus.call(field);
  field.focus();
}

export function bindMathInput(field, submit) {
  const configure = () => {
    field.menuItems = [];
    field.inlineShortcuts = { ...field.inlineShortcuts, ln: '\\ln', log10: '\\log_{10}', log2: '\\log_{2}', floor: '\\operatorname{floor}', ceil: '\\operatorname{ceil}', fmod: '\\operatorname{fmod}' };
    localizeMathControls(field);
  };
  field.addEventListener('mount', configure, { once: true });
  if (field.isConnected) configure();
  field.mathVirtualKeyboardPolicy = 'manual';
  const keyboard = window.mathVirtualKeyboard;
  field.addEventListener('focus', () => requestAnimationFrame(() => {
    if (document.activeElement === field) keyboard.show();
  }));
  field.addEventListener('blur', () => requestAnimationFrame(() => {
    if (!document.activeElement.matches('math-field')) keyboard.hide();
  }));
  field.addEventListener('beforeinput', event => {
    if (event.inputType === 'insertLineBreak') {
      event.preventDefault();
      submit();
    }
  });
}

export function initializeMathInput() {
  const keyboard = window.mathVirtualKeyboard;
  keyboard.container = document.body;
  const fullLayout = {
    label: 'ƒ(x)',
    tooltip: t('keyboard.functionsEquations'),
    rows: [
      ['x', 'y', '=', '+', '-', '\\cdot', '\\frac{#0}{#?}', '#@^{2}', '#@^{#?}', '[backspace]'],
      ['7', '8', '9', ...['\\sin', '\\cos', '\\tan', '\\ln', '\\log_{10}'].map(latex => ({ latex, insert: `${latex}(#0)`, class: 'small' })), '\\sqrt{#0}', '\\sqrt[3]{#0}'],
      ['4', '5', '6', '(', ')', '\\left|#0\\right|', '\\pi', 'e', 'e^{#0}', '[left]'],
      ['1', '2', '3', '0', '.', ',', '[undo]', '[redo]', '[right]', '[return]'],
    ],
  };
  const compactLayout = {
    label: '123',
    tooltip: t('keyboard.numbersEquations'),
    rows: [
      ['x', 'y', '=', '\\frac{#0}{#?}', '#@^{2}', '[backspace]'],
      ['7', '8', '9', '+', '-', '\\sqrt{#0}'],
      ['4', '5', '6', '\\cdot', '\\div', '#@^{#?}'],
      ['1', '2', '3', '(', ')', '[left]'],
      ['0', '.', '\\pi', 'e', '[right]', '[return]'],
    ],
  };
  const functionLayout = {
    label: t('keyboard.functions'),
    tooltip: t('keyboard.functions'),
    rows: [
      ['\\sin(#0)', '\\cos(#0)', '\\tan(#0)', '\\ln(#0)', '\\log_{10}(#0)', '\\log_{2}(#0)'].map(latex => ({ latex: latex.replace('(#0)', ''), insert: latex, class: 'small' })),
      ['\\arcsin(#0)', '\\arccos(#0)', '\\arctan(#0)', 'e^{#0}', '\\left|#0\\right|', '\\sqrt[3]{#0}'].map(latex => ({ latex: latex.replace('(#0)', ''), insert: latex, class: 'small' })),
      [
        { latex: '\\lfloor x\\rfloor', insert: '\\lfloor#0\\rfloor', class: 'small' },
        { latex: '\\lceil x\\rceil', insert: '\\lceil#0\\rceil', class: 'small' },
        ...['fmod', 'min', 'max', 'hypot'].map(name => ({ latex: `\\operatorname{${name}}`, insert: `\\operatorname{${name}}(#0,#?)`, class: 'small' })),
      ],
      ['x', 'y', '=', '\\pi', 'e', '[backspace]'],
      ['[undo]', '[redo]', '(', ')', '[left]', '[right]'],
      ['0', '1', '2', '+', '-', '[return]'],
    ],
  };
  const compact = window.matchMedia('(max-width: 600px)');
  // MathLive's default key widths assume ten columns, including for custom
  // six-column rows. Use a scoped container so numeric/function keys can grow.
  for (const layout of [compactLayout, functionLayout]) {
    layout.layers = [{ container: 'stucanvas-keyboard-six', rows: layout.rows }];
    delete layout.rows;
  }
  const updateLayouts = () => {
    fullLayout.tooltip = t('keyboard.functionsEquations');
    compactLayout.tooltip = t('keyboard.numbersEquations');
    functionLayout.label = t('keyboard.functions');
    functionLayout.tooltip = t('keyboard.functions');
    keyboard.layouts = compact.matches ? [compactLayout, functionLayout, 'alphabetic'] : [fullLayout, functionLayout, 'alphabetic'];
  };
  updateLayouts();
  compact.addEventListener('change', updateLayouts);
  onLocaleChange(updateLayouts);
  const geometryChanged = () => {
    const height = keyboard.visible ? keyboard.boundingRect.height : 0;
    document.documentElement.style.setProperty('--math-keyboard-height', `${height}px`);
    if (height && document.activeElement.matches('math-field')) document.activeElement.scrollIntoView({ block: 'nearest' });
  };
  keyboard.addEventListener('geometrychange', geometryChanged);
}
