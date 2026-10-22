import { defaultTouchOffsetPixels, maxTouchOffsetPixels, validTouchOffsetPixels } from './grid-snap.js';

export function createTouchSettings(changed) {
  const enabled = document.getElementById('touch-offset');
  const slider = document.getElementById('touch-offset-range');
  const number = document.getElementById('touch-offset-pixels');
  const storageKey = 'stucanvas-lite.touch-offset-pixels';
  let pixels = defaultTouchOffsetPixels;
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(storageKey) || 'null');
    if (validTouchOffsetPixels(saved)) pixels = saved;
  } catch {}
  const save = () => {
    try { globalThis.localStorage?.setItem(storageKey, JSON.stringify(pixels)); } catch {}
  };
  const sync = () => {
    for (const input of [slider, number]) {
      input.min = 0; input.max = maxTouchOffsetPixels; input.step = 1;
      input.value = pixels; input.disabled = !enabled.checked;
      input.removeAttribute('aria-invalid');
    }
  };
  for (const input of [slider, number]) input.addEventListener('input', () => {
    const value = Number(input.value);
    if (!input.value.trim() || !validTouchOffsetPixels(value)) {
      input.setAttribute('aria-invalid', 'true'); return;
    }
    pixels = value; sync(); save(); changed();
  });
  number.addEventListener('blur', () => {
    if (number.getAttribute('aria-invalid') === 'true') sync();
  });
  enabled.addEventListener('change', () => { sync(); changed(); });
  sync();
  return {
    read: () => pixels,
    offset: () => enabled.checked ? pixels : 0,
    apply(value) {
      pixels = validTouchOffsetPixels(value) ? value : defaultTouchOffsetPixels;
      sync(); save();
    },
  };
}
