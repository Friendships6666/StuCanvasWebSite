import { localizeDOM, onLocaleChange, t } from './i18n.js';

export function createMobileUI() {
  const panel = document.querySelector('.algebra');
  const handle = document.createElement('button'); handle.type = 'button'; handle.id = 'mobile-panel-toggle';
  handle.className = 'mobile-panel-toggle'; handle.setAttribute('aria-expanded', 'false'); handle.setAttribute('aria-controls', 'object-panel json-panel');
  const grip = document.createElement('span'); grip.className = 'mobile-panel-grip'; grip.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span'); text.dataset.i18n = 'mobile.objects';
  const icon = document.createElement('span'); icon.className = 'mobile-panel-chevron'; icon.textContent = '⌃'; icon.setAttribute('aria-hidden', 'true');
  handle.append(grip, text, icon); panel.prepend(handle);
  const media = matchMedia('(max-width: 760px), (max-height: 550px) and (pointer: coarse)');
  let open = false;
  function show(value) {
    open = Boolean(value); panel.classList.toggle('mobile-panel-open', open);
    handle.setAttribute('aria-expanded', String(open));
    handle.setAttribute('aria-label', t(open ? 'mobile.closeObjects' : 'mobile.objects'));
    for (const child of panel.children) if (child !== handle) child.inert = media.matches && !open;
    if (!open && panel.contains(document.activeElement) && document.activeElement !== handle) document.activeElement.blur();
  }
  handle.addEventListener('click', () => show(!open));
  media.addEventListener('change', () => show(open));
  panel.addEventListener('focusin', event => { if (event.target !== handle && media.matches) show(true); });
  // A swipe on the handle expands or closes the sheet without moving the canvas.
  let start;
  handle.addEventListener('pointerdown', event => { start = event.clientY; handle.setPointerCapture(event.pointerId); });
  handle.addEventListener('pointerup', event => {
    if (Math.abs(event.clientY - start) > 18) { show(event.clientY < start); event.preventDefault(); suppressClick = true; }
  });
  let suppressClick = false;
  handle.addEventListener('click', event => { if (suppressClick) { suppressClick = false; event.stopImmediatePropagation(); } }, true);
  handle.addEventListener('pointercancel', () => { start = undefined; });
  onLocaleChange(() => { localizeDOM(handle); show(open); }); localizeDOM(handle); show(false);
  return { show, get mobile() { return media.matches; } };
}
