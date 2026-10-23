import { localizeDOM } from './i18n.js';

export function createRotationDialog(actions) {
  const dialog = document.createElement('dialog');
  dialog.id = 'rotation-dialog';
  dialog.className = 'ratio-dialog';
  dialog.setAttribute('aria-labelledby', 'rotation-title');
  dialog.innerHTML = '<form><h2 id="rotation-title" data-i18n="tool.rotation"></h2><div class="ratio-inputs"><label><span data-i18n="transform.angle"></span><input type="number" step="any" value="90" required></label></div><div class="ratio-actions"><button type="button" data-i18n="ratio.cancel"></button><button type="submit" data-i18n="ratio.create"></button></div></form>';
  document.body.append(dialog);
  const input = dialog.querySelector('input');
  const valid = () => input.value.trim() && Number.isFinite(input.valueAsNumber);
  const cancel = () => { dialog.close(); actions.cancel(); };
  input.addEventListener('input', () => {
    input.setAttribute('aria-invalid', String(!valid()));
    dialog.querySelector('[type="submit"]').disabled = !valid();
    actions.preview(valid() ? input.valueAsNumber : null);
  });
  dialog.querySelector('[type="button"]').addEventListener('click', cancel);
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  dialog.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); cancel(); } });
  dialog.querySelector('form').addEventListener('submit', event => { event.preventDefault(); if (valid()) actions.submit(input.valueAsNumber); });
  return {
    open() {
      localizeDOM(dialog); input.value = '90'; input.removeAttribute('aria-invalid');
      dialog.querySelector('[type="submit"]').disabled = false;
      dialog.showModal(); input.focus(); input.select();
    },
    close() { if (dialog.open) dialog.close(); },
  };
}
