import { setMessage } from './i18n.js';
import { validDivisionRatio } from './geometry.js';

export function createRatioDialog(actions) {
  const dialog = document.getElementById('ratio-dialog');
  const inputs = ['ratio-first', 'ratio-second'].map(id => document.getElementById(id));
  const error = document.getElementById('ratio-error');
  const submit = document.getElementById('ratio-create');
  const read = () => inputs.map(input => input.valueAsNumber);
  const validate = () => {
    const ratio = read();
    const valid = validDivisionRatio(ratio);
    for (const [index, input] of inputs.entries()) input.setAttribute('aria-invalid', String(!(Number.isFinite(ratio[index]) && ratio[index] > 0)));
    setMessage(error, valid ? '' : { key: 'ratio.invalid' });
    submit.disabled = !valid;
    actions.preview(valid ? ratio : null);
    return valid;
  };
  const cancel = () => { dialog.close(); actions.cancel(); };
  for (const input of inputs) input.addEventListener('input', validate);
  document.getElementById('ratio-cancel').addEventListener('click', cancel);
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  // Keep application shortcuts from running while editing a modal form.
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); cancel(); }
  });
  document.getElementById('ratio-form').addEventListener('submit', event => {
    event.preventDefault();
    if (validate()) actions.submit(read());
  });
  return {
    open(first, second) {
      setMessage(document.getElementById('ratio-help'), { key: 'ratio.help', values: { first: first.name, second: second.name } });
      for (const input of inputs) input.value = '1';
      validate();
      dialog.showModal();
      inputs[0].focus();
      inputs[0].select();
    },
    close() { if (dialog.open) dialog.close(); },
  };
}
