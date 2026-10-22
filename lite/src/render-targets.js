export const mainWindowId = 'main';
export const mainOnly = object => ['physicsBody', 'softBody', 'liquid', 'rope', 'spring'].includes(object?.type);
export const renderTargets = object => mainOnly(object) ? [mainWindowId] : Array.isArray(object?.renderTargets) ? object.renderTargets : [mainWindowId];
export const rendersInWindow = (object, id = mainWindowId) => renderTargets(object).includes(id);
export const validWindowId = id => typeof id === 'string' && id.length > 0 && id.length < 128;
export function validRenderTargets(object, available) {
  const targets = object.renderTargets;
  if (targets === undefined) return true;
  return Array.isArray(targets) && new Set(targets).size === targets.length && targets.every(id => validWindowId(id) && (!available || available.has(id)))
    && (!mainOnly(object) || targets.length === 1 && targets[0] === mainWindowId);
}
