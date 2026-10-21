import { parser } from '@lezer/javascript';
import { TreeFragment } from '@lezer/common';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';
import { JsonSyntaxIndex } from './json-syntax.js';

const highlighter = tagHighlighter([
  { tag: tags.keyword, class: 'keyword' },
  { tag: tags.comment, class: 'comment' },
  { tag: tags.string, class: 'string' },
  { tag: tags.regexp, class: 'regex' },
  { tag: tags.number, class: 'number' },
  { tag: tags.bool, class: 'boolean' },
  { tag: tags.null, class: 'null' },
  { tag: tags.function(tags.variableName), class: 'function' },
  { tag: tags.function(tags.propertyName), class: 'function' },
  { tag: tags.propertyName, class: 'key' },
  { tag: tags.variableName, class: 'variable' },
  { tag: tags.operator, class: 'operator' },
  { tag: tags.punctuation, class: 'punctuation' },
]);
const structural = new Set(['(', ')', '[', ']', '{', '}', 'InterpolationStart', 'InterpolationEnd']);

export class JavaScriptSyntaxIndex extends JsonSyntaxIndex {
  constructor(...args) {
    super(...args);
    this.tree = null;
    this.brackets = new Set();
    this.step = (text, offset, state) => {
      if (!this.brackets.has(offset)) return '';
      if ('([{'.includes(text[offset])) return `bracket-${state.depth++ % 6}`;
      state.depth = Math.max(0, state.depth - 1);
      return `bracket-${state.depth % 6}`;
    };
  }
  update(text) {
    if (this.tree && text === this.text) return;
    let from = 0, suffix = 0;
    const before = this.text;
    while (from < Math.min(before.length, text.length) && before[from] === text[from]) from++;
    while (suffix < Math.min(before.length, text.length) - from && before[before.length - suffix - 1] === text[text.length - suffix - 1]) suffix++;
    const fragments = this.tree ? TreeFragment.applyChanges(TreeFragment.addTree(this.tree), [{ fromA: from, toA: before.length - suffix, fromB: from, toB: text.length - suffix }]) : [];
    this.tree = parser.parse(text, fragments);
    this.brackets.clear();
    this.tree.iterate({ enter: node => {
      if (structural.has(node.name)) this.brackets.add(node.from + (node.name === 'InterpolationStart' ? 1 : 0));
    } });
    // Error recovery may reinterpret earlier tokens. The compact line/width
    // index is rebuilt in the Worker; the parser reuses unchanged tree fragments.
    this.lines = []; this.text = '';
    super.update(text);
  }
  viewport(viewport) {
    const rows = super.viewport(viewport);
    for (const row of rows) {
      const styles = [];
      highlightTree(this.tree, highlighter, (from, to, kind) => styles.push({ from, to, kind }), row.from, row.to);
      let offset = row.from, at = 0;
      const tokens = [];
      for (const token of row.tokens) {
        const end = offset + token.text.length;
        if (token.kind.startsWith('bracket-') || token.width !== undefined) {
          tokens.push(token); offset = end; continue;
        }
        while (offset < end) {
          while (at < styles.length && styles[at].to <= offset) at++;
          const style = styles[at];
          const next = Math.min(end, style && style.from <= offset ? style.to : style?.from ?? end);
          const kind = style && style.from <= offset ? style.kind : '';
          const text = this.text.slice(offset, next);
          if (tokens.at(-1)?.kind === kind && tokens.at(-1).width === undefined) tokens.at(-1).text += text;
          else tokens.push({ kind, text });
          offset = next;
        }
      }
      row.tokens = tokens;
    }
    return rows;
  }
}
