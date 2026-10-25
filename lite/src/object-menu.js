import { mainOnly, mainWindowId, renderTargets } from './render-targets.js';
import { createRegionEditor } from './region-editor.js';
import { t, onLocaleChange } from './i18n.js';
import { normalizeOptions, parameterAppliesToAlgorithm, parameterHints, parameters } from './plot/options.js';
import { objectColor, objectOpacity } from './object-style.js';
import { isPlot } from './plot/types.js';
import { isJavaScript } from './reflection.js';
import { normalizeParametricOptions, parametricParameterApplies, parametricParameters } from './plot/parametric-options.js';

export function createObjectMenu(actions) {
  const popup = document.createElement('div');
  popup.id = 'object-menu';
  popup.className = 'object-menu';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', t('menu.object'));
  popup.hidden = true;
  document.body.append(popup);
  let objectId = null;
  let anchor = null;
  let contextPosition = null;
  let panel = 'menu';
  const close = () => {
    actions.endStyle?.();
    popup.hidden = true;
    anchor?.setAttribute('aria-expanded', 'false');
    objectId = null;
    contextPosition = null;
  };
  const position = () => {
    if (!anchor?.isConnected) { close(); return; }
    const bounds = anchor.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(contextPosition?.x ?? bounds.right - 18, innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(contextPosition?.y ?? bounds.bottom + 4, innerHeight - popup.offsetHeight - 8))}px`;
  };
  const button = (text, action, className = '') => {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = `object-menu-item ${className}`;
    control.textContent = text;
    control.addEventListener('click', action);
    popup.append(control);
    return control;
  };
  const setting = (label, control, parent = popup) => {
    const row = document.createElement('label');
    row.className = 'object-setting';
    const caption = document.createElement('span');
    caption.textContent = label;
    row.append(caption, control);
    parent.append(row);
  };
  const styleControl = (control, update) => {
    control.addEventListener('input', () => {
      if (!actions.get(objectId)) return;
      if (actions.changeStyle) actions.changeStyle(objectId, update);
      else actions.change(objectId, update);
    });
    control.addEventListener('change', () => actions.endStyle?.());
  };
  const showStyleControls = object => {
    const visibility = document.createElement('input');
    visibility.type = 'checkbox';
    visibility.checked = !object.hidden;
    visibility.setAttribute('aria-label', t('menu.show'));
    styleControl(visibility, target => { target.hidden = !visibility.checked; });
    setting(t('menu.show'), visibility);
    const trace = document.createElement('input');
    trace.type = 'checkbox';
    trace.checked = !!object.trace;
    trace.setAttribute('aria-label', t('menu.trace'));
    trace.addEventListener('change', () => actions.change(objectId, target => { target.trace = trace.checked; }));
    setting(t('menu.trace'), trace);
    const color = document.createElement('input');
    color.type = 'color';
    color.value = objectColor(object);
    color.setAttribute('aria-label', t('menu.color'));
    styleControl(color, target => { target.color = color.value; });
    setting(t('menu.color'), color);
    button(t('theme.objectColor'), () => {
      actions.endStyle?.();
      actions.change(objectId, target => { target.color = null; });
      color.value = objectColor(actions.get(objectId));
    }, 'object-menu-reset');
    const control = document.createElement('span');
    control.className = 'opacity-control';
    const opacity = document.createElement('input');
    opacity.type = 'range'; opacity.min = '0'; opacity.max = '100'; opacity.step = '1';
    opacity.value = Math.round((1 - objectOpacity(object)) * 100);
    opacity.setAttribute('aria-label', t('menu.opacity'));
    const value = document.createElement('output');
    value.textContent = `${opacity.value}%`;
    styleControl(opacity, target => {
      value.textContent = `${opacity.value}%`;
      target.opacity = 1 - Number(opacity.value) / 100;
    });
    control.append(opacity, value);
    setting(t('menu.opacity'), control);
    if (!['region','slider','liquid'].includes(object.type)) {
      const thickness = document.createElement('input');
      thickness.type = 'range';
      thickness.min = '0.5'; thickness.max = '10'; thickness.step = '0.1';
      thickness.value = object.strokeWidth || 2.4;
      thickness.setAttribute('aria-label', t('menu.thickness'));
      styleControl(thickness, target => { target.strokeWidth = Number(thickness.value); });
      setting(t('menu.thickness'), thickness);
    }
  };
  const showSettings = () => {
    panel = 'settings';
    const object = actions.get(objectId);
    if (!object) { close(); return; }
    popup.replaceChildren();
    popup.classList.remove('object-menu-quick');
    popup.classList.add('object-menu-settings');
    button(t('menu.back'), showMenu, 'object-menu-back');
    showStyleControls(object);
    if (object.type === 'region') createRegionEditor(popup, {
      get: () => actions.get(objectId),
      change: update => actions.changeStyle(objectId, update),
      end: () => actions.endStyle?.(),
    });
    if (object.type === 'angleMeasure') {
      const angleMode = document.createElement('select');
      angleMode.setAttribute('aria-label', t('menu.angleMode'));
      for (const [value, label] of [['inner', t('angle.inner')], ['reflex', t('angle.external')], ['supplementary', t('angle.supplementary')]]) {
        const option = document.createElement('option');
        option.value = value; option.textContent = label;
        angleMode.append(option);
      }
      angleMode.value = object.angleMode || 'inner';
      angleMode.addEventListener('change', () => actions.change(objectId, target => { target.angleMode = angleMode.value; }));
      setting(t('menu.angleMode'), angleMode);
    }
    if (object.type === 'slider') {
      const name = document.createElement('input');
      name.type = 'text'; name.value = object.name; name.maxLength = 12; name.pattern = '[a-zA-Z][a-zA-Z0-9]*';
      name.addEventListener('change', () => {
        const value = name.value.trim().toLowerCase();
        if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(value) || ['x', 'y', 'e', 'pi', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'cbrt', 'abs', 'exp', 'log', 'ln', 'floor', 'ceil', 'fmod', 'min', 'max', 'pow', 'hypot'].includes(value) || actions.all?.().some(item => item.id !== objectId && item.type === 'slider' && item.name.toLowerCase() === value) || actions.get(objectId) !== object) return;
        actions.change(objectId, target => { target.name = value; });
        showSettings();
      });
      setting(t('menu.name'), name);
      for (const [key, label, minimum] of [['min', t('menu.minimum'), -1e300], ['max', t('menu.maximum'), -1e300], ['step', t('menu.step'), Number.MIN_VALUE]]) {
        const input = document.createElement('input');
        input.type = 'number'; input.value = object[key]; input.min = minimum; input.step = 'any';
        input.addEventListener('change', () => {
          if (!input.value.trim() || !Number.isFinite(Number(input.value))) return;
          actions.change(objectId, target => { target[key] = Number(input.value); });
          showSettings();
        });
        setting(label, input);
      }
    }
    if (isPlot(object) || isJavaScript(object)) {
      const parametric = object.type === 'parametric';
      const normalize = parametric ? normalizeParametricOptions : normalizeOptions;
      const base = parametric ? {} : actions.defaults();
      const settings = parametric ? parametricParameters : parameters;
      const applies = parametric ? parametricParameterApplies : parameterAppliesToAlgorithm;
      const options = normalize({ ...base, ...object.plotOptions });
      const algorithm = document.createElement('select');
      algorithm.setAttribute('aria-label', t('menu.algorithm'));
      const algorithms = parametric ? [['adaptive', t('algorithm.adaptive')], ['interval', t('algorithm.interval')]] : [['marching', t('algorithm.marching')], ['lshade', t('algorithm.lshade')]];
      for (const [value, text] of algorithms) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        algorithm.append(option);
      }
      algorithm.value = options.algorithm;
      algorithm.addEventListener('change', () => {
        actions.change(objectId, target => { target.plotOptions = { ...target.plotOptions, algorithm: algorithm.value }; });
        showSettings();
      });
      setting(t('menu.algorithm'), algorithm);
      const advanced = document.createElement('details');
      advanced.className = 'object-advanced';
      const summary = document.createElement('summary');
      summary.textContent = t('menu.advanced');
      advanced.append(summary);
      for (const [key, label, , minimum, maximum, step] of settings) {
        if (!applies(key, options.algorithm)) continue;
        const input = document.createElement('input');
        const toggle = !parametric && key === 'adaptiveVerification';
        input.type = toggle ? 'checkbox' : 'number';
        if (toggle) input.checked = options[key] === 1;
        input.value = options[key];
        input.min = minimum;
        input.max = maximum;
        input.step = step;
        input.dataset.parameter = key;
        if (!parametric && parameterHints[key]) input.title = t(parameterHints[key]);
        input.addEventListener('change', () => {
          if (!toggle && (!input.value.trim() || !input.checkValidity())) return;
          actions.change(objectId, target => {
            target.plotOptions = normalize({ ...base, ...target.plotOptions, [key]: toggle ? Number(input.checked) : Number(input.value) });
          });
          input.value = actions.get(objectId).plotOptions[key];
        });
        setting(t(label), input, advanced);
      }
      popup.append(advanced);
      advanced.addEventListener('toggle', position);
      button(t('menu.reset'), () => {
        actions.change(objectId, target => { delete target.plotOptions; delete target.color; delete target.strokeWidth; delete target.opacity; });
        showSettings();
      }, 'object-menu-reset');
    }
    position();
  };
  function showTargets() {
    panel='targets';actions.endStyle?.();
    const object=actions.get(objectId);if(!object){close();return;}
    popup.replaceChildren();popup.classList.remove('object-menu-quick');popup.classList.add('object-menu-settings');
    button(t('menu.back'),showMenu,'object-menu-back');
    const title=document.createElement('div');title.className='object-menu-title';title.textContent=t('targets.label');popup.append(title);
    const selected=new Set(renderTargets(object));
    for(const id of actions.windows()){
      const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(id);check.disabled=mainOnly(object);check.dataset.renderTarget=id;
      check.addEventListener('change',()=>{
        actions.change(objectId,target=>{const next=new Set(renderTargets(target));if(check.checked)next.add(id);else next.delete(id);target.renderTargets=[...next];});
      });
      setting(id===mainWindowId?t('targets.main'):id,check);
    }
    if(mainOnly(object)){const note=document.createElement('p');note.className='render-target-note';note.textContent=t('targets.physics');popup.append(note);}
    position();
  }
  function showMenu() {
    panel = 'menu';
    actions.endStyle?.();
    const object = actions.get(objectId);
    if (!object) { close(); return; }
    popup.replaceChildren();
    popup.classList.remove('object-menu-settings', 'object-menu-quick');
    if (isPlot(object)) {
      button(t('menu.edit'), () => { const id = objectId; close(); actions.edit(id); });
      button(t('menu.duplicate'), () => { const id = objectId; close(); actions.duplicate(id); });
    }
    const targets=button(t('targets.label'),showTargets);targets.dataset.action='render-targets';
    if (isJavaScript(object)) {
      button(t('menu.delete'), () => { const id = objectId; close(); actions.remove(id); }, 'object-menu-delete');
      position(); return;
    }
    button(object.hidden ? t('menu.show') : t('menu.hide'), () => {
      const id = objectId;
      close();
      actions.change(id, target => { target.hidden = !target.hidden; });
    });
    button(t('menu.delete'), () => { const id = objectId; close(); actions.remove(id); }, 'object-menu-delete');
    button(object.trace ? t('menu.traceOff') : t('menu.traceOn'), () => {
      const id = objectId;
      close();
      actions.change(id, target => { target.trace = !target.trace; });
    });
    button(t('menu.settings'), showSettings);
    position();
  }
  function showQuickMenu() {
    panel = 'quick';
    const object = actions.get(objectId);
    if (!object) { close(); return; }
    if (isJavaScript(object)) { showMenu(); return; }
    popup.replaceChildren();
    popup.classList.remove('object-menu-settings');
    popup.classList.add('object-menu-quick');
    const title = document.createElement('div');
    title.className = 'object-menu-title';
    title.textContent = object.name;
    popup.append(title);
    if (object.type === 'region') {
      const instantiate = button(t('physics.instantiate'), () => { const id = objectId; close(); actions.instantiate(id); });
      instantiate.dataset.action = 'instantiate-physics';
      const liquefy = button(t('liquid.instantiate'), () => { const id=objectId;close();actions.liquefy(id); });
      liquefy.dataset.action='instantiate-liquid';
      const soften=button(t('soft.instantiate'),()=>{const id=objectId;close();actions.soften(id);});
      soften.dataset.action='instantiate-soft';
      const refine = button(t('region.refine'), () => { const id = objectId; close(); actions.refineRegion(id); });
      refine.dataset.action = 'region-refine';
    }
    showStyleControls(object);
    button(t('menu.more'), showSettings, 'object-menu-reset');
    position();
  }
  popup.addEventListener('contextmenu', event => event.preventDefault());
  document.addEventListener('pointerdown', event => {
    if (!popup.hidden && !popup.contains(event.target) && !(anchor?.tagName !== 'CANVAS' && anchor?.contains(event.target))) close();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !popup.hidden) { close(); anchor?.focus(); event.preventDefault(); event.stopImmediatePropagation(); }
  });
  window.addEventListener('resize', () => { if (!popup.hidden) position(); });
  document.querySelector('.algebra-content').addEventListener('scroll', event => {
    if (anchor && event.currentTarget.contains(anchor)) close();
  });
  onLocaleChange(() => {
    popup.setAttribute('aria-label', t('menu.object'));
    if (popup.hidden) return;
    if (panel === 'targets') showTargets();
    else if (panel === 'settings') showSettings();
    else if (panel === 'quick') showQuickMenu();
    else if (panel === 'canvas') menu.openCanvas(anchor, contextPosition);
    else showMenu();
  });
  const menu = {
    close,
    sync() {
      if (objectId && !actions.get(objectId)) close();
      else if(objectId&&!popup.hidden&&panel==='targets')showTargets();
      else if(!popup.hidden&&panel==='canvas') for(const control of popup.querySelectorAll('[data-canvas-visibility]')) {
        control.checked = !!actions.canvasVisibility()[control.dataset.canvasVisibility];
      }
    },
    openCanvas(control, point) {
      close();
      panel = 'canvas';
      anchor = control;
      contextPosition = point;
      anchor.setAttribute('aria-expanded', 'true');
      popup.replaceChildren();
      popup.classList.remove('object-menu-settings', 'object-menu-quick');
      popup.hidden = false;
      const timeline = button(t('timeline.open'), () => { const at = contextPosition; close(); actions.openTimeline(at); });
      timeline.dataset.action = 'open-timeline';
      const coordinate=button(t('coordinates.create'),()=>{const at=contextPosition;close();actions.openCoordinates(at);});
      coordinate.dataset.action='open-coordinate-window';
      for (const key of ['hidePoints', 'hideObjectLabels']) {
        const control = document.createElement('input');
        control.type = 'checkbox';
        control.dataset.canvasVisibility = key;
        control.checked = !!actions.canvasVisibility()[key];
        control.addEventListener('change', () => actions.changeCanvasVisibility(key, control.checked));
        setting(t(`menu.${key}`), control);
      }
      const clear = button(t('menu.clearTraces'), () => { close(); actions.clearTraces(); });
      clear.dataset.action = 'clear-traces';
      position();
      timeline.focus({ preventScroll: true });
    },
    open(id, control) {
      const same = objectId === id && !popup.hidden;
      close();
      if (same) return;
      objectId = id;
      anchor = control;
      anchor.setAttribute('aria-expanded', 'true');
      popup.hidden = false;
      showMenu();
      popup.querySelector('button')?.focus();
    },
    openQuick(id, control, point) {
      close();
      objectId = id;
      anchor = control;
      contextPosition = point;
      anchor.setAttribute('aria-expanded', 'true');
      popup.hidden = false;
      showQuickMenu();
      popup.querySelector('input')?.focus({ preventScroll: true });
    },
  };
  return menu;
}
