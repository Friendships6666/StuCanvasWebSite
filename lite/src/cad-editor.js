import { setMessage, t } from './i18n.js';
import { cornerSides } from './cad.js';

export function createCadEditor(container, actions) {
  const object = actions.get();
  const connection = object.type === 'arcConnection';
  const key = object.type !== 'chamfer' ? 'radius' : 'size';
  const controls = document.createElement('div');
  controls.className = 'cad-controls';
  const sizeLabel = document.createElement('label');
  const caption = document.createElement('span');
  caption.dataset.i18n = connection ? 'cad.connectionRadius' : key === 'radius' ? 'cad.radius' : 'cad.size';
  const input = document.createElement('input');
  input.type = 'number'; input.min = '0'; input.step = 'any'; input.value = object[key];
  input.dataset.parameter = key;
  input.dataset.i18nAriaLabel = caption.dataset.i18n;
  sizeLabel.append(caption, input);
  const directionLabel = document.createElement('label');
  const directionCaption = document.createElement('span');
  directionCaption.dataset.i18n = connection ? 'cad.connectionBranch' : 'cad.direction';
  const direction = document.createElement('select');
  direction.dataset.parameter = connection ? 'branch' : 'sides';
  direction.dataset.i18nAriaLabel = directionCaption.dataset.i18n;
  (connection ? Array.from({ length: 8 }) : cornerSides).forEach((_, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    direction.append(option);
  });
  directionLabel.append(directionCaption, direction);
  controls.append(sizeLabel, directionLabel);
  const error = document.createElement('div');
  error.className = 'formula-error cad-error';
  error.id = `cad-error-${object.id}`;
  error.setAttribute('role', 'alert');
  input.setAttribute('aria-describedby', error.id);
  direction.setAttribute('aria-describedby', error.id);
  const trimLabel = document.createElement('label');
  trimLabel.className = 'cad-trim';
  const trim = document.createElement('input');
  trim.type = 'checkbox'; trim.dataset.parameter = connection ? 'longArc' : 'trim';
  const trimCaption = document.createElement('span');
  trimCaption.dataset.i18n = connection ? 'cad.longArc' : 'cad.trim';
  trimLabel.append(trim, trimCaption);
  trimLabel.addEventListener('click', event => event.stopPropagation());
  trim.addEventListener('change', () => {
    const checked = trim.checked;
    actions.change(target => { target[connection ? 'longArc' : 'trim'] = checked; });
    actions.end();
  });
  container.append(controls, trimLabel, error);
  if (connection) {
    const note = document.createElement('div');
    note.className = 'cad-note';
    note.dataset.i18n = 'cad.connectionNote';
    container.append(note);
  }
  let invalidInput = false;
  let latestGeometry;
  const sync = (current, geometry) => {
    latestGeometry = geometry;
    trim.checked = connection ? current.longArc : current.trim !== false;
    if (document.activeElement !== input && !invalidInput) input.value = String(current[key]);
    input.setAttribute('aria-invalid', String(invalidInput));
    direction.value = String(connection ? current.branch : cornerSides.findIndex(sides => sides.every((side, index) => side === current.sides[index])));
    [...direction.options].forEach((option, index) => { option.textContent = t(connection ? 'cad.branchOption' : 'cad.corner', { index: index + 1 }); });
    setMessage(error, invalidInput ? { key: 'cad.positiveSize' } : !geometry ? { key: connection ? 'cad.connectionUndefined' : 'cad.undefined' } : '');
  };
  controls.addEventListener('click', event => event.stopPropagation());
  for (const control of [input, direction]) {
    control.addEventListener('focus', actions.begin);
    control.addEventListener('blur', () => {
      invalidInput = false;
      // Reject incomplete/non-positive input without putting invalid numbers in JSON.
      const current = actions.get();
      if (current) { input.value = String(current[key]); sync(current, latestGeometry); }
      actions.end();
    });
    control.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); control.blur(); }
    });
  }
  input.addEventListener('input', () => {
    const value = input.valueAsNumber;
    invalidInput = !Number.isFinite(value) || value <= 0;
    if (invalidInput) {
      input.setAttribute('aria-invalid', 'true');
      setMessage(error, { key: 'cad.positiveSize' });
    } else actions.change(target => { target[key] = value; });
  });
  input.addEventListener('change', actions.end);
  direction.addEventListener('change', () => {
    const value = Number(direction.value);
    actions.change(target => { if (connection) target.branch = value; else target.sides = [...cornerSides[value]]; });
    actions.end();
  });
  return sync;
}
