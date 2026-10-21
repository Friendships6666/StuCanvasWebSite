import en from './locales/en.js';
import simplified from './locales/zh-CN.js';
import traditional from './locales/zh-TW.js';

export const languages = [
  { id: 'en', language: 'en', messages: en },
  { id: 'zh-CN', language: 'zh', script: 'Hans', regions: ['CN', 'SG'], messages: simplified },
  { id: 'zh-TW', language: 'zh', script: 'Hant', regions: ['TW', 'HK', 'MO'], messages: traditional },
];
const storageKey = 'stucanvas.locale';
const listeners = new Set();
const messageValues = new WeakMap();

export function resolveLocale(tag) {
  try {
    const requested = new Intl.Locale(String(tag).replaceAll('_', '-'));
    const exact = languages.find(language => language.id.toLowerCase() === requested.baseName.toLowerCase());
    if (exact) return exact.id;
    const candidates = languages.filter(language => language.language === requested.language);
    return (candidates.find(language => requested.script && language.script === requested.script)
      || candidates.find(language => !requested.script && language.regions?.includes(requested.region))
      || candidates[0])?.id || 'en';
  } catch { return 'en'; }
}

export function detectLocale(preferences = globalThis.navigator?.languages?.length ? globalThis.navigator.languages : [globalThis.navigator?.language]) {
  return resolveLocale(preferences[0]);
}

function savedLocale() {
  if (!globalThis.document) return null;
  try {
    const saved = globalThis.localStorage?.getItem(storageKey);
    return languages.some(language => language.id === saved) ? saved : null;
  } catch { return null; }
}

let locale = savedLocale() || detectLocale();
export const getLocale = () => locale;

export function t(key, values = {}) {
  const messages = languages.find(language => language.id === locale).messages;
  return (messages[key] ?? en[key] ?? String(key)).replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
}

export function messageText(message) {
  return message?.key ? t(message.key, message.values) : String(message ?? '');
}

export class LocalizedError extends Error {
  constructor(key, values = {}) {
    super();
    this.key = key;
    this.values = values;
  }
  get message() { return t(this.key, this.values); }
}

export const errorMessage = error => error instanceof LocalizedError ? { key: error.key, values: error.values } : error.message;

export function setMessage(element, message) {
  if (message?.key) {
    element.dataset.i18n = message.key;
    messageValues.set(element, message.values || {});
  } else {
    delete element.dataset.i18n;
    messageValues.delete(element);
  }
  element.textContent = messageText(message);
}

export function localizeDOM(root = globalThis.document) {
  if (!root) return;
  const nodes = [...root.querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-aria-label], [data-i18n-placeholder]')];
  if (root.matches?.('[data-i18n], [data-i18n-title], [data-i18n-aria-label], [data-i18n-placeholder]')) nodes.unshift(root);
  for (const node of nodes) {
    if (node.dataset.i18n) node.textContent = t(node.dataset.i18n, messageValues.get(node));
    for (const attribute of ['title', 'aria-label', 'placeholder']) {
      const key = node.getAttribute(`data-i18n-${attribute}`);
      if (key) node.setAttribute(attribute, t(key));
    }
  }
}

export function onLocaleChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function setLocale(requested, { persist = true } = {}) {
  const next = resolveLocale(requested);
  if (persist && globalThis.document) {
    try { globalThis.localStorage?.setItem(storageKey, next); } catch {}
  }
  if (next === locale) return;
  locale = next;
  if (globalThis.document) document.documentElement.lang = locale;
  localizeDOM();
  for (const callback of listeners) callback(locale);
}

if (globalThis.document) document.documentElement.lang = locale;
globalThis.addEventListener?.('languagechange', () => { if (!savedLocale()) setLocale(detectLocale(), { persist: false }); });
