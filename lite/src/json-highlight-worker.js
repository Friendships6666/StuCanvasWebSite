import { JsonSyntaxIndex } from './json-syntax.js';

const documents = new Map();
let javascriptModule;
// Serialize async module startup with updates/deletions for every editor.
let queue = Promise.resolve();
self.onmessage = ({ data }) => { queue = queue.then(async () => {
  if (data.release) { documents.delete(data.client); return; }
  let entry = documents.get(data.client);
  if (!entry || entry.font !== data.font) {
    const context = new OffscreenCanvas(1, 1).getContext('2d');
    context.font = data.font;
    context.fontKerning = 'none';
    const widths = new Map();
    const width = character => {
      if (!widths.has(character)) widths.set(character, context.measureText(character).width);
      return widths.get(character);
    };
    const Index = data.language === 'javascript' ? (await (javascriptModule ||= import('../assets/javascript-syntax.js'))).JavaScriptSyntaxIndex : JsonSyntaxIndex;
    entry = { font: data.font, index: new Index(width, width(' ') * 2) };
    documents.set(data.client, entry);
  }
  const { index } = entry;
  if (data.text !== undefined) index.update(data.text);
  self.postMessage({ client: data.client, id: data.id, revision: data.revision, viewport: data.viewport, rows: index.viewport(data.viewport), lineCount: index.lines.length });
}).catch(() => { self.postMessage({ client: data.client, failed: true }); }); };
