import { contactSurfaceFrame, paintSurface, surfaceColor, surfaceFrame, surfaceLocal, surfaceValueAtLocal } from './surface-friction.js';

// Keep the object's existing elasticity as the fallback for unpainted/erased
// surfaces. Fixed geometry has no bulk elasticity and defaults to zero.
export function restitutionAt(object, point, normal, frame = surfaceFrame(object)) {
  frame=contactSurfaceFrame(object,point,frame);
  return surfaceValueAtLocal(object, surfaceLocal(frame, point), surfaceLocal(frame, normal, true), 'surfaceRestitution')
    ?? (object.type === 'softBody' ? object.restitution ?? .2 : object.type === 'physicsBody' ? object.restitution ?? 0 : 0);
}

export function paintRestitution(object, point, normal, radius, coefficient, frame = surfaceFrame(object)) {
  paintSurface(object, point, normal, radius, coefficient, frame, 'surfaceRestitution');
}

export const restitutionColor = value => surfaceColor(value, 'restitution');
