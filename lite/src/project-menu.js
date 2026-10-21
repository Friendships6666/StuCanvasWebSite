import { errorMessage, LocalizedError, setMessage } from './i18n.js';
import { parseProject, serializeProject } from './project-file.js';

export function createProjectMenu({ prepare, read, apply }) {
  const exportButton = document.getElementById('project-export');
  const importButton = document.getElementById('project-import');
  const input = document.getElementById('project-file');
  const status = document.getElementById('project-status');
  let busy = false;
  const run = async action => {
    if (busy) return;
    busy = true; exportButton.disabled = importButton.disabled = true;
    setMessage(status, ''); status.classList.remove('project-error');
    try { await action(); }
    catch (error) { status.classList.add('project-error'); setMessage(status, errorMessage(error)); }
    finally { busy = false; exportButton.disabled = importButton.disabled = false; }
  };
  exportButton.addEventListener('click', () => run(async () => {
    if (!await prepare('export')) throw new LocalizedError('project.pendingEdits');
    const text = serializeProject(read());
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'StuCanvasLite.stucanvas.json';
    document.body.append(link); link.click(); link.remove();
    // Keep the object URL alive until the browser has started the download.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setMessage(status, { key: 'project.exported' });
  }));
  importButton.addEventListener('click', () => { input.value = ''; input.click(); });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    void run(async () => {
      let text;
      try { text = await file.text(); } catch { throw new LocalizedError('project.readError'); }
      // Validate the whole file before touching the current document or drafts.
      const project = parseProject(text);
      if (!await prepare('import')) throw new LocalizedError('project.pendingEdits');
      await apply(project);
      setMessage(status, { key: 'project.imported', values: { name: file.name } });
    });
  });
}
