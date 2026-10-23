import { isFlexible, ropeParents } from './rope.js';
import { isSoftBody, DEFAULT_SOFT_SUBDIVISIONS, MAX_SOFT_NODES, validSoftSubdivisions } from './soft-body.js';
import { isLiquid, DEFAULT_LIQUID_DROPS, validLiquidDrops } from './liquid.js';
import { defaultTimeline, MAX_TIMELINE_TIME } from './timeline-state.js';
import { supportsSurfaceFriction } from './surface-friction.js';
import { DEFAULT_INSTANCE_SUBDIVISIONS, validInstanceSubdivisions } from './region-options.js';
import { LocalizedError, languages } from './i18n.js';
import { listThemes, validateThemeConfiguration } from './themes.js';
import { arcTypes, isLinear, isPoint, isTangentCurve, isCommonTangentCurve, validDivisionRatio } from './geometry.js';
import { conicTypes } from './conics.js';
import { objectOpacity } from './object-style.js';
import { isMeasurement } from './measurements.js';
import { compileEquation, equationToLatex } from './plot/formula.js';
import { latexToSource } from './math-source.js';
import { compileParametric } from './plot/parametric-formula.js';
import { defaults, normalizeOptions, parameters } from './plot/options.js';
import { normalizeParametricOptions, parametricParameters } from './plot/parametric-options.js';
import { isPlot } from './plot/types.js';
import { isCad, validCornerSides } from './cad.js';
import { isArcSource, validArcBranch } from './arc-connection.js';
import { defaultPhysicsMaterial, validTextureImage } from './physics-material.js';
import { SCRIPT_LIMIT, bindingPatch, formulaParameters, isJavaScript, jsonValue, validVariablePath, variableRoot } from './reflection.js';
import { jsonData } from './json-data.js';
import { validSnapSettings, validTouchOffsetPixels } from './grid-snap.js';
import { mainWindowId, renderTargets, validRenderTargets } from './render-targets.js';
import { validCoordinateView, validCoordinateWindows } from './coordinate-system.js';
import { isTransform, canTransform, transformedDefinition } from './transforms.js';

export const documentFormat = 'stucanvas-lite';
export const documentVersion = 1;
let constructionCodec = null;
export function setConstructionCodec(codec) { constructionCodec = codec; }
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const mathInputPairs = object => object.type === 'parametric' ? [['xSource', 'xLatex'], ['ySource', 'yLatex']] : [['source', 'latex']];
const boundary = object => isLinear(object) || isPlot(object) || object.type === 'circle' || arcTypes.has(object.type) || conicTypes.has(object.type);
const polarCurve = object => object.type === 'circle' || conicTypes.has(object.type);
const points = parents => parents.every(isPoint);
const lines = parents => parents.every(isLinear);
const noParents = parents => parents.length === 0;
const twoPoints = parents => parents.length === 2 && points(parents);
const threePoints = parents => parents.length === 3 && points(parents);
const segmentOrPoints = parents => twoPoints(parents) || parents.length === 1 && parents[0].type === 'segment';
const linesOrPoints = parents => threePoints(parents) || parents.length === 2 && lines(parents);
const parentRules = {
  centralSymmetry: parents => parents.length === 2 && canTransform(parents[0]) && isPoint(parents[1]),
  axialSymmetry: parents => parents.length === 2 && canTransform(parents[0]) && isLinear(parents[1]),
  rotation: parents => parents.length === 2 && canTransform(parents[0]) && isPoint(parents[1]),
  point: noParents, slider: noParents, javascript: noParents, equation: noParents, parametric: noParents, physicsBody: noParents, liquid: noParents, softBody: noParents,
  spring: parents => parents.length <= 2 && parents.every(parent => parent.type === 'physicsBody' || isSoftBody(parent) || isPoint(parent)),
  rope: parents => parents.length <= 2 && parents.every(parent => parent.type === 'physicsBody' || isSoftBody(parent) || isPoint(parent)),
  line: twoPoints, segment: twoPoints, ray: twoPoints,
  circle: parents => twoPoints(parents) || threePoints(parents),
  semicircle: twoPoints, arc: threePoints, circumArc: threePoints, sector: threePoints, circumSector: threePoints,
  ellipse: threePoints, hyperbola: threePoints,
  parabola: parents => parents.length === 2 && isPoint(parents[0]) && isLinear(parents[1]),
  polar: parents => parents.length === 2 && isPoint(parents[0]) && polarCurve(parents[1]),
  pole: parents => parents.length === 2 && isLinear(parents[0]) && polarCurve(parents[1]),
  parallel: parents => parents.length === 2 && isPoint(parents[0]) && isLinear(parents[1]),
  perpendicular: parents => parents.length === 2 && isPoint(parents[0]) && isLinear(parents[1]),
  tangent: parents => parents.length === 2 && isPoint(parents[0]) && isTangentCurve(parents[1]),
  commonTangent: parents => parents.length === 2 && parents.every(isCommonTangentCurve) && parents[0].id !== parents[1].id,
  innerBisector: linesOrPoints, outerBisector: linesOrPoints,
  fillet: parents => parents.length === 2 && lines(parents),
  chamfer: parents => parents.length === 2 && lines(parents),
  arcConnection: parents => parents.length === 2 && parents.every(isArcSource) && parents[0].id !== parents[1].id,
  perpendicularBisector: segmentOrPoints,
  midpoint: segmentOrPoints, ratioPoint: segmentOrPoints, lengthMeasure: segmentOrPoints, angleMeasure: linesOrPoints,
  areaMeasure: parents => parents.length === 1 && parents[0].type === 'region',
  snapPoint: parents => parents.length === 1 && boundary(parents[0]),
  intersection: parents => parents.length === 2 && parents.every(boundary),
  region: parents => parents.length > 0 && parents.every(boundary),
};

function fail(key, values) { throw new LocalizedError(key, values); }
function finite(value, path) {
  if (!Number.isFinite(value)) fail('error.documentNumber', { path });
}
function position(value, path) {
  if (!record(value)) fail('error.documentValue', { path });
  finite(value.x, `${path}.x`);
  finite(value.y, `${path}.y`);
}
function finiteTree(value, path) {
  if (typeof value === 'number') finite(value, path);
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) finiteTree(child, `${path}.${key}`);
}

export function objectDefinition(source, { plotDefaults = defaults, resolved } = {}) {
  const { plot, region, rectangles, solver, body, ...definition } = source;
  const { latex, xLatex, yLatex, invalid, error, ...object } = structuredClone(definition);
  // Incomplete math input is document data too; never export the last valid
  // formula as if it were the text the user is currently editing.
  if (invalid && isPlot(object)) {
    object.draft ??= object.type === 'parametric' ? { xLatex: xLatex ?? '', yLatex: yLatex ?? '', tMin: String(object.tMin ?? ''), tMax: String(object.tMax ?? '') } : { latex: latex ?? '' };
    for (const key of ['tMin', 'tMax']) if (Object.hasOwn(object, key) && !Number.isFinite(object[key])) object[key] = null;
  }
  if (isPlot(object)) {
    // Keep the user's notation, tied to the formula it represents. Editing a
    // source in JSON invalidates only that coordinate's old presentation.
    const input = { ...object.mathInput };
    const runtime = { latex, xLatex, yLatex };
    for (const [sourceKey, latexKey] of mathInputPairs(object)) {
      if (!object.draft && typeof runtime[latexKey] === 'string') {
        input[sourceKey] = object[sourceKey]; input[latexKey] = runtime[latexKey];
      }
      if (object.draft || input[sourceKey] !== object[sourceKey]) {
        delete input[sourceKey]; delete input[latexKey];
      }
    }
    if (Object.keys(input).length) object.mathInput = input;
    else delete object.mathInput;
  }
  object.name ??= object.id;
  object.parents ??= [];
  object.color ??= null;
  object.opacity = objectOpacity(object);
  object.strokeWidth ??= 2.4;
  object.hidden ??= false;
  object.renderTargets = [...renderTargets(object)];
  object.trace ??= false;
  if (isJavaScript(object)) {
    object.source ??= 'return 1;'; object.enabled ??= true;
    if (object.value === undefined) object.value = 0;
  }
  if (supportsSurfaceFriction(object)) {
    object.surfaceFriction ??= [];
    object.surfaceRestitution ??= [];
  }
  delete object.friction;
  if (object.type === 'physicsBody') {
    object.material = { ...defaultPhysicsMaterial(), ...object.material };
    object.smoothing ??= 0;
  }
  if (isSoftBody(object)) object.smoothing ??= 0;
  if (object.type === 'region') {
    object.subdivision ??= .25;
    object.instanceSubdivisions ??= DEFAULT_INSTANCE_SUBDIVISIONS;
    object.liquidDrops ??= DEFAULT_LIQUID_DROPS;
    object.softSubdivisions ??= DEFAULT_SOFT_SUBDIVISIONS;
  }
  if (object.type === 'ratioPoint') object.ratio ??= [1, 1];
  if (object.type === 'rotation') object.angle ??= 90;
  if (isCad(object)) {
    if (object.type === 'arcConnection') {
      object.branch ??= 0;
      object.longArc ??= false;
    } else {
      object.sides ??= [1, 1];
      object.trim ??= true;
    }
    if (object.type !== 'chamfer') object.radius ??= 1;
    else object.size ??= .25;
  }
  if (!isCad(object) && ['circle', ...arcTypes].includes(object.type)) object.construction ??= object.type.startsWith('circum') || object.type === 'circle' && object.parents.length === 3 ? 'three-point' : 'center';
  if (isPlot(object)) {
    const normalize = object.type === 'parametric' ? normalizeParametricOptions : normalizeOptions;
    const base = object.type === 'parametric' ? {} : plotDefaults;
    object.plotOptions = { ...object.plotOptions, ...normalize({ ...base, ...object.plotOptions }) };
  }
  if (isMeasurement(object)) object.labelOffset ??= { x: 0, y: 0 };
  if (object.type === 'angleMeasure') object.angleMode ??= 'inner';
  if (object.type === 'intersection' || object.type === 'tangent' || object.type === 'commonTangent') object.branch ??= 0;
  if (object.type === 'intersection' && Number.isFinite(resolved?.x) && Number.isFinite(resolved?.y)) object.position = { x: resolved.x, y: resolved.y };
  return object;
}

export function createDocument(objects, { extras = {}, plotDefaults = defaults, resolved = new Map() } = {}) {
  const byId = new Map(objects.map(object => [object.id, object]));
  const definitions = objects.map(object => {
    const definition = objectDefinition(object, { plotDefaults, resolved: resolved.get(object.id) });
    if (object.type === 'snapPoint') definition.constraint = isPlot(byId.get(object.parents?.[0])) ? 'plot' : 'object';
    return definition;
  });
  return { ...structuredClone(extras), timeline: { ...defaultTimeline(), ...extras.timeline }, format: documentFormat, version: documentVersion, objects: definitions };
}

export const serializeDocument = document => JSON.stringify(jsonData(document), null, 2);
export function documentKey(value) {
  const active = new WeakSet();
  function key(input) {
    if (!input || typeof input !== 'object') return JSON.stringify(input);
    if (active.has(input)) fail('error.documentCycle', { ids: '$' });
    active.add(input);
    const result = Array.isArray(input) ? `[${input.map(key).join(',')}]`
      : `{${Object.keys(input).sort().map(name => `${JSON.stringify(name)}:${key(input[name])}`).join(',')}}`;
    active.delete(input); return result;
  }
  return key(value);
}

// Apply the user's edits to the newest model, preserving concurrent canvas
// changes in fields the user did not touch (for example an animated slider).
export function mergeDocumentEdits(base, edited, current) {
  function merge(before, next, latest) {
    if (documentKey(before) === documentKey(next)) return latest;
    if (!record(before) || !record(next) || !record(latest)) return next;
    const result = {};
    for (const key of new Set([...Object.keys(latest), ...Object.keys(next)])) {
      if (!Object.hasOwn(next, key)) {
        if (!Object.hasOwn(before, key)) Object.defineProperty(result, key, { value: latest[key], enumerable: true });
      } else if (Object.hasOwn(before, key)) {
        if (!Object.hasOwn(latest, key) && documentKey(before[key]) === documentKey(next[key])) continue;
        Object.defineProperty(result, key, { value: merge(before[key], next[key], latest[key]), enumerable: true });
      } else Object.defineProperty(result, key, { value: next[key], enumerable: true });
    }
    return result;
  }
  const byId = values => new Map(values.map(value => [value.id, value]));
  const original = byId(base.objects);
  const latest = byId(current.objects);
  const editedIds = new Set(edited.objects.map(object => object.id));
  const definitions = edited.objects.flatMap(object => {
    const before = original.get(object.id);
    const now = latest.get(object.id);
    if (before && !now && documentKey(before) === documentKey(object)) return [];
    return [before && now ? merge(before, object, now) : object];
  });
  for (const object of current.objects) if (!original.has(object.id) && !editedIds.has(object.id)) definitions.push(object);
  const sameOrder = documentKey(base.objects.map(object => object.id)) === documentKey(edited.objects.map(object => object.id));
  if (sameOrder) {
    const order = new Map(current.objects.map((object, index) => [object.id, index]));
    definitions.sort((first, second) => (order.get(first.id) ?? Infinity) - (order.get(second.id) ?? Infinity));
  }
  return { ...merge(base, edited, current), objects: definitions };
}

function validateOptions(object, path) {
  const options = object.plotOptions;
  if (options === undefined) return;
  if (!record(options)) fail('error.documentValue', { path: `${path}.plotOptions` });
  const parametric = object.type === 'parametric';
  if (options.algorithm !== undefined && !(parametric ? ['adaptive', 'interval'] : ['marching', 'lshade']).includes(options.algorithm)) fail('error.documentValue', { path: `${path}.plotOptions.algorithm` });
  for (const [key, , , minimum, maximum, step] of parametric ? parametricParameters : parameters) {
    if (options[key] === undefined) continue;
    const value = options[key];
    finite(value, `${path}.plotOptions.${key}`);
    if (value < minimum || value > maximum || step === 1 && !Number.isInteger(value)) fail('error.documentRange', { path: `${path}.plotOptions.${key}`, minimum, maximum });
  }
  if (options.marchingBlocks !== undefined && !Number.isInteger(Math.log2(options.marchingBlocks))) fail('error.documentValue', { path: `${path}.plotOptions.marchingBlocks` });
  if (!parametric && (options.minimumPopulation ?? defaults.minimumPopulation) > (options.population ?? defaults.population)) fail('error.documentValue', { path: `${path}.plotOptions.minimumPopulation` });
}

function validateRope(object,path) {
  const range=(key,min,max)=>{finite(object[key],`${path}.${key}`);if(object[key]<min||object[key]>max)fail('error.documentRange',{path:`${path}.${key}`,minimum:min,maximum:max});};
  range('length',.001,100000);range('radius',.002,10);range('segments',4,128);range('stiffness',.001,1);range('damping',0,1);
  if(object.type==='spring'){range('coilRadius',.005,10);range('turns',2,64);if(!Number.isInteger(object.turns))fail('error.documentValue',{path:`${path}.turns`});}
  if(!Number.isInteger(object.segments))fail('error.documentValue',{path:`${path}.segments`});
  for(const key of ['collideGeometry','collideBodies'])if(typeof object[key]!=='boolean')fail('error.documentValue',{path:`${path}.${key}`});
  if(!Array.isArray(object.anchors)||object.anchors.length!==2)fail('error.documentValue',{path:`${path}.anchors`});
  for(const [i,anchor]of object.anchors.entries()){
    if(!record(anchor)||anchor.objectId!==null&&(typeof anchor.objectId!=='string'||!anchor.objectId.length))fail('error.documentValue',{path:`${path}.anchors[${i}]`});
    position(anchor.point,`${path}.anchors[${i}].point`);
  }
  if(documentKey(ropeParents(object))!==documentKey(object.parents))fail('error.documentValue',{path:`${path}.parents`});
  const links=(states,at)=>{
    if(!Array.isArray(states)||states.length!==object.segments)fail('error.documentValue',{path:at});
    for(const [i,state]of states.entries()){
      if(!record(state))fail('error.documentValue',{path:`${at}[${i}]`});
      for(const key of ['position','velocity'])position(state[key],`${at}[${i}].${key}`);
      for(const key of ['angle','angularVelocity'])finite(state[key],`${at}[${i}].${key}`);
    }
  };
  links(object.links,`${path}.links`);
  if(!record(object.initialState))fail('error.documentValue',{path:`${path}.initialState`});
  links(object.initialState.links,`${path}.initialState.links`);
}

function validateSoftBody(object,path) {
  const mesh=object.mesh,at=`${path}.mesh`;
  if(!record(mesh)||!Array.isArray(mesh.vertices)||mesh.vertices.length<3||mesh.vertices.length>MAX_SOFT_NODES||!validSoftSubdivisions(mesh.subdivisions))fail('error.documentValue',{path:at});
  const count=mesh.vertices.length;
  mesh.vertices.forEach((p,i)=>position(p,`${at}.vertices[${i}]`));
  const index=i=>Number.isInteger(i)&&i>=0&&i<count;
  if(!Array.isArray(mesh.triangles)||!mesh.triangles.length||mesh.triangles.length>MAX_SOFT_NODES*2)fail('error.documentValue',{path:`${at}.triangles`});
  const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`,edges=new Map();let area=0;
  for(const face of mesh.triangles){
    if(!Array.isArray(face)||face.length!==3||!face.every(index)||new Set(face).size!==3)fail('error.documentValue',{path:`${at}.triangles`});
    const [a,b,c]=face.map(i=>mesh.vertices[i]),weight=((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;
    if(!(weight>0))fail('error.documentValue',{path:`${at}.triangles`});area+=weight;
    for(let i=0;i<3;i++){const key=edgeKey(face[i],face[(i+1)%3]);edges.set(key,(edges.get(key)||0)+1);if(edges.get(key)>2)fail('error.documentValue',{path:`${at}.triangles`});}
  }
  if(!Number.isFinite(mesh.area)||Math.abs(mesh.area-area)>area*1e-8)fail('error.documentValue',{path:`${at}.area`});
  for(const key of ['weights','radii'])if(!Array.isArray(mesh[key])||mesh[key].length!==count||mesh[key].some(v=>!Number.isFinite(v)||v<=0))fail('error.documentValue',{path:`${at}.${key}`});
  if(Math.abs(mesh.weights.reduce((a,b)=>a+b,0)-1)>1e-8)fail('error.documentValue',{path:`${at}.weights`});
  if(!Array.isArray(mesh.boundary)||mesh.boundary.length>count*3)fail('error.documentValue',{path:`${at}.boundary`});
  const outline=new Set();
  for(const edge of mesh.boundary){if(!Array.isArray(edge)||edge.length!==2||!edge.every(index)||edge[0]===edge[1]||edges.get(edgeKey(...edge))!==1||outline.has(edgeKey(...edge)))fail('error.documentValue',{path:`${at}.boundary`});outline.add(edgeKey(...edge));}
  if([...edges].some(([key,n])=>n===1&&!outline.has(key)))fail('error.documentValue',{path:`${at}.boundary`});
  if(!Array.isArray(mesh.links)||mesh.links.length>MAX_SOFT_NODES*8)fail('error.documentValue',{path:`${at}.links`});
  const connected=new Set();
  for(const link of mesh.links){
    if(!record(link)||!index(link.a)||!index(link.b)||link.a===link.b||!['stretch','shear','bend'].includes(link.kind)||!Number.isFinite(link.length)||link.length<=0)fail('error.documentValue',{path:`${at}.links`});
    const a=mesh.vertices[link.a],b=mesh.vertices[link.b],distance=Math.hypot(a.x-b.x,a.y-b.y);
    if(Math.abs(distance-link.length)>distance*1e-8)fail('error.documentValue',{path:`${at}.links`});
    if(link.kind!=='bend'){const key=edgeKey(link.a,link.b);if(edges.get(key)!==(link.kind==='stretch'?1:2)||connected.has(key))fail('error.documentValue',{path:`${at}.links`});connected.add(key);}
  }
  if(connected.size!==edges.size)fail('error.documentValue',{path:`${at}.links`});
  for(const key of ['stretchStiffness','shearStiffness','bendStiffness','areaStiffness','damping'])if(!Number.isFinite(object[key])||object[key]<0||object[key]>1)fail('error.documentValue',{path:`${path}.${key}`});
  if(!Number.isFinite(object.collisionRadius)||object.collisionRadius<.25||object.collisionRadius>1.5)fail('error.documentValue',{path:`${path}.collisionRadius`});
  for(const key of ['selfCollision','showMesh','collideGeometry','collideBodies'])if(typeof object[key]!=='boolean')fail('error.documentValue',{path:`${path}.${key}`});
  for(const [states,at]of [[object.nodes,`${path}.nodes`],[object.initialState?.nodes,`${path}.initialState.nodes`]]){
    if(!Array.isArray(states)||states.length!==count)fail('error.documentValue',{path:at});
    states.forEach((state,i)=>{if(!record(state))fail('error.documentValue',{path:`${at}[${i}]`});for(const key of ['position','velocity'])position(state[key],`${at}[${i}].${key}`);});
  }
}

function validateLiquid(object,path) {
  if(!validLiquidDrops(object.particleCount))fail('error.documentValue',{path:`${path}.particleCount`});
  for(const key of ['volume','radius','density','pressure','viscosity','cohesion','buoyancy'])finite(object[key],`${path}.${key}`);
  if(!(object.volume>0&&object.radius>0&&Number.isFinite(object.density*object.volume)&&object.density>=.001&&object.density<=100000&&object.pressure>=1&&object.pressure<=2000&&object.viscosity>=0&&object.viscosity<=1&&object.cohesion>=0&&object.cohesion<=1&&object.buoyancy>=0&&object.buoyancy<=3))fail('error.documentValue',{path});
  for(const key of ['collideGeometry','collideBodies'])if(typeof object[key]!=='boolean')fail('error.documentValue',{path:`${path}.${key}`});
  const particles=(states,at)=>{
    if(!Array.isArray(states)||states.length!==object.particleCount)fail('error.documentValue',{path:at});
    for(const [i,state]of states.entries()){
      if(!record(state))fail('error.documentValue',{path:`${at}[${i}]`});
      for(const key of ['position','velocity'])position(state[key],`${at}[${i}].${key}`);
    }
  };
  particles(object.particles,`${path}.particles`);
  if(!record(object.initialState))fail('error.documentValue',{path:`${path}.initialState`});
  particles(object.initialState.particles,`${path}.initialState.particles`);
}

export function parseDocument(text) {
  let document;
  try { document = JSON.parse(text); }
  catch (error) {
    const offset = /position (\d+)/i.exec(error.message);
    const coordinates = /line (\d+) column (\d+)/i.exec(error.message);
    if (offset || coordinates) {
      const prefix = text.slice(0, Number(offset?.[1]));
      const line = offset ? prefix.split('\n').length : Number(coordinates[1]);
      const column = offset ? prefix.length - prefix.lastIndexOf('\n') : Number(coordinates[2]);
      fail('error.documentSyntaxAt', { line, column });
    }
    fail('error.documentSyntax');
  }
  if (!record(document) || document.format !== documentFormat || !Array.isArray(document.objects)) fail('error.documentRoot');
  if (document.version !== documentVersion) fail('error.documentVersion', { version: String(document.version) });
  finiteTree(document, '$');
  if (document.view !== undefined && !validCoordinateView(document.view)) fail('error.documentValue', { path: '$.view' });
  if (document.physicsFrame !== undefined && document.physicsFrame !== null) {
    const frame = document.physicsFrame;
    if (!record(frame) || !validCoordinateView(frame.view) || !['width', 'height'].every(key => Number.isFinite(frame[key]) && frame[key] >= 0)) fail('error.documentValue', { path: '$.physicsFrame' });
  }
  if (document.display !== undefined) {
    if (!record(document.display) || !['grid', 'axes', 'snap'].every(key => typeof document.display[key] === 'boolean')) fail('error.documentValue', { path: '$.display' });
    for (const key of ['hidePoints', 'hideObjectLabels']) if (document.display[key] !== undefined && typeof document.display[key] !== 'boolean') fail('error.documentValue', { path: `$.display.${key}` });
    if (document.display.snapping !== undefined && !validSnapSettings(document.display.snapping)) fail('error.documentValue', { path: '$.display.snapping' });
    if (document.display.touchOffset !== undefined && typeof document.display.touchOffset !== 'boolean') fail('error.documentValue', { path: '$.display.touchOffset' });
    if (document.display.touchOffsetPixels !== undefined && !validTouchOffsetPixels(document.display.touchOffsetPixels)) fail('error.documentValue', { path: '$.display.touchOffsetPixels' });
  }
  if(document.ui?.mainWindowId!==undefined&&document.ui.mainWindowId!==mainWindowId)fail('error.documentValue',{path:'$.ui.mainWindowId'});
  if(document.ui?.coordinateWindows!==undefined&&!validCoordinateWindows(document.ui.coordinateWindows))fail('error.documentValue',{path:'$.ui.coordinateWindows'});
  if (document.ui?.timeline !== undefined) {
    const state = document.ui.timeline;
    if (!record(state) || typeof state.visible !== 'boolean' || typeof state.expanded !== 'boolean') fail('error.documentValue', { path: '$.ui.timeline' });
    if (state.position !== null) position(state.position, '$.ui.timeline.position');
  }
  if (document.settings !== undefined) {
    const settings = document.settings;
    if (!record(settings)) fail('error.documentValue', { path: '$.settings' });
    if (settings.locale !== undefined && !languages.some(language => language.id === settings.locale)) fail('error.documentValue', { path: '$.settings.locale' });
    if (settings.themeConfiguration !== undefined) {
      try { validateThemeConfiguration(settings.themeConfiguration); } catch { fail('error.documentValue', { path: '$.settings.themeConfiguration' }); }
      if (settings.theme !== undefined && settings.theme !== settings.themeConfiguration.selection) fail('error.documentValue', { path: '$.settings.theme' });
    } else if (settings.theme !== undefined && settings.theme !== 'system' && !listThemes().some(theme => theme.id === settings.theme)) fail('error.documentValue', { path: '$.settings.theme' });
    if (settings.plotDefaults !== undefined) validateOptions({ type: 'equation', plotOptions: settings.plotDefaults }, '$.settings');
  }
  if (document.constructionGraph !== undefined) {
    if (!constructionCodec) fail('error.documentValue', { path: '$.constructionGraph' });
    return constructionCodec.parse(document);
  }
  if (document.timeline !== undefined) {
    const value = document.timeline;
    if (!record(value)) fail('error.documentValue', { path: '$.timeline' });
    for (const key of ['time', 'duration', 'playbackRate']) finite(value[key], `$.timeline.${key}`);
    if (value.time < 0 || value.time > MAX_TIMELINE_TIME || value.duration < 0 || value.duration > MAX_TIMELINE_TIME || value.playbackRate < .05 || value.playbackRate > 4
      || value.duration > 0 && value.time > value.duration || typeof value.running !== 'boolean') fail('error.documentValue', { path: '$.timeline' });
  }

  const availableWindows=document.ui?.coordinateWindows===undefined&&document.ui?.mainWindowId===undefined?null:new Set([mainWindowId,...(document.ui.coordinateWindows||[]).map(window=>window.id)]);
  const byId = new Map();
  const sliderNames = new Map();
  for (const [index, object] of document.objects.entries()) {
    const path = `objects[${index}]`;
    if (!record(object)) fail('error.documentValue', { path });
    for (const key of ['latex', 'xLatex', 'yLatex', 'invalid', 'error', 'transformNode', 'plotTransform']) if (Object.hasOwn(object, key)) fail('error.documentValue', { path: `${path}.${key}` });
    if (typeof object.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(object.id)) fail('error.documentId', { path: `${path}.id` });
    if (byId.has(object.id)) fail('error.documentDuplicate', { id: object.id });
    if (object.type === 'rightAngle') object.type = 'chamfer';
    if (typeof object.type !== 'string' || !Object.hasOwn(parentRules, object.type)) fail('error.documentType', { id: object.id, type: JSON.stringify(object.type) });
    if (!validRenderTargets(object,availableWindows)) fail('error.documentValue', { path: `${path}.renderTargets` });
    if (object.name !== undefined && (typeof object.name !== 'string' || !object.name.trim())) fail('error.documentValue', { path: `${path}.name` });
    if (object.parents !== undefined && (!Array.isArray(object.parents) || object.parents.some(parent => typeof parent !== 'string'))) fail('error.documentValue', { path: `${path}.parents` });
    if (object.script !== undefined) fail('error.documentValue', { path: `${path}.script` });
    if (object.bindings !== undefined) {
      if (isJavaScript(object) || !record(object.bindings) || Object.values(object.bindings).some(reference => !validVariablePath(reference))) fail('error.documentValue', { path: `${path}.bindings` });
      try { bindingPatch(object, () => 0); } catch { fail('error.documentValue', { path: `${path}.bindings` }); }
    }
    if (isJavaScript(object)) {
      const name = object.name ?? object.id;
      if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name) || !compileEquation(`y=${name}`, { [name.toLowerCase()]: 0 }).parameterNames.includes(name.toLowerCase())) fail('error.documentValue', { path: `${path}.name` });
      if (typeof object.source !== 'string' || object.source.length > SCRIPT_LIMIT || object.enabled !== undefined && typeof object.enabled !== 'boolean') fail('error.documentValue', { path: `${path}.source` });
      try { if (object.value !== undefined) jsonValue(object.value); } catch { fail('error.documentValue', { path: `${path}.value` }); }
    }
    if (object.color !== undefined && object.color !== null && (typeof object.color !== 'string' || !/^#[\da-f]{6}$/i.test(object.color))) fail('error.documentValue', { path: `${path}.color` });
    for (const key of ['hidden', 'trace']) if (object[key] !== undefined && typeof object[key] !== 'boolean') fail('error.documentValue', { path: `${path}.${key}` });
    if (object.opacity !== undefined && (typeof object.opacity !== 'number' || object.opacity < 0 || object.opacity > 1)) fail('error.documentRange', { path: `${path}.opacity`, minimum: 0, maximum: 1 });
    if (object.strokeWidth !== undefined && (typeof object.strokeWidth !== 'number' || object.strokeWidth <= 0)) fail('error.documentValue', { path: `${path}.strokeWidth` });
    if (object.labelOffset !== undefined) position(object.labelOffset, `${path}.labelOffset`);
    if (object.branch !== undefined && (!Number.isInteger(object.branch) || object.branch < 0)) fail('error.documentValue', { path: `${path}.branch` });
    if (object.type === 'commonTangent' && (object.branch ?? 0) > 3) fail('error.documentValue', { path: `${path}.branch` });
    if (object.construction !== undefined && !['center', 'three-point'].includes(object.construction)) fail('error.documentValue', { path: `${path}.construction` });
    if (object.draft !== undefined) {
      if (!isPlot(object) || !record(object.draft)) fail('error.documentValue', { path: `${path}.draft` });
      for (const key of object.type === 'parametric' ? ['xLatex', 'yLatex', 'tMin', 'tMax'] : ['latex']) if (typeof object.draft[key] !== 'string') fail('error.documentValue', { path: `${path}.draft.${key}` });
    }
    if (object.mathInput !== undefined) {
      if (!isPlot(object) || !record(object.mathInput)) fail('error.documentValue', { path: `${path}.mathInput` });
      for (const [sourceKey, latexKey] of mathInputPairs(object)) {
        const input = object.mathInput;
        if (!Object.hasOwn(input, sourceKey) && !Object.hasOwn(input, latexKey)) continue;
        if (typeof input[sourceKey] !== 'string' || typeof input[latexKey] !== 'string') fail('error.documentValue', { path: `${path}.mathInput.${latexKey}` });
        if (object.draft || input[sourceKey] !== object[sourceKey]) continue;
        try {
          if (equationToLatex(latexToSource(input[latexKey])) !== equationToLatex(object[sourceKey])) throw new Error('Inconsistent notation');
        } catch { fail('error.documentValue', { path: `${path}.mathInput.${latexKey}` }); }
      }
    }
    if (isPlot(object)) for (const key of object.type === 'parametric' ? ['xSource', 'ySource'] : ['source']) {
      if (typeof object[key] !== 'string' || !object.draft && !object[key].trim()) fail('error.documentValue', { path: `${path}.${key}` });
    }
    if (object.friction !== undefined && (!Number.isFinite(object.friction) || object.friction < 0 || object.friction > 1)) fail('error.documentValue', { path: `${path}.friction` });
    for (const field of ['surfaceFriction', 'surfaceRestitution']) if (object[field] !== undefined) {
      if (!supportsSurfaceFriction(object) || !Array.isArray(object[field])) fail('error.documentValue', { path: `${path}.${field}` });
      for (const [index, patch] of object[field].entries()) {
        const at = `${path}.${field}[${index}]`;
        if (!record(patch)) fail('error.documentValue', { path: at });
        position(patch.center, `${at}.center`); position(patch.normal, `${at}.normal`);
        if (!(Number.isFinite(patch.radius) && patch.radius > 0) || Math.abs(Math.hypot(patch.normal.x, patch.normal.y) - 1) > 1e-6
          || patch.coefficient !== null && (!Number.isFinite(patch.coefficient) || patch.coefficient < 0 || patch.coefficient > 1)) fail('error.documentValue', { path: at });
      }
    }
    if (object.type === 'point') position(object, path);
    if (object.type === 'rotation') finite(object.angle ?? 90, `${path}.angle`);
    if (isTransform(object)) for (const key of ['transformNode', 'plotTransform', 'first', 'second', 'origin', 'axis', 'coefficients', 'points', 'segments', 'x', 'y', 'source', 'xSource', 'ySource']) {
      if (Object.hasOwn(object, key)) fail('error.documentValue', { path: `${path}.${key}` });
    }
    if (object.type === 'physicsBody' || isFlexible(object) || isLiquid(object) || isSoftBody(object)) {
      const rope = isFlexible(object);
      const liquid = isLiquid(object), soft = isSoftBody(object), particles = rope || liquid || soft;
      if (object.smoothing !== undefined && (!Number.isFinite(object.smoothing) || object.smoothing < 0 || object.smoothing > 100)) fail('error.documentRange', { path: `${path}.smoothing`, minimum: 0, maximum: 100 });
      if (object.material !== undefined) {
        const material = object.material;
        if (!record(material) || !['concrete', 'image'].includes(material.type)) fail('error.documentValue', { path: `${path}.material` });
        if (!Number.isFinite(material.tileSize) || material.tileSize < .05 || material.tileSize > 100) fail('error.documentValue', { path: `${path}.material.tileSize` });
        if (typeof material.name !== 'string' || (material.type === 'image' ? !validTextureImage(material.image) : material.image !== null)) fail('error.documentValue', { path: `${path}.material.image` });
      }
      for (const key of particles ? ['gravity'] : ['position', 'velocity', 'gravity']) position(object[key], `${path}.${key}`);
      for (const key of (particles ? [...(liquid?[]:['mass']), 'restitution', 'airFriction', 'time', 'duration', 'playbackRate'] : ['angle', 'angularVelocity', 'mass', 'restitution', 'airFriction', 'time', 'duration', 'playbackRate'])) finite(object[key], `${path}.${key}`);
      if (!liquid && object.mass <= 0 || object.time < 0 || object.duration < 0 || object.duration > 3600 || object.playbackRate < .05 || object.playbackRate > 4) fail('error.documentValue', { path });
      for (const key of ['restitution', 'airFriction']) if (object[key] < 0 || object[key] > 1) fail('error.documentValue', { path: `${path}.${key}` });
      for (const key of ['running', 'freeFall']) if (typeof object[key] !== 'boolean') fail('error.documentValue', { path: `${path}.${key}` });
      if (!Array.isArray(object.ignored) || object.ignored.some(id => typeof id !== 'string') || new Set(object.ignored).size !== object.ignored.length) fail('error.documentValue', { path: `${path}.ignored` });
      if (!particles) {
        if (!record(object.shape) || !Array.isArray(object.shape.rectangles) || !object.shape.rectangles.length) fail('error.documentValue', { path: `${path}.shape` });
        for (const rectangle of object.shape.rectangles) if (!Array.isArray(rectangle) || rectangle.length !== 4 || !rectangle.every(Number.isFinite) || rectangle[0] >= rectangle[2] || rectangle[1] >= rectangle[3]) fail('error.documentValue', { path: `${path}.shape.rectangles` });
        if (!record(object.initialState)) fail('error.documentValue', { path: `${path}.initialState` });
        for (const key of ['position', 'velocity']) position(object.initialState[key], `${path}.initialState.${key}`);
        for (const key of ['angle', 'angularVelocity']) finite(object.initialState[key], `${path}.initialState.${key}`);
      } else if (soft) {
        validateSoftBody(object,path);
      } else if (liquid) {
        validateLiquid(object,path);
      } else {
        validateRope(object, path);
      }
    }

    if (object.type === 'ratioPoint' && !validDivisionRatio(object.ratio)) fail('error.documentValue', { path: `${path}.ratio` });
    if (isCad(object)) {
      if (object.trim !== undefined && typeof object.trim !== 'boolean') fail('error.documentValue', { path: `${path}.trim` });
      if (object.type === 'arcConnection') {
        if (!validArcBranch(object.branch)) fail('error.documentValue', { path: `${path}.branch` });
        if (typeof object.longArc !== 'boolean') fail('error.documentValue', { path: `${path}.longArc` });
      } else if (!validCornerSides(object.sides)) fail('error.documentValue', { path: `${path}.sides` });
      const key = object.type !== 'chamfer' ? 'radius' : 'size';
      finite(object[key], `${path}.${key}`);
      if (object[key] <= 0) fail('error.documentValue', { path: `${path}.${key}` });
      if (object.construction !== undefined) fail('error.documentValue', { path: `${path}.construction` });
    }
    if (object.type === 'intersection' && object.position !== undefined) position(object.position, `${path}.position`);
    if (object.type === 'region') {
      position(object.seed, `${path}.seed`);
      if (object.instanceSubdivisions !== undefined && !validInstanceSubdivisions(object.instanceSubdivisions)) fail('error.documentValue', { path: `${path}.instanceSubdivisions` });
      if (object.liquidDrops !== undefined && !validLiquidDrops(object.liquidDrops)) fail('error.documentValue', { path: `${path}.liquidDrops` });
      if (object.softSubdivisions !== undefined && !validSoftSubdivisions(object.softSubdivisions)) fail('error.documentValue', { path: `${path}.softSubdivisions` });
      if (object.subdivision !== undefined && (!Number.isFinite(object.subdivision) || object.subdivision < .03125 || object.subdivision > 1)) fail('error.documentValue', { path: `${path}.subdivision` });
      if (!['single', 'multiple'].includes(object.mode)) fail('error.documentValue', { path: `${path}.mode` });
    }
    if (object.type === 'angleMeasure' && object.angleMode !== undefined && !['inner', 'reflex', 'supplementary'].includes(object.angleMode)) fail('error.documentValue', { path: `${path}.angleMode` });
    if (isPlot(object)) validateOptions(object, path);
    if (object.type === 'parametric') for (const key of ['tMin', 'tMax']) if (!object.draft || object[key] !== null) finite(object[key], `${path}.${key}`);
    if (object.type === 'slider') {
      const name = object.name ?? object.id;
      if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name) || !compileEquation(`y=${name}`, { [name.toLowerCase()]: 0 }).parameterNames.includes(name.toLowerCase())) fail('error.documentValue', { path: `${path}.name` });
      if (sliderNames.has(name.toLowerCase())) fail('error.documentSlider', { name });
      sliderNames.set(name.toLowerCase(), object.id);
      for (const key of ['value', 'min', 'max', 'step']) finite(object[key], `${path}.${key}`);
      if (object.min > object.max || object.step <= 0 || object.value < object.min || object.value > object.max) fail('error.documentValue', { path });
    }
    byId.set(object.id, object);
  }
  const namedVariables = document.objects.filter(object => object.type === 'slider' || isJavaScript(object));
  sliderNames.clear();
  for (const object of namedVariables) {
    const name = (object.name ?? object.id).toLowerCase();
    if (sliderNames.has(name)) fail('error.documentValue', { path: `${object.id}.name` });
    sliderNames.set(name, object.id);
  }
  const bindings = formulaParameters(document.objects.map(object => ({ ...object, name: object.name ?? object.id })));
  const incoming = new Map(document.objects.map(object => [object.id, 0]));
  const dependents = new Map(document.objects.map(object => [object.id, []]));
  for (const object of document.objects) {
    const parents = object.parents || [];
    for (const parent of parents) if (!byId.has(parent)) fail('error.documentReference', { id: object.id, parent });
    if (!parentRules[object.type](parents.map(parent => transformedDefinition(byId.get(parent), byId)))) fail('error.documentParents', { id: object.id, type: object.type });
    if (object.construction !== undefined) {
      const three = object.construction === 'three-point';
      if (object.type === 'circle' ? three !== (parents.length === 3) : arcTypes.has(object.type) ? three !== object.type.startsWith('circum') : true) fail('error.documentValue', { path: `${object.id}.construction` });
    }
    if (object.type === 'snapPoint') {
      const parent = transformedDefinition(byId.get(parents[0]), byId);
      const plot = isPlot(parent);
      if (plot) position(object, object.id);
      else if (parent.type === 'hyperbola' && record(object.parameter)) {
        finite(object.parameter.value, `${object.id}.parameter.value`);
        if (![1, -1].includes(object.parameter.branch)) fail('error.documentValue', { path: `${object.id}.parameter.branch` });
      } else finite(object.parameter, `${object.id}.parameter`);
      if (object.constraint !== undefined && object.constraint !== (plot ? 'plot' : 'object')) fail('error.documentValue', { path: `${object.id}.constraint` });
      object.constraint = plot ? 'plot' : 'object';
    }
    let compiled;
    try {
      if (object.type === 'equation' && !object.draft) compiled = compileEquation(object.source, bindings);
      else if (object.type === 'parametric' && !object.draft) compiled = compileParametric(object, bindings);
    } catch (error) {
      if (error instanceof LocalizedError) { error.values.path = object.id; throw error; }
      throw error;
    }
    const bindingParents = Object.values(object.bindings || {}).map(reference => {
      const parent = sliderNames.get(variableRoot(reference));
      if (!parent || !isJavaScript(byId.get(parent))) fail('error.documentReference', { id: object.id, parent: reference });
      return parent;
    });
    const dependencies = new Set([...parents, ...bindingParents, ...(compiled?.parameterNames || []).map(name => sliderNames.get(variableRoot(name)))]);
    incoming.set(object.id, dependencies.size);
    for (const parent of dependencies) dependents.get(parent).push(object.id);
  }
  const queue = document.objects.filter(object => incoming.get(object.id) === 0).map(object => object.id);
  for (let index = 0; index < queue.length; index++) for (const id of dependents.get(queue[index])) {
    incoming.set(id, incoming.get(id) - 1);
    if (incoming.get(id) === 0) queue.push(id);
  }
  if (queue.length !== document.objects.length) fail('error.documentCycle', { ids: document.objects.filter(object => incoming.get(object.id) > 0).map(object => object.id).join(', ') });
  return { ...document, timeline: { ...defaultTimeline(), ...document.timeline }, objects: document.objects.map(object => objectDefinition(object)) };
}

export function reconcileDocument(current, next, options = {}) {
  const byId = new Map(current.map(object => [object.id, object]));
  const definitions = new Map(createDocument(current, options).objects.map(object => [object.id, object]));
  const changed = new Set();
  const objects = next.map(object => {
    const previous = byId.get(object.id);
    if (previous && documentKey(definitions.get(object.id)) === documentKey(object)) return previous;
    changed.add(object.id);
    const replacement = { ...object };
    if (object.draft) {
      replacement.invalid = true;
      replacement.error = { key: 'error.documentDraft' };
      if (object.type === 'equation') replacement.latex = object.draft.latex;
      else for (const coordinate of ['x', 'y']) replacement[`${coordinate}Latex`] = object.draft[`${coordinate}Latex`];
    }
    if (isPlot(object) && !object.draft) {
      for (const [sourceKey, latexKey] of mathInputPairs(object)) {
        if (object.mathInput?.[sourceKey] === object[sourceKey]) replacement[latexKey] = object.mathInput[latexKey];
      }
    }
    return replacement;
  });
  const ids = new Set(objects.map(object => object.id));
  for (const object of current) if (!ids.has(object.id)) changed.add(object.id);
  return { objects, changed };
}
