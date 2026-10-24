import { LocalizedError } from '../i18n.js';
import * as ranges from './interval.js';
import { transformEquation } from './transform.js';

const unaryNames = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sqrt', 'cbrt', 'abs', 'exp', 'expm1', 'log', 'log10', 'log2', 'floor', 'ceil', 'round', 'trunc', 'sign']);
const binaryNames = new Set(['min', 'max', 'pow', 'hypot', 'fmod']);
const aliases = { ln: 'log', arcsin: 'asin', arccos: 'acos', arctan: 'atan' };
const constants = { pi: Math.PI, e: Math.E };
const derivatives = {
  neg: () => -1, sin: argument => Math.cos(argument), cos: argument => -Math.sin(argument), tan: (argument, value) => 1 + value ** 2,
  asin: argument => 1 / Math.sqrt(1 - argument ** 2), acos: argument => -1 / Math.sqrt(1 - argument ** 2), atan: argument => 1 / (1 + argument ** 2),
  sinh: argument => Math.cosh(argument), cosh: argument => Math.sinh(argument), tanh: (argument, value) => 1 - value ** 2,
  sqrt: (argument, value) => 0.5 / value, cbrt: (argument, value) => 1 / (3 * value ** 2), abs: argument => Math.sign(argument),
  exp: (argument, value) => value, expm1: argument => Math.exp(argument), log: argument => 1 / argument,
  log10: argument => 1 / (argument * Math.LN10), log2: argument => 1 / (argument * Math.LN2),
};
const scalar = (name, first, second) => {
  if (name === '+') return first + second;
  if (name === '-') return first - second;
  if (name === '*') return first * second;
  if (name === '/') return first / second;
  if (name === '^') return first ** second;
  if (name === 'neg') return -first;
  if (name === 'fmod') return first % second;
  return Math[name](first, second);
};

function tokenize(source) {
  const tokens = [];
  let position = 0;
  while (position < source.length) {
    const rest = source.slice(position);
    const space = /^\s+/.exec(rest);
    if (space) { position += space[0].length; continue; }
    const numeric = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (numeric) {
      const value = Number(numeric[0]);
      if (!Number.isFinite(value)) throw new LocalizedError('error.numberRange');
      tokens.push({ kind: 'number', value });
      position += numeric[0].length;
      continue;
    }
    const word = /^[a-zA-Z][a-zA-Z0-9]*(?:(?:\.[a-zA-Z][a-zA-Z0-9]*)|(?:\[\d+\]))*/.exec(rest);
    if (word) {
      const value = word[0].toLowerCase();
      if (/^[xy]+$/.test(value)) for (const variable of value) tokens.push({ kind: 'name', value: variable });
      else tokens.push({ kind: 'name', value: aliases[value] || value });
      position += word[0].length;
      continue;
    }
    const operator = source[position];
    if ('+-*/^()=,'.includes(operator)) {
      if (source.slice(position, position + 2) === '**') { tokens.push({ kind: '^' }); position += 2; }
      else { tokens.push({ kind: operator }); position++; }
      continue;
    }
    throw new LocalizedError('error.character', { character: operator });
  }
  if (tokens.length > 512) throw new LocalizedError('error.tooLong');
  tokens.push({ kind: 'end' });
  return tokens;
}

function makeFactory() {
  const nodes = new Map();
  return (operation, first, second) => {
    if (operation !== 'number' && operation !== 'x' && operation !== 'y' && first?.op === 'number' && (!second || second.op === 'number')) {
      const value = scalar(operation, first.value, second?.value);
      if (Number.isFinite(value)) { operation = 'number'; first = value; second = undefined; }
    }
    const key = operation === 'number' ? `#${Object.is(first, -0) ? '-0' : first}` : `${operation}(${first?.key || ''},${second?.key || ''})`;
    if (nodes.has(key)) return nodes.get(key);
    if (nodes.size >= 256) throw new LocalizedError('error.nodeCount');
    const leaf = ['number', 'x', 'y'].includes(operation);
    const total = leaf || (first.total && (!second || second.total) && !['/', '^', 'sqrt', 'log', 'log10', 'log2', 'asin', 'acos', 'tan'].includes(operation));
    const node = { op: operation, key, value: operation === 'number' ? first : undefined, left: leaf ? undefined : first, right: second, vars: operation === 'x' ? 1 : operation === 'y' ? 2 : leaf ? 0 : first.vars | (second?.vars || 0), total };
    nodes.set(key, node);
    return node;
  };
}

function parse(source, symbolic = false) {
  const tokens = tokenize(source);
  const make = makeFactory();
  let cursor = 0;
  let depth = 0;
  const current = () => tokens[cursor];
  const expect = kind => { if (current().kind !== kind) throw new LocalizedError('error.expected', { token: kind }); cursor++; };
  function expression(minimum = 0) {
    if (++depth > 64) throw new LocalizedError('error.nesting');
    const token = tokens[cursor++];
    let left;
    if (token.kind === 'number') left = make('number', token.value);
    else if (token.kind === '+' || token.kind === '-') {
      const argument = expression(25);
      left = token.kind === '-' ? make('neg', argument) : argument;
    } else if (token.kind === '(') { left = expression(); expect(')'); }
    else if (token.kind === 'name') {
      if (token.value === 'x' || token.value === 'y') left = make(token.value);
      else if (Object.hasOwn(constants, token.value)) left = make('number', constants[token.value]);
      else if (unaryNames.has(token.value) || binaryNames.has(token.value)) {
        expect('(');
        const first = expression();
        let second;
        if (binaryNames.has(token.value)) { expect(','); second = expression(); }
        expect(')');
        left = make(token.value, first, second);
      } else if (symbolic) left = { op: 'symbol', key: token.value, value: token.value, vars: 0, total: true };
      else throw new LocalizedError('error.unknownName', { name: token.value });
    } else throw new LocalizedError('error.expectedValue');
    while (true) {
      const token = current();
      const implicit = ['number', 'name', '('].includes(token.kind);
      const operation = implicit ? '*' : token.kind;
      const binding = { '+': 10, '-': 10, '*': 20, '/': 20, '^': 30 }[operation];
      if (binding === undefined || binding < minimum) break;
      if (!implicit) cursor++;
      const right = expression(operation === '^' ? binding : binding + 1);
      left = make(operation, left, right);
    }
    depth--;
    return left;
  }
  const left = expression();
  let right = make('number', 0);
  if (current().kind === '=') { cursor++; right = expression(); }
  if (current().kind !== 'end') throw new LocalizedError('error.singleEquation');
  return { left, right, root: make('-', left, right) };
}

function compileScalar(node) {
  if (node.op === 'number') return () => node.value;
  if (node.op === 'x') return x => x;
  if (node.op === 'y') return (x, y) => y;
  const left = compileScalar(node.left);
  const right = node.right && compileScalar(node.right);
  // Bind the operation once, rather than dispatching on its name at every
  // corner/edge evaluation (millions of times in dense implicit curves).
  if (node.op === '+') return (x, y) => left(x, y) + right(x, y);
  if (node.op === '-') return (x, y) => left(x, y) - right(x, y);
  if (node.op === '*') return (x, y) => left(x, y) * right(x, y);
  if (node.op === '/') return (x, y) => left(x, y) / right(x, y);
  if (node.op === '^') return (x, y) => left(x, y) ** right(x, y);
  if (node.op === 'neg') return (x, y) => -left(x, y);
  if (node.op === 'fmod') return (x, y) => left(x, y) % right(x, y);
  const operation = Math[node.op];
  return right ? (x, y) => operation(left(x, y), right(x, y)) : (x, y) => operation(left(x, y));
}

function compileInterval(node, arithmetic = ranges) {
  if (node.op === 'number') { const value = arithmetic.interval(node.value); return () => value; }
  if (node.op === 'x') return x => x;
  if (node.op === 'y') return (x, y) => y;
  const left = compileInterval(node.left, arithmetic);
  const right = node.right && compileInterval(node.right, arithmetic);
  const operations = { '+': arithmetic.add, '-': arithmetic.subtract, '*': arithmetic.multiply, '/': arithmetic.divide };
  if (operations[node.op]) return (x, y) => operations[node.op](left(x, y), right(x, y));
  if (node.op === 'neg') return (x, y) => arithmetic.negate(left(x, y));
  if (node.op === '^' && node.right.op === 'number') return (x, y) => arithmetic.power(left(x, y), node.right.value);
  if (node.op === '^') return (x, y) => arithmetic.binary('pow', left(x, y), right(x, y));
  if (right) return (x, y) => arithmetic.binary(node.op, left(x, y), right(x, y));
  return (x, y) => arithmetic.unary(node.op, left(x, y));
}

function compileGradient(node) {
  if (node.op === 'number') return () => [node.value, 0, 0];
  if (node.op === 'x') return x => [x, 1, 0];
  if (node.op === 'y') return (x, y) => [y, 0, 1];
  const left = compileGradient(node.left);
  const right = node.right && compileGradient(node.right);
  const operation = node.op;
  return (x, y) => {
    const first = left(x, y);
    const second = right?.(x, y);
    const value = scalar(operation, first[0], second?.[0]);
    let weightFirst;
    let weightSecond = 0;
    if (operation === '+') { weightFirst = 1; weightSecond = 1; }
    else if (operation === '-') { weightFirst = 1; weightSecond = -1; }
    else if (operation === '*') { weightFirst = second[0]; weightSecond = first[0]; }
    else if (operation === '/') { weightFirst = 1 / second[0]; weightSecond = -first[0] / second[0] ** 2; }
    else if (operation === '^' || operation === 'pow') {
      weightFirst = second[0] === 0 ? 0 : second[0] * first[0] ** (second[0] - 1);
      weightSecond = node.right.vars === 0 ? 0 : value * Math.log(first[0]);
    } else if (operation === 'fmod') { weightFirst = 1; weightSecond = -Math.trunc(first[0] / second[0]); }
    else if (operation === 'hypot') { weightFirst = first[0] / value; weightSecond = second[0] / value; }
    else if (operation === 'min' || operation === 'max') { weightFirst = value === first[0] ? 1 : 0; weightSecond = 1 - weightFirst; }
    else weightFirst = derivatives[operation]?.(first[0], value) ?? 0;
    const component = axis => (first[axis] === 0 ? 0 : weightFirst * first[axis]) + (!second || second[axis] === 0 ? 0 : weightSecond * second[axis]);
    return [value, component(1), component(2)];
  };
}

function normalizeSource(input) {
  if (typeof input !== 'string' || !input.trim()) throw new LocalizedError('error.enterEquation');
  if (input.length > 512) throw new LocalizedError('error.characterLimit');
  return input.trim().replaceAll('−', '-').replaceAll('×', '*').replaceAll('÷', '/').replaceAll('π', 'pi').replaceAll('²', '^2').replaceAll('³', '^3').replaceAll('＝', '=');
}

const parameterNames = new Set([...unaryNames, ...binaryNames, ...Object.keys(constants), 'x', 'y']);
function bindParameters(source, parameters, independentVariables = ['x', 'y']) {
  const used = new Set();
  if (!parameters || !Object.keys(parameters).length) return { source, used };
  const variables = [...Object.keys(parameters), ...independentVariables].filter(Boolean).sort((first, second) => second.length - first.length);
  const splitToken = token => {
    // Cache failed suffixes too: overlapping slider names such as a/aa/aaa
    // otherwise make an unknown suffix trigger exponential backtracking.
    const memo = new Map();
    const visit = position => {
      if (position === token.length) return [];
      if (memo.has(position)) return memo.get(position);
      for (const variable of variables) {
        if (!token.startsWith(variable, position)) continue;
        const rest = visit(position + variable.length);
        if (rest) { const result = [variable, ...rest]; memo.set(position, result); return result; }
      }
      memo.set(position, null);
      return null;
    };
    const parts = visit(0);
    if (!parts || parts.length < 2 || parts.every(part => !Object.hasOwn(parameters, part))) return token;
    for (const part of parts) if (Object.hasOwn(parameters, part)) used.add(part);
    return parts.map(part => Object.hasOwn(parameters, part) ? `(${Number(parameters[part])})` : part).join('*');
  };
  const bound = source.replace(/\b[a-zA-Z][a-zA-Z0-9]*(?:(?:\.[a-zA-Z][a-zA-Z0-9]*)|(?:\[\d+\]))*/g, name => {
    const key = name.toLowerCase();
    if (parameterNames.has(key)) return name;
    if (!Object.hasOwn(parameters, key)) return splitToken(key);
    const value = Number(parameters[key]);
    if (!Number.isFinite(value)) return splitToken(key);
    used.add(key);
    return `(${value})`;
  });
  return { source: bound, used };
}

export function equationToLatex(input) {
  const { left, right } = parse(normalizeSource(input), true);
  const format = (node, precedence = 0) => {
    if (node.op === 'number') {
      if (Object.is(node.value, -0)) return precedence > 25 ? '\\left(-0\\right)' : '-0';
      if (node.value === Math.PI) return '\\pi';
      if (node.value === Math.E) return 'e';
      const value = String(node.value).replace(/e([+-]?\d+)$/, '\\cdot 10^{$1}');
      return (node.value < 0 && precedence > 25) || (value.includes('\\cdot') && precedence > 20) ? `\\left(${value}\\right)` : value;
    }
    if (node.op === 'x' || node.op === 'y') return node.op;
    if (node.op === 'symbol') return node.value.length > 1 ? `\\operatorname{${node.value}}` : node.value;
    const first = () => format(node.left);
    const second = () => format(node.right);
    const parenthesize = value => `\\left(${value}\\right)`;
    if (node.op === '/') return `\\frac{${first()}}{${second()}}`;
    if (node.op === '^' || node.op === 'pow') {
      const value = `${format(node.left, 31)}^{${second()}}`;
      return precedence > 30 ? parenthesize(value) : value;
    }
    if (node.op === 'neg') {
      const value = `-${format(node.left, 25)}`;
      return precedence > 25 ? parenthesize(value) : value;
    }
    const binding = { '+': 10, '-': 10, '*': 20 }[node.op];
    if (binding) {
      const value = `${format(node.left, binding)}${node.op === '*' ? '\\cdot ' : node.op}${format(node.right, node.op === '-' ? binding + 1 : binding)}`;
      return binding < precedence ? parenthesize(value) : value;
    }
    if (node.op === 'sqrt') return `\\sqrt{${first()}}`;
    if (node.op === 'cbrt') return `\\sqrt[3]{${first()}}`;
    if (node.op === 'abs') return `\\left|${first()}\\right|`;
    if (node.op === 'floor') return `\\left\\lfloor ${first()}\\right\\rfloor`;
    if (node.op === 'ceil') return `\\left\\lceil ${first()}\\right\\rceil`;
    if (node.op === 'log10' || node.op === 'log2') return `\\log_{${node.op.slice(3)}}${parenthesize(first())}`;
    const name = { asin: 'arcsin', acos: 'arccos', atan: 'arctan', log: 'ln' }[node.op] || node.op;
    return `\\operatorname{${name}}${parenthesize(first() + (node.right ? `,${second()}` : ''))}`;
  };
  return `${format(left)}=${format(right)}`;
}

export const expressionToLatex = input => equationToLatex(input).split('=')[0];

export function compileExpression(input, parameters = {}, variable = 'x') {
  const bound = bindParameters(normalizeSource(input), parameters, [variable]);
  const source = variable === 't' ? bound.source.replace(/\b[t]+\b/gi, name => name.replace(/t/gi, 'x')) : bound.source;
  const { root } = parse(source);
  const evaluate = compileScalar(root);
  const gradient = compileGradient(root);
  const evaluateRange = compileInterval(root);
  return {
    parameterNames: [...bound.used],
    evaluate: parameter => evaluate(parameter, 0),
    derivative: parameter => gradient(parameter, 0)[1],
    interval: (lower, upper) => evaluateRange(ranges.interval(lower, upper), ranges.interval(0)),
    compileInterval: arithmetic => {
      const evaluate = compileInterval(root, arithmetic);
      return (lower, upper) => evaluate(arithmetic.interval(lower, upper), arithmetic.interval(0));
    },
  };
}

export function compileEquation(input, parameters = {}) {
  const source = normalizeSource(typeof input === 'object' ? input.source : input);
  const bound = bindParameters(source, parameters);
  const { root } = parse(bound.source);
  const evaluate = compileScalar(root);
  const evaluateRange = compileInterval(root);
  return transformEquation({
    source: source.includes('=') ? source : `${source} = 0`,
    parameterNames: [...bound.used],
    evaluate,
    gradient: compileGradient(root),
    interval: (x0, x1, y0, y1) => evaluateRange(ranges.interval(x0, x1), ranges.interval(y0, y1)),
  }, typeof input === 'object' ? input.plotTransform : null);
}
