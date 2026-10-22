import { localizeDOM, setMessage, t } from './i18n.js';
import { getTheme } from './themes.js';
import { concreteTextureURL, defaultPhysicsMaterial, importTextureImage, physicsMaterial } from './physics-material.js';

export function createPhysicsMaterialEditor(container, actions) {
  const panel = document.createElement('details'); panel.className = 'physics-material'; panel.open = true;
  const summary = document.createElement('summary'); summary.dataset.i18n = 'physics.material';
  const preview = document.createElement('div'); preview.className = 'physics-material-preview'; preview.setAttribute('role', 'img');
  const name = document.createElement('div'); name.className = 'physics-material-name';
  const buttons = document.createElement('div'); buttons.className = 'physics-material-actions';
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
  file.dataset.action = 'physics-texture-file'; file.dataset.i18nAriaLabel = 'physics.openTexture';
  const open = document.createElement('button'); open.type = 'button'; open.dataset.i18n = 'physics.openTexture'; open.dataset.action = 'physics-texture-open';
  const reset = document.createElement('button'); reset.type = 'button'; reset.dataset.i18n = 'physics.resetTexture'; reset.dataset.action = 'physics-texture-reset';
  const label = document.createElement('label'), caption = document.createElement('span'), size = document.createElement('input');
  label.className = 'physics-material-size'; caption.dataset.i18n = 'physics.tileSize';
  size.type = 'number'; size.min = .05; size.max = 100; size.step = 'any'; size.dataset.parameter = 'material.tileSize'; size.dataset.i18nAriaLabel = 'physics.tileSize';
  label.append(caption, size);
  const error = document.createElement('p'); error.className = 'formula-error physics-texture-error'; error.setAttribute('role', 'alert');
  const errorId = `texture-error-${actions.get().id}`; error.id = errorId; file.setAttribute('aria-describedby', errorId); size.setAttribute('aria-describedby', errorId);
  buttons.append(open, reset); panel.append(summary, preview, name, buttons, file, label, error); container.append(panel);
  let request = 0, previewSource = '';
  open.addEventListener('click', () => { file.value = ''; file.click(); });
  file.addEventListener('change', async () => {
    const source = file.files?.[0];
    if (!source) return;
    const token = ++request; open.disabled = true; setMessage(error, '');
    try {
      const imported = await importTextureImage(source);
      if (token !== request || !actions.get()) return;
      actions.change(object => { object.material = { ...physicsMaterial(object), type: 'image', ...imported }; });
      actions.end();
    } catch {
      if (token === request) setMessage(error, { key: 'physics.textureError' });
    } finally { if (token === request) open.disabled = false; }
  });
  reset.addEventListener('click', () => {
    request++; open.disabled = false; setMessage(error, '');
    actions.change(object => { object.material = defaultPhysicsMaterial(); }); actions.end();
  });
  size.addEventListener('focus', actions.begin);
  size.addEventListener('input', () => {
    const value = size.valueAsNumber;
    const valid = size.value !== '' && Number.isFinite(value) && value >= .05 && value <= 100;
    size.setAttribute('aria-invalid', String(!valid));
    if (!valid) { setMessage(error, { key: 'physics.tileSizeError' }); return; }
    setMessage(error, '');
    actions.change(object => { object.material = { ...physicsMaterial(object), tileSize: value }; });
  });
  size.addEventListener('blur', () => {
    actions.end();
    const object = actions.get();
    if (object) size.value = physicsMaterial(object).tileSize;
    if (size.getAttribute('aria-invalid') === 'true') setMessage(error, '');
    size.setAttribute('aria-invalid', 'false');
  });
  size.addEventListener('keydown', event => { if (event.key === 'Enter') size.blur(); });
  return object => {
    const material = physicsMaterial(object);
    const source = material.type === 'image' ? material.image : concreteTextureURL;
    if (source !== previewSource) {
      previewSource = source;
      preview.style.backgroundImage = `url("${source}")`;
      setMessage(error, '');
      if (material.type === 'image') {
        const image = new Image();
        image.onerror = () => { if (source === previewSource) setMessage(error, { key: 'physics.textureError' }); };
        image.src = source;
      }
    }
    preview.style.backgroundColor = getTheme().objects.physicsMaterial;
    preview.style.backgroundBlendMode = material.type === 'concrete' ? 'multiply' : 'normal';
    preview.setAttribute('aria-label', t(material.type === 'concrete' ? 'physics.concrete' : 'physics.customTexture'));
    name.textContent = material.type === 'image' ? material.name || t('physics.customTexture') : t('physics.concrete');
    if (document.activeElement !== size) size.value = material.tileSize;
    localizeDOM(panel);
  };
}
