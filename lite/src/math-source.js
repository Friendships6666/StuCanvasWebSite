import { LocalizedError } from './i18n.js';

const functions = new Set(['sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'ln', 'log', 'log10', 'log2', 'sqrt', 'cbrt', 'abs', 'exp', 'expm1', 'floor', 'ceil', 'round', 'trunc', 'sign', 'min', 'max', 'pow', 'hypot', 'fmod']);
const inverseNames = { sin: 'asin', cos: 'acos', tan: 'atan' };
const nameCommands = new Set(['operatorname', 'mathrm', 'mathit']);

export function latexToSource(input) {
  if (!input.trim()) throw new LocalizedError('error.enterEquation');
  if (input.length > 8192) throw new LocalizedError('error.tooLong');
  const source = input.replace(/\\(?:left|right|mleft|mright|displaystyle|textstyle)\b/g, '').replace(/\\(?:,|;|!| |quad\b|qquad\b)/g, ' ').replaceAll('−', '-');
  let cursor = 0;
  let depth = 0;
  const skip = () => { while (/\s/.test(source[cursor] || '') && cursor < source.length) cursor++; };
  const group = (opening, closing) => {
    skip();
    if (source[cursor] !== opening) throw new LocalizedError('error.expected', { token: opening });
    cursor++;
    const value = sequence(closing);
    if (source[cursor] !== closing) throw new LocalizedError('error.unclosed');
    cursor++;
    if (!value.trim()) throw new LocalizedError('error.completeBlanks');
    return value;
  };
  const nameGroup = () => {
    skip();
    if (source[cursor] !== '{') throw new LocalizedError('error.functionName');
    if (++depth > 64) throw new LocalizedError('error.nesting');
    cursor++;
    let name = '';
    while (cursor < source.length) {
      skip();
      if (source[cursor] === '}') {
        cursor++;
        depth--;
        if (!name) throw new LocalizedError('error.functionName');
        return name;
      }
      if (source[cursor] === '{') {
        name += nameGroup();
      } else if (source[cursor] === '\\') {
        cursor++;
        const command = /^[a-zA-Z]+/.exec(source.slice(cursor))?.[0];
        if (!nameCommands.has(command)) throw new LocalizedError('error.functionName');
        cursor += command.length;
        name += nameGroup();
      } else {
        const part = /^[a-zA-Z0-9.\[\]]+/.exec(source.slice(cursor))?.[0];
        if (!part) throw new LocalizedError('error.functionName');
        cursor += part.length;
        name += part;
      }
    }
    throw new LocalizedError('error.unclosed');
  };
  const argument = () => {
    skip();
    if (source[cursor] === '{') return group('{', '}');
    if (source[cursor] === '(') return group('(', ')');
    return atom();
  };
  const functionCall = name => {
    skip();
    let base;
    if (source[cursor] === '_') {
      cursor++;
      base = argument();
      if (name !== 'log') throw new LocalizedError('error.logSubscript');
    }
    skip();
    let exponent;
    if (source[cursor] === '^') { cursor++; exponent = argument(); }
    skip();
    const groupedArgument = source[cursor] === '(' || source[cursor] === '{';
    let value = argument();
    if (!groupedArgument && source[cursor] === '^') { cursor++; value = `(${value})^(${argument()})`; }
    if (exponent?.replaceAll(' ', '') === '-1' && inverseNames[name]) return `${inverseNames[name]}(${value})`;
    const call = base ? `(log(${value})/log(${base}))` : `${name}(${value})`;
    return exponent ? `(${call})^(${exponent})` : call;
  };
  const atom = () => {
    skip();
    const character = source[cursor];
    if (!character) throw new LocalizedError('error.completeEquation');
    if (character === '{') return `(${group('{', '}')})`;
    if (character === '(') return `(${group('(', ')')})`;
    if (character === '|') return `abs(${group('|', '|')})`;
    if (character === '\\') {
      cursor++;
      const command = /^[a-zA-Z]+/.exec(source.slice(cursor))?.[0];
      if (!command) throw new LocalizedError('error.mathSymbol');
      cursor += command.length;
      if (command === 'lfloor' || command === 'lceil') {
        const ending = command === 'lfloor' ? '\\rfloor' : '\\rceil';
        const value = sequence(ending);
        if (!source.startsWith(ending, cursor)) throw new LocalizedError('error.roundingBracket');
        cursor += ending.length;
        if (!value.trim()) throw new LocalizedError('error.completeBlanks');
        return `${command === 'lfloor' ? 'floor' : 'ceil'}(${value})`;
      }
      if (command === 'frac' || command === 'dfrac' || command === 'tfrac') {
        const numerator = argument();
        return `((${numerator})/(${argument()}))`;
      }
      if (command === 'sqrt') {
        skip();
        const root = source[cursor] === '[' ? group('[', ']') : '2';
        const value = argument();
        return root === '2' ? `sqrt(${value})` : root === '3' ? `cbrt(${value})` : `((${value})^(1/(${root})))`;
      }
      if (nameCommands.has(command)) {
        const name = nameGroup();
        if (functions.has(name)) return functionCall(name);
        if (['x', 'y', 'e', 'pi'].includes(name)) return name;
        if (/^[a-zA-Z][a-zA-Z0-9]*(?:(?:\.[a-zA-Z][a-zA-Z0-9]*)|(?:\[\d+\]))*$/.test(name)) return name;
        throw new LocalizedError('error.unsupportedName', { name });
      }
      if (command === 'pi') return 'pi';
      if (command === 'cdot' || command === 'times') return '*';
      if (command === 'div') return '/';
      if (functions.has(command)) return functionCall(command);
      throw new LocalizedError('error.command', { command });
    }
    const numeric = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(cursor));
    if (numeric) { cursor += numeric[0].length; return numeric[0]; }
    const word = /^[a-zA-Z][a-zA-Z0-9]*(?:(?:\.[a-zA-Z][a-zA-Z0-9]*)|(?:\[\d+\]))*/.exec(source.slice(cursor));
    if (word) {
      cursor += word[0].length;
      return functions.has(word[0]) ? functionCall(word[0]) : word[0];
    }
    if ('+-*/=,^'.includes(character)) {
      cursor++;
      return character === '^' ? `^(${argument()})` : character;
    }
    throw new LocalizedError('error.symbol', { symbol: character });
  };
  function sequence(ending) {
    if (++depth > 64) throw new LocalizedError('error.nesting');
    const values = [];
    while (cursor < source.length) {
      skip();
      if (cursor >= source.length || (ending && source.startsWith(ending, cursor))) break;
      values.push(atom());
    }
    depth--;
    return values.join(' ');
  }
  return sequence();
}

