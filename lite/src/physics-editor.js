import { isFlexible } from './rope.js';
import { isSoftBody } from './soft-body.js';
import { createSoftControls } from './soft-editor.js';
import { isLiquid, rigidArea } from './liquid.js';
import { createLiquidControls } from './liquid-editor.js';
import { createRopeControls } from './rope-editor.js';
import { createPhysicsMaterialEditor } from './physics-material-editor.js';
import { localizeDOM, t } from './i18n.js';
import { isBoundary } from './regions.js';
import { isPoint } from './geometry.js';
import { isPhysicsObject } from './physics.js';
import { bodyGeometry, smoothingLevel } from './physics-shape.js';

export function createPhysicsEditor(container, actions) {
  const rope = isFlexible(actions.get());
  const liquid = isLiquid(actions.get());
  const soft = isSoftBody(actions.get());
  const panel = document.createElement('div');
  panel.className = 'physics-editor';
  panel.addEventListener('click', event => event.stopPropagation());
  const buttons = document.createElement('div'); buttons.className = 'physics-playback';
  const play = document.createElement('button');
  const step = document.createElement('button'); step.dataset.i18n = 'physics.step'; step.dataset.action = 'physics-step';
  const reset = document.createElement('button'); reset.dataset.i18n = 'physics.reset'; reset.dataset.action = 'physics-reset';
  play.dataset.action = 'physics-play';
  for (const button of [play, step, reset]) button.type = 'button';
  play.addEventListener('click', () => actions.command('play'));
  step.addEventListener('click', () => actions.command('step'));
  reset.addEventListener('click', () => actions.command('reset'));
  buttons.append(play, step, reset);
  const progress = document.createElement('progress'); progress.max = 30;
  progress.dataset.i18nAriaLabel = 'physics.progress';
  const clock = document.createElement('output'); clock.className = 'physics-clock';
  panel.append(buttons, progress, clock);
  const controls = document.createElement('div'); controls.className = 'physics-controls';
  const fields = [];
  const addNumber = (key, label, minimum, maximum, step = 'any', container = controls) => {
    const row = document.createElement('label'), caption = document.createElement('span'), input = document.createElement('input');
    caption.dataset.i18n = label;
    input.type = 'number'; input.step = step; input.dataset.parameter = key; input.dataset.i18nAriaLabel = label;
    if (minimum !== undefined) input.min = minimum;
    if (maximum !== undefined) input.max = maximum;
    const read = object => key.split('.').reduce((value, name) => value[name], object);
    input.addEventListener('focus', () => { actions.begin(); input.value = read(actions.get()); });
    input.addEventListener('input', () => {
      const value = input.valueAsNumber;
      const valid = input.value !== '' && Number.isFinite(value) && (!['segments','turns'].includes(key) || Number.isInteger(value)) && (minimum === undefined || value >= minimum) && (maximum === undefined || value <= maximum);
      input.setAttribute('aria-invalid', String(!valid));
      if (!valid) return;
      actions.change(object => {
        const path = key.split('.'), last = path.pop();
        path.reduce((value, name) => value[name], object)[last] = value;
      });
    });
    input.addEventListener('blur', () => { actions.end(); input.value = read(actions.get()); input.setAttribute('aria-invalid', 'false'); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter') input.blur(); });
    row.append(caption, input); container.append(row); fields.push({ input, read });
    return input;
  };
  if (!rope && !liquid && !soft) {
    addNumber('position.x', 'physics.positionX'); addNumber('position.y', 'physics.positionY');
    addNumber('velocity.x', 'physics.velocityX'); addNumber('velocity.y', 'physics.velocityY');
  }
  addNumber('gravity.x', 'physics.gravityX'); addNumber('gravity.y', 'physics.gravityY');
  if(!liquid)addNumber('mass', 'physics.mass', .000001);
  let densityInput=null;
  if(!rope&&!liquid&&!soft) {
    const row=document.createElement('label'),caption=document.createElement('span');caption.dataset.i18n='liquid.rigidDensity';
    densityInput=document.createElement('input');densityInput.type='number';densityInput.min=.000001;densityInput.step='any';densityInput.dataset.parameter='rigidDensity';
    densityInput.addEventListener('focus',()=>actions.begin());
    densityInput.addEventListener('input',()=>{const value=densityInput.valueAsNumber,valid=Number.isFinite(value)&&value>0;densityInput.setAttribute('aria-invalid',String(!valid));if(valid)actions.change(object=>{object.mass=value*rigidArea(object)});});
    densityInput.addEventListener('blur',()=>{actions.end();densityInput.value=actions.get().mass/rigidArea(actions.get());densityInput.removeAttribute('aria-invalid');});
    densityInput.addEventListener('keydown',event=>{if(event.key==='Enter')densityInput.blur()});
    row.append(caption,densityInput);controls.append(row);
  }
  addNumber('restitution', 'physics.restitution', 0, 1, .05);
  const air = document.createElement('div'); air.className = 'physics-air-resistance';
  const airInput = addNumber('airFriction', 'physics.airFriction', 0, 1, .001, air);
  const airNote = document.createElement('p'); airNote.className = 'physics-note'; airNote.dataset.i18n = 'physics.airFrictionNote';
  airNote.id = `physics-air-note-${actions.get().id}`;
  airInput.setAttribute('aria-describedby', airNote.id);
  air.append(airNote); panel.append(air);
  let syncShape = () => {};
  if (!rope && !liquid && !soft) {
    const smoothing = document.createElement('div'); smoothing.className = 'physics-smoothing';
    const smoothInput = addNumber('smoothing', 'physics.smoothing', 0, 100, 1, smoothing);
    const smoothRange = document.createElement('input'); smoothRange.type = 'range';
    smoothRange.min = 0; smoothRange.max = 100; smoothRange.step = 1;
    smoothRange.dataset.parameter = 'smoothing-range'; smoothRange.dataset.i18nAriaLabel = 'physics.smoothing';
    smoothRange.addEventListener('input', () => {
      const value = smoothRange.valueAsNumber;
      actions.change(object => { object.smoothing = value; });
    });
    smoothRange.addEventListener('change', () => actions.end());
    smoothRange.addEventListener('blur', () => actions.end());
    const smoothStats = document.createElement('output'); smoothStats.className = 'physics-smoothing-stats';
    const smoothNote = document.createElement('p'); smoothNote.className = 'physics-note'; smoothNote.dataset.i18n = 'physics.smoothingNote';
    smoothNote.id = `physics-smoothing-note-${actions.get().id}`;
    smoothInput.setAttribute('aria-describedby', smoothNote.id); smoothRange.setAttribute('aria-describedby', smoothNote.id);
    const restore = document.createElement('button'); restore.type = 'button'; restore.dataset.i18n = 'physics.smoothingReset'; restore.dataset.action = 'physics-smoothing-reset';
    restore.addEventListener('click', () => { actions.change(object => { object.smoothing = 0; }); actions.end(); });
    smoothing.append(smoothRange, smoothStats, smoothNote, restore); panel.append(smoothing);
    const syncMaterial = createPhysicsMaterialEditor(panel, actions);
    addNumber('angle', 'physics.angle'); addNumber('angularVelocity', 'physics.angularVelocity');
    syncShape = object => {
      syncMaterial(object);
      const level = smoothingLevel(object), geometry = bodyGeometry(object);
      if (document.activeElement !== smoothRange) smoothRange.value = level;
      smoothStats.textContent = t(level > 0 && !geometry.applied ? 'physics.smoothingFallback' : 'physics.smoothingStats', { original: object.shape.rectangles.length, current: geometry.parts });
      restore.disabled = level === 0;
    };
  } else syncShape = soft ? createSoftControls(panel,actions,addNumber) : liquid ? createLiquidControls(panel, actions, addNumber) : createRopeControls(panel, actions, addNumber);
  addNumber('duration', 'physics.duration', 0, 3600);
  addNumber('playbackRate', 'physics.rate', .05, 4, .05);
  const properties = document.createElement('details'); properties.open = true;
  const summary = document.createElement('summary'); summary.dataset.i18n = 'physics.parameters';
  properties.append(summary, controls); panel.append(properties);
  const freeLabel = document.createElement('label'); freeLabel.className = 'physics-freefall';
  const free = document.createElement('input'); free.type = 'checkbox'; free.dataset.parameter = 'freeFall';
  const freeCaption = document.createElement('span'); freeCaption.dataset.i18n = 'physics.freeFall';
  free.addEventListener('change', () => { const checked = free.checked; actions.change(object => { object.freeFall = checked; }); actions.end(); });
  freeLabel.append(free, freeCaption); panel.append(freeLabel);
  const seekRow = document.createElement('div'); seekRow.className = 'physics-seek';
  const seek = document.createElement('input'); seek.type = 'number'; seek.min = 0; seek.max = 60; seek.step = .1; seek.value = 0;
  seek.dataset.i18nAriaLabel = 'physics.seek';
  const seekButton = document.createElement('button'); seekButton.type = 'button'; seekButton.dataset.i18n = 'physics.seek'; seekButton.dataset.action = 'physics-seek';
  seekButton.addEventListener('click', async () => {
    if (!seek.checkValidity() || !Number.isFinite(seek.valueAsNumber)) { seek.reportValidity(); return; }
    seekButton.disabled = true;
    try { await actions.command('seek', seek.valueAsNumber); } finally { seekButton.disabled = false; }
  });
  seekRow.append(seek, seekButton); panel.append(seekRow);
  const note = document.createElement('p'); note.className = 'physics-note'; note.dataset.i18n = 'physics.seekNote'; panel.append(note);
  const exclusions = document.createElement('details'), title = document.createElement('summary'), list = document.createElement('div');
  title.dataset.i18n = 'physics.ignore'; list.className = 'physics-exclusions';
  exclusions.append(title, list); panel.append(exclusions);
  let listKey = '';
  container.append(panel);
  return object => {
    if(densityInput&&document.activeElement!==densityInput)densityInput.value=Number((object.mass/rigidArea(object)).toPrecision(9));
    syncShape(object);
    play.dataset.i18n = object.running ? 'physics.pause' : 'physics.play';
    progress.max = object.duration || Math.max(30, object.time); progress.value = object.time;
    clock.textContent = t('physics.time', { time: object.time.toFixed(2) });
    for (const { input, read } of fields) if (document.activeElement !== input) input.value = Number(read(object).toPrecision(9));
    free.checked = object.freeFall;
    const candidates = actions.all().filter(item => item.id !== object.id && (isBoundary({ ...item, hidden: false }) || isPoint(item) || isPhysicsObject(item)));
    const key = JSON.stringify([candidates.map(item => [item.id, item.name]), object.ignored]);
    if (key !== listKey) {
      listKey = key; list.replaceChildren();
      if (!candidates.length) { const empty = document.createElement('p'); empty.dataset.i18n = 'physics.noBoundaries'; list.append(empty); }
      for (const candidate of candidates) {
        const label = document.createElement('label'), input = document.createElement('input'), text = document.createElement('span');
        input.type = 'checkbox'; input.checked = object.ignored.includes(candidate.id); input.dataset.ignoreId = candidate.id;
        text.textContent = candidate.name;
        input.addEventListener('change', () => {
          const checked = input.checked;
          actions.change(target => { target.ignored = checked ? [...new Set([...target.ignored, candidate.id])] : target.ignored.filter(id => id !== candidate.id); });
          actions.end();
        });
        label.append(input, text); list.append(label);
      }
    }
    localizeDOM(panel);
  };
}
