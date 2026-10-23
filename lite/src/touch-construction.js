import { arcTypes, bisectorTypes, derivedLineTypes, isCommonTangentCurve, isLinear, isPoint, isTangentCurve } from './geometry.js';
import { conicTypes, isConic, isPolarCurve } from './conics.js';
import { isPlot } from './plot/types.js';
import { isArcSource } from './arc-connection.js';
import { canTransform, transformTypes } from './transforms.js';

const circles = new Set(['circle', 'circleRadius', 'circle3', 'semicircle', 'arc', 'circumArc', 'sector', 'circumSector']);
const measurements = new Set(['measureLength', 'measureAngleInner', 'measureAngleReflex', 'measureAngleSupplementary', 'measureArea']);
const boundary = object => isLinear(object) || object?.type === 'circle' || arcTypes.has(object?.type) || isConic(object) || isPlot(object);
const pointTarget = object => isPoint(object) || boundary(object);
const physics = object => ['physicsBody', 'softBody', 'liquid', 'rope', 'spring'].includes(object?.type);

// Candidate selection, snapping and chooser actions share the construction's
// current role. A point cannot intercept a step that now requires a curve.
export function touchConstructionPolicy(tool, pending = null) {
  let accepts = () => false, coordinates = false, automatic = false, attaches = false;
  let excluded = new Set(pending?.ids || []);
  const points = (attach = true, smart = true) => {
    accepts = attach ? pointTarget : isPoint;
    coordinates = true; attaches = attach; automatic = smart;
  };
  if (tool === 'select' || tool === 'pan' || ['frictionBrush', 'restitutionBrush'].includes(tool)) accepts = () => true;
  else if (tool === 'physicsDrag') accepts = physics;
  else if (tool === 'point') points(false, false);
  else if (tool === 'snapPoint') { accepts = object => object.type === 'snapPoint' || boundary(object); attaches = true; }
  else if (tool === 'smartPoint' || ['line', 'segment', 'ray'].includes(tool)) points();
  else if (tool === 'commonTangent') { accepts = isCommonTangentCurve; excluded.add(pending?.sourceId); }
  else if (transformTypes.has(tool)) {
    if (!pending?.transform) accepts = canTransform;
    else if (tool === 'axialSymmetry') accepts = isLinear;
    else points(false, false);
  } else if (derivedLineTypes.has(tool)) {
    const reference = tool === 'tangent' ? isTangentCurve : isLinear;
    if (pending?.pointId) { accepts = reference; excluded.add(pending.pointId); }
    else if (pending?.referenceId) points();
    else { points(); accepts = object => isPoint(object) || reference(object); }
  } else if (circles.has(tool)) points(!!pending, false);
  else if (tool === 'intersection') { accepts = boundary; excluded.add(pending?.id); }
  else if (tool === 'arcConnection') accepts = isArcSource;
  else if (tool === 'fillet' || tool === 'chamfer') accepts = object => isLinear(object) || object.type === 'intersection';
  else if (tool === 'midpoint') { accepts = object => isPoint(object) || !pending && object.type === 'segment'; excluded.add(pending?.id); }
  else if (tool === 'ratioPoint' || tool === 'perpendicularBisector') points();
  else if (bisectorTypes.has(tool)) {
    if (pending?.mode === 'lines') accepts = isLinear;
    else points();
  } else if (measurements.has(tool)) {
    accepts = tool === 'measureArea' ? object => object.type === 'region'
      : tool === 'measureLength' ? object => isPoint(object) || !pending && object.type === 'segment'
      : pending?.mode === 'lines' ? isLinear : pending?.mode === 'points' ? isPoint : object => isPoint(object) || isLinear(object);
  } else if (['parabola', 'polar', 'pole'].includes(tool)) {
    const subject = tool === 'pole' ? isLinear : isPoint;
    const reference = tool === 'parabola' ? isLinear : isPolarCurve;
    if (pending?.subjectId) { accepts = reference; excluded.add(pending.subjectId); }
    else if (pending?.referenceId) {
      if (tool === 'pole') accepts = subject;
      else points();
    } else {
      if (tool !== 'pole') points();
      accepts = object => subject(object) || reference(object);
    }
  } else if (conicTypes.has(tool)) points();
  else if (tool === 'rope' || tool === 'spring') accepts = object => isPoint(object) || ['physicsBody', 'softBody'].includes(object.type);
  return { accepts: object => !!object && !object.invalid && !excluded.has(object.id) && accepts(object), coordinates, automatic, attaches };
}
