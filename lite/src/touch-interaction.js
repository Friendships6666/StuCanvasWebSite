import { localizeDOM, onLocaleChange, t } from './i18n.js';

// Touch owns a complete gesture. Mouse and pen retain their existing paths.
// In particular, a second finger cancels the first finger's unfinished edit.
export function createTouchInteraction(canvas, actions) {
  const lifecycle = new AbortController();
  const listen = (target, event, callback, options = {}) => target.addEventListener(event, callback, typeof options === 'boolean' ? {capture: options, signal: lifecycle.signal} : {...options, signal: lifecycle.signal});
  const contacts = new Map();
  let current = null, pinch = false, suppress = false, timer = null;
  let suppressClick = false;
  // A compatibility click can be retargeted to a chooser or action button
  // that appeared during pointerup. Require a fresh pointerdown for that UI.
  // Keyboard and assistive/programmatic activations have detail === 0.
  listen(document, 'pointerdown', () => { suppressClick = false; }, true);
  listen(document, 'click', event => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false; event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  const host = canvas.parentElement;
  const aim = document.createElement('div'); aim.id = canvas.id === 'canvas' ? 'touch-aim' : `${canvas.id}-touch-aim`; aim.className = 'touch-aim'; aim.hidden = true;
  const cross = document.createElement('span'); cross.className = 'touch-crosshair';
  const coordinates = document.createElement('output');
  const caption = document.createElement('small'); caption.dataset.i18n = 'mobile.release';
  aim.append(cross, coordinates, caption); host.append(aim); localizeDOM(aim);
  const chooser = document.createElement('div'); chooser.id = canvas.id === 'canvas' ? 'touch-picker' : `${canvas.id}-touch-picker`; chooser.className = 'touch-picker';
  chooser.setAttribute('role', 'dialog'); chooser.hidden = true;
  const heading = document.createElement('strong'); heading.dataset.i18n = 'mobile.choose'; heading.id = `${chooser.id}-title`;
  chooser.setAttribute('aria-labelledby', heading.id);
  const list = document.createElement('div'); list.className = 'touch-picker-list';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.dataset.i18n = 'ratio.cancel';
  chooser.append(heading, list, cancel); document.body.append(chooser); localizeDOM(chooser);
  const clearTimer = () => { clearTimeout(timer); timer = null; };
  function hideAim() { aim.hidden = true; actions.clearPreview(); }
  function close() {
    if (chooser.hidden) return;
    chooser.hidden = true; actions.hover(null); list.replaceChildren();
    if (chooser.contains(document.activeElement)) canvas.focus({ preventScroll: true });
  }
  listen(cancel, 'click', close);
  listen(document, 'pointerdown', event => { if (!chooser.hidden && !chooser.contains(event.target)) close(); });
  listen(document, 'keydown', event => { if (event.key === 'Escape') close(); });
  function choose(candidates, complete, allowEmpty = false, automatic = false) {
    close(); list.replaceChildren();
    const add = (object, label) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'touch-candidate';
      const swatch = document.createElement('span'); swatch.className = 'touch-candidate-swatch'; swatch.style.background = object ? actions.color(object) : 'transparent';
      const name = document.createElement('span'); name.textContent = label;
      button.append(swatch, name);
      listen(button, 'pointerenter', () => actions.hover(object?.id || null));
      listen(button, 'focus', () => actions.hover(object?.id || null));
      listen(button, 'click', () => { close(); complete(object); });
      list.append(button);
    };
    for (const object of candidates) add(object, actions.describe(object));
    if (automatic) add(undefined, t('mobile.automatic'));
    if (allowEmpty) add(null, t('mobile.coordinate'));
    localizeDOM(chooser); chooser.hidden = false; list.firstElementChild?.focus({ preventScroll: true });
  }
  function update(event) {
    const screen = actions.position(event);
    const preview = actions.preview(screen);
    aim.style.left = `${preview.screen.x}px`; aim.style.top = `${preview.screen.y}px`;
    coordinates.textContent = preview.label; aim.hidden = false;
    const margin = Math.min(110, canvas.clientWidth / 2);
    const offset = Math.max(margin, Math.min(canvas.clientWidth - margin, preview.screen.x)) - preview.screen.x;
    coordinates.style.left = caption.style.left = `${offset}px`;
    coordinates.style.top = preview.screen.y < 64 ? '24px' : '';
    caption.style.top = preview.screen.y < 64 ? '58px' : '';
    return preview;
  }
  function down(event) {
    event.preventDefault();
    contacts.set(event.pointerId, actions.position(event));
    canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true }); close();
    if (contacts.size >= 2) {
      clearTimer(); hideAim();
      if (current?.started) actions.cancel(current.event);
      current = null; suppress = true;
      if (!pinch) { pinch = true; actions.beginPinch([...contacts.values()].slice(0, 2)); }
      return;
    }
    if (suppress) return;
    const mode = actions.mode(), screen = actions.position(event);
    current = { event, mode, screen, moved: false, started: false, candidates: actions.candidates(screen) };
    if (mode === 'construct') current.preview = update(event);
    else if (mode === 'direct') { actions.start(event); current.started = true; }
    else if (mode === 'select') timer = setTimeout(() => {
      timer = null;
      if (!current || current.moved || pinch) return;
      const saved = current; current = null; suppress = true;
      hideAim();
      const open = target => actions.context(saved.event, target);
      if (saved.candidates.length > 1) choose(saved.candidates, open);
      else open(saved.candidates[0] || null);
    }, 550);
  }
  function move(event) {
    if (!contacts.has(event.pointerId)) return;
    event.preventDefault(); contacts.set(event.pointerId, actions.position(event));
    if (pinch) { if (contacts.size >= 2) actions.movePinch([...contacts.values()].slice(0, 2)); return; }
    if (!current || suppress || current.event.pointerId !== event.pointerId) return;
    const screen = actions.position(event);
    if (Math.hypot(screen.x - current.screen.x, screen.y - current.screen.y) > 8) { current.moved = true; clearTimer(); }
    if (current.mode === 'construct') { current.preview = update(event); return; }
    if (current.mode === 'select' && current.moved && !current.started) {
      const selected = current.candidates.find(object => object.id === actions.selected());
      if (current.candidates.length > 1 && !selected) return;
      actions.start(current.event, selected || current.candidates[0] || null); current.started = true;
    }
    if (current.started) actions.move(event);
  }
  function end(event) {
    if (!contacts.has(event.pointerId)) return;
    suppressClick = true;
    const cancelled = event.type !== 'pointerup';
    clearTimer();
    const saved = current;
    contacts.delete(event.pointerId);
    if (pinch || suppress) {
      if (!contacts.size) { if (pinch) actions.endPinch(); pinch = false; suppress = false; current = null; }
      return;
    }
    if (!saved || saved.event.pointerId !== event.pointerId) return;
    current = null;
    if (saved.started) { if (cancelled) actions.cancel(event); else { actions.move(event); actions.finish(event); } hideAim(); return; }
    if (cancelled) { hideAim(); return; }
    if (saved.mode === 'construct') {
      const preview = saved.preview || update(event);
      hideAim();
      // Commit the same position and candidates that produced the visible aim.
      // Repeating the hit test at the unsnapped aim position loses curves.
      const candidates = preview.candidates;
      const complete = target => actions.construct(preview.positionFor(target), target);
      if (candidates.length > 1) choose(candidates, complete, actions.allowCoordinate(), actions.allowAutomatic());
      else complete(candidates[0]);
    } else if (saved.mode === 'select') {
      const complete = target => actions.select(target);
      if (saved.candidates.length > 1) choose(saved.candidates, complete); else complete(saved.candidates[0] || null);
    }
  }
  function cancelGesture() {
    clearTimer();
    if (!current && !pinch && !contacts.size && aim.hidden && chooser.hidden) return;
    const saved = current, ids = [...contacts.keys()];
    current = null; contacts.clear();
    if (saved?.started) actions.cancel(saved.event);
    if (pinch) actions.endPinch();
    pinch = suppress = false;
    suppressClick = true;
    hideAim(); close();
    for (const id of ids) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  listen(window, 'blur', () => {
    cancelGesture();
  });
  const unlocalize = onLocaleChange(() => { close(); localizeDOM(aim); });
  return { down, move, end, close, cancel: cancelGesture, destroy() { cancelGesture();lifecycle.abort();unlocalize();aim.remove();chooser.remove(); }, get active() { return contacts.size > 0; } };
}
