import { errorMessage, setMessage } from './i18n.js';
import { documentKey, mergeDocumentEdits, parseDocument, serializeDocument } from './document.js';
import { createJsonHighlight } from './json-highlight.js';

export function createDocumentEditor({ read, apply, available, prepare }) {
  const editor = document.getElementById('json-input');
  const highlight = createJsonHighlight(editor);
  const status = document.getElementById('json-status');
  const error = document.getElementById('json-error');
  const objectPanel = document.querySelector('.algebra-content');
  const jsonPanel = document.getElementById('json-panel');
  const objectsButton = document.getElementById('view-objects');
  const jsonButton = document.getElementById('view-json');
  let dirty = false;
  let timer = null;
  let syncTimer = null;
  let modelKey = '';
  let baseline = null;
  let composing = false;
  const indicate = key => setMessage(status, { key });
  const showCurrent = () => {
    clearTimeout(timer);
    timer = null;
    dirty = false;
    const current = read();
    editor.value = serializeDocument(current);
    highlight.update();
    modelKey = documentKey(current);
    baseline = current;
    editor.removeAttribute('aria-invalid');
    setMessage(error, '');
    indicate('document.synced');
  };
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    if (!dirty) return true;
    if (composing) return false;
    if (!available()) {
      timer = setTimeout(flush, 180);
      return false;
    }
    try {
      const edited = parseDocument(editor.value);
      const current = read();
      const merged = baseline ? mergeDocumentEdits(baseline, edited, current) : edited;
      // Revalidate after merging: concurrent changes may alter dependencies.
      apply(parseDocument(serializeDocument(merged)));
      baseline = edited;
      modelKey = documentKey(edited);
      dirty = false;
      editor.removeAttribute('aria-invalid');
      setMessage(error, '');
      indicate('document.synced');
      thisEditor.sync();
      return true;
    } catch (caught) {
      editor.setAttribute('aria-invalid', 'true');
      setMessage(error, errorMessage(caught));
      indicate('document.invalid');
      return false;
    }
  };
  const switchView = json => {
    if (json && jsonPanel.hidden) {
      prepare();
      if (!dirty) showCurrent();
    }
    if (!json) flush();
    objectPanel.hidden = json;
    jsonPanel.hidden = !json;
    objectsButton.setAttribute('aria-selected', String(!json));
    jsonButton.setAttribute('aria-selected', String(json));
    document.querySelector('.algebra').dataset.mode = json ? 'json' : 'objects';
    objectsButton.tabIndex = json ? -1 : 0;
    jsonButton.tabIndex = json ? 0 : -1;
    if (json) window.mathVirtualKeyboard?.hide();
    if (json) highlight.show();
  };
  objectsButton.addEventListener('click', () => switchView(false));
  jsonButton.addEventListener('click', () => switchView(true));
  for (const button of [objectsButton, jsonButton]) button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const json = event.key === 'End' || event.key !== 'Home' && jsonPanel.hidden;
    switchView(json);
    (json ? jsonButton : objectsButton).focus();
  });
  editor.addEventListener('input', () => {
    dirty = true;
    clearTimeout(timer);
    indicate('document.pending');
    timer = setTimeout(flush, 180);
  });
  editor.addEventListener('compositionstart', () => { composing = true; });
  editor.addEventListener('compositionend', () => { composing = false; if (dirty) timer = setTimeout(flush, 180); });
  editor.addEventListener('blur', () => { if (flush()) showCurrent(); });
  editor.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      if (flush()) showCurrent();
    }
  });
  document.getElementById('json-format').addEventListener('click', () => { if (flush()) showCurrent(); });
  document.getElementById('json-revert').addEventListener('click', showCurrent);
  const thisEditor = {
    sync() {
      if (jsonPanel.hidden || dirty || syncTimer !== null) return;
      syncTimer = setTimeout(() => {
        syncTimer = null;
        if (!jsonPanel.hidden && !dirty) {
          const current = read();
          const key = documentKey(current);
          if (key === modelKey) return;
          modelKey = key;
          baseline = current;
          const value = serializeDocument(current);
          if (editor.value !== value) {
            const top = editor.scrollTop;
            const left = editor.scrollLeft;
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            editor.value = value;
            editor.setSelectionRange(Math.min(start, value.length), Math.min(end, value.length));
            editor.scrollTop = top;
            editor.scrollLeft = left;
            highlight.update();
          }
        }
      }, 120);
    },
    showObjects() { switchView(false); },
    flush,
    reset: showCurrent,
  };
  return thisEditor;
}
