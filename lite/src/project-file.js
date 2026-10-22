import { validDocumentRenderTargets } from './render-targets.js';
import { LocalizedError } from './i18n.js';
import { parseDocument, serializeDocument } from './document.js';
import { compactDocument, expandDocument } from './compact-document.js';

export const projectFormat = 'stucanvas-lite-project';
export const projectVersion = 1;
const fail = (key, values = {}) => { throw new LocalizedError(key, values); };
const record = value => value && typeof value === 'object' && !Array.isArray(value);

// File export is exactly the canonical document shown in the JSON editor.
// The legacy envelope is an input adapter only; settings now live in document.
export function createProject(document, { view, display } = {}) {
  return parseProject(serializeDocument({ ...document, ...(view ? { view } : {}), ...(display ? { display } : {}) }));
}
export function parseProject(text) {
  let input;
  try { input = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { fail('project.invalidFile'); }
  if (!record(input)) fail('project.invalidFile');
  let document;
  if (input.format === 'stucanvas-lite') document = parseDocument(serializeDocument(input));
  else {
    if (input.format !== projectFormat || !record(input.document)) fail('project.invalidFile');
    if (input.version !== projectVersion) fail('project.version', { version: String(input.version) });
    document = parseDocument(serializeDocument({ ...input.document,
      ...(input.view && !input.document.view ? { view: input.view } : {}),
      ...(input.display && !input.document.display ? { display: input.display } : {}) }));
  }
  if(!validDocumentRenderTargets(document))fail('error.documentValue',{path:'$.objects.renderTargets'});
  document = compactDocument(expandDocument(document));
  return { format: projectFormat, version: projectVersion, document,
    ...(document.view ? { view: document.view } : {}), ...(document.display ? { display: document.display } : {}) };
}
export const serializeProject = project => serializeDocument(compactDocument(expandDocument(project.document || project)));
