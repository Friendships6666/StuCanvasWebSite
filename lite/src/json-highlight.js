const clients = new Map();
let sharedWorker = null, sequence = 0;
function getWorker() {
  if (sharedWorker) return sharedWorker;
  sharedWorker = new Worker(new URL('./json-highlight-worker.js', import.meta.url), { type: 'module' });
  sharedWorker.onmessage = ({ data }) => clients.get(data.client)?.(data);
  sharedWorker.onerror = () => {
    for (const receive of clients.values()) receive({ failed: true });
    sharedWorker?.terminate(); sharedWorker = null;
  };
  return sharedWorker;
}

export function createCodeHighlight(editor, { language = 'json' } = {}) {
  const host = editor.parentElement;
  const layer = document.createElement('div');
  layer.className = 'json-highlight';
  layer.setAttribute('aria-hidden', 'true');
  const paint = document.createElement('div');
  paint.className = 'json-highlight-paint';
  layer.append(paint);
  host.prepend(layer);
  const client = ++sequence;
  let busy = false, frame = null, request = 0, revision = 0, sentRevision = -1, failed = false;
  let font = '', lineHeight = 21, padding = 12, drawn = null, wanted = false;
  const fallback = () => { host.classList.remove('json-highlight-ready'); };
  const position = () => {
    if (!drawn) return;
    paint.style.transform = `translate(${drawn.scrollLeft - editor.scrollLeft}px, ${drawn.scrollTop - editor.scrollTop}px)`;
    if (Math.abs(drawn.scrollTop - editor.scrollTop) > lineHeight * 4 || Math.abs(drawn.scrollLeft - editor.scrollLeft) > 64) fallback();
  };
  const render = data => {
    const viewport = data.viewport;
    const fragment = document.createDocumentFragment();
    for (const row of data.rows) {
      const line = document.createElement('div');
      line.className = 'json-highlight-line';
      line.dataset.line = row.number;
      line.style.top = `${padding + row.number * lineHeight - viewport.scrollTop}px`;
      line.style.left = `${viewport.horizontalPadding + row.x - viewport.scrollLeft}px`;
      for (const token of row.tokens) {
        const span = document.createElement('span');
        if (token.kind) span.className = `json-token-${token.kind}`;
        if (token.width !== undefined) {
          span.classList.add('json-tab');
          span.style.width = `${token.width}px`;
        }
        span.textContent = token.text;
        line.append(span);
      }
      fragment.append(line);
    }
    paint.replaceChildren(fragment);
    drawn = viewport;
    layer.style.width = `${editor.clientWidth}px`;
    layer.style.height = `${editor.clientHeight}px`;
    layer.dataset.lineCount = data.lineCount;
    position();
    // Late scroll responses may fill an old viewport. Keep native text visible
    // until the next response, instead of hiding text while scrolling quickly.
    if (Math.abs(drawn.scrollTop - editor.scrollTop) <= lineHeight * 4 && Math.abs(drawn.scrollLeft - editor.scrollLeft) <= 64) host.classList.add('json-highlight-ready');
  };
  clients.set(client, data => {
    busy = false;
    if (data.failed) { failed = true; fallback(); return; }
    if (data.revision === revision) render(data);
    if (wanted || data.revision !== revision) schedule();
  });
  const send = () => {
    frame = null;
    if (failed || !editor.clientHeight || !editor.clientWidth || !visible) return;
    if (busy) { wanted = true; return; }
    wanted = false;
    const style = getComputedStyle(editor);
    // Computed `font` may be empty when ligatures/kerning are overridden.
    const nextFont = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if (font !== nextFont) { font = nextFont; sentRevision = -1; }
    lineHeight = parseFloat(style.lineHeight);
    layer.style.font = nextFont;
    layer.style.lineHeight = style.lineHeight;
    padding = parseFloat(style.paddingTop) + editor.clientTop;
    const horizontalPadding = parseFloat(style.paddingLeft) + editor.clientLeft;
    const bounds = editor.getBoundingClientRect();
    const panel = editor.closest('.algebra-content')?.getBoundingClientRect();
    const clippedTop = Math.max(0, (panel?.top ?? 0) - bounds.top);
    const clippedBottom = Math.min(editor.clientHeight, (panel?.bottom ?? innerHeight) - bounds.top);
    const viewport = {
      firstLine: Math.max(0, Math.floor((editor.scrollTop + clippedTop - padding) / lineHeight) - 4),
      lastLine: Math.ceil((editor.scrollTop + clippedBottom - padding) / lineHeight) + 4,
      left: Math.max(0, editor.scrollLeft - horizontalPadding - 64), width: editor.clientWidth + 128,
      scrollTop: editor.scrollTop, scrollLeft: editor.scrollLeft,
      horizontalPadding,
    };
    const message = { client, language, id: ++request, revision, font, viewport };
    if (sentRevision !== revision) { message.text = editor.value; sentRevision = revision; }
    busy = true;
    try { getWorker().postMessage(message); }
    catch { busy = false; failed = true; fallback(); }
  };
  function schedule() { if (frame === null) frame = requestAnimationFrame(send); }
  const update = () => { revision++; fallback(); schedule(); };
  const scroll = () => { position(); schedule(); };
  editor.addEventListener('input', update);
  editor.addEventListener('scroll', scroll, { passive: true });
  const outerScroll = event => {
    if (visible && event.target !== editor && event.target.contains?.(editor)) { fallback(); schedule(); }
  };
  window.addEventListener('scroll', outerScroll, { capture: true, passive: true });
  const resize = new ResizeObserver(() => { position(); schedule(); }); resize.observe(editor);
  let visible = false;
  const visibility = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) schedule();
  }); visibility.observe(editor);
  return { update, show: schedule, destroy() {
    if (frame !== null) cancelAnimationFrame(frame);
    clients.delete(client); sharedWorker?.postMessage({ client, release: true });
    resize.disconnect(); visibility.disconnect();
    editor.removeEventListener('input', update); editor.removeEventListener('scroll', scroll);
    window.removeEventListener('scroll', outerScroll, true);
    layer.remove(); fallback();
  } };
}

export const createJsonHighlight = editor => createCodeHighlight(editor);
