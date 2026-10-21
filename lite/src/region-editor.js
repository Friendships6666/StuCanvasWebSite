import { localizeDOM, t } from './i18n.js';
import { DEFAULT_INSTANCE_SUBDIVISIONS, MIN_INSTANCE_SUBDIVISIONS, MAX_INSTANCE_SUBDIVISIONS, validInstanceSubdivisions } from './region-options.js';
import { DEFAULT_LIQUID_DROPS, MAX_LIQUID_DROPS, validLiquidDrops } from './liquid.js';
import { DEFAULT_SOFT_SUBDIVISIONS, MAX_SOFT_SUBDIVISIONS, validSoftSubdivisions } from './soft-body.js';

let nextControl = 0;
export function createRegionEditor(container, actions) {
  const controls = document.createElement('div'); controls.className = 'region-properties';
  controls.addEventListener('click', event => event.stopPropagation());
  const label = document.createElement('label'), caption = document.createElement('span'), input = document.createElement('input');
  caption.dataset.i18n = 'region.instanceSubdivisions';
  input.type = 'number'; input.min = MIN_INSTANCE_SUBDIVISIONS; input.max = MAX_INSTANCE_SUBDIVISIONS; input.step = 1;
  input.dataset.parameter = 'instanceSubdivisions'; input.dataset.i18nAriaLabel = 'region.instanceSubdivisions';
  const note = document.createElement('p'); note.className = 'physics-note'; note.dataset.i18n = 'region.instanceNote';
  const error = document.createElement('p'); error.className = 'formula-error'; error.setAttribute('role', 'alert');
  note.id = `region-instance-note-${++nextControl}`; error.id = `region-instance-error-${nextControl}`;
  input.setAttribute('aria-describedby', `${note.id} ${error.id}`);
  label.append(caption, input); controls.append(label, note, error); container.append(controls);
  const dropsLabel=document.createElement('label'),dropsCaption=document.createElement('span'),drops=document.createElement('input'),dropsNote=document.createElement('p');
  dropsCaption.dataset.i18n='liquid.drops';drops.type='number';drops.min=1;drops.max=MAX_LIQUID_DROPS;drops.step=1;drops.dataset.parameter='liquidDrops';drops.dataset.i18nAriaLabel='liquid.drops';
  dropsNote.className='physics-note';dropsNote.dataset.i18n='liquid.dropsNote';dropsLabel.append(dropsCaption,drops);controls.append(dropsLabel,dropsNote);
  drops.addEventListener('focus',()=>actions.begin?.());
  drops.addEventListener('input',()=>{const value=drops.valueAsNumber,valid=validLiquidDrops(value);drops.setAttribute('aria-invalid',String(!valid));if(valid)actions.change(object=>{object.liquidDrops=value});});
  drops.addEventListener('change',()=>actions.end?.());
  drops.addEventListener('blur',()=>{drops.value=actions.get().liquidDrops??DEFAULT_LIQUID_DROPS;drops.removeAttribute('aria-invalid');actions.end?.();});
  drops.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();drops.blur()}});
  const softLabel=document.createElement('label'),softCaption=document.createElement('span'),soft=document.createElement('input'),softNote=document.createElement('p');
  softCaption.dataset.i18n='soft.subdivisions';soft.type='number';soft.min=3;soft.max=MAX_SOFT_SUBDIVISIONS;soft.step=1;soft.dataset.parameter='softSubdivisions';soft.dataset.i18nAriaLabel='soft.subdivisions';
  softNote.className='physics-note';softNote.dataset.i18n='soft.subdivisionsNote';softLabel.append(softCaption,soft);controls.append(softLabel,softNote);
  soft.addEventListener('focus',()=>actions.begin?.());
  soft.addEventListener('input',()=>{const value=soft.valueAsNumber,valid=validSoftSubdivisions(value);soft.setAttribute('aria-invalid',String(!valid));if(valid)actions.change(object=>{object.softSubdivisions=value;});});
  soft.addEventListener('blur',()=>{soft.value=actions.get().softSubdivisions??DEFAULT_SOFT_SUBDIVISIONS;soft.removeAttribute('aria-invalid');actions.end?.();});
  soft.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();soft.blur();}});
  const sync = object => {
    if (document.activeElement !== input) input.value = object.instanceSubdivisions ?? DEFAULT_INSTANCE_SUBDIVISIONS;
    if (document.activeElement !== drops) drops.value = object.liquidDrops ?? DEFAULT_LIQUID_DROPS;
    if (document.activeElement !== soft) soft.value = object.softSubdivisions ?? DEFAULT_SOFT_SUBDIVISIONS;
  };
  input.addEventListener('focus', () => actions.begin?.());
  input.addEventListener('input', () => {
    const value = input.valueAsNumber, valid = validInstanceSubdivisions(value);
    input.setAttribute('aria-invalid', String(!valid));
    error.textContent = valid ? '' : t('region.instanceError');
    if (valid) actions.change(object => { object.instanceSubdivisions = value; });
  });
  input.addEventListener('change', () => actions.end?.());
  input.addEventListener('blur', () => {
    const current = actions.get();
    if (current) input.value = current.instanceSubdivisions ?? DEFAULT_INSTANCE_SUBDIVISIONS;
    input.setAttribute('aria-invalid', 'false'); error.textContent = '';
    actions.end?.();
  });
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); input.blur(); } });
  sync(actions.get()); localizeDOM(controls);
  return sync;
}
