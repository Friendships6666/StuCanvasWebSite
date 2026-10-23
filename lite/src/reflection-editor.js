import { localizeDOM } from './i18n.js';
import { SCRIPT_LIMIT } from './reflection.js';
import { createCodeHighlight } from './json-highlight.js';

export function createReflectionEditor(panel, actions) {
  const area = document.createElement('div'); area.className = 'script-editor js-region-editor';
  const heading = document.createElement('div'); heading.className = 'script-heading';
  const badge = document.createElement('strong'); badge.textContent = 'JS';
  const name = document.createElement('input'); name.type = 'text'; name.className = 'script-name'; name.dataset.i18nAriaLabel = 'script.variable';
  const equals = document.createElement('span'); equals.textContent = '=';
  heading.append(badge, name, equals);
  const label = document.createElement('label'); label.className = 'script-toggle';
  const enabled = document.createElement('input'); enabled.type = 'checkbox';
  const caption = document.createElement('span'); caption.dataset.i18n = 'script.enabled'; label.append(enabled, caption);
  const source = document.createElement('textarea'); source.className = 'script-source'; source.spellcheck = false; source.maxLength = SCRIPT_LIMIT;
  source.dataset.i18nAriaLabel = 'script.source'; source.rows = 6;
  source.wrap = 'off'; source.autocapitalize = 'off'; source.autocomplete = 'off';
  const sourceHost = document.createElement('div'); sourceHost.className = 'script-code'; sourceHost.append(source);
  const highlight = createCodeHighlight(source, { language: 'javascript' });
  const output = document.createElement('pre'); output.className = 'script-value'; output.dataset.i18nAriaLabel = 'script.result';
  const error = document.createElement('p'); error.className = 'formula-error'; error.setAttribute('role', 'status');
  const retry = document.createElement('button'); retry.type = 'button'; retry.dataset.i18n = 'script.retry';
  retry.addEventListener('click', () => actions.retry());
  const help = document.createElement('details'); help.className = 'script-query-help';
  const summary = document.createElement('summary'); summary.dataset.i18n = 'script.query'; help.append(summary);
  help.addEventListener('toggle', () => {
    if (!help.open || help.childElementCount > 1) return;
    const note = document.createElement('p'); note.dataset.i18n = 'script.queryNote';
    const sample = document.createElement('pre');
    sample.textContent = `query.get("data.samples[0]", 0)
query.get("/data/key~1with~1slashes")
query.has("data.samples")
query.byId("point-p")
query.byName("A")
query.byType("point")
query.all().map(o => o.id)
query.find({ type: "point", hidden: false })
query.filter(o => o.type === "point" && o.x > 0)
query.exists("A")
query.locate("A")
query.path("A")
query.parents("segment-ab", true)
query.children("A", true)
query.resolve("A")
query.search("radius", "data")
query.search((value, path) => typeof value === "number" && value > 10, "data")`;
    help.append(note, sample); localizeDOM(help);
  });
  let timer = null, composing = false, dirty = false, displayedValue;
  let outputReady = false;
  const flush = () => {
    clearTimeout(timer); timer = null;
    const object = actions.get();
    if (!object) return true;
    if (composing) return false;
    // Textareas normalize CRLF. Preserve the exact saved code when its displayed
    // text hasn't changed, including exports and edits to just the variable name.
    const code = source.value === object.source.replace(/\r\n?/g, '\n') ? object.source : source.value;
    if (code === object.source && enabled.checked === object.enabled && name.value === object.name) { dirty = false; return true; }
    dirty = false;
    const problem = actions.change({ source: code, enabled: enabled.checked, name: name.value });
    name.setAttribute('aria-invalid', String(!!problem));
    if (problem) { dirty = true; error.textContent = problem; error.hidden = false; }
    return !problem;
  };
  enabled.addEventListener('change', () => { flush(); actions.end(); });
  for (const input of [name, source]) {
    input.addEventListener('focus', actions.begin);
    input.addEventListener('input', () => { dirty = true; clearTimeout(timer); if (!composing) timer = setTimeout(flush, 250); });
    input.addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
    input.addEventListener('compositionend', () => { composing = false; timer = setTimeout(flush, 250); });
    input.addEventListener('blur', () => { flush(); actions.end(); });
    input.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); flush(); actions.end(); }
    });
  }
  for (const event of ['click', 'pointerdown', 'contextmenu']) area.addEventListener(event, event => event.stopPropagation());
  area.append(heading, sourceHost, label, output, error, retry, help); panel.append(area);
  const sync = (object, result) => {
    if (!dirty) enabled.checked = object.enabled;
    if (!dirty && document.activeElement !== source && source.value !== object.source.replace(/\r\n?/g, '\n')) { source.value = object.source; highlight.update(); }
    if (!dirty && document.activeElement !== name) name.value = object.name;
    if (!outputReady || !Object.is(displayedValue, object.value)) {
      displayedValue = object.value; outputReady = true;
      output.textContent = JSON.stringify(object.value, null, 2);
    }
    source.setAttribute('aria-invalid', String(!!result?.error));
    error.textContent = result?.error || ''; error.hidden = !result?.error;
    retry.hidden = !result?.error;
    localizeDOM(area);
  };
  sync.flush = flush;
  sync.destroy = () => { clearTimeout(timer); highlight.destroy(); };
  return sync;
}
