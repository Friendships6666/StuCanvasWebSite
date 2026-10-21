// Only lexical checkpoints are indexed. Colored tokens are created on demand
// for a bounded viewport, including horizontal slices of very long strings.
const blank = () => ({ depth: 0, string: false, escaped: false, key: false, stringStart: 0, atom: '' });
const delimiter = character => character === undefined || /[\s{}\[\],:]/.test(character);
const spacing = character => character === ' ' || character === '\t' || character === '\r' || character === '\n';
function stringKey(text, start) {
  let end = start;
  while ((end = text.indexOf('"', end + 1)) !== -1) {
    let slashes = 0;
    for (let index = end - 1; text[index] === '\\'; index--) slashes++;
    if (slashes % 2) continue;
    do { end++; } while (spacing(text[end]));
    return text[end] === ':';
  }
  return false;
}

function step(text, offset, state) {
  const character = text[offset];
  if (state.string) {
    const kind = state.key ? 'key' : 'string';
    if (state.escaped) state.escaped = false;
    else if (character === '\\') state.escaped = true;
    else if (character === '"') state.string = false;
    return kind;
  }
  if (spacing(character)) { state.atom = ''; return ''; }
  if (character === '"') {
    state.atom = ''; state.string = true; state.stringStart = offset; state.key = stringKey(text, offset); state.escaped = false;
    return state.key ? 'key' : 'string';
  }
  if (character === '{' || character === '[') {
    state.atom = '';
    return `bracket-${state.depth++ % 6}`;
  }
  if (character === '}' || character === ']') {
    state.atom = ''; state.depth = Math.max(0, state.depth - 1);
    return `bracket-${state.depth % 6}`;
  }
  if (character === ':' || character === ',') { state.atom = ''; return 'punctuation'; }
  if (!state.atom) {
    state.atom = /[-0-9]/.test(character) ? 'number'
      : text.startsWith('true', offset) && delimiter(text[offset + 4]) || text.startsWith('false', offset) && delimiter(text[offset + 5]) ? 'boolean'
      : text.startsWith('null', offset) && delimiter(text[offset + 4]) ? 'null' : 'invalid';
  }
  return state.atom;
}

export class JsonSyntaxIndex {
  constructor(width = () => 1, tabWidth = 2) {
    this.width = width;
    this.tabWidth = tabWidth;
    this.text = '';
    this.lines = [];
    this.scanned = 0;
    this.step = step;
  }
  advance(character, x) {
    return character === '\t' ? this.tabWidth - x % this.tabWidth : character === '\r' ? 0 : this.width(character);
  }
  update(text) {
    if (this.lines.length && text === this.text) { this.scanned = 0; return; }
    // Keep earlier line checkpoints when edits happen near the document end.
    let prefix = 0;
    while (prefix < Math.min(text.length, this.text.length) && text.charCodeAt(prefix) === this.text.charCodeAt(prefix)) prefix++;
    let low = 0, high = this.lines.length;
    while (low < high) { const middle = (low + high) >>> 1; if (this.lines[middle].start <= prefix) low = middle + 1; else high = middle; }
    // Restart one line earlier: changing a colon can change the previous
    // line's property-string classification during incomplete JSON edits.
    const restart = Math.max(0, low - 2);
    const start = this.lines[restart]?.start || 0;
    const state = { ...(this.lines[restart]?.checkpoints[0].state || blank()) };
    this.lines.length = restart;
    let line = { start, end: text.length, checkpoints: [{ offset: start, x: 0, state: { ...state } }] };
    this.lines.push(line);
    let x = 0, checkpoint = start;
    this.scanned = text.length - start;
    for (let offset = start; offset < text.length;) {
      if (text[offset] === '\n') {
        this.step(text, offset, state);
        line.end = offset;
        offset++;
        line = { start: offset, end: text.length, checkpoints: [{ offset, x: 0, state: { ...state } }] };
        this.lines.push(line);
        x = 0; checkpoint = offset;
        continue;
      }
      if (offset - checkpoint >= 512) {
        line.checkpoints.push({ offset, x, state: { ...state } });
        checkpoint = offset;
      }
      const character = String.fromCodePoint(text.codePointAt(offset));
      this.step(text, offset, state);
      x += this.advance(character, x);
      offset += character.length;
    }
    this.text = text;
  }
  viewport({ firstLine, lastLine, left, width }) {
    const rows = [];
    for (let number = Math.max(0, firstLine); number <= Math.min(lastLine, this.lines.length - 1); number++) {
      const line = this.lines[number], checkpoints = line.checkpoints;
      let low = 0, high = checkpoints.length;
      while (low < high) { const middle = (low + high) >>> 1; if (checkpoints[middle].x <= left) low = middle + 1; else high = middle; }
      const checkpoint = checkpoints[Math.max(0, low - 1)];
      const state = { ...checkpoint.state };
      if (state.string) state.key = stringKey(this.text, state.stringStart);
      let x = checkpoint.x, offset = checkpoint.offset, startX = x, from = offset;
      const tokens = [];
      while (offset < line.end && x < left + width) {
        const character = String.fromCodePoint(this.text.codePointAt(offset));
        const kind = this.step(this.text, offset, state), advance = this.advance(character, x);
        if (x + advance >= left) {
          if (!tokens.length) { startX = x; from = offset; }
          const value = character === '\r' ? '' : character;
          if (character === '\t') tokens.push({ kind, text: value, width: advance });
          else if (tokens.at(-1)?.kind === kind && tokens.at(-1).width === undefined) tokens.at(-1).text += value;
          else tokens.push({ kind, text: value });
        }
        x += advance; offset += character.length;
      }
      rows.push({ number, x: startX, from, to: offset, tokens });
    }
    return rows;
  }
}
