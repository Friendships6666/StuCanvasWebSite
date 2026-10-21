import { t, getLocale } from './i18n.js';
const tasks = new WeakMap();

export function createObjectStatus() {
  const status = document.createElement('div');
  status.className = 'object-status';
  status.dataset.state = 'idle';
  status.setAttribute('aria-hidden', 'true');
  status.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="status-track" cx="12" cy="12" r="8"/><circle class="status-progress" cx="12" cy="12" r="8" pathLength="100" transform="rotate(-90 12 12)"/><g class="status-question"><path d="M9.2 8.5C9.2 5 15.1 4.9 15.1 8.5c0 2.5-3.1 2.5-3.1 5"/><circle cx="12" cy="17.1" r="1"/></g><path class="status-check" d="m6.8 12.1 3.5 3.5 7-7.2"/></svg>';
  return status;
}

export function updateObjectStatus(element, status) {
  const state = !status ? 'idle' : status.done ? ['adaptive', 'interval'].includes(status.algorithm) ? 'marching' : status.algorithm : 'running';
  const changed = element.dataset.state !== state;
  const languageChanged = element.dataset.locale !== getLocale();
  element.dataset.locale = getLocale();
  if (changed) element.dataset.state = state;
  if (state === 'idle') {
    tasks.delete(element);
    if (changed) {
      element.setAttribute('aria-hidden', 'true');
      element.removeAttribute('role');
      element.removeAttribute('aria-label');
      element.removeAttribute('aria-valuemin');
      element.removeAttribute('aria-valuemax');
      element.removeAttribute('aria-valuenow');
      element.title = '';
    }
    return;
  }
  if (tasks.get(element) !== status.task) {
    tasks.set(element, status.task);
    const ring = element.querySelector('.status-progress');
    const replacement = ring.cloneNode();
    replacement.style.strokeDashoffset = '100';
    ring.replaceWith(replacement);
  }
  element.removeAttribute('aria-hidden');
  const progress = status.done ? 1 : Math.max(0, Math.min(0.999, status.progress));
  const ring = element.querySelector('.status-progress');
  const offset = String(100 * (1 - progress));
  if (ring.style.strokeDashoffset !== offset) ring.style.strokeDashoffset = offset;
  if (state === 'running') {
    const percent = Math.floor(progress * 100);
    element.setAttribute('role', 'progressbar');
    element.setAttribute('aria-label', status.algorithm === 'interval' ? t('status.interval') : status.algorithm === 'adaptive' ? t('status.adaptive') : t('status.region'));
    element.setAttribute('aria-valuemin', '0');
    element.setAttribute('aria-valuemax', '100');
    element.setAttribute('aria-valuenow', String(percent));
    element.title = t('status.running', { percent });
  } else if (changed || languageChanged) {
    element.setAttribute('role', 'img');
    element.removeAttribute('aria-valuemin');
    element.removeAttribute('aria-valuemax');
    element.removeAttribute('aria-valuenow');
    const name = { lshade: t('algorithm.lshade'), marching: t('algorithm.marching'), adaptive: t('algorithm.adaptive'), interval: t('algorithm.interval') }[status.algorithm];
    element.title = t('status.done', { algorithm: name });
    element.setAttribute('aria-label', element.title);
  }
}
