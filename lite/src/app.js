import { createSpring, flexibleDistance as ropeDistance } from './spring.js';
import { isLiquid, liquidFromBody, liquidDistance, liquidMass, DEFAULT_LIQUID_DROPS } from './liquid.js';
import { isSoftBody, softFromBody, softDistance, DEFAULT_SOFT_SUBDIVISIONS } from './soft-body.js';
import { isFlexible, createRope, ropeAnchor, ropeBuildKey, rebuildRope } from './rope.js';
import { PhysicsTimeline, defaultTimeline } from './physics-timeline.js';
import { createTimelineEditor } from './timeline-editor.js';
import { paintRestitution } from './surface-restitution.js';
import { createSurfaceBrush } from './friction-brush.js';
import { findBrushSurface } from './surface-brush-target.js';
import { paintSurface, surfaceFrame } from './surface-friction.js';
import { t, LocalizedError, errorMessage, getLocale, languages, localizeDOM, messageText, onLocaleChange, setLocale, setMessage } from './i18n.js';
import { angleBisector, arcTypes, bisectorTypes, derivedLines, derivedLineTypes, distance, distanceToObject, intersections, isLinear, isPoint, isTangentCurve, linearDirection, linearTypes, midpoint, perpendicularBisector, projectPointOnObject, ratioPoint, resolveObjects } from './geometry.js';
import { scaleBounds, toScreen, toWorld, zoomView } from './projection.js';
import { GeometryRenderer } from './renderer.js';
import { buildScene } from './scene.js';
import { compileEquation, equationToLatex, expressionToLatex } from './plot/formula.js';
import { PlotManager } from './plot/manager.js';
import { compileParametric } from './plot/parametric-formula.js';
import { isPlot } from './plot/types.js';
import { bindMathInput, focusMathInput, initializeMathInput, latexToSource } from './math-input.js';
import { createObjectMenu } from './object-menu.js';
import { createObjectStatus, updateObjectStatus } from './object-status.js';
import { IntersectionTracker, intersectionContext, intersectionKey } from './intersection-tracker.js';
import { equationGeometryIntersections } from './equation-intersections.js';
import { objectColor } from './object-style.js';
import { getTheme, getThemeSelection, listThemes, onThemeChange, setTheme, readThemeConfiguration, applyThemeConfiguration } from './themes.js';
import { objectsInBox, screenBox } from './selection.js';
import { isBoundary, RegionManager, regionContains, SNAPSHOT_CELL } from './regions.js';
import { conicTypes, createConic, isConic, isPolarCurve, polarLine, polePoint } from './conics.js';
import { isMeasurement, measurementDistance, measurementLayout, measurementText, regionMeasurement, resolveMeasurement } from './measurements.js';
import { TraceManager } from './traces.js';
import { createDocument, documentKey, parseDocument, reconcileDocument } from './document.js';
import { compactDocument, expandDocument, rememberRegionConstruction, recordConstructionStep, recordConstructionSync } from './compact-document.js';
import { createDocumentEditor } from './document-editor.js';
import { createProject } from './project-file.js';
import { createProjectMenu } from './project-menu.js';
import { createRatioDialog } from './ratio-dialog.js';
import { circularPreview } from './construction-preview.js';
import { cadPrimitives, cadTools, computeCadCorner, cornerSides, isCad, lineCorner, resolveCadCorner, trimCadSources } from './cad.js';
import { arcConnectionParameters, isArcSource } from './arc-connection.js';
import { snapToGrid, touchAim, pinchView } from './grid-snap.js';
import { createSnapSettings } from './snap-settings.js';
import { createMobileUI } from './mobile-ui.js';
import { createTouchInteraction } from './touch-interaction.js';
import { createCadEditor } from './cad-editor.js';
import { PhysicsWorld, PHYSICS_STEP, isPhysicsBody, isPhysicsObject, instantiateRegion, bodyContains, bodyState } from './physics.js';
import { syncPhysicsBoundaries } from './physics-boundaries.js';
import { createPhysicsEditor } from './physics-editor.js';
import { createRegionEditor } from './region-editor.js';
import { instanceCell } from './region-options.js';
import { ReflectionManager } from './reflection-manager.js';
import { createReflectionEditor } from './reflection-editor.js';
import { formulaParameters, hasBindings, hasScript, isJavaScript, needsReflection, reflectionSource, variableRoot } from './reflection.js';

const element = id => document.getElementById(id);
localizeDOM();
const setHint = (key = '', values = {}) => setMessage(element('hint'), key ? { key, values } : '');
const canvas = element('canvas');
const textLayer = element('text-layer');
const draftTemplate = element('equation-form').cloneNode(true);
const tools = [
  { id: 'select', get name() { return t('tool.select'); }, key: 'V', icon: '<path d="m7 3 13 11-7 1-3 7Z"/>' },
  { id: 'points', get name() { return t('tool.points'); }, key: 'P', icon: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3m0 12v3M3 12h3m12 0h3"/>', children: [
    { id: 'point', get name() { return t('tool.point'); }, get description() { return t('description.point'); }, key: 'P', smart: false, icon: '<circle cx="12" cy="12" r="3"/><path d="M12 4v3m0 6v3M4 12h3m6 0h3"/>' },
    { id: 'snapPoint', get name() { return t('tool.snapPoint'); }, get description() { return t('description.snapPoint'); }, key: 'O', smart: true, icon: '<circle cx="12" cy="12" r="3"/><path d="M4 12h5m6 0h5M12 4v5m0 6v5"/>' },
    { id: 'smartPoint', get name() { return t('tool.smartPoint'); }, get description() { return t('description.smartPoint'); }, key: '⇧P', smart: true, icon: '<circle cx="12" cy="12" r="3"/><path d="M5 5 9 9m6 6 4 4M19 5l-4 4M9 15l-4 4"/>' },
    { id: 'intersection', get name() { return t('tool.intersection'); }, get description() { return t('description.intersection'); }, key: 'I', icon: '<path d="m4 5 16 14M5 21 14 2"/><circle cx="11" cy="11" r="2.5"/>' },
    { id: 'midpoint', get name() { return t('tool.midpoint'); }, get description() { return t('description.midpoint'); }, key: '⇧M', icon: '<path d="M4 17 20 7m-11 4 2 4m2-6 2 4"/><circle cx="4" cy="17" r="1.8"/><circle cx="20" cy="7" r="1.8"/><circle cx="12" cy="12" r="2.8"/>' },
    { id: 'ratioPoint', get name() { return t('tool.ratioPoint'); }, get description() { return t('description.ratioPoint'); }, key: '⇧I', icon: '<path d="M3 18 21 6m-14 7 2 4m6-10 2 4"/><circle cx="3" cy="18" r="1.7"/><circle cx="21" cy="6" r="1.7"/><circle cx="9" cy="14" r="2.8"/>' },
  ] },
  { id: 'linear', get name() { return t('tool.linear'); }, key: 'L', icon: '<path d="M3 20 21 4"/><circle cx="6" cy="17" r="1.6"/><circle cx="18" cy="7" r="1.6"/>', children: [
    { id: 'line', get name() { return t('tool.line'); }, get description() { return t('description.line'); }, key: 'L', icon: '<path d="M2 22 22 2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="7" r="2"/>' },
    { id: 'segment', get name() { return t('tool.segment'); }, get description() { return t('description.segment'); }, key: 'S', icon: '<path d="M5 19 19 5"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="5" r="2.2"/>' },
    { id: 'ray', get name() { return t('tool.ray'); }, get description() { return t('description.ray'); }, key: 'R', icon: '<path d="M5 19 21 3m-6 0h6v6"/><circle cx="5" cy="19" r="2.3"/>' },
    { id: 'parallel', get name() { return t('tool.parallel'); }, get description() { return t('description.referenceLine'); }, key: '⇧L', icon: '<path d="m3 12 13-9M8 21l13-9m-14-1 3 1-1-3m3 9 3 1-1-3"/><circle cx="16" cy="15.5" r="2.2"/>' },
    { id: 'perpendicular', get name() { return t('tool.perpendicular'); }, get description() { return t('description.referenceLine'); }, key: '⇧N', icon: '<path d="M3 18 21 9M7 3l9 18m-7-6 4.5-2.2 2.2 4.5"/><circle cx="9" cy="7" r="2.2"/>' },
    { id: 'perpendicularBisector', get name() { return t('tool.perpendicularBisector'); }, get description() { return t('description.perpendicularBisector'); }, key: '⇧S', icon: '<path d="M3 16h18M12 3v19m0-11h5v5M7 13v6m10-6v6"/><circle cx="3" cy="16" r="1.6"/><circle cx="21" cy="16" r="1.6"/>' },
    { id: 'innerBisector', get name() { return t('tool.innerBisector'); }, get description() { return t('description.bisector'); }, key: 'D', icon: '<path d="m20 4-16 16h18M4 20 22 12"/><path d="M10 14a8 8 0 0 1 2 6m-4-3 2 2m1-6 2 2"/><circle cx="4" cy="20" r="1.7"/>' },
    { id: 'outerBisector', get name() { return t('tool.outerBisector'); }, get description() { return t('description.bisector'); }, key: '⇧D', icon: '<path d="m20 4-12 12h14M8 16 2 2"/><path d="M8 16 2 22" stroke-dasharray="2 2"/><path d="M3 11a7 7 0 0 1 10-1"/><circle cx="8" cy="16" r="1.7"/>' },
    { id: 'tangent', get name() { return t('tool.tangent'); }, get description() { return t('description.tangent'); }, key: 'T', icon: '<circle cx="10" cy="13" r="7"/><path d="m5 1 18 18"/><circle cx="15" cy="8" r="2.2"/>' },
  ] },
  { id: 'circles', get name() { return t('tool.circles'); }, key: 'C', icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.6"/><path d="M17.7 6.3 20 4"/>', children: [
    { id: 'circle', get name() { return t('tool.circle'); }, get description() { return t('description.circle'); }, key: 'C', requiredPoints: 2, shapeType: 'circle', icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="7" r="2"/>' },
    { id: 'circleRadius', get name() { return t('tool.circleRadius'); }, get description() { return t('description.circleRadius'); }, key: '⇧C', requiredPoints: 2, shapeType: 'circle', icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.7"/><path d="M12 12 19 6"/>' },
    { id: 'circle3', get name() { return t('tool.circle3'); }, get description() { return t('description.circle3'); }, key: '3C', requiredPoints: 3, shapeType: 'circle', construction: 'three-point', icon: '<circle cx="12" cy="12" r="8"/><circle cx="6" cy="16" r="1.8"/><circle cx="18" cy="16" r="1.8"/><circle cx="14" cy="5" r="1.8"/>' },
    { id: 'semicircle', get name() { return t('tool.semicircle'); }, get description() { return t('description.semicircle'); }, key: 'M', requiredPoints: 2, shapeType: 'semicircle', icon: '<path d="M4 17a8 8 0 0 1 16 0"/><path d="M4 17h16"/><circle cx="4" cy="17" r="1.5"/><circle cx="20" cy="17" r="1.5"/>' },
    { id: 'arc', get name() { return t('tool.arc'); }, get description() { return t('description.arc'); }, key: 'A', requiredPoints: 3, shapeType: 'arc', icon: '<path d="M5 17a8 8 0 0 1 14-5"/><circle cx="5" cy="17" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>' },
    { id: 'circumArc', get name() { return t('tool.circumArc'); }, get description() { return t('description.circumArc'); }, key: '⇧A', requiredPoints: 3, shapeType: 'circumArc', construction: 'three-point', icon: '<path d="M4 16a9 9 0 0 1 16-5"/><circle cx="4" cy="16" r="1.7"/><circle cx="12" cy="5" r="1.7"/><circle cx="20" cy="11" r="1.7"/>' },
    { id: 'sector', get name() { return t('tool.sector'); }, get description() { return t('description.arc'); }, key: 'E', requiredPoints: 3, shapeType: 'sector', icon: '<path d="M12 12 5 18a8 8 0 0 0 14-7Z"/><circle cx="12" cy="12" r="1.7"/>' },
    { id: 'circumSector', get name() { return t('tool.circumSector'); }, get description() { return t('description.circumArc'); }, key: '⇧E', requiredPoints: 3, shapeType: 'circumSector', construction: 'three-point', icon: '<path d="M12 12 5 18a8 8 0 0 0 14-7Z"/><circle cx="5" cy="18" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="20" cy="11" r="1.6"/>' },
  ] },
  { id: 'conics', get name() { return t('tool.conics'); }, key: 'G', children: [
    { id: 'ellipse', get name() { return t('tool.ellipse'); }, get description() { return t('description.ellipse'); }, key: 'G', requiredPoints: 3, icon: '<ellipse cx="12" cy="12" rx="10" ry="6.5" transform="rotate(-25 12 12)"/><circle cx="7.5" cy="14" r="1.5"/><circle cx="16.5" cy="10" r="1.5"/>' },
    { id: 'parabola', get name() { return t('tool.parabola'); }, get description() { return t('description.parabola'); }, key: 'J', icon: '<path d="M4 3c2 22 14 22 16 0M3 18h18"/><circle cx="12" cy="10" r="1.8"/>' },
    { id: 'hyperbola', get name() { return t('tool.hyperbola'); }, get description() { return t('description.ellipse'); }, key: '⇧G', requiredPoints: 3, icon: '<path d="M3 3c12 9 12 9 0 18M21 3c-12 9-12 9 0 18"/><circle cx="5" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>' },
    { id: 'pole', get name() { return t('tool.pole'); }, get description() { return t('description.pole'); }, key: '⇧T', icon: '<ellipse cx="10" cy="14" rx="7" ry="5"/><path d="m2 5 19 6M17 3v3m-1.5-1.5h3"/><circle cx="17" cy="4.5" r="2.3"/>' },
    { id: 'polar', get name() { return t('tool.polar'); }, get description() { return t('description.polar'); }, key: '⇧J', icon: '<ellipse cx="10" cy="14" rx="7" ry="5"/><path d="m2 6 20 5"/><circle cx="18" cy="3" r="1.8"/><path d="m18 5-3 7" stroke-dasharray="2 2"/>' },
  ] },
  { id: 'cad', get name() { return t('tool.cad'); }, key: 'N', icon: '<path d="M3 21V4h17M3 15a6 6 0 0 0 6 6h12M14 4v6h6"/>', children: [
    { id: 'fillet', get name() { return t('tool.fillet'); }, get description() { return t('description.fillet'); }, key: 'N', icon: '<path d="M3 21V11a8 8 0 0 1 8-8h10"/><path d="M3 3h8M3 3v8" stroke-dasharray="2 2"/><circle cx="11" cy="11" r="1.2"/>' },
    { id: 'chamfer', get name() { return t('tool.chamfer'); }, get description() { return t('description.chamfer'); }, key: '⇧R', icon: '<path d="M4 3v10l7 7h10"/><path d="M4 13v7h7" stroke-dasharray="2 2"/>' },
    { id: 'arcConnection', get name() { return t('tool.arcConnection'); }, get description() { return t('description.arcConnection'); }, key: '⇧K', icon: '<path d="M2 7a5 5 0 0 1 8 4m4 0a5 5 0 0 1 8-4M10 11a2 2 0 0 0 4 0"/><circle cx="10" cy="11" r="1"/><circle cx="14" cy="11" r="1"/>' },
  ] },
  { id: 'fills', get name() { return t('tool.fills'); }, children: [
    { id: 'fillSingle', get name() { return t('tool.fillSingle'); }, get description() { return t('description.fillSingle'); }, key: 'B', icon: '<path d="m4 10 7-7 9 9-7 7a2.8 2.8 0 0 1-4 0l-5-5a2.8 2.8 0 0 1 0-4ZM8 2l6 6M4 12h16"/><path d="M20 15s-2 2.5-2 3.8a2 2 0 0 0 4 0C22 17.5 20 15 20 15Z" fill="currentColor" fill-opacity=".22"/>' },
    { id: 'fillMultiple', get name() { return t('tool.fillMultiple'); }, get description() { return t('description.fillMultiple'); }, key: '⇧B', icon: '<path d="M3 9h12v12H3ZM15 16a7 7 0 1 0-7-7"/><path d="M8 9h7v7a7 7 0 0 1-7-7Z" fill="currentColor" fill-opacity=".22"/><path d="m9 12 3-3m-2 6 5-5m-2 6 2-2"/>' },
  ] },
  { id: 'measurements', get name() { return t('tool.measurements'); }, key: 'F', children: [
    { id: 'measureLength', get name() { return t('tool.measureLength'); }, get description() { return t('description.measureLength'); }, key: 'F', icon: '<path d="m3 16 14-14 5 5L8 21Zm3-3 3 3m0-6 2 2m1-5 3 3m0-6 2 2"/><path d="m2 22 4-1"/>' },
    { id: 'measureAngleInner', get name() { return t('tool.measureAngleInner'); }, get description() { return t('description.measureAngle'); }, key: 'Q', angleMode: 'inner', icon: '<path d="M21 5 4 20h18M10 15a8 8 0 0 1 2 5"/><circle cx="4" cy="20" r="1.5"/>' },
    { id: 'measureAngleReflex', get name() { return t('tool.measureAngleReflex'); }, get description() { return t('description.reflex'); }, key: '⇧Q', angleMode: 'reflex', icon: '<path d="M20 6 8 17h14M12 11a6 6 0 1 0 3 10"/><path d="m12 21 3 0-1 3"/><circle cx="8" cy="17" r="1.5"/>' },
    { id: 'measureAngleSupplementary', get name() { return t('tool.measureAngleSupplementary'); }, get description() { return t('description.supplementary'); }, key: '⇧F', angleMode: 'supplementary', icon: '<path d="M2 20h20M12 20 20 5M5 20a7 7 0 0 1 10-6"/><circle cx="12" cy="20" r="1.5"/>' },
    { id: 'measureArea', get name() { return t('tool.measureArea'); }, get description() { return t('description.measureArea'); }, key: 'Z', icon: '<path d="m4 8 9-5 8 7-5 11-12-5ZM5 13l10-8m-9 12 13-10m-8 12 9-8"/><path d="M3 3h4M3 3v4m18 14h-4m4 0v-4"/>' },
  ] },
  { id: 'physics', get name() { return t('tool.physics'); }, key: 'Y', children: [
    { id: 'rope', key: 'Y', get name() { return t('tool.rope'); }, get description() { return t('rope.hint'); }, icon: '<path d="M3 5c0 16 18 16 18 0"/><circle cx="3" cy="5" r="2"/><circle cx="21" cy="5" r="2"/>' },
    { id: 'spring', key: '⇧Y', get name() { return t('tool.spring'); }, get description() { return t('spring.hint'); }, icon: '<path d="M2 12h3c2 0 1-8 3-8s0 16 3 16 0-16 3-16 0 16 3 16 1-8 3-8h2"/>' },
    { id: 'physicsDrag', key: '⇧H', get name() { return t('tool.physicsDrag'); }, get description() { return t('drag.hint'); }, icon: '<path d="M5 3v13l4-4 4 8 3-2-4-7h6ZM17 4h5m-2-2 2 2-2 2"/>' },
    { id: 'frictionBrush', key: 'W', get name() { return t('tool.frictionBrush'); }, get description() { return t('friction.note'); }, icon: '<path d="m14 3 7 7-10 10-7 1 1-7ZM4 21h17M12 5l7 7"/><path d="M3 9h4m-2-2v4"/>' },
    { id: 'restitutionBrush', key: '⇧W', get name() { return t('tool.restitutionBrush'); }, get description() { return t('restitution.note'); }, icon: '<path d="m14 3 7 7-10 10-7 1 1-7ZM12 5l7 7M3 22h19M3 9l2-3 2 3 2-3"/>' },
  ] },
  { id: 'pan', get name() { return t('tool.pan'); }, key: 'H', icon: '<path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3-3 3-3m14 6 3-3 3 3"/>' },
  { id: 'parametric', get name() { return t('tool.parametric'); }, key: 'U', icon: '<path d="M5 19V5m0 14h16M7 14c2-10 11-11 11-4s-9 10-9 4 10-7 11-2"/><path d="m3 7 2-2 2 2m12 10 2 2-2 2"/>' },
  { id: 'javascript', get name() { return t('tool.javascript'); }, key: '⇧U', icon: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-2-16-4 20"/>' },
  { id: 'slider', get name() { return t('tool.slider'); }, key: 'K', icon: '<path d="M4 7h16M4 17h16"/><circle cx="14" cy="7" r="2.5"/><circle cx="9" cy="17" r="2.5"/>' },
];
const toolItems = tools.flatMap(tool => tool.children || [tool]);
const toolGroups = new Map(tools.filter(tool => tool.children).map(tool => [tool.id, tool]));
const toolParents = new Map(tools.flatMap(tool => (tool.children || []).map(child => [child.id, tool])));
const lastToolByGroup = new Map([...toolGroups].map(([id, group]) => [id, group.children[0].id]));
const toolById = new Map(toolItems.map(tool => [tool.id, tool]));
const labels = { point: 'object.point', snapPoint: 'tool.snapPoint', smartPoint: 'tool.smartPoint', intersection: 'tool.intersection', midpoint: 'tool.midpoint', ratioPoint: 'tool.ratioPoint', line: 'tool.line', segment: 'tool.segment', ray: 'tool.ray', parallel: 'tool.parallel', perpendicular: 'tool.perpendicular', tangent: 'tool.tangent', circle: 'object.circle', semicircle: 'tool.semicircle', arc: 'tool.arc', circumArc: 'tool.circumArc', sector: 'tool.sector', circumSector: 'tool.circumSector' };
Object.assign(labels, { fillet: 'tool.fillet', chamfer: 'tool.chamfer', arcConnection: 'tool.arcConnection' });
Object.assign(labels, { ellipse: 'tool.ellipse', parabola: 'tool.parabola', hyperbola: 'tool.hyperbola', pole: 'tool.pole', polar: 'tool.polar' });
Object.assign(labels, { perpendicularBisector: 'tool.perpendicularBisector', innerBisector: 'tool.innerBisector', outerBisector: 'tool.outerBisector' });
Object.assign(labels, { lengthMeasure: 'object.length', angleMeasure: 'object.angle', areaMeasure: 'object.area' });
const measurementTools = new Set(['measureLength', 'measureAngleInner', 'measureAngleReflex', 'measureAngleSupplementary', 'measureArea']);
const shapeTypes = new Set([...linearTypes, 'circle', ...arcTypes, ...conicTypes]);
const dualConstructionTools = new Set(['parabola', 'polar', 'pole']);
const number = value => value === 0 ? '0' : Number(value.toPrecision(8)).toString();
let objects = [];
let documentExtras = {};
let documentEditor = null;
let resolved = new Map();
const intersectionTracker = new IntersectionTracker();
const equationIntersectionCache = new Map();
let activeTool = 'select';
let selected = null;
let selection = new Set();
let hovered = null;
let pending = null;
let pointer = null;
let gesture = null;
let spaceHeld = false;
let width = 0;
let height = 0;
let view = { x: 0, y: 0, scale: 65 };
let renderer = null;
let touchInteraction = null;
let mobileUI = null;
let forcedHit = null;
let touchPreview = false;
let hitRadius = 1;
const snapSettings = createSnapSettings(element('snap-options'), draw);
let frame = 0;
const ripples = [];
const ratioDialog = createRatioDialog({
  preview(ratio) { if (pending?.ratioInput) { pending.ratio = ratio; draw(); } },
  submit: finishRatioPoint,
  cancel() { cancelPending(); setHint(''); refresh(); canvas.focus(); },
});
const cadEditors = new WeakMap();
const physicsEditors = new WeakMap();
const regionEditors = new WeakMap();
const reflectionEditors = new WeakMap();
const physics = new PhysicsWorld();
const timeline = new PhysicsTimeline(physics);
let physicsSession = null;
let physicsReplay = 0;
let physicsReplayBefore = null;
const history = [];
const future = [];
const snapshot = () => JSON.stringify({ objects, extras: documentExtras, timeline: timeline.state, environment: readEnvironment() });
function restoreSnapshot(text) {
  reflection.invalidate();
  physics.invalidate();
  const saved = JSON.parse(text);
  objects = saved.objects;
  documentExtras = saved.extras;
  timeline.setState(saved.timeline || defaultTimeline());
  if (saved.environment) applyEnvironment(saved.environment);
}
const screenToWorld = point => toWorld(point, view, width, height);
const plots = new PlotManager(draw);
const reflection = new ReflectionManager({
  read: readDocument, resolved: () => resolved,
  apply(updates) {
    const changed = new Set();
    for (const update of updates) {
      const object = objects.find(item => item.id === update.id);
      if (!needsReflection(object) || reflectionSource(object) !== update.source) continue;
      const patch = update.patch;
      if (Object.keys(patch).every(key => documentKey(object[key]) === documentKey(patch[key]))) continue;
      Object.assign(object, patch);
      if (['source', 'xSource', 'ySource'].some(key => Object.hasOwn(patch, key))) {
        for (const key of ['latex', 'xLatex', 'yLatex', 'draft', 'invalid', 'error']) delete object[key];
      }
      changed.add(object.id);
    }
    if (changed.size) refresh(changed);
  },
  changed: () => renderObjects(),
});
function syncReflection() {
  if (objects.some(needsReflection) || reflection.statuses.size) reflection.sync();
}
const scriptClockOnly = () => objects.some(hasScript) && !objects.some(isPhysicsObject);
function playTimeline() {
  if (scriptClockOnly()) { timeline.state.running = true; timeline.resetClock(); }
  else timeline.play(objects);
}
function tickTimeline(now) {
  if (!scriptClockOnly()) return timeline.tick(now, objects);
  if (!timeline.state.running) { timeline.resetClock(); return new Set(); }
  if (timeline.lastFrame === null) timeline.lastFrame = now;
  timeline.accumulator += Math.min(.1, Math.max(0, (now - timeline.lastFrame) / 1000)) * timeline.state.playbackRate;
  timeline.lastFrame = now;
  const steps = Math.floor((timeline.accumulator + 1e-12) / PHYSICS_STEP);
  timeline.accumulator -= steps * PHYSICS_STEP;
  timeline.frame += steps;
  if (timeline.state.duration > 0 && timeline.frame * PHYSICS_STEP >= timeline.state.duration) {
    timeline.frame = Math.floor(timeline.state.duration / PHYSICS_STEP); timeline.state.running = false;
  }
  timeline.state.time = timeline.frame * PHYSICS_STEP;
  return new Set();
}
const regions = new RegionManager(draw);
const surfaceBrushes = {
  frictionBrush: createSurfaceBrush(element('canvas-wrap'), draw, 'friction'),
  restitutionBrush: createSurfaceBrush(element('canvas-wrap'), draw, 'restitution'),
};
const traces = new TraceManager();
let regionRequest = 0;
let editingSession = null;
const sliderEdits = new Map();
const sliderAnimations = new Map();
let objectStyleSession = null;

function finishObjectStyleEdit() {
  if (!objectStyleSession) return;
  const before = objectStyleSession.before;
  objectStyleSession = null;
  commit(before);
}

function triggerRipple(position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
  ripples.push({ x: position.x, y: position.y, started: performance.now(), duration: 520 });
  draw();
}
const objectMenu = createObjectMenu({
  openTimeline: point => syncTimeline.open(point),
  get: id => objects.find(object => object.id === id),
  all: () => objects,
  defaults: () => plots.options,
  endStyle: finishObjectStyleEdit,
  clearTraces: () => { traces.clear(); draw(); },
  instantiate: instantiatePhysicsBody,
  liquefy: id => instantiatePhysicsBody(id, true),
  soften: id => instantiatePhysicsBody(id,'soft'),
  refineRegion,
  changeStyle: (id, update) => {
    pausePhysics();
    const object = objects.find(item => item.id === id);
    if (!object) return;
    if (objectStyleSession?.id !== id) {
      finishObjectStyleEdit();
      objectStyleSession = { id, before: snapshot() };
    }
    update(object);
    refresh(new Set([id]));
  },
  change: (id, update) => {
    pausePhysics();
    const object = objects.find(item => item.id === id);
    if (!object) return;
    const before = snapshot();
    update(object);
    commit(before);
  },
  remove: removeObject,
  edit: id => {
    const row = element('objects').querySelector(`[data-id="${id}"]`);
    if (isJavaScript(objects.find(object => object.id === id))) row?.querySelector('.script-source')?.focus();
    else focusMathInput(row?.querySelector('math-field'));
  },
  duplicate: id => {
    pausePhysics();
    const original = objects.find(object => object.id === id);
    if (!original) return;
    const before = snapshot();
    const object = { ...structuredClone(original), id: crypto.randomUUID(), name: isJavaScript(original) ? nextVariableName() : original.type === 'parametric' ? nextParametricName() : nextEquationName() };
    objects.push(object);
    selected = object.id;
    commit(before);
  },
});

function pausePhysics() {
  if (gesture?.mode === 'physicsForce') releasePhysicsDrag(false);
  physics.endDrag();
  physicsReplay++;
  if (!physicsSession && !physicsReplayBefore && !timeline.state.running && !objects.some(object => isPhysicsObject(object) && object.running)) return;
  for (const object of objects) if (isPhysicsObject(object)) object.running = false;
  physics.lastFrame = null;
  timeline.pause(objects);
  const before = physicsSession?.before || physicsReplayBefore;
  physicsSession = null;
  physicsReplayBefore = null;
  if (before) commit(before); else refresh();
}

async function instantiatePhysicsBody(id, mode = false) {
  const liquid=mode===true,soft=mode==='soft';
  pausePhysics(); finishObjectEdit(); finishObjectStyleEdit(); cancelPending();
  const source = objects.find(object => object.id === id && object.type === 'region');
  if (!source) return;
  const softSubdivisions=source.softSubdivisions??DEFAULT_SOFT_SUBDIVISIONS;
  const request = ++regionRequest;
  setHint('region.refining');
  while (regions.entries.get(id)?.desired && !regions.entries.get(id).desired.ready) {
    await new Promise(resolve => setTimeout(resolve, 40));
    if (request !== regionRequest || !objects.includes(source)) return;
  }
  const cell = liquid ? Math.max(.5, instanceCell(source, window.devicePixelRatio)) : instanceCell(source, window.devicePixelRatio);
  const region = await regions.refine(id, cell, { publish: false });
  if (request !== regionRequest || !objects.includes(source)) return;
  if (cell !== (liquid ? Math.max(.5, instanceCell(source, window.devicePixelRatio)) : instanceCell(source, window.devicePixelRatio))) { setHint('hint.changedBoundary'); return; }
  if(soft&&softSubdivisions!==(source.softSubdivisions??DEFAULT_SOFT_SUBDIVISIONS)){setHint('hint.changedBoundary');return;}
  const body = instantiateRegion(region, view, width, height);
  const object = soft ? softFromBody(body,softSubdivisions) : liquid ? liquidFromBody(body, source.liquidDrops ?? DEFAULT_LIQUID_DROPS) : body;
  if (!object) { setHint(soft?'soft.meshFailed':'physics.notReady'); return; }
  const before = snapshot();
  object.id = crypto.randomUUID();
  let index = 1;
  const prefix=soft?'soft':liquid?'liquid':'body';
  while (objects.some(item => item.name === `${prefix}${index}`)) index++;
  object.name = `${prefix}${index}`;
  object.color = source.color || null;
  rememberRegionConstruction(object, source, objects, region, soft ? 'soft' : liquid ? 'liquid' : 'rigid', { view, width, height });
  objects.push(object); selected = object.id; selection.clear();
  setHint(''); setTool('select'); commit(before, new Set([object.id]));
  element('objects').querySelector(`[data-id="${object.id}"]`)?.scrollIntoView({ block: 'nearest' });
}

// Subdivide actual geometry to 1/8 of a device pixel, with a bounded DPR.
function subdivisionCell() { return SNAPSHOT_CELL / Math.max(1, Math.min(4, window.devicePixelRatio || 1)); }

async function refineRegion(id) {
  pausePhysics(); finishObjectEdit(); finishObjectStyleEdit();
  const source = objects.find(object => object.id === id && object.type === 'region');
  if (!source) return;
  const request = ++regionRequest;
  setHint('region.refining');
  while (regions.entries.get(id)?.desired && !regions.entries.get(id).desired.ready) {
    await new Promise(resolve => setTimeout(resolve, 40));
    if (request !== regionRequest || !objects.includes(source)) return;
  }
  const cell = subdivisionCell();
  const result = await regions.refine(id, cell);
  if (request !== regionRequest || !objects.includes(source)) return;
  if (!result) { setHint('hint.changedBoundary'); return; }
  const before = snapshot();
  source.subdivision = cell;
  setHint('');
  commit(before, new Set([id]));
}

const syncTimeline = createTimelineEditor(element('canvas-wrap'), {
  uiChanged: () => documentEditor?.sync(),
  get: () => timeline.state, all: () => objects,
  command: timelineCommand,
  change(update) {
    pausePhysics();
    const before = snapshot(); update(timeline.state); timeline.resetClock(); commit(before, new Set());
  },
});

function constructionScene() {
  const plotRecipes = {};
  for (const object of selectableObjects().filter(isPlot)) {
    const task = object.plot || plots.get(object.id);
    if (task?.view) plotRecipes[object.id] = { view: task.view, width: task.width, height: task.height, options: task.options, work: task.work || 0 };
  }
  return {
    definitions: createDocument(objects.filter(object => !isPhysicsObject(object)), { plotDefaults: plots.options, resolved }).objects,
    plots: plotRecipes, view: { ...view }, width, height,
  };
}
physics.recordStep = seconds => recordConstructionStep(physics, objects, constructionScene(), seconds);
physics.recordSync = current => recordConstructionSync(physics, current, constructionScene());

async function timelineCommand(command, value) {
  if (physicsReplayBefore) { pausePhysics(); if (command === 'play') return; }
  finishObjectEdit(); finishObjectStyleEdit();
  if (scriptClockOnly()) {
    if (command === 'play') {
      if (timeline.state.running) { pausePhysics(); return; }
      physicsSession ||= { before: snapshot() };
      if (timeline.state.duration > 0 && timeline.state.time >= timeline.state.duration - PHYSICS_STEP) timeline.setState({ ...timeline.state, time: 0, running: false });
      playTimeline(); refresh(); return;
    }
    pausePhysics();
    const before = snapshot();
    const limit = timeline.state.duration > 0 ? timeline.state.duration : Infinity;
    const time = command === 'reset' ? 0 : command === 'step' ? timeline.state.time + PHYSICS_STEP : value;
    if (!Number.isFinite(time) || time < 0) return;
    timeline.setState({ ...timeline.state, time: Math.min(limit, Math.round(time / PHYSICS_STEP) * PHYSICS_STEP), running: false });
    commit(before, new Set()); return;
  }
  if (!objects.some(isPhysicsObject)) return;
  if (command === 'play') {
    if (objects.some(object=>isPhysicsObject(object)&&object.running)) { pausePhysics(); return; }
    if (timeline.state.duration > 0 && timeline.state.time >= timeline.state.duration - PHYSICS_STEP) {
      timeline.reset(objects);
    }
    physicsSession ||= { before: snapshot() };
    for (const object of objects.filter(isPhysicsObject)) if (object.time === 0) object.initialState = bodyState(object);
    playTimeline(); refresh(); return;
  }
  pausePhysics();
  const before = snapshot();
  physics.anchors = resolved;
  syncPhysicsBoundaries(physics, selectableObjects(), view, width, height);
  if (command === 'reset') timeline.reset(objects);
  else if (command === 'step') {
    timeline.play(objects);
    if (!timeline.state.duration || timeline.state.time + PHYSICS_STEP <= timeline.state.duration + 1e-9) timeline.advance(objects);
    timeline.pause(objects);
  } else if (command === 'seek') {
    const token = ++physicsReplay;
    physicsReplayBefore = before;
    const complete = await timeline.seek(value, objects, {
      cancelled: () => token !== physicsReplay,
      yieldControl: async () => {
        resolved = resolveObjects(objects, resolved, new Set(objects.filter(isPhysicsObject).map(object=>object.id)), intersectionTracker);
        renderObjects(); syncTimeline(); documentEditor?.sync();
        // Avoid entering the animation loop while a seek owns the solver.
        await new Promise(resolve=>setTimeout(resolve,0));
      },
    });
    if (!complete || token !== physicsReplay) return;
    physicsReplayBefore = null;
  }
  commit(before, new Set(objects.filter(isPhysicsObject).map(object=>object.id)));
}

async function physicsCommand(id, command, value) {
  if (physicsReplayBefore) pausePhysics();
  finishObjectEdit(); finishObjectStyleEdit();
  const object = objects.find(item => item.id === id && isPhysicsObject(item));
  if (!object) return;
  if (command === 'play') {
    physicsReplay++;
    if (object.running) {
      object.running = false;
      if (!objects.some(item => isPhysicsObject(item) && item.running)) pausePhysics();
      else refresh(new Set([id]));
    } else {
      physicsSession ||= { before: snapshot() };
      if (object.duration && object.time >= object.duration) object.time = 0;
      if (object.time === 0) object.initialState = bodyState(object);
      object.running = true;
      physics.lastFrame = null;
      timeline.resetClock();
      refresh(new Set([id]));
    }
    return;
  }
  pausePhysics();
  const before = snapshot();
  if (command === 'reset' || command === 'seek') {
    Object.assign(object, structuredClone(object.initialState), { time: 0, running: false });
    physics.invalidate();
  }
  if (command === 'step' || command === 'seek') {
    const token = ++physicsReplay;
    if (command === 'seek') physicsReplayBefore = before;
    physics.anchors = resolved;
    syncPhysicsBoundaries(physics, selectableObjects(), view, width, height);
    const target = command === 'step' ? Math.max(object.time, Math.min(object.time + PHYSICS_STEP * object.playbackRate, object.duration || Infinity)) : Math.min(value, object.duration || Infinity);
    let ticks = 0;
    while (object.time + 1e-9 < target && token === physicsReplay && objects.includes(object)) {
      object.running = true;
      physics.syncBodies(objects);
      physics.step(Math.min(PHYSICS_STEP, (target - object.time) / object.playbackRate));
      if (command === 'seek' && ++ticks % 120 === 0) {
        object.running = false;
        refresh(new Set([id]));
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    if (token !== physicsReplay || !objects.includes(object)) return;
    object.time = target;
    object.running = false;
    physicsReplayBefore = null;
    physics.lastFrame = null;
  }
  commit(before, new Set([id]));
}

function showError(message) {
  element('gpu-error').hidden = false;
  setMessage(element('gpu-error'), message instanceof Error ? errorMessage(message) : message);
}

function commit(before, changed = null) {
  if (before === snapshot()) { refresh(changed); return; }
  history.push(before);
  if (history.length > 100) history.shift();
  future.length = 0;
  refresh(changed);
}

function refresh(changed = null) {
  for (const id of intersectionTracker.retain(objects)) resolved.delete(id);
  const ids = new Set(objects.map(object => object.id));
  selection = new Set([...selection].filter(id => ids.has(id)));
  for (const [key, entry] of equationIntersectionCache) {
    if (!ids.has(entry.equationId) || !ids.has(entry.geometryId)) equationIntersectionCache.delete(key);
  }
  resolved = resolveObjects(objects, resolved, changed, intersectionTracker);
  if (width && height) plots.sync(objects, view, width, height);
  updateEquationIntersections();
  renderObjects();
  objectMenu.sync();
  element('undo').disabled = !history.length && !pending;
  element('redo').disabled = !future.length;
  element('touch-selection-actions').hidden = !selected;
  element('touch-cancel').hidden = !pending;
  documentEditor?.sync();
  syncReflection();
  draw();
}

function readEnvironment() {
  return {
    view: { ...view },
    display: { ...Object.fromEntries(['grid', 'axes', 'snap'].map(id => [id, element(id).checked])), snapping: snapSettings.read(), touchOffset: element('touch-offset').checked },
    settings: { locale: getLocale(), theme: getThemeSelection(), themeConfiguration: readThemeConfiguration(), plotDefaults: { ...plots.options } },
    ui: { ...documentExtras.ui, timeline: syncTimeline.read() },
  };
}

function applyEnvironment(document) {
  if (document.view) view = { ...document.view };
  if (document.display) {
    for (const id of ['grid', 'axes', 'snap']) element(id).checked = document.display[id];
    snapSettings.apply(document.display.snapping);
    element('touch-offset').checked = document.display.touchOffset ?? true;
  }
  if (document.settings?.plotDefaults) plots.configure(document.settings.plotDefaults);
  if (document.settings?.locale) setLocale(document.settings.locale);
  if (document.settings?.themeConfiguration) applyThemeConfiguration(document.settings.themeConfiguration);
  else if (document.settings?.theme) setTheme(document.settings.theme);
  if (document.ui?.timeline) syncTimeline.apply(document.ui.timeline);
}

function readDocument() {
  return compactDocument(createDocument(objects, { extras: {
    ...documentExtras, timeline: timeline.state, ...readEnvironment(),
  }, plotDefaults: plots.options, resolved }));
}

function applyDocument(document) {
  document = expandDocument(document);
  // Check reconstructibility before touching the current model. Old files
  // without a recoverable generator must never silently lose their state.
  compactDocument(document);
  const before = snapshot();
  pausePhysics();
  applyEnvironment(document);
  const { format, version, objects: definitions, timeline: nextTimeline, ...extras } = document;
  const next = reconcileDocument(objects, definitions, { plotDefaults: plots.options, resolved });
  const reordered = objects.some((object, index) => object.id !== next.objects[index]?.id);
  if (!next.changed.size && !reordered && documentKey(documentExtras) === documentKey(extras) && documentKey(timeline.state) === documentKey(nextTimeline)) return;
  reflection.invalidate({ keepCache: true });
  const seekClock = !next.changed.size && nextTimeline.time !== timeline.state.time && (objects.some(isPhysicsObject) || scriptClockOnly());
  const startClock = nextTimeline.running && !timeline.state.running;
  const branchChanges = new Set(next.objects.filter(object => {
    if (object.type !== 'intersection') return false;
    const previous = objects.find(item => item.id === object.id && item.type === 'intersection');
    const position = resolved.get(object.id);
    return previous && (previous.branch ?? 0) !== object.branch && object.position?.x === position?.x && object.position?.y === position?.y;
  }).map(object => object.id));
  // Replacing a definition also replaces the identity used by branch tracking.
  for (const id of next.changed) {
    resolved.delete(id);
    const animation = sliderAnimations.get(id);
    if (animation) cancelAnimationFrame(animation.frame);
    sliderAnimations.delete(id);
  }
  objects = next.objects;
  documentExtras = extras;
  if (seekClock) {
    // Keep the solver's playhead until seek completes, while replacing every
    // other field (including extension fields and explicit removals).
    timeline.state = { ...structuredClone(nextTimeline), time: timeline.state.time, running: false };
  } else if (timeline.state.time !== nextTimeline.time) timeline.setState(structuredClone(nextTimeline));
  else timeline.state = structuredClone(nextTimeline);
  if (startClock && !seekClock) { physicsSession ||= { before }; playTimeline(); }
  intersectionTracker.retain(objects);
  for (const object of objects) {
    if (next.changed.has(object.id) && object.type === 'intersection' && object.position && !branchChanges.has(object.id)) intersectionTracker.seed(object, object.position);
  }
  if (!objects.some(object => object.id === selected)) selected = null;
  if (!objects.some(object => object.id === hovered)) hovered = null;
  commit(before, next.changed);
  if (seekClock) void timelineCommand('seek', nextTimeline.time).then(() => {
    if (startClock) { physicsSession ||= { before }; playTimeline(); refresh(); }
  }).catch(showError);
}

function cancelPending() {
  ratioDialog.close();
  if (pending?.before) restoreSnapshot(pending.before);
  pending = null;
}

function setTool(tool) {
  touchInteraction?.close();
  if (mobileUI?.mobile) mobileUI.show(false);
  pausePhysics();
  const cadSelection = cadTools.has(tool) ? [...new Set([...selection, selected, ...(pending?.cad && tool !== activeTool ? pending.ids : [])])].map(id => resolved.get(id)).filter(object => (tool === 'arcConnection' ? isArcSource(object) : isLinear(object)) && !object.hidden) : [];
  regionRequest++;
  regions.cancelQueries();
  closeToolMenu();
  cancelPending();
  activeTool = tool;
  for (const [id, brush] of Object.entries(surfaceBrushes)) brush.show(tool === id);
  const parent = toolParents.get(tool);
  if (parent) lastToolByGroup.set(parent.id, tool);
  selected = null;
  selection.clear();
  hovered = null;
  setHint(tool === 'arcConnection' ? 'cad.selectArcs' : tool === 'physicsDrag' ? 'drag.hint' : ['rope','spring'].includes(tool) ? `${tool}.hint` : '');
  for (const button of element('tools').children) {
    const active = button.dataset.tool === tool || Boolean(button.dataset.group && toolParents.get(tool)?.id === button.dataset.group);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    if (button.dataset.group) {
      const selectedTool = toolById.get(lastToolByGroup.get(button.dataset.group));
      const icon = button.querySelector('.tool-icon svg');
      if (selectedTool && icon && icon.dataset.tool !== selectedTool.id) {
        icon.innerHTML = selectedTool.icon;
        icon.dataset.tool = selectedTool.id;
      }
      if (selectedTool) {
        button.title = t('tool.groupTitle', { name: selectedTool.name, key: selectedTool.key });
        button.setAttribute('aria-label', t('tool.groupAria', { group: toolGroups.get(button.dataset.group).name, name: selectedTool.name }));
      }
    }
  }
  canvas.style.cursor = tool === 'select' ? 'default' : tool === 'pan' ? 'grab' : 'crosshair';
  if (cadSelection.length === 1 || cadSelection.length === 2) {
    pending = { cad: true, ids: [cadSelection[0].id], positions: [tool === 'arcConnection' ? cadSelection[0].arcStart || cadSelection[0].second : midpoint(cadSelection[0].first, cadSelection[0].second)], before: snapshot() };
    setHint(tool === 'arcConnection' ? 'cad.secondArc' : 'cad.secondLine');
  }
  refresh();
  if (cadSelection.length === 2) constructCadCorner(null, cadSelection[1]);
}

function newPoint(position, type = 'point') {
  let index = 0;
  const names = new Set(objects.filter(isPoint).map(object => object.name));
  const name = value => String.fromCharCode(65 + value % 26) + (value >= 26 ? Math.floor(value / 26) : '');
  while (names.has(name(index))) index++;
  const point = { id: crypto.randomUUID(), type, name: name(index), ...position };
  objects.push(point);
  resolved.set(point.id, { ...point });
  triggerRipple(position);
  return point;
}

function nextParametricName() {
  let index = 1;
  while (objects.some(object => object.name === `c${index}`)) index++;
  return `c${index}`;
}

function createParametric() {
  if (gesture) return;
  finishObjectEdit();
  setTool('select');
  const before = snapshot();
  const object = { id: crypto.randomUUID(), type: 'parametric', name: nextParametricName(), xSource: 'cos(t)', ySource: 'sin(t)', xLatex: '\\cos(t)', yLatex: '\\sin(t)', tMin: 0, tMax: 2 * Math.PI };
  objects.push(object);
  selected = object.id;
  commit(before);
  mobileUI?.show(true);
  focusMathInput(element('objects').querySelector(`[data-id="${object.id}"] math-field`));
}

function nextVariableName() {
  const names = new Set(objects.map(object => object.name.toLowerCase()));
  let index = 1;
  while (names.has(`v${index}`)) index++;
  return `v${index}`;
}

function createJavaScriptRegion() {
  if (gesture) return;
  finishObjectEdit(); setTool('select'); documentEditor?.showObjects();
  const before = snapshot();
  const object = { id: crypto.randomUUID(), type: 'javascript', name: nextVariableName(), source: 'return 1 + Math.sin(json.timeline.time);', enabled: true, value: 0 };
  objects.push(object); selected = object.id; commit(before);
  mobileUI?.show(true);
  element('objects').querySelector(`[data-id="${object.id}"] .script-source`)?.focus();
}

function nextSliderName() {
  const names = new Set(objects.map(object => object.name.toLowerCase()));
  for (const name of ['k', 'm', 'n', 't', 'a', 'b', 'c']) if (!names.has(name)) return name;
  let index = 1;
  while (names.has(`k${index}`)) index++;
  return `k${index}`;
}

function normalizeSlider(object) {
  object.min = Number.isFinite(Number(object.min)) ? Number(object.min) : -5;
  object.max = Number.isFinite(Number(object.max)) ? Number(object.max) : 5;
  if (object.min > object.max) [object.min, object.max] = [object.max, object.min];
  object.step = Number.isFinite(Number(object.step)) && Number(object.step) > 0 ? Number(object.step) : 0.1;
  object.value = Math.max(object.min, Math.min(object.max, Number(object.value) || 0));
}

function sliderParameters() {
  return formulaParameters(objects);
}

function setSliderValue(id, value) {
  const object = objects.find(item => item.id === id && item.type === 'slider');
  if (!object) return;
  object.value = Number(value);
  normalizeSlider(object);
  refresh(new Set([id]));
}

function createSlider() {
  if (gesture) return;
  pausePhysics();
  const before = snapshot();
  const slider = { id: crypto.randomUUID(), type: 'slider', name: nextSliderName(), value: 1.3, min: -5, max: 5, step: 0.1 };
  objects.push(slider);
  selected = slider.id;
  commit(before);
  mobileUI?.show(true);
}

function toggleSliderAnimation(id, button) {
  const active = sliderAnimations.get(id);
  if (active) {
    cancelAnimationFrame(active.frame);
    sliderAnimations.delete(id);
    if (active.before !== snapshot()) commit(active.before);
    button.textContent = '▶';
    return;
  }
  const before = snapshot();
  const started = performance.now();
  const animate = now => {
    const object = objects.find(item => item.id === id && item.type === 'slider');
    if (!object) return;
    const phase = ((now - started) / 2400) % 2;
    const progress = phase <= 1 ? phase : 2 - phase;
    setSliderValue(id, object.min + (object.max - object.min) * progress);
    const animation = sliderAnimations.get(id);
    if (animation) animation.frame = requestAnimationFrame(animate);
  };
  sliderAnimations.set(id, { before, frame: requestAnimationFrame(animate) });
  button.textContent = 'Ⅱ';
}

function newShape(type, parents, construction = null) {
  let index = 0;
  const name = value => String.fromCharCode(102 + value % 21) + (value >= 21 ? Math.floor(value / 21) : '');
  while (objects.some(object => object.name === name(index))) index++;
  const object = { id: crypto.randomUUID(), name: name(index), type, parents };
  if (construction) object.construction = construction;
  objects.push(object);
  return object;
}

function snapped(position) {
  return element('snap').checked ? snapToGrid(position, snapSettings.read(), view.scale) : position;
}

function plotWorldPoints(object) {
  const points = plots.get(object.id)?.points;
  if (!points) return [];
  const result = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    if (Number.isFinite(points[index]) && Number.isFinite(points[index + 1])) result.push({ x: points[index], y: points[index + 1] });
  }
  return result;
}

function nearestPlotPoint(position, object) {
  const points = plotWorldPoints(object);
  let nearest = null;
  let best = Infinity;
  for (const point of points) {
    const current = distance(position, point);
    if (current < best) { best = current; nearest = point; }
  }
  return nearest;
}

function createSnapPoint(position, parent) {
  if (!parent) return newPoint(snapped(position));
  if (isPlot(parent)) {
    const nearest = nearestPlotPoint(position, parent);
    return nearest ? Object.assign(newPoint(nearest, 'snapPoint'), { parents: [parent.id], constraint: 'plot' }) : newPoint(snapped(position));
  }
  const geometry = trimCadSources([...resolved.values()]).find(object => object.id === parent.id);
  const projection = projectPointOnObject(position, geometry);
  if (!projection) return newPoint(snapped(position));
  return Object.assign(newPoint(projection, 'snapPoint'), { parents: [parent.id], constraint: 'object', parameter: projection.parameter });
}

function pickPoint(position, mode = 'snap') {
  const existing = hitTest(position, isPoint);
  if (existing && (mode !== 'nearest' || existing.type === 'snapPoint')) {
    triggerRipple(existing);
    return existing;
  }
  if (mode === 'free') return newPoint(snapped(position));
  const target = nearestObjects(position, mode === 'nearest' ? Infinity : 24)[0]?.object;
  if (!target && mode === 'nearest') return null;
  return target ? createSnapPoint(position, target) : newPoint(snapped(position));
}

function nearestObjects(position, radius = Infinity) {
  const candidates = [];
  for (const object of trimCadSources([...resolved.values()])) {
    if (forcedHit && object.id !== forcedHit.object?.id) continue;
    if (object.hidden || object.invalid || (!shapeTypes.has(object.type) && !isPlot(object))) continue;
    const projection = isPlot(object) ? nearestPlotPoint(position, object) : projectPointOnObject(position, object);
    if (!projection) continue;
    const screenDistance = distance(position, projection) * view.scale;
    if (screenDistance <= radius) candidates.push({ object, screenDistance });
  }
  return candidates.sort((first, second) => first.screenDistance - second.screenDistance);
}

function movePoint(point, position) {
  if (point.type !== 'snapPoint') {
    Object.assign(point, snapped(position));
    return;
  }
  const parent = objects.find(object => object.id === point.parents?.[0]);
  if (!parent) return;
  if (point.constraint === 'plot' || isPlot(parent)) {
    const nearest = nearestPlotPoint(position, parent);
    if (nearest) Object.assign(point, nearest);
    return;
  }
  const geometry = trimCadSources([...resolved.values()]).find(object => object.id === parent.id);
  const projection = projectPointOnObject(position, geometry);
  if (projection) Object.assign(point, projection);
}

function hitCandidates(position, filter = () => true, radius = hitRadius) {
  return trimCadSources([...resolved.values()]).filter(object => !object.hidden && !object.invalid && (isMeasurement(object) || isPoint(object) || shapeTypes.has(object.type) || isPlot(object) || object.type === 'region' || isPhysicsObject(object)) && filter(object))
    .map(object => ({ object, distance: isPlot(object)
      ? plots.get(object.id)?.distance(toScreen(position, view, width, height), view, width, height) ?? Infinity
      : isMeasurement(object) ? measurementDistance(measurementLayout(object, view, width, height), toScreen(position, view, width, height))
      : isLiquid(object) ? liquidDistance(object, position) * view.scale
      : isSoftBody(object) ? softDistance(object,position)*view.scale
      : isFlexible(object) ? ropeDistance(object, position) * view.scale
      : isPhysicsBody(object) ? bodyContains(object, position) ? 0 : Infinity
      : object.type === 'region' ? regionContains(regions.get(object.id), position) ? 8.5 : Infinity
      : distanceToObject(position, object) * view.scale }))
    .filter(hit => hit.distance < (isPoint(hit.object) ? 13 : 9) * radius)
    .sort((first, second) => Number(isPhysicsObject(second.object)) - Number(isPhysicsObject(first.object)) || Number(isPoint(second.object)) - Number(isPoint(first.object)) || Number(first.object.type === 'region') - Number(second.object.type === 'region') || first.distance - second.distance).map(hit => hit.object);
}

function hitTest(position, filter = () => true) {
  if (forcedHit) return forcedHit.object && filter(forcedHit.object) ? forcedHit.object : null;
  return hitCandidates(position, filter)[0];
}

function plotSegments(object) {
  const segments = plots.get(object.id)?.segments;
  if (segments) {
    const result = [];
    for (let index = 0; index < segments.length; index += 4) result.push({ type: 'segment', first: { x: segments[index], y: segments[index + 1] }, second: { x: segments[index + 2], y: segments[index + 3] } });
    return result;
  }
  const points = plotWorldPoints(object);
  const result = [];
  for (let index = 1; index < points.length; index++) {
    const first = points[index - 1];
    const second = points[index];
    if (distance(first, second) * view.scale > 180) continue;
    result.push({ first, second });
  }
  return result;
}

function segmentIntersection(first, second) {
  const direction = { x: first.second.x - first.first.x, y: first.second.y - first.first.y };
  const other = { x: second.second.x - second.first.x, y: second.second.y - second.first.y };
  const determinant = direction.x * other.y - direction.y * other.x;
  if (Math.abs(determinant) < 1e-12) return null;
  const offset = { x: second.first.x - first.first.x, y: second.first.y - first.first.y };
  const parameter = (offset.x * other.y - offset.y * other.x) / determinant;
  const otherParameter = (offset.x * direction.y - offset.y * direction.x) / determinant;
  if (parameter < -1e-9 || parameter > 1 + 1e-9 || otherParameter < -1e-9 || otherParameter > 1 + 1e-9) return null;
  return { x: first.first.x + parameter * direction.x, y: first.first.y + parameter * direction.y };
}

function uniquePositions(positions) {
  const result = [];
  const threshold = Math.max(1e-10, 0.75 / view.scale);
  const candidates = positions.filter(position => Number.isFinite(position?.x) && Number.isFinite(position?.y)).sort((first, second) => first.x - second.x || first.y - second.y);
  for (const position of candidates) {
    if (!result.some(item => distance(item, position) < threshold)) result.push(position);
  }
  return result;
}

function equationIntersections(first, second) {
  const firstEquation = isPlot(first);
  const secondEquation = isPlot(second);
  if (!firstEquation && !secondEquation) return intersections(first, second);
  if ((first.type === 'parametric' || second.type === 'parametric') && !(firstEquation && secondEquation)) {
    const curve = firstEquation ? first : second;
    const geometry = firstEquation ? second : first;
    return uniquePositions(plotSegments(curve).flatMap(segment => intersections(segment, geometry)));
  }
  if (firstEquation && secondEquation) {
    const firstSegments = plotSegments(first);
    const secondSegments = plotSegments(second);
    const bins = new Map();
    for (const segment of firstSegments) {
      const minX = Math.floor((Math.min(segment.first.x, segment.second.x) - view.x) * view.scale / 24);
      const maxX = Math.floor((Math.max(segment.first.x, segment.second.x) - view.x) * view.scale / 24);
      const minY = Math.floor((view.y - Math.max(segment.first.y, segment.second.y)) * view.scale / 24);
      const maxY = Math.floor((view.y - Math.min(segment.first.y, segment.second.y)) * view.scale / 24);
      for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
        const bucket = bins.get(`${x}:${y}`) || [];
        bucket.push(segment);
        bins.set(`${x}:${y}`, bucket);
      }
    }
    const positions = [];
    for (const segment of secondSegments) {
      const minX = Math.floor((Math.min(segment.first.x, segment.second.x) - view.x) * view.scale / 24);
      const maxX = Math.floor((Math.max(segment.first.x, segment.second.x) - view.x) * view.scale / 24);
      const minY = Math.floor((view.y - Math.max(segment.first.y, segment.second.y)) * view.scale / 24);
      const maxY = Math.floor((view.y - Math.min(segment.first.y, segment.second.y)) * view.scale / 24);
      const candidates = new Set();
      for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (const item of bins.get(`${x}:${y}`) || []) candidates.add(item);
      for (const candidate of candidates) {
        const position = segmentIntersection(candidate, segment);
        if (position) positions.push(position);
      }
    }
    return uniquePositions(positions);
  }
  const equation = firstEquation ? first : second;
  const geometry = firstEquation ? second : first;
  const compiled = plots.equation(equation.id);
  if (!compiled || equation.invalid) return [];
  const key = intersectionKey({ parents: [first.id, second.id] });
  const context = JSON.stringify([intersectionContext(first, second), view, width, height]);
  const cached = equationIntersectionCache.get(key);
  if (cached?.compiled === compiled && cached.context === context) return cached.positions;
  const positions = equationGeometryIntersections(compiled, geometry, view, width, height);
  equationIntersectionCache.set(key, { compiled, context, positions, equationId: equation.id, geometryId: geometry.id });
  return positions;
}

function updatePointDependents(changed) {
  if (!changed.size) return;
  const dependents = objects.filter(object => object.parents?.some(parent => changed.has(parent))).map(object => object.id);
  if (dependents.length) resolved = resolveObjects(objects, resolved, new Set(dependents), intersectionTracker);
}

function updateEquationIntersections() {
  const changed = new Set();
  const groups = new Map();
  for (const object of objects) {
    if (object.type !== 'intersection') continue;
    const key = intersectionKey(object);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(object);
  }
  for (const group of groups.values()) {
    const object = group[0];
    const first = resolved.get(object.parents?.[0]);
    const second = resolved.get(object.parents?.[1]);
    if (!first || !second || (!isPlot(first) && !isPlot(second))) continue;
    const equations = [first, second].filter(isPlot);
    const complete = (equations.length === 1 && equations[0].type === 'equation') || equations.every(parent => parent.invalid || !plots.status(parent.id) || plots.status(parent.id).done);
    const positions = first.invalid || second.invalid ? [] : equationIntersections(first, second);
    const context = JSON.stringify([intersectionContext(first, second), equations.map(parent => plots.entries.get(parent.id)?.dependencyKey)]);
    const matches = intersectionTracker.match(group, positions, { previous: resolved, scale: view.scale, complete, context });
    for (const point of group) {
      const position = matches.get(point.id);
      const previous = resolved.get(point.id);
      if (position?.x !== previous?.x || position?.y !== previous?.y) changed.add(point.id);
      if (position) resolved.set(point.id, { ...point, ...position });
      else resolved.delete(point.id);
    }
  }
  updatePointDependents(changed);
}

function updateEquationSnapPoints() {
  const changed = new Set();
  for (const object of objects) {
    if (object.type !== 'snapPoint' || object.constraint !== 'plot') continue;
    const parent = objects.find(item => item.id === object.parents?.[0] && isPlot(item));
    if (!parent || !Number.isFinite(object.x) || !Number.isFinite(object.y)) continue;
    const nearest = nearestPlotPoint(object, parent);
    if (nearest) {
      const previous = resolved.get(object.id);
      if (nearest.x !== previous?.x || nearest.y !== previous?.y) changed.add(object.id);
      Object.assign(object, nearest);
      resolved.set(object.id, { ...object });
    }
  }
  updatePointDependents(changed);
}

function nearestIntersection(position) {
  const candidates = nearestObjects(position, 24).map(candidate => candidate.object);
  let best = null;
  for (let firstIndex = 0; firstIndex < candidates.length; firstIndex++) {
    const first = resolved.get(candidates[firstIndex].id);
    for (let secondIndex = firstIndex + 1; secondIndex < candidates.length; secondIndex++) {
      const second = resolved.get(candidates[secondIndex].id);
      for (const [branch, candidate] of equationIntersections(first, second).entries()) {
        const screenDistance = distance(position, candidate) * view.scale;
        if ((!best || screenDistance < best.screenDistance) && screenDistance <= 18) best = { first, second, branch, position: candidate, screenDistance };
      }
    }
  }
  return best;
}

function createSmartIntersection(position) {
  const nearest = nearestIntersection(position);
  if (!nearest) return null;
  const duplicate = objects.find(object => object.type === 'intersection' && (
    intersectionKey(object) === intersectionKey({ parents: [nearest.first.id, nearest.second.id] })
    && resolved.has(object.id) && distance(resolved.get(object.id), nearest.position) * view.scale < 0.5
  ));
  if (duplicate) {
    triggerRipple(resolved.get(duplicate.id));
    return resolved.get(duplicate.id) || duplicate;
  }
  const point = newPoint(nearest.position);
  point.type = 'intersection';
  point.parents = [nearest.first.id, nearest.second.id];
  point.branch = nearest.branch;
  intersectionTracker.seed(point, nearest.position);
  delete point.x;
  delete point.y;
  return point;
}

function pickSmartPoint(position) {
  const existing = hitTest(position, isPoint);
  if (existing) {
    triggerRipple(existing);
    return existing;
  }
  return (!forcedHit && createSmartIntersection(position)) || pickPoint(position, 'snap');
}

function derivedReference(object) {
  return activeTool === 'tangent' ? isTangentCurve(object) : isLinear(object);
}

function derivedCandidates(point, reference) {
  return derivedLines(activeTool, point, reference, reference?.type === 'equation' ? plots.equation(reference.id) : null);
}

function constructDerivedLine(position) {
  const before = pending?.before || snapshot();
  if (!pending) {
    const target = hitTest(position, object => isPoint(object) || derivedReference(object));
    if (target && !isPoint(target)) pending = { referenceId: target.id, before };
    else {
      const point = target || pickSmartPoint(position);
      if (target) triggerRipple(point);
      pending = { pointId: point.id, before };
    }
    setHint(pending.referenceId ? 'hint.throughPoint' : activeTool === 'tangent' ? 'hint.tangentCurve' : 'hint.referenceLine');
    refresh();
    return;
  }
  const attempt = snapshot();
  const reference = pending.referenceId ? resolved.get(pending.referenceId) : hitTest(position, derivedReference);
  if (!reference) return;
  const point = pending.pointId ? resolved.get(pending.pointId) : pickSmartPoint(position);
  const lines = derivedCandidates(point, reference);
  if (!lines.some(Boolean)) {
    restoreSnapshot(attempt);
    setHint(activeTool === 'tangent' ? reference.type === 'equation' ? 'hint.regularPoint' : 'hint.noTangent' : 'hint.unavailableLine');
    refresh();
    return;
  }
  lines.forEach((line, branch) => {
    if (!line) return;
    const object = newShape(activeTool, [point.id, reference.id]);
    if (activeTool === 'tangent') object.branch = branch;
    selected = object.id;
  });
  pending = null;
  setHint('');
  commit(before);
}

function derivedPreview(position) {
  const reference = pending.referenceId ? resolved.get(pending.referenceId) : hitTest(position, derivedReference);
  let point = pending.pointId ? resolved.get(pending.pointId) : hitTest(position, isPoint);
  if (!point && reference) {
    const nearest = nearestObjects(position, 24)[0]?.object;
    const projection = isPlot(nearest) ? nearestPlotPoint(position, nearest) : nearest && projectPointOnObject(position, nearest);
    point = projection ? { ...projection, type: 'snapPoint', parents: [nearest.id] } : { ...snapped(position), type: 'point' };
  }
  return derivedCandidates(point, reference).filter(Boolean).map(line => ({ ...line, type: activeTool, preview: true }));
}

function cadTarget(position, target = null) {
  if (activeTool === 'arcConnection') {
    const candidate = target || position && hitTest(position, isArcSource);
    if (!pending?.cad || !candidate) return null;
    const parents = [resolved.get(pending.ids[0]), resolved.get(candidate.id)];
    return parents.every(parent => isArcSource(parent) && !parent.hidden) && parents[0].id !== parents[1].id
      ? { parents, vertex: position || candidate.arcStart || candidate.second } : null;
  }
  const point = target || position && hitTest(position, object => object.type === 'intersection');
  if (point?.type === 'intersection') {
    const parents = point.parents.map(id => resolved.get(id));
    const corner = parents.length === 2 && parents.every(parent => isLinear(parent) && !parent.hidden) && lineCorner(parents);
    if (corner) return { parents, vertex: corner.vertex };
  }
  if (pending?.cad) {
    const candidate = target || position && hitTest(position, isLinear);
    const parents = [resolved.get(pending.ids[0]), candidate && resolved.get(candidate.id)];
    const corner = parents.every(parent => isLinear(parent) && !parent.hidden) && parents[0].id !== parents[1].id && lineCorner(parents);
    return corner ? { parents, vertex: corner.vertex, positions: [pending.positions[0], position || midpoint(parents[1].first, parents[1].second)] } : null;
  }
  if (!position || target) return null;
  const lines = nearestObjects(position, 24).map(hit => hit.object).filter(isLinear).map(line => resolved.get(line.id));
  let best = null;
  for (let first = 0; first < lines.length; first++) for (let second = first + 1; second < lines.length; second++) {
    const vertex = intersections(lines[first], lines[second])[0];
    if (!vertex) continue;
    const separation = distance(position, vertex) * view.scale;
    if (separation <= 18 && (!best || separation < best.separation)) best = { parents: [lines[first], lines[second]], vertex, separation };
  }
  return best;
}

function cadParameters(target, position) {
  if (activeTool === 'arcConnection') return arcConnectionParameters(target.parents, position);
  let size = 1;
  for (const parent of target.parents) if (parent.type === 'segment' || parent.type === 'chamfer') size = Math.min(size, distance(parent.first, parent.second) / 4);
  const preferred = target.positions?.map((point, index) => {
    const vector = linearDirection(target.parents[index]);
    if (distance(point, target.vertex) < 1e-9) point = midpoint(target.parents[index].first, target.parents[index].second);
    return (point.x - target.vertex.x) * vector.x + (point.y - target.vertex.y) * vector.y < 0 ? -1 : 1;
  });
  for (let attempt = 0; attempt < 12; attempt++, size /= 2) {
    const candidates = cornerSides.flatMap(sides => {
      const parameters = { tool: activeTool, trim: true, sides: [...sides], [activeTool === 'fillet' ? 'radius' : 'size']: size };
      const geometry = computeCadCorner(parameters, target.parents);
      const preference = preferred ? sides.reduce((total, side, index) => total + Number(side !== preferred[index]), 0) : 0;
      return geometry ? [{ parameters, preference, separation: distance(position || target.vertex, activeTool === 'fillet' ? geometry.first : midpoint(geometry.first, geometry.second)) }] : [];
    }).sort((a, b) => a.preference - b.preference || a.separation - b.separation);
    if (candidates.length && (!preferred || candidates[0].preference === 0 || attempt === 11)) return candidates[0].parameters;
  }
  return null;
}

function constructCadCorner(position, targetObject = null) {
  const target = cadTarget(position, targetObject);
  if (!target) {
    const connection = activeTool === 'arcConnection';
    const accepts = connection ? isArcSource : isLinear;
    const candidate = targetObject || position && hitTest(position, accepts);
    if (accepts(candidate)) {
      if (pending?.cad) {
        setHint(connection ? 'cad.secondArc' : candidate.id === pending.ids[0] ? 'cad.secondLine' : 'cad.parallelLines');
      } else {
        const source = resolved.get(candidate.id);
        pending = { cad: true, ids: [source.id], positions: [position || (connection ? source.arcStart || source.second : midpoint(source.first, source.second))], before: snapshot() };
        setHint(connection ? 'cad.secondArc' : 'cad.secondLine');
        refresh();
      }
    } else setHint(connection ? 'cad.selectArcs' : 'cad.selectIntersection');
    return;
  }
  const parameters = cadParameters(target, position || (isPoint(targetObject) ? targetObject : null));
  if (!parameters) { setHint(activeTool === 'arcConnection' ? 'cad.connectionDoesNotFit' : 'cad.doesNotFit'); return; }
  const before = pending?.before || snapshot();
  const { tool, ...properties } = parameters;
  const object = newShape(tool, target.parents.map(parent => parent.id));
  Object.assign(object, properties);
  pending = null;
  selected = object.id;
  selection.clear();
  triggerRipple(target.vertex);
  setHint('');
  commit(before, new Set([object.id]));
  element('objects').querySelector(`[data-id="${object.id}"]`)?.scrollIntoView({ block: 'nearest' });
}

function cadPreview(position) {
  if (!position) return [];
  const target = cadTarget(position);
  if (!target) return [];
  const parameters = cadParameters(target, position);
  const geometry = parameters && resolveCadCorner({ ...parameters, type: parameters.tool }, target.parents);
  return geometry ? [{ ...geometry, preview: true }] : [];
}

function constructRatioPoint(position, target = null) {
  if (pending?.ratioInput) return;
  const before = pending?.before || snapshot();
  const attempt = snapshot();
  const candidate = target || hitTest(position, object => isPoint(object) || !pending && object.type === 'segment');
  if (!pending && candidate?.type === 'segment') pending = { ids: [candidate.id], before };
  else {
    const point = candidate || pickSmartPoint(position);
    if (candidate) triggerRipple(point);
    if (!pending) {
      pending = { ids: [point.id], before };
      setHint('hint.secondPoint');
      refresh();
      return;
    }
    if (pending.ids.includes(point.id)) { restoreSnapshot(attempt); refresh(); return; }
    pending.ids.push(point.id);
  }
  const parents = pending.ids.map(id => resolved.get(id));
  if (!ratioPoint(parents, [1, 1])) { cancelPending(); refresh(); return; }
  const endpoints = parents.length === 1 ? [parents[0].first, parents[0].second] : parents;
  pending.ratioInput = true;
  pending.ratio = [1, 1];
  setHint('');
  refresh();
  ratioDialog.open(...endpoints);
}

function finishRatioPoint(ratio) {
  if (!pending?.ratioInput) return;
  const position = ratioPoint(pending.ids.map(id => resolved.get(id)), ratio);
  if (!position) return;
  const before = pending.before;
  const point = newPoint(position, 'ratioPoint');
  point.parents = [...pending.ids];
  point.ratio = [...ratio];
  delete point.x;
  delete point.y;
  pending = null;
  ratioDialog.close();
  selected = point.id;
  setHint('');
  commit(before);
  canvas.focus();
}

function ratioPointPreview(position) {
  let parents = pending.ids.map(id => resolved.get(id));
  if (!pending.ratioInput) {
    if (!position) return [];
    const nearest = nearestObjects(position, 24)[0]?.object;
    const projection = isPlot(nearest) ? nearestPlotPoint(position, nearest) : nearest && projectPointOnObject(position, nearest);
    parents.push(hitTest(position, isPoint) || { ...(projection || snapped(position)), type: 'point' });
  }
  const point = ratioPoint(parents, pending.ratioInput ? pending.ratio : [1, 1]);
  if (!point) return [];
  const [first, second] = parents.length === 1 ? [parents[0].first, parents[0].second] : parents;
  return [{ type: 'segment', first, second, preview: true }, { ...point, type: 'ratioPoint', preview: true }];
}

function constructPerpendicularBisector(position) {
  const before = pending?.before || snapshot();
  if (!pending) {
    const target = hitTest(position, object => isPoint(object) || object.type === 'segment');
    if (target?.type === 'segment') {
      if (!perpendicularBisector([target])) { setHint('hint.unavailableLine'); return; }
      selected = newShape(activeTool, [target.id]).id;
      setHint('');
      commit(before);
      return;
    }
    const first = target || pickSmartPoint(position);
    if (target) triggerRipple(first);
    pending = { ids: [first.id], before };
    setHint('hint.secondPoint');
    refresh();
    return;
  }
  const attempt = snapshot();
  const second = pickSmartPoint(position);
  const first = resolved.get(pending.ids[0]);
  if (!perpendicularBisector([first, second])) {
    restoreSnapshot(attempt);
    setHint('hint.unavailableLine');
    refresh();
    return;
  }
  selected = newShape(activeTool, [first.id, second.id]).id;
  pending = null;
  setHint('');
  commit(before);
}

function perpendicularBisectorPreview(position) {
  const first = resolved.get(pending.ids[0]);
  let second = hitTest(position, isPoint);
  if (!second) {
    const nearest = nearestObjects(position, 24)[0]?.object;
    const projection = isPlot(nearest) ? nearestPlotPoint(position, nearest) : nearest && projectPointOnObject(position, nearest);
    second = { ...(projection || snapped(position)), type: 'point' };
  }
  const line = perpendicularBisector([first, second]);
  return line ? [
    { type: 'segment', first, second, preview: true },
    { ...line, type: 'perpendicularBisector', preview: true },
  ] : [];
}

function constructBisector(position) {
  const before = pending?.before || snapshot();
  if (!pending) {
    const target = hitTest(position, object => isPoint(object) || isLinear(object));
    const first = target || pickSmartPoint(position);
    pending = { ids: [first.id], mode: isLinear(first) ? 'lines' : 'points', before };
    if (isPoint(first)) triggerRipple(first);
    setHint(pending.mode === 'lines' ? 'hint.secondLine' : 'hint.vertex');
    refresh();
    return;
  }
  const attempt = snapshot();
  const next = pending.mode === 'lines' ? hitTest(position, object => isLinear(object) && !pending.ids.includes(object.id)) : pickSmartPoint(position);
  if (!next) return;
  if (pending.ids.includes(next.id)) { restoreSnapshot(attempt); refresh(); return; }
  const ids = [...pending.ids, next.id];
  if (pending.mode === 'points' && ids.length < 3) {
    pending.ids = ids;
    setHint('hint.otherArm');
    refresh();
    return;
  }
  if (!angleBisector(activeTool, ids.map(id => resolved.get(id)))) {
    restoreSnapshot(attempt);
    setHint(pending.mode === 'lines' ? 'hint.intersectingLines' : 'hint.distinctArms');
    refresh();
    return;
  }
  selected = newShape(activeTool, ids).id;
  pending = null;
  setHint('');
  commit(before);
}

function bisectorPreview(position) {
  const parents = pending.ids.map(id => resolved.get(id));
  if (pending.mode === 'lines') parents.push(hitTest(position, object => isLinear(object) && !pending.ids.includes(object.id)));
  else {
    const point = hitTest(position, isPoint) || { ...snapped(position), type: 'point' };
    if (parents.length === 1) return parents[0] ? [{ type: 'segment', first: parents[0], second: point, preview: true }] : [];
    parents.push(point);
  }
  const line = angleBisector(activeTool, parents);
  return line ? [{ ...line, type: activeTool, preview: true }] : [];
}

function measurementTarget(object) {
  if (activeTool === 'measureArea') return object.type === 'region';
  if (activeTool === 'measureLength') return isPoint(object) || !pending && object.type === 'segment';
  return pending?.mode === 'lines' ? isLinear(object) : pending?.mode === 'points' ? isPoint(object) : isPoint(object) || isLinear(object);
}

function newMeasurement(type, parents, angleMode) {
  const stem = type === 'lengthMeasure' ? 'd' : type === 'areaMeasure' ? 'S' : 'α';
  let index = 1;
  while (objects.some(object => object.name === `${stem}${index}`)) index++;
  const object = { id: crypto.randomUUID(), type, name: `${stem}${index}`, parents };
  if (angleMode) object.angleMode = angleMode;
  objects.push(object);
  return object;
}

function constructMeasurement(position, target = null) {
  const candidate = target || hitTest(position, measurementTarget);
  if (!candidate || !measurementTarget(candidate)) {
    setHint(activeTool === 'measureArea' ? 'hint.region' : activeTool === 'measureLength' ? 'hint.length' : 'hint.angle');
    return;
  }
  const before = pending?.before || snapshot();
  let type;
  let ids;
  if (activeTool === 'measureArea') { type = 'areaMeasure'; ids = [candidate.id]; }
  else if (activeTool === 'measureLength' && !pending && candidate.type === 'segment') { type = 'lengthMeasure'; ids = [candidate.id]; }
  else {
    if (!pending) {
      pending = { ids: [candidate.id], mode: isPoint(candidate) ? 'points' : 'lines', before };
      if (isPoint(candidate)) triggerRipple(candidate);
      setHint(activeTool === 'measureLength' ? 'hint.secondPoint' : pending.mode === 'lines' ? 'hint.secondLine' : 'hint.vertex');
      refresh();
      return;
    }
    if (pending.ids.includes(candidate.id)) return;
    ids = [...pending.ids, candidate.id];
    const required = activeTool === 'measureLength' || pending.mode === 'lines' ? 2 : 3;
    if (ids.length < required) {
      pending.ids = ids;
      setHint('hint.otherArm');
      refresh();
      return;
    }
    type = activeTool === 'measureLength' ? 'lengthMeasure' : 'angleMeasure';
  }
  const angleMode = toolById.get(activeTool)?.angleMode;
  const measurement = resolveMeasurement({ type, angleMode }, ids.map(id => resolved.get(id)));
  if (!measurement) {
    setHint('hint.unmeasurable');
    return;
  }
  const existing = objects.find(object => object.type === type && object.angleMode === angleMode && JSON.stringify(object.parents) === JSON.stringify(ids));
  selected = existing?.id || newMeasurement(type, ids, angleMode).id;
  pending = null;
  setHint('');
  commit(before);
}

function measurementPreview(position) {
  const target = hitTest(position, measurementTarget);
  if (!target || pending.ids.includes(target.id)) return [];
  const type = activeTool === 'measureLength' ? 'lengthMeasure' : 'angleMeasure';
  const parents = [...pending.ids.map(id => resolved.get(id)), target];
  if (type === 'angleMeasure' && pending.mode === 'points' && parents.length !== 3) return [];
  const result = resolveMeasurement({ type, angleMode: toolById.get(activeTool)?.angleMode, preview: true }, parents);
  return result ? [result] : [];
}

function updateAreaMeasurements() {
  let changed = false;
  for (const object of objects) {
    if (object.type !== 'areaMeasure') continue;
    const current = resolved.get(object.id);
    const region = resolved.get(object.parents[0]);
    if (!current || !region) continue;
    const boundaries = region.parents.map(id => resolved.get(id)).filter(Boolean);
    const metrics = regionMeasurement(regions.get(region.id), boundaries);
    if (!metrics || current.value === metrics.value && current.anchor?.x === metrics.anchor.x && current.anchor?.y === metrics.anchor.y && current.approximate === metrics.approximate) continue;
    Object.assign(current, metrics);
    changed = true;
  }
  if (changed) renderObjects();
}

function conicSubject(object) {
  return activeTool === 'pole' ? isLinear(object) : isPoint(object);
}

function conicReference(object) {
  return activeTool === 'parabola' ? isLinear(object) : isPolarCurve(object);
}

function conicConstruction(subject, reference) {
  if (!subject || !reference) return null;
  return activeTool === 'parabola' ? createConic('parabola', [subject, reference]) : activeTool === 'pole' ? polePoint(subject, reference) : polarLine(subject, reference);
}

function constructConic(position) {
  const before = pending?.before || snapshot();
  const target = hitTest(position, object => conicSubject(object) || conicReference(object));
  if (!pending) {
    if (target && conicReference(target)) pending = { referenceId: target.id, before };
    else {
      const subject = target || (activeTool !== 'pole' && pickSmartPoint(position));
      if (!subject) { setHint('hint.lineOrConic'); return; }
      pending = { subjectId: subject.id, before };
      if (isPoint(subject)) triggerRipple(subject);
    }
    setHint(pending.referenceId ? activeTool === 'pole' ? 'hint.line' : 'hint.point' : activeTool === 'parabola' ? 'hint.directrix' : 'hint.circleOrConic');
    refresh();
    return;
  }
  const attempt = snapshot();
  const reference = pending.referenceId ? resolved.get(pending.referenceId) : hitTest(position, conicReference);
  if (!reference) return;
  const subject = pending.subjectId ? resolved.get(pending.subjectId) : activeTool === 'pole' ? hitTest(position, conicSubject) : pickSmartPoint(position);
  const result = conicConstruction(subject, reference);
  if (!result) {
    restoreSnapshot(attempt);
    setHint('hint.noFiniteResult');
    refresh();
    return;
  }
  const object = activeTool === 'pole' ? newPoint(result, 'pole') : newShape(activeTool, []);
  object.parents = [subject.id, reference.id];
  if (activeTool === 'pole') { delete object.x; delete object.y; }
  selected = object.id;
  pending = null;
  setHint('');
  commit(before);
}

function conicPreview(position) {
  if (dualConstructionTools.has(activeTool)) {
    const reference = pending.referenceId ? resolved.get(pending.referenceId) : hitTest(position, conicReference);
    const subject = pending.subjectId ? resolved.get(pending.subjectId) : activeTool === 'pole' ? hitTest(position, conicSubject) : hitTest(position, isPoint) || { ...snapped(position), type: 'point' };
    const result = conicConstruction(subject, reference);
    return result ? [{ ...result, type: activeTool, preview: true }] : [];
  }
  const points = pending.ids.map(id => resolved.get(id));
  const through = hitTest(position, isPoint) || snapped(position);
  if (points.length < 2) return points[0] ? [{ type: 'segment', first: points[0], second: through, preview: true }] : [];
  const curve = createConic(activeTool, [...points, through]);
  return curve ? [{ ...curve, preview: true }] : [];
}

function circularToolPreview(position) {
  const fixed = pending.ids.map(id => resolved.get(id));
  let next = hitTest(position, isPoint);
  if (!next) {
    const nearest = nearestObjects(position, 24)[0]?.object;
    const projection = isPlot(nearest) ? nearestPlotPoint(position, nearest) : nearest && projectPointOnObject(position, nearest);
    next = { ...(projection || snapped(position)), type: 'point' };
  }
  return circularPreview(toolById.get(activeTool), fixed, next);
}

async function createRegion(position) {
  const request = ++regionRequest;
  const mode = activeTool === 'fillSingle' ? 'single' : 'multiple';
  regions.cancelQueries();
  setHint('hint.findRegion');
  while ([...resolved.values()].some(object => isBoundary(object) && isPlot(object) && !plots.status(object.id)?.done)) {
    await new Promise(resolve => setTimeout(resolve, 40));
    if (request !== regionRequest) return;
  }
  const boundaries = [...resolved.values()].filter(isBoundary).map(object => isPlot(object) ? { ...object, plot: plots.get(object.id) } : object);
  if (!boundaries.length) { setHint('hint.createRegion'); return; }
  const equationTasks = boundaries.filter(isPlot).map(object => [object.id, plots.entries.get(object.id)?.task]);
  const content = JSON.stringify([intersectionContext(...boundaries), sliderParameters()]);
  const result = await regions.request(boundaries, position, { ...view }, width, height, mode);
  if (request !== regionRequest) return;
  if (equationTasks.some(([id, task]) => plots.entries.get(id)?.task !== task) || content !== JSON.stringify([intersectionContext(...[...resolved.values()].filter(isBoundary)), sliderParameters()])) { setHint('hint.changedBoundary'); return; }
  if (!result) { setHint('hint.noRegion'); return; }
  const before = snapshot();
  let index = 1;
  while (objects.some(object => object.name === `R${index}`)) index++;
  const object = { id: crypto.randomUUID(), name: `R${index}`, type: 'region', mode, parents: result.parents, seed: { ...position }, opacity: 0.28 };
  objects.push(object);
  regions.entries.set(object.id, { result });
  selection.clear();
  selected = object.id;
  setHint('');
  commit(before);
}

function constructRope(position, precise=false, candidate=null) {
  const target=candidate||hitTest(position,object=>isPhysicsBody(object)||isSoftBody(object)||isPoint(object));
  const anchor=ropeAnchor(target,position,precise);
  if(!pending?.rope){pausePhysics();pending={rope:true,anchor};setHint(activeTool==='spring'?'spring.second':'rope.second');draw();return;}
  const rope=(activeTool==='spring'?createSpring:createRope)([pending.anchor,anchor],resolved);
  if(!rope){setHint('rope.distinct');return;}
  const before=snapshot();rope.id=crypto.randomUUID();let index=1;
  while(objects.some(o=>o.name===`${activeTool}${index}`))index++;
  rope.name=`${activeTool}${index}`;objects.push(rope);pending=null;selected=rope.id;selection.clear();setHint('');commit(before);
}

function construct(position) {
  if (cadTools.has(activeTool)) {
    constructCadCorner(position);
    return;
  }
  if (measurementTools.has(activeTool)) {
    constructMeasurement(position);
    return;
  }
  if (activeTool === 'ratioPoint') {
    constructRatioPoint(position);
    return;
  }
  if (activeTool === 'perpendicularBisector') {
    constructPerpendicularBisector(position);
    return;
  }
  if (bisectorTypes.has(activeTool)) {
    constructBisector(position);
    return;
  }
  if (dualConstructionTools.has(activeTool)) {
    constructConic(position);
    return;
  }
  if (activeTool === 'fillSingle' || activeTool === 'fillMultiple') {
    createRegion(position);
    return;
  }
  if (derivedLineTypes.has(activeTool)) {
    constructDerivedLine(position);
    return;
  }
  if (activeTool === 'midpoint') {
    const target = hitTest(position, object => isPoint(object) || (!pending && object.type === 'segment'));
    if (!target) return;
    if (!pending && isPoint(target)) {
      pending = { id: target.id };
      triggerRipple(target);
      setHint('hint.secondPoint');
      refresh();
      return;
    }
    if (pending?.id === target.id) return;
    const before = snapshot();
    const parents = pending ? [pending.id, target.id] : [target.id];
    const endpoints = pending ? [resolved.get(pending.id), target] : [target.first, target.second];
    if (!endpoints.every(Boolean)) return;
    const point = newPoint(midpoint(...endpoints), 'midpoint');
    point.parents = parents;
    delete point.x;
    delete point.y;
    pending = null;
    selected = point.id;
    setHint('');
    commit(before);
    return;
  }
  if (activeTool === 'intersection') {
    const shape = hitTest(position, object => !isPoint(object) && (isPlot(object) || shapeTypes.has(object.type)) && object.id !== pending?.id);
    if (!shape) return;
    if (!pending) {
      pending = { id: shape.id };
      setHint('hint.secondObject');
      refresh();
      return;
    }
    const first = resolved.get(pending.id);
    const positions = equationIntersections(first, shape);
    const before = snapshot();
    positions.forEach((position, branch) => {
      if (objects.some(object => object.type === 'intersection' && intersectionKey(object) === intersectionKey({ parents: [first.id, shape.id] }) && resolved.has(object.id) && distance(resolved.get(object.id), position) * view.scale < 0.5)) return;
      const point = newPoint(position);
      point.type = 'intersection';
      point.parents = [first.id, shape.id];
      point.branch = branch;
      intersectionTracker.seed(point, position);
      delete point.x;
      delete point.y;
    });
    pending = null;
    commit(before);
    setHint(positions.length ? '' : 'hint.noIntersection');
    refresh();
    return;
  }
  const before = pending?.before || snapshot();
  const tool = toolById.get(activeTool);
  const linearTool = activeTool === 'line' || activeTool === 'segment' || activeTool === 'ray';
  const useSmartPoint = !!pending && !linearTool && activeTool !== 'point';
  const point = activeTool === 'point'
    ? pickPoint(position, 'free')
    : activeTool === 'snapPoint'
      ? pickPoint(position, 'nearest')
      : activeTool === 'smartPoint' || linearTool || conicTypes.has(activeTool)
        ? pickSmartPoint(position)
        : pickPoint(position, useSmartPoint ? 'snap' : 'free');
  if (!point) {
    setHint('hint.createSnapTarget');
    return;
  }
  if (activeTool === 'point' || activeTool === 'snapPoint' || activeTool === 'smartPoint') {
    selected = point.id;
    setHint('');
    commit(before);
    refresh();
    return;
  }
  const requiredPoints = tool?.requiredPoints || 2;
  if (!pending) {
    pending = { ids: [point.id], before };
    setHint(requiredPoints === 3 ? 'hint.secondPoint' : activeTool === 'circle' || tool?.shapeType === 'circle' ? 'hint.circlePoint' : 'hint.secondPoint');
  } else if (!pending.ids.includes(point.id)) {
    const first = resolved.get(pending.ids[pending.ids.length - 1]);
    if (!first || distance(first, point) === 0) return;
    pending.ids.push(point.id);
    if (pending.ids.length >= requiredPoints) {
      selected = newShape(tool?.shapeType || activeTool, pending.ids, tool?.construction).id;
      pending = null;
      commit(before);
      setHint('');
    } else {
      setHint('hint.lastPoint');
    }
  }
  refresh();
}

function removeObject(id) {
  pausePhysics();
  removeObjects([id]);
}

function removeObjects(ids) {
  pausePhysics();
  cancelPending();
  const before = snapshot();
  const removed = new Set(ids);
  const variables = new Map(objects.filter(object => object.type === 'slider' || isJavaScript(object)).map(object => [object.name.toLowerCase(), object.id]));
  const parameters = formulaParameters(objects);
  let added;
  do {
    added = false;
    for (const object of objects) {
      if (removed.has(object.id)) continue;
      const dependencies = [...(object.parents || []), ...Object.values(object.bindings || {}).map(reference => variables.get(variableRoot(reference)))];
      if (isPlot(object) && !object.invalid) {
        try {
          const compiled = object.type === 'parametric' ? compileParametric(object, parameters) : compileEquation(object.source, parameters);
          dependencies.push(...compiled.parameterNames.map(name => variables.get(variableRoot(name))));
        } catch { /* Keep incomplete formula drafts editable. */ }
      }
      if (dependencies.some(id => removed.has(id))) { removed.add(object.id); added = true; }
    }
  } while (added);
  objects = objects.filter(object => !removed.has(object.id));
  selected = null;
  selection.clear();
  hovered = null;
  commit(before);
}

function equation(object) {
  if (isLiquid(object)) return t('liquid.summary',{count:object.particleCount,volume:number(object.volume),mass:number(liquidMass(object))});
  if (isPhysicsObject(object)) return t('physics.detail', { mass: number(object.mass) });
  if (isMeasurement(object)) return `${t(labels[object.type])} · ${object.parents.map(id => objects.find(parent => parent.id === id)?.name).join(', ')}${object.type === 'angleMeasure' ? ` · ${{ inner: t('angle.inner'), reflex: t('angle.reflex'), supplementary: t('angle.supplementary') }[object.angleMode || 'inner']}` : ''}`;
  if (isConic(object)) {
    if (object.type === 'parabola') return t('object.vertex', { p: number(object.p), x: number(object.origin.x), y: number(object.origin.y) });
    return t('object.center', { a: number(object.a), b: number(object.b), x: number(object.origin.x), y: number(object.origin.y) });
  }
  if (object.type === 'region') return t('object.regionDetail', { mode: t(object.mode === 'single' ? 'object.single' : 'object.multiple'), percent: Math.round((1 - (object.opacity ?? 0.28)) * 100) });
  if (object.type === 'circle') return `(x − ${number(object.first.x)})² + (y − ${number(object.first.y)})² = ${number(object.radius ** 2)}`;
  if (arcTypes.has(object.type)) return `${t(labels[object.type])} · r = ${number(object.radius)}`;
  if (object.type === 'chamfer') return t('cad.chamferDetail', { size: number(object.size) });
  if (object.type === 'segment') return `= ${number(object.radius)}`;
  const direction = linearDirection(object);
  const coefficientX = direction.y;
  const coefficientY = -direction.x;
  const constant = coefficientX * object.first.x + coefficientY * object.first.y;
  return `${number(coefficientX)}x ${coefficientY < 0 ? '−' : '+'} ${number(Math.abs(coefficientY))}y = ${number(constant)}`;
}

function nextEquationName() {
  let index = 1;
  while (objects.some(object => object.name === `eq${index}`)) index++;
  return `eq${index}`;
}

function finishObjectEdit() {
  if (!editingSession) return;
  const before = editingSession.before;
  editingSession = null;
  commit(before);
}

function beginObjectEdit(id) {
  pausePhysics();
  if (editingSession?.id !== id) {
    finishObjectEdit();
    cancelPending();
    editingSession = { id, before: snapshot() };
  }
  selected = id;
  selection.clear();
  refresh();
}

function updateEquation(id, field) {
  const object = objects.find(item => item.id === id);
  if (!object) return;
  const latex = field.value;
  if (editingSession?.id !== id) beginObjectEdit(id);
  object.latex = latex;
  try {
    object.source = compileEquation(latexToSource(latex), sliderParameters()).source;
    delete object.invalid;
    delete object.error;
    delete object.draft;
  } catch (error) {
    object.invalid = true;
    object.error = latex.trim() ? errorMessage(error) : '';
    object.draft = { latex };
  }
  refresh();
}

function bindEquationField(field) {
  const currentId = () => field.closest('.object-row')?.dataset.id;
  bindMathInput(field, () => currentId() ? focusMathInput(element('equation-input')) : addDraftEquation());
  field.addEventListener('focus', () => { if (currentId()) beginObjectEdit(currentId()); });
  field.addEventListener('blur', () => { if (editingSession?.id === currentId()) finishObjectEdit(); });
  field.addEventListener('input', () => currentId() ? updateEquation(currentId(), field) : addDraftEquation());
}

function updateParametric(id, row) {
  const object = objects.find(item => item.id === id);
  if (!object) return;
  const horizontal = row.querySelector('[data-coordinate="x"]').value;
  const vertical = row.querySelector('[data-coordinate="y"]').value;
  const lower = row.querySelector('[data-bound="tMin"]').value;
  const upper = row.querySelector('[data-bound="tMax"]').value;
  if (editingSession?.id !== id) beginObjectEdit(id);
  object.xLatex = horizontal;
  object.yLatex = vertical;
  try {
    object.xSource = latexToSource(object.xLatex);
    object.ySource = latexToSource(object.yLatex);
    if (!lower.trim() || !upper.trim()) throw new LocalizedError('error.enterRange');
    object.tMin = Number(lower);
    object.tMax = Number(upper);
    compileParametric(object, sliderParameters());
    delete object.invalid;
    delete object.error;
    delete object.draft;
  } catch (error) {
    object.invalid = true;
    object.error = errorMessage(error);
    object.draft = { xLatex: horizontal, yLatex: vertical, tMin: lower, tMax: upper };
  }
  refresh();
}

function createParametricEditor(row, id) {
  const definition = row.querySelector('.object-definition');
  definition.className = 'object-definition parametric-definition';
  const name = document.createElement('span');
  name.className = 'parametric-name';
  definition.append(name);
  for (const coordinate of ['x', 'y']) {
    const label = document.createElement('label');
    label.className = 'parametric-coordinate';
    const caption = document.createElement('span');
    caption.textContent = `${coordinate}(t) =`;
    const field = document.createElement('math-field');
    field.className = 'equation-math';
    field.dataset.coordinate = coordinate;
    field.setAttribute('aria-label', `${coordinate}(t)`);
    field.setAttribute('math-virtual-keyboard-policy', 'manual');
    bindMathInput(field, () => coordinate === 'x' ? focusMathInput(row.querySelector('[data-coordinate="y"]')) : focusMathInput(element('equation-input')));
    field.addEventListener('focus', () => beginObjectEdit(id));
    field.addEventListener('blur', finishObjectEdit);
    field.addEventListener('input', () => updateParametric(id, row));
    label.append(caption, field);
    definition.append(label);
  }
  const domain = document.createElement('div');
  domain.className = 'parametric-domain';
  for (const [key, caption] of [['tMin', 't ∈ ['], ['tMax', ',']]) {
    const text = document.createElement('span');
    text.textContent = caption;
    const input = document.createElement('input');
    input.type = 'number'; input.step = 'any'; input.dataset.bound = key;
    input.dataset.i18nAriaLabel = key === 'tMin' ? 'ui.tStart' : 'ui.tEnd';
    input.addEventListener('focus', () => beginObjectEdit(id));
    input.addEventListener('blur', finishObjectEdit);
    input.addEventListener('input', () => updateParametric(id, row));
    domain.append(text, input);
  }
  const end = document.createElement('span');
  end.textContent = ']';
  domain.append(end);
  definition.append(domain);
  const error = document.createElement('div');
  error.className = 'formula-error';
  error.setAttribute('role', 'alert');
  row.querySelector('.object-info').append(error);
}

function bindDraft(form) {
  bindEquationField(form.querySelector('math-field'));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (form.dataset.id) focusMathInput(element('equation-input'));
    else addDraftEquation();
  });
}

function createObjectRow(object, existing) {
  const row = existing || document.createElement('div');
  const id = object.id;
  row.dataset.id = id;
  row.dataset.type = object.type;
  if (!existing) {
    row.innerHTML = '<div class="object-info"><div class="object-definition"></div><div class="object-detail"></div></div><button type="button" class="object-more" data-i18n-title="menu.object" data-i18n-aria-label="menu.object" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg></button>';
    row.prepend(createObjectStatus());
  }
  if (existing) {
    row.removeAttribute('id');
    const field = row.querySelector('math-field');
    field.removeAttribute('id');
    field.removeAttribute('placeholder');
    delete field.dataset.i18nPlaceholder;
    field.className = 'equation-math';
    row.querySelector('.equation-name').hidden = false;
    row.querySelector('.object-more').hidden = false;
    row.querySelector('button').replaceWith(createObjectStatus());
  } else if (object.type === 'slider') {
    row.classList.add('slider-row');
    row.querySelector('.object-info').innerHTML = '<div class="slider-definition"><span class="slider-name"></span><span>=</span><output class="slider-value"></output></div><div class="slider-controls"><output class="slider-min"></output><input class="slider-input" type="range"><output class="slider-max"></output><button class="slider-play" type="button" data-i18n-aria-label="ui.play">▶</button></div><div class="object-detail"></div>';
    const input = row.querySelector('.slider-input');
    input.addEventListener('pointerdown', () => { pausePhysics(); sliderEdits.set(id, snapshot()); });
    input.addEventListener('keydown', () => { pausePhysics(); if (!sliderEdits.has(id)) sliderEdits.set(id, snapshot()); });
    input.addEventListener('input', () => setSliderValue(id, input.value));
    input.addEventListener('change', () => {
      const before = sliderEdits.get(id);
      sliderEdits.delete(id);
      if (before && before !== snapshot()) commit(before);
    });
    row.querySelector('.slider-play').addEventListener('click', event => { event.stopPropagation(); toggleSliderAnimation(id, event.currentTarget); });
  } else if (isPhysicsObject(object)) {
    physicsEditors.set(row, createPhysicsEditor(row.querySelector('.object-info'), {
      get: () => objects.find(item => item.id === id), all: () => objects, resolved: () => resolved,
      begin: () => beginObjectEdit(id), end: finishObjectEdit,
      change(update) {
        if (editingSession?.id !== id) beginObjectEdit(id);
        const current = objects.find(item => item.id === id);
        if (!current) return;
        const build = isFlexible(current) ? ropeBuildKey(current) : null;
        update(current);
        if (isFlexible(current) && build !== ropeBuildKey(current)) rebuildRope(current, resolved);
        if (current.time === 0) current.initialState = bodyState(current);
        refresh(new Set([id]));
      },
      command: (command, value) => physicsCommand(id, command, value),
    }));
  } else if (object.type === 'region') {
    regionEditors.set(row, createRegionEditor(row.querySelector('.object-info'), {
      get: () => objects.find(item => item.id === id),
      begin: () => beginObjectEdit(id), end: finishObjectEdit,
      change(update) {
        if (editingSession?.id !== id) beginObjectEdit(id);
        const current = objects.find(item => item.id === id);
        if (!current) return;
        update(current);
        refresh(new Set([id]));
      },
    }));
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'region-refine';
    button.dataset.i18n = 'region.refine'; button.dataset.action = 'region-refine';
    button.addEventListener('click', async event => {
      event.stopPropagation(); button.disabled = true;
      try { await refineRegion(id); } finally { button.disabled = false; }
    });
    row.querySelector('.object-info').append(button);
  } else if (isCad(object)) {
    cadEditors.set(row, createCadEditor(row.querySelector('.object-info'), {
      get: () => objects.find(item => item.id === id),
      begin: () => beginObjectEdit(id),
      change(update) {
        if (editingSession?.id !== id) beginObjectEdit(id);
        const current = objects.find(item => item.id === id);
        if (!current) return;
        update(current);
        refresh(new Set([id]));
      },
      end: finishObjectEdit,
    }));
  } else if (object.type === 'parametric') {
    createParametricEditor(row, id);
  } else if (object.type === 'equation') {
    const definition = row.querySelector('.object-definition');
    definition.classList.add('equation-definition');
    const name = document.createElement('span');
    name.className = 'equation-name';
    const field = document.createElement('math-field');
    field.className = 'equation-math';
    field.setAttribute('math-virtual-keyboard-policy', 'manual');
    const error = document.createElement('div');
    error.className = 'formula-error';
    error.setAttribute('role', 'alert');
    definition.append(name, field);
    row.querySelector('.object-info').append(error);
    bindEquationField(field);
  }
  if (isJavaScript(object)) reflectionEditors.set(row, createReflectionEditor(row.querySelector('.object-info'), {
    get: () => objects.find(item => item.id === id),
    begin: () => beginObjectEdit(id), end: finishObjectEdit,
    change(fields) {
      if (editingSession?.id !== id) beginObjectEdit(id);
      const current = objects.find(item => item.id === id);
      if (!current) return;
      try {
        const document = readDocument();
        Object.assign(document.objects.find(item => item.id === id), fields);
        parseDocument(JSON.stringify(document));
      } catch (error) { return messageText(errorMessage(error)); }
      reflection.invalidate({ keepCache: true });
      Object.assign(current, fields);
      refresh(new Set([id]));
      return '';
    },
    retry: () => reflection.retry(id),
  }));
  else {
    const status = document.createElement('p'); status.className = 'physics-note binding-status'; status.hidden = true;
    row.querySelector('.object-info').append(status);
  }
  row.addEventListener('click', () => {
    const object = objects.find(item => item.id === id);
    if (!object) return;
    if (!gesture) {
      if (['rope','spring'].includes(activeTool) && (isPhysicsBody(object) || isPoint(object))) {
        const target=resolved.get(id);if(target)constructRope(isPhysicsBody(target)?target.position:target,false,target);return;
      }
      if (cadTools.has(activeTool) && (activeTool === 'arcConnection' ? isArcSource(object) : object.type === 'intersection' || isLinear(object))) {
        const geometry = resolved.get(id);
        if (geometry) constructCadCorner(null, geometry);
        return;
      }
      if (activeTool === 'ratioPoint' && (isPoint(object) || !pending && object.type === 'segment')) {
        const geometry = resolved.get(id);
        if (geometry) constructRatioPoint(null, geometry);
        return;
      }
      if (measurementTools.has(activeTool) && measurementTarget(object)) {
        constructMeasurement(null, resolved.get(id) || object);
        return;
      }
      if (isPoint(object)) triggerRipple(resolved.get(id) || object);
      if (selected === id && !selection.size) return;
      cancelPending();
      selection.clear();
      selected = id;
      refresh();
    }
  });
  row.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopPropagation();
    if (gesture) return;
    objectMenu.close();
    cancelPending();
    setHint('');
    selection.clear();
    selected = id;
    refresh();
    objectMenu.openQuick(id, row.querySelector('.object-more'), { x: event.clientX, y: event.clientY });
  });
  row.querySelector('.object-more').addEventListener('click', event => {
    event.stopPropagation();
    if (gesture) return;
    cancelPending();
    selection.clear();
    selected = id;
    refresh();
    objectMenu.open(id, row.querySelector('.object-more'));
  });
  return row;
}

function renderObjects() {
  const list = element('objects');
  const rows = new Map([...list.children].filter(row => row.dataset.id).map(row => [row.dataset.id, row]));
  for (const [index, object] of objects.entries()) {
    const geometry = resolved.get(object.id);
    let row = rows.get(object.id);
    if (row && row.dataset.type !== object.type) { reflectionEditors.get(row)?.destroy?.(); row.remove(); row = null; }
    row ||= createObjectRow(object);
    rows.delete(object.id);
    row.className = `object-row${isPlot(object) ? ' equation-row' : object.type === 'slider' ? ' slider-row' : ''}${object.type === 'parametric' ? ' parametric-row' : ''}${selected === object.id || selection.has(object.id) ? ' selected' : ''}`;
    row.style.setProperty('--object-color', objectColor(object));
    if (object.type === 'slider') row.querySelector('.object-info').style.opacity = object.hidden ? '0.3' : String(object.opacity ?? 1);
    const parents = object.parents?.map(id => objects.find(parent => parent.id === id)?.name).join(', ');
    if (isJavaScript(object)) {
      row.querySelector('.object-definition').hidden = true;
    } else if (object.type === 'parametric') {
      row.querySelector('.parametric-name').textContent = `${object.name}:`;
      for (const coordinate of ['x', 'y']) {
        const field = row.querySelector(`[data-coordinate="${coordinate}"]`);
        const latex = object[`${coordinate}Latex`] ?? expressionToLatex(object[`${coordinate}Source`]);
        if (field.value !== latex) field.value = latex;
        field.setAttribute('aria-invalid', String(!!object.invalid));
      }
      for (const key of ['tMin', 'tMax']) {
        const input = row.querySelector(`[data-bound="${key}"]`);
        if (document.activeElement !== input) input.value = object.draft?.[key] ?? object[key];
        input.setAttribute('aria-invalid', String(!!object.invalid));
      }
      row.querySelector('.formula-error').textContent = messageText(object.error);
    } else if (object.type === 'equation') {
      row.querySelector('.equation-name').textContent = `${object.name}:`;
      const field = row.querySelector('math-field');
      const latex = object.latex ?? equationToLatex(object.source);
      if (field.value !== latex) field.value = latex;
      delete field.dataset.i18nAriaLabel;
      field.setAttribute('aria-label', `${object.name}: ${object.source}`);
      field.setAttribute('aria-invalid', String(!!object.invalid));
      row.querySelector('.formula-error').textContent = messageText(object.error);
    } else if (object.type === 'slider') {
      normalizeSlider(object);
      row.querySelector('.slider-name').textContent = object.name;
      row.querySelector('.slider-value').textContent = number(object.value);
      row.querySelector('.slider-min').textContent = number(object.min);
      row.querySelector('.slider-max').textContent = number(object.max);
      const input = row.querySelector('.slider-input');
      input.min = object.min; input.max = object.max; input.step = object.step; input.value = object.value;
      row.querySelector('.slider-play').dataset.i18nAriaLabel = sliderAnimations.has(object.id) ? 'ui.pause' : 'ui.play';
    } else row.querySelector('.object-definition').textContent = !geometry ? t('object.undefined', { name: object.name }) : isMeasurement(object) ? Number.isFinite(geometry.value) ? measurementText(geometry, true) : t('object.computing', { name: object.name }) : isPoint(object) ? `${object.name} = (${number(geometry.x)}, ${number(geometry.y)})` : `${object.name} : ${isSoftBody(object) ? t('soft.object') : isLiquid(object) ? t('liquid.object') : isFlexible(object) ? t(`tool.${object.type}`) : isPhysicsBody(object) ? t('physics.body') : object.type === 'region' ? t('object.region') : t(labels[object.type])} (${parents})`;
    const detail = row.querySelector('.object-detail');
    detail.hidden = isJavaScript(object) || !geometry || isPoint(object) && object.type !== 'ratioPoint' || isPlot(object) || object.type === 'slider';
    if (!detail.hidden) detail.textContent = object.type === 'ratioPoint' ? t('ratio.definition', { parents, m: object.ratio[0], n: object.ratio[1] }) : equation(geometry);
    cadEditors.get(row)?.(object, geometry);
    physicsEditors.get(row)?.(object);
    regionEditors.get(row)?.(object);
    reflectionEditors.get(row)?.(object, hasScript(object) ? reflection.statuses.get(object.id) : undefined);
    const bindingStatus = row.querySelector('.binding-status');
    if (bindingStatus) {
      bindingStatus.hidden = !hasBindings(object);
      const error = reflection.statuses.get(object.id)?.error;
      bindingStatus.classList.toggle('formula-error', !!error);
      bindingStatus.textContent = error || t('script.bindings', { references: JSON.stringify(object.bindings || {}) });
    }
    localizeDOM(row);
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
  }
  for (const row of rows.values()) { reflectionEditors.get(row)?.destroy?.(); row.remove(); }
}

function selectableObjects() {
  return [...resolved.values()].filter(object => !isJavaScript(object)).map(object => isPlot(object) ? { ...object, plot: plots.get(object.id) } : object.type === 'region' ? { ...object, region: regions.get(object.id) } : object);
}

function updateMarquee() {
  selection = objectsInBox(selectableObjects(), view, width, height, screenBox(gesture.screen, gesture.current));
  selected = [...selection].at(-1) || null;
  renderObjects();
  draw();
}

function scene(clean = false) {
  const radius = hitRadius;
  if (touchPreview) hitRadius = 2;
  plots.sync(objects, view, width, height);
  if (!clean) for (const row of element('objects').children) {
    if (row.dataset.id) updateObjectStatus(row.querySelector('.object-status'), plots.status(row.dataset.id));
  }
  updateEquationSnapPoints();
  updateEquationIntersections();
  regions.sync([...resolved.values()], view, width, height, plots);
  updateAreaMeasurements();
  if (!clean) traces.sync(objects, resolved, plots, regions);
  const geometry = selectableObjects();
  if (!clean && cadTools.has(activeTool)) geometry.push(...cadPreview(pointer));
  else if (!clean && pending?.rope && pointer) {
    const second=ropeAnchor(hitTest(pointer,object=>isPhysicsBody(object)||isSoftBody(object)||isPoint(object)),pointer);
    const preview=(activeTool==='spring'?createSpring:createRope)([pending.anchor,second],resolved);if(preview)geometry.push({...preview,preview:true});
  }
  else if (!clean && pending && activeTool === 'ratioPoint') geometry.push(...ratioPointPreview(pointer));
  else if (!clean && pending && pointer && measurementTools.has(activeTool)) geometry.push(...measurementPreview(pointer));
  else if (!clean && pending && pointer && activeTool === 'perpendicularBisector') geometry.push(...perpendicularBisectorPreview(pointer));
  else if (!clean && pending && pointer && bisectorTypes.has(activeTool)) geometry.push(...bisectorPreview(pointer));
  else if (!clean && pending && pointer && (conicTypes.has(activeTool) || dualConstructionTools.has(activeTool))) geometry.push(...conicPreview(pointer));
  else if (!clean && pending && pointer && derivedLineTypes.has(activeTool)) geometry.push(...derivedPreview(pointer));
  else if (!clean && pending && pointer && toolParents.get(activeTool)?.id === 'circles') geometry.push(...circularToolPreview(pointer));
  else if (!clean && pending && pointer && !['intersection', 'midpoint', 'select', 'pan'].includes(activeTool)) {
    const first = resolved.get(pending.ids[0]);
    const second = hitTest(pointer, isPoint) || snapped(pointer);
    if (first && distance(first, second) > 0) geometry.push({ type: activeTool, first, second, radius: distance(first, second), preview: true });
  }
  hitRadius = radius;
  return buildScene(geometry, view, width, height, {
    grid: element('grid').checked, axes: element('axes').checked,
    snapGrid: element('snap').checked ? snapSettings.read() : null,
    selected, selection, hovered, pending: pending?.ids?.at(-1) || pending?.id || pending?.pointId || pending?.subjectId || pending?.referenceId, clean,
    marquee: gesture?.mode === 'marquee' ? screenBox(gesture.screen, gesture.current) : null,
    surfaceOverlay: !clean && surfaceBrushes[activeTool] ? activeTool === 'frictionBrush' ? 'friction' : 'restitution' : null,
    surfaceBrush: !clean && surfaceBrushes[activeTool] && pointer ? { ...surfaceBrushes[activeTool].state, property: activeTool === 'frictionBrush' ? 'friction' : 'restitution', position: pointer, target: surfaceBrushTarget(pointer) } : null,
    ripples: clean ? [] : ripples,
    traces: traces.samples,
    physicsDrag: !clean ? physics.dragGuide() : null,
  });
}

function paintText(labels) {
  for (const [index, label] of labels.entries()) {
    let node = textLayer.children[index];
    if (!node) {
      node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      node.setAttribute('font-family', 'Arial, sans-serif');
      textLayer.append(node);
    }
    for (const [key, value] of Object.entries({ x: label.x, y: label.y, fill: label.color, opacity: label.opacity ?? 1, 'text-anchor': label.anchor, 'font-size': label.size, stroke: label.measurement ? getTheme().canvas.background : 'none', 'stroke-width': label.measurement ? 4 : 0, 'stroke-linejoin': 'round', 'paint-order': 'stroke fill' })) {
      const attribute = String(value);
      if (node.getAttribute(key) !== attribute) node.setAttribute(key, attribute);
    }
    if (node.textContent !== label.value) node.textContent = label.value;
  }
  while (textLayer.children.length > labels.length) textLayer.lastElementChild.remove();
}

function draw() {
  if (frame) return;
  frame = requestAnimationFrame(now => {
    frame = 0;
    if (!renderer || !width || !height) return;
    for (let index = ripples.length - 1; index >= 0; index--) {
      if (now - ripples[index].started >= ripples[index].duration) ripples.splice(index, 1);
    }
    physics.anchors = resolved;
    syncPhysicsBoundaries(physics, selectableObjects(), view, width, height);
    const physicsChanged = physicsReplayBefore ? new Set() : tickTimeline(now);
    syncTimeline();
    if (physicsChanged.size) {
      resolved = resolveObjects(objects, resolved, physicsChanged, intersectionTracker);
      renderObjects();
    }
    const current = scene();
    renderer.render(current.shapes, false, current.groups);
    paintText(current.labels);
    documentEditor?.sync();
    syncReflection();
    const playing = !physicsReplayBefore && (scriptClockOnly() && timeline.state.running || objects.some(object => isPhysicsObject(object) && object.running && !object.hidden));
    if (physicsSession && !playing) pausePhysics();
    if ((ripples.length || playing) && !renderer.lost) draw();
  });
}

function zoom(factor, anchor = { x: width / 2, y: height / 2 }) {
  if (gesture) return;
  view = zoomView(view, factor, anchor, width, height);
  pointer = screenToWorld(anchor);
  hovered = hitTest(pointer, activeTool === 'intersection' ? object => !isPoint(object) : () => true)?.id || null;
  draw();
}

function eventPosition(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function surfaceBrushTarget(position, tool = activeTool) {
  const brush = surfaceBrushes[tool];
  const lock = gesture?.mode === 'surfacePaint' ? gesture.surfaceLock : null;
  return findBrushSurface(trimCadSources(selectableObjects()).flatMap(cadPrimitives), position,
    view, width, height, brush.state.reach, lock);
}

function paintSurfaceAt(position) {
  const brush = surfaceBrushes[gesture.tool];
  const target = surfaceBrushTarget(position, gesture.tool);
  if (!target) return;
  const object = objects.find(object => object.id === target.geometry.id);
  if (!object) return;
  gesture.surfaceLock = { id: object.id, normal: target.hit.normal };
  const { radius, coefficient, erase } = brush.state;
  const paint = gesture.tool === 'restitutionBrush' ? paintRestitution : paintSurface;
  paint(object, target.hit.position, target.hit.normal, radius / view.scale, erase ? null : coefficient, surfaceFrame(target.geometry));
  selected = object.id;
}

function paintSurfaceStroke(position) {
  const brush = surfaceBrushes[gesture.tool];
  const previous = gesture.last || position;
  const distance = Math.hypot(position.x - previous.x, position.y - previous.y) * view.scale;
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, brush.state.radius / 3)));
  for (let index = 1; index <= steps; index++) paintSurfaceAt({ x: previous.x + (position.x - previous.x) * index / steps, y: previous.y + (position.y - previous.y) * index / steps });
  gesture.last = { ...position };
  refresh();
}

function beginPhysicsDrag(position, pointerId) {
  const hit = hitTest(position, isPhysicsObject);
  if (!hit) { setHint('drag.physicalOnly'); return; }
  if (physicsReplayBefore) pausePhysics();
  finishObjectEdit(); finishObjectStyleEdit();
  const object = objects.find(object => object.id === hit.id);
  if ((object.duration > 0 && object.time >= object.duration) || (timeline.state.duration > 0 && timeline.state.time >= timeline.state.duration)) {
    setHint('drag.finished'); return;
  }
  const before = snapshot(), session = physicsSession;
  physicsSession ||= { before };
  for (const item of objects.filter(isPhysicsObject)) if (item.time === 0) item.initialState = bodyState(item);
  timeline.play(objects);
  physics.anchors = resolved;
  syncPhysicsBoundaries(physics, selectableObjects(), view, width, height);
  timeline.sync(objects); timeline.ensureEngine(objects); physics.syncBodies(objects);
  if (!physics.beginDrag(hit.id, position)) { physicsSession = session; restoreSnapshot(before); refresh(); return; }
  selected = hit.id; selection.clear();
  gesture = { mode: 'physicsForce', id: hit.id, before, session, pointerId };
  canvas.style.cursor = 'grabbing'; setHint('drag.active'); refresh();
}

function releasePhysicsDrag(cancelled) {
  if (gesture?.mode !== 'physicsForce') return;
  const { before, session, pointerId } = gesture;
  gesture = null; physics.endDrag();
  if (cancelled) { physicsSession = session; restoreSnapshot(before); }
  if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  canvas.style.cursor = 'grab'; setHint('drag.hint'); refresh();
}

function startPointer(event) {
  if (!renderer || renderer.lost || gesture || ![0, 1].includes(event.button)) return;
  event.preventDefault();
  canvas.focus();
  const screen = eventPosition(event);
  pointer = screenToWorld(screen);
  canvas.setPointerCapture(event.pointerId);
  if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
    regionRequest++;
    regions.cancelQueries();
    cancelPending();
    gesture = { mode: 'marquee', screen, current: screen, pointerId: event.pointerId, previous: selection, selected };
    selection = new Set();
    selected = null;
    refresh();
  } else if (spaceHeld || activeTool === 'pan' || event.button === 1) {
    gesture = { mode: 'pan', screen, view: { ...view }, pointerId: event.pointerId };
    canvas.style.cursor = 'grabbing';
  } else if (surfaceBrushes[activeTool]) {
    pausePhysics(); finishObjectEdit(); finishObjectStyleEdit();
    selection.clear();
    gesture = { mode: 'surfacePaint', tool: activeTool, before: snapshot(), pointerId: event.pointerId };
    paintSurfaceStroke(pointer);
  } else if (activeTool === 'physicsDrag') {
    beginPhysicsDrag(pointer, event.pointerId);
  } else if (activeTool === 'select') {
    const rope=resolved.get(selected);
    const handle=isFlexible(rope)?rope.anchorPoints.findIndex(p=>distance(p,pointer)*view.scale<11):-1;
    const hit = handle>=0 ? rope : hitTest(pointer);
    selection.clear();
    selected = hit?.id || null;
    if (hit && isPoint(hit)) triggerRipple(hit);
    if (handle>=0) {
      pausePhysics();gesture={mode:'ropeAnchor',id:hit.id,index:handle,before:snapshot(),pointerId:event.pointerId};
    } else if (isLiquid(hit)||isSoftBody(hit)) {
      pausePhysics();
      const object=objects.find(o=>o.id===hit.id);
      const field=isSoftBody(hit)?'nodes':'particles';
      gesture={mode:'liquidMove',field,id:hit.id,before:snapshot(),origin:{...pointer},positions:object[field].map(p=>({...p.position})),pointerId:event.pointerId};
    } else if (isPhysicsBody(hit)) {
      pausePhysics();
      gesture = { mode: 'physics', id: hit.id, before: snapshot(), offset: { x: hit.position.x - pointer.x, y: hit.position.y - pointer.y }, pointerId: event.pointerId };
    } else if ((hit?.type === 'point' || hit?.type === 'snapPoint') && !hasBindings(hit)) { pausePhysics(); gesture = { mode: 'point', id: hit.id, before: snapshot(), offset: { x: hit.x - pointer.x, y: hit.y - pointer.y }, pointerId: event.pointerId }; }
    else if (isMeasurement(hit)) { pausePhysics(); gesture = { mode: 'measurement', id: hit.id, before: snapshot(), screen, offset: { ...(hit.labelOffset || { x: 0, y: 0 }) }, pointerId: event.pointerId }; }
    else if (!hit) gesture = { mode: 'pan', screen, view: { ...view }, pointerId: event.pointerId };
    refresh();
  } else if (['rope','spring'].includes(activeTool)) constructRope(pointer, event.altKey);
  else construct(pointer);
}
canvas.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch') {
    if (renderer && !renderer.lost) touchInteraction.down(event);
  } else startPointer(event);
});

function movePointer(event) {
  if (gesture && event.pointerId !== gesture.pointerId) return;
  const screen = eventPosition(event);
  pointer = screenToWorld(screen);
  if (gesture?.mode === 'physicsForce') {
    physics.moveDrag(pointer); draw();
  } else if (gesture?.mode === 'surfacePaint') {
    paintSurfaceStroke(pointer);
  } else if (gesture?.mode === 'marquee') {
    gesture.current = screen;
    updateMarquee();
  } else if (gesture?.mode === 'pan') {
    view.x = gesture.view.x - (screen.x - gesture.screen.x) / view.scale;
    view.y = gesture.view.y + (screen.y - gesture.screen.y) / view.scale;
    pointer = screenToWorld(screen);
    draw();
  } else if (gesture?.mode === 'ropeAnchor') {
    const object=objects.find(o=>o.id===gesture.id);
    if(object){
      const target=hitTest(pointer,o=>isPhysicsBody(o)||isSoftBody(o)||isPoint(o));
      object.anchors[gesture.index]=ropeAnchor(target,pointer,true);
      if(isPhysicsBody(target)||isSoftBody(target))object.ignored=[...new Set([...object.ignored,target.id])];
      rebuildRope(object,resolved);
    }
    refresh(new Set([gesture.id]));
  } else if (gesture?.mode === 'liquidMove') {
    const object=objects.find(o=>o.id===gesture.id);
    if(object){object[gesture.field].forEach((p,i)=>{p.position={x:gesture.positions[i].x+pointer.x-gesture.origin.x,y:gesture.positions[i].y+pointer.y-gesture.origin.y}});object.time=0;object.initialState=bodyState(object);}
    refresh(new Set([gesture.id]));
  } else if (gesture?.mode === 'physics') {
    const object = objects.find(item => item.id === gesture.id);
    if (object) {
      object.position = { x: pointer.x + gesture.offset.x, y: pointer.y + gesture.offset.y };
      object.time = 0;
      object.initialState = bodyState(object);
    }
    refresh(new Set([gesture.id]));
  } else if (gesture?.mode === 'measurement') {
    const object = objects.find(object => object.id === gesture.id);
    if (object) object.labelOffset = { x: gesture.offset.x + screen.x - gesture.screen.x, y: gesture.offset.y + screen.y - gesture.screen.y };
    refresh(new Set([gesture.id]));
  } else if (gesture?.mode === 'point') {
    const point = objects.find(object => object.id === gesture.id);
    if (point) movePoint(point, { x: pointer.x + gesture.offset.x, y: pointer.y + gesture.offset.y });
    refresh();
  } else {
    const hit = hitTest(pointer, activeTool === 'intersection' ? object => !isPoint(object) : () => true);
    hovered = hit?.id || null;
    if (activeTool === 'select') canvas.style.cursor = hit ? isPoint(hit) || isPhysicsObject(hit) ? 'grab' : 'pointer' : 'default';
    if (activeTool === 'physicsDrag') canvas.style.cursor = isPhysicsObject(hit) ? 'grab' : 'crosshair';
    draw();
  }
}
canvas.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') touchInteraction.move(event);
  else movePointer(event);
});

function finishGesture(event) {
  if (gesture && event.pointerId !== gesture.pointerId) return;
  if (['physics','liquidMove','ropeAnchor','point','measurement'].includes(gesture?.mode) && event.type === 'lostpointercapture' && (event.buttons & 1)) {
    try { canvas.setPointerCapture(event.pointerId); return; } catch { /* Finish if the pointer is no longer active. */ }
  }
  if (gesture?.mode === 'physicsForce') {
    if (event.type === 'lostpointercapture' && (event.buttons & 1)) {
      physics.moveDrag(screenToWorld(eventPosition(event)));
      try { canvas.setPointerCapture(event.pointerId); return; } catch { /* Release if the pointer is no longer active. */ }
    }
    if (event.type === 'pointerup') physics.moveDrag(screenToWorld(eventPosition(event)));
    releasePhysicsDrag(event.type === 'pointercancel');
    return;
  }
  if (gesture?.mode === 'surfacePaint' && event.type === 'lostpointercapture' && (event.buttons & 1)) {
    // A browser can drop capture before delivering a coalesced move. Preserve
    // that last span and resume capture while the painting button is still held.
    paintSurfaceStroke(screenToWorld(eventPosition(event)));
    try { canvas.setPointerCapture(event.pointerId); return; } catch { /* Pointer no longer active: finish below. */ }
  }
  if (gesture?.mode === 'marquee') {
    if (event.type === 'pointerup') { gesture.current = eventPosition(event); updateMarquee(); }
    else { selection = gesture.previous; selected = gesture.selected; }
    renderObjects();
    draw();
  }
  if (gesture?.mode === 'surfacePaint') {
    if (event.type === 'pointercancel') { restoreSnapshot(gesture.before); refresh(); }
    else { if (event.type === 'pointerup') paintSurfaceStroke(screenToWorld(eventPosition(event))); commit(gesture.before); }
  }
  if (gesture?.mode === 'ropeAnchor') { if(event.type==='pointercancel')restoreSnapshot(gesture.before);else commit(gesture.before);refresh(); }
  if (['point','measurement','physics','liquidMove'].includes(gesture?.mode)) {
    if (event.type === 'pointercancel') { restoreSnapshot(gesture.before); refresh(); }
    else commit(gesture.before);
  }
  gesture = null;
  canvas.style.cursor = activeTool === 'pan' || spaceHeld ? 'grab' : activeTool === 'select' ? 'default' : 'crosshair';
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => {
  if (event.pointerType === 'touch') touchInteraction.end(event);
  else finishGesture(event);
});
window.addEventListener('blur', () => {
  if (gesture?.mode === 'physicsForce') { releasePhysicsDrag(false); pausePhysics(); return; }
  if (gesture?.mode !== 'surfacePaint') return;
  const pointerId = gesture.pointerId;
  finishGesture({ type: 'pointercancel', pointerId });
  if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
});
canvas.addEventListener('pointerleave', () => { if (!gesture && !touchInteraction?.active) { pointer = null; hovered = null; draw(); } });
canvas.addEventListener('wheel', event => { event.preventDefault(); zoom(Math.exp(-event.deltaY * 0.0015), eventPosition(event)); }, { passive: false });
canvas.addEventListener('contextmenu', event => {
  event.preventDefault();
  if (event.pointerType === 'touch') return;
  if (gesture) return;
  objectMenu.close();
  const position = screenToWorld(eventPosition(event));
  const target = hitTest(position)?.id;
  cancelPending();
  setHint('');
  selection.clear();
  selected = objects.some(object => object.id === target) ? target : null;
  hovered = null;
  refresh();
  if (selected) objectMenu.openQuick(selected, canvas, { x: event.clientX, y: event.clientY });
  else objectMenu.openCanvas(canvas, { x: event.clientX, y: event.clientY });
});

function undo() {
  if (gesture) return;
  touchInteraction?.close();
  pausePhysics();
  finishObjectEdit();
  if (pending) { setTool(activeTool); return; }
  if (!history.length) return;
  future.push(snapshot());
  restoreSnapshot(history.pop());
  selected = null;
  selection.clear();
  hovered = null;
  refresh();
}
function redo() {
  if (gesture) return;
  touchInteraction?.close();
  pausePhysics();
  finishObjectEdit();
  if (pending) setTool(activeTool);
  if (!future.length) return;
  history.push(snapshot());
  restoreSnapshot(future.pop());
  selected = null;
  selection.clear();
  hovered = null;
  refresh();
}
element('undo').addEventListener('click', undo);
element('redo').addEventListener('click', redo);
element('home').addEventListener('click', () => { if (!gesture) { view = { x: 0, y: 0, scale: 65 }; draw(); } });
element('zoom-in').addEventListener('click', () => zoom(1.25));
element('zoom-out').addEventListener('click', () => zoom(0.8));
element('settings-toggle').addEventListener('click', () => {
  element('settings').hidden = !element('settings').hidden;
  element('settings-toggle').setAttribute('aria-expanded', String(!element('settings').hidden));
});
document.addEventListener('pointerdown', event => {
  if (!element('settings').contains(event.target) && !element('settings-toggle').contains(event.target)) {
    element('settings').hidden = true;
    element('settings-toggle').setAttribute('aria-expanded', 'false');
  }
});
element('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { setHint('hint.fullscreen'); }
});
for (const id of ['grid', 'axes', 'snap']) element(id).addEventListener('change', draw);
element('clear').addEventListener('click', () => {
  pausePhysics();
  if (gesture || !objects.length || !window.confirm(t('ui.clearConfirm'))) return;
  cancelPending();
  const before = snapshot();
  objects = [];
  traces.clear();
  selected = null;
  hovered = null;
  commit(before);
});

element('export').addEventListener('click', async () => {
  if (!renderer || renderer.lost) return;
  element('export').disabled = true;
  let url;
  try {
    const clean = scene(true);
    paintText(clean.labels);
    const svg = textLayer.cloneNode(true);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const imageData = await renderer.render(clean.shapes, true, clean.groups);
    draw();
    const output = document.createElement('canvas');
    output.width = imageData.width;
    output.height = imageData.height;
    const compositor = output.getContext('2d');
    compositor.putImageData(imageData, 0, 0);
    url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    const image = new Image();
    image.src = url;
    await image.decode();
    compositor.drawImage(image, 0, 0, output.width, output.height);
    const link = document.createElement('a');
    link.download = 'StuCanvas.png';
    link.href = output.toDataURL('image/png');
    link.click();
  } catch (error) { setHint('error.export', { message: error.message }); }
  finally { if (url) URL.revokeObjectURL(url); element('export').disabled = false; draw(); }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && gesture?.mode === 'physicsForce') {
    event.preventDefault(); releasePhysicsDrag(true); return;
  }
  if (event.key === 'Escape' && ['surfacePaint','ropeAnchor'].includes(gesture?.mode)) {
    const { before, pointerId } = gesture; gesture = null;
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    restoreSnapshot(before); refresh(); event.preventDefault(); return;
  }
  if (event.key === 'Escape' && gesture?.mode === 'marquee') {
    event.preventDefault();
    const pointerId = gesture.pointerId;
    selection = gesture.previous;
    selected = gesture.selected;
    gesture = null;
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    renderObjects();
    draw();
    return;
  }
  if (event.target.matches('input, textarea, select, math-field, [contenteditable]') || gesture) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
  if ((event.ctrlKey || event.metaKey) && key === 'y') { event.preventDefault(); redo(); return; }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Space' && event.target === canvas) { event.preventDefault(); spaceHeld = true; canvas.style.cursor = 'grab'; }
  if (key === 'escape') setTool(pending ? activeTool : 'select');
  if ((key === 'delete' || key === 'backspace') && (selected || selection.size)) { event.preventDefault(); removeObjects(selection.size ? selection : [selected]); }
  const tool = event.shiftKey
    ? toolItems.find(tool => tool.key.toLowerCase() === `⇧${key}`) || toolItems.find(tool => tool.key.toLowerCase() === key)
    : toolItems.find(tool => tool.key.toLowerCase() === key);
  if (tool?.id === 'slider') createSlider();
  else if (tool?.id === 'parametric') createParametric();
  else if (tool?.id === 'javascript') createJavaScriptRegion();
  else if (tool) setTool(surfaceBrushes[tool.id] && activeTool === tool.id ? 'select' : tool.id);
});
document.addEventListener('keyup', event => { if (event.code === 'Space') { spaceHeld = false; canvas.style.cursor = activeTool === 'pan' ? 'grab' : activeTool === 'select' ? 'default' : 'crosshair'; } });
window.addEventListener('blur', () => { spaceHeld = false; });

function addDraftEquation() {
  pausePhysics();
  if (gesture) return;
  const draft = element('equation-input');
  if (!draft.value.trim()) {
    draft.removeAttribute('aria-invalid');
    setMessage(element('equation-error'), '');
    return;
  }
  try {
    const latex = draft.value;
    const compiled = compileEquation(latexToSource(latex), sliderParameters());
    cancelPending();
    finishObjectEdit();
    const before = snapshot();
    const object = { id: crypto.randomUUID(), type: 'equation', name: nextEquationName(), source: compiled.source, latex };
    objects.push(object);
    selected = object.id;
    editingSession = { id: object.id, before };
    const form = draft.closest('form');
    createObjectRow(object, form);
    draft.removeAttribute('aria-invalid');
    setMessage(element('equation-error'), '');
    const nextDraft = draftTemplate.cloneNode(true);
    element('objects').append(nextDraft);
    localizeDOM(nextDraft);
    bindDraft(nextDraft);
    refresh();
  } catch (error) {
    draft.setAttribute('aria-invalid', 'true');
    setMessage(element('equation-error'), errorMessage(error));
  }
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && event.target.matches('math-field')) {
    event.preventDefault();
    event.stopPropagation();
    if (editingSession) {
      restoreSnapshot(editingSession.before);
      editingSession = null;
      refresh();
    } else event.target.value = '';
    setMessage(element('equation-error'), '');
    canvas.focus();
  }
});
initializeMathInput();
bindDraft(element('equation-form'));
for (const language of languages) {
  const option = document.createElement('option');
  option.value = language.id;
  option.dataset.i18n = `language.${language.id}`;
  element('language').append(option);
}
localizeDOM(element('language'));
element('language').value = getLocale();
element('language').addEventListener('change', event => setLocale(event.target.value));
function renderThemeSettings() {
  const select = element('theme');
  const options = [{ id: 'system', name: t('theme.system') }, ...listThemes().map(theme => ({ id: theme.id, name: theme.nameKey ? t(theme.nameKey) : theme.name }))];
  if (select.options.length !== options.length || [...select.options].some((option, i) => option.value !== options[i].id)) {
    select.replaceChildren(...options.map(({ id, name }) => new Option(name, id)));
  } else options.forEach(({ name }, i) => { select.options[i].textContent = name; });
  select.value = getThemeSelection();
}
renderThemeSettings();
element('theme').addEventListener('change', event => setTheme(event.target.value));
onThemeChange(() => {
  renderThemeSettings();
  objectMenu.close();
  renderObjects();
  draw();
});

onLocaleChange(() => {
  renderThemeSettings();
  element('language').value = getLocale();
  for (const button of element('tools').children) {
    const group = toolGroups.get(button.dataset.group);
    const tool = toolById.get(group ? lastToolByGroup.get(group.id) : button.dataset.tool);
    button.title = t(group ? 'tool.groupTitle' : 'tool.title', { name: tool.name, key: tool.key });
    button.setAttribute('aria-label', group ? t('tool.groupAria', { group: group.name, name: tool.name }) : tool.name);
  }
  if (openToolMenuAnchor) showToolMenu(toolGroups.get(openToolMenuAnchor.dataset.group), openToolMenuAnchor);
  renderObjects();
  for (const row of element('objects').children) if (row.dataset.id) updateObjectStatus(row.querySelector('.object-status'), plots.status(row.dataset.id));
  draw();
});

let openToolMenu = null;
let openToolMenuAnchor = null;
function closeToolMenu() {
  openToolMenu?.remove();
  openToolMenuAnchor?.setAttribute('aria-expanded', 'false');
  openToolMenu = null;
  openToolMenuAnchor = null;
}

function showToolMenu(group, anchor) {
  closeToolMenu();
  const menu = document.createElement('div');
  menu.className = `tool-menu tool-menu-${group.id}`;
  menu.setAttribute('role', 'menu');
  const title = document.createElement('div');
  title.className = 'tool-menu-title';
  title.innerHTML = `<span>${group.name}</span><small>${t(group.id === 'physics' ? 'ui.chooseTool' : 'ui.chooseConstruction')}</small>`;
  menu.append(title);
  for (const child of group.children) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tool-menu-item';
    item.setAttribute('role', 'menuitem');
    item.classList.toggle('selected', activeTool === child.id);
    item.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${child.icon}</svg><span><strong>${child.name}</strong><small>${child.description}</small></span><kbd>${child.key}</kbd>`;
    item.addEventListener('click', () => { closeToolMenu(); setTool(surfaceBrushes[child.id] && activeTool === child.id ? 'select' : child.id); });
    menu.append(item);
  }
  document.body.append(menu);
  const bounds = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, bounds.left));
  const top = Math.min(window.innerHeight - menu.offsetHeight - 8, bounds.bottom + 8);
  menu.style.left = `${left}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  openToolMenu = menu;
  openToolMenuAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');
}

for (const tool of tools) {
  const button = document.createElement('button');
  button.className = `tool-button${tool.children ? ' tool-group-button' : ''}`;
  button.dataset.tool = tool.id;
  if (tool.children) button.dataset.group = tool.id;
  const selectedTool = tool.children ? toolById.get(lastToolByGroup.get(tool.id)) : tool;
  button.title = t(tool.children ? 'tool.groupTitle' : 'tool.title', { name: selectedTool.name, key: selectedTool.key });
  button.setAttribute('aria-label', tool.children ? t('tool.groupAria', { group: tool.name, name: selectedTool.name }) : tool.name);
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-haspopup', tool.children ? 'menu' : 'false');
  if (tool.children) button.setAttribute('aria-expanded', 'false');
  button.innerHTML = `<span class="tool-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${selectedTool.icon}</svg></span>${tool.children ? '<span class="tool-menu-caret" aria-hidden="true">⌄</span>' : ''}`;
  button.addEventListener('click', () => {
    if (tool.children) {
      if (!gesture) {
        setTool(lastToolByGroup.get(tool.id));
        showToolMenu(tool, button);
      }
    }
    else if (tool.id === 'slider') createSlider();
    else if (tool.id === 'parametric') createParametric();
    else if (tool.id === 'javascript') createJavaScriptRegion();
    else if (!gesture) setTool(surfaceBrushes[tool.id] && activeTool === tool.id ? 'select' : tool.id);
  });
  if (tool.children) {
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' || gesture) return;
      event.preventDefault();
      showToolMenu(tool, button);
      (openToolMenu.querySelector('.tool-menu-item.selected') || openToolMenu.querySelector('.tool-menu-item'))?.focus();
    });
  }
  element('tools').append(button);
}
document.addEventListener('pointerdown', event => {
  if (openToolMenu && !openToolMenu.contains(event.target) && !event.target.closest('.tool-group-button')) closeToolMenu();
});
window.addEventListener('resize', closeToolMenu);
document.addEventListener('visibilitychange', () => { if (document.hidden) pausePhysics(); });

documentEditor = createDocumentEditor({
  read: readDocument,
  apply: applyDocument,
  available: () => !gesture && !pending && !editingSession && !objectStyleSession,
  prepare: () => {
    pausePhysics();
    finishObjectEdit();
    finishObjectStyleEdit();
    objectMenu.close();
    closeToolMenu();
    cancelPending();
    refresh(new Set());
  },
});

createProjectMenu({
  async prepare(mode) {
    if (gesture) return false;
    touchInteraction?.close();
    document.activeElement?.blur?.();
    pausePhysics(); cancelPending();
    objectMenu.close(); closeToolMenu();
    for (const row of element('objects').children) if (reflectionEditors.get(row)?.flush?.() === false) return false;
    finishObjectEdit(); finishObjectStyleEdit();
    if (!documentEditor.flush()) return false;
    if (mode === 'export') {
      syncReflection();
      const deadline = performance.now() + 10000;
      while (reflection.pending) {
        if (performance.now() > deadline) throw new LocalizedError('project.calculating');
        await new Promise(resolve => setTimeout(resolve, 16));
      }
    }
    return true;
  },
  read: () => createProject(readDocument()),
  apply(project) {
    applyDocument(project.document);
    if (project.view) view = { ...project.view };
    if (project.display) for (const id of ['grid','axes','snap']) element(id).checked = project.display[id];
    snapSettings.apply(project.display?.snapping);
    element('touch-offset').checked = project.display?.touchOffset ?? true;
    selection.clear(); selected = hovered = null;
    documentEditor.reset(); refresh(new Set());
  },
});

mobileUI = createMobileUI();

function withTouchHit(target, action) {
  const previous = forcedHit, radius = hitRadius;
  forcedHit = target === undefined ? null : { object: target }; hitRadius = 2;
  try { return action(); } finally { forcedHit = previous; hitRadius = radius; }
}

function touchCandidates(screen) {
  return hitCandidates(screenToWorld(screen), object => {
    if (activeTool === 'point') return isPoint(object);
    if (toolParents.get(activeTool)?.id === 'circles' && !pending) return isPoint(object);
    if (['fillSingle','fillMultiple'].includes(activeTool)) return false;
    if (activeTool === 'intersection') return !isPoint(object) && (isPlot(object) || shapeTypes.has(object.type)) && object.id !== pending?.id;
    if (activeTool === 'arcConnection') return isArcSource(object) && !pending?.ids?.includes(object.id);
    if (['fillet', 'chamfer'].includes(activeTool)) return isLinear(object) && !pending?.ids?.includes(object.id);
    if (['midpoint', 'ratioPoint', 'perpendicularBisector'].includes(activeTool)) return isPoint(object) || object.type === 'segment';
    if (['rope', 'spring'].includes(activeTool)) return isPoint(object) || isPhysicsBody(object) || isSoftBody(object);
    if (activeTool === 'physicsDrag') return isPhysicsObject(object);
    if (activeTool !== 'select' && activeTool !== 'pan') return isPoint(object) || shapeTypes.has(object.type) || isPlot(object);
    return true;
  }, 2);
}

touchInteraction = createTouchInteraction(canvas, {
  position: eventPosition,
  screen: position => toScreen(position, view, width, height),
  selected: () => selected,
  mode: () => activeTool === 'select' ? 'select' : activeTool === 'pan' || activeTool === 'physicsDrag' || surfaceBrushes[activeTool] ? 'direct' : 'construct',
  candidates: touchCandidates,
  allowCoordinate: () => ['point','smartPoint','line','segment','ray','circle','circleRadius','circle3','arc','circumArc','semicircle','sector','circumSector','ellipse','hyperbola'].includes(activeTool),
  allowAutomatic: () => ['smartPoint','line','segment','ray'].includes(activeTool) || conicTypes.has(activeTool),
  color: objectColor,
  describe: object => `${object.name || object.id} · ${t(labels[object.type] || (object.type === 'region' ? 'object.region' : object.type === 'equation' ? 'ui.equation' : object.type === 'softBody' ? 'soft.object' : object.type === 'liquid' ? 'liquid.object' : 'mobile.object'))}`,
  hover(id) { hovered = id; draw(); },
  preview(screen) {
    touchPreview = true;
    const target = touchAim(screen, width, height, element('touch-offset').checked ? 52 : 0);
    const position = screenToWorld(target);
    pointer = position;
    const candidate = touchCandidates(target)[0];
    let shown = isPoint(candidate) ? candidate : snapped(position);
    const attaches = ['snapPoint','smartPoint','line','segment','ray'].includes(activeTool) || conicTypes.has(activeTool) || pending && toolParents.get(activeTool)?.id === 'circles';
    if (!isPoint(candidate) && attaches) {
      const nearest = candidate || nearestObjects(position, activeTool === 'snapPoint' ? Infinity : 24)[0]?.object;
      const projected = isPlot(nearest) ? nearestPlotPoint(position, nearest) : nearest && projectPointOnObject(position, nearest);
      if (projected) shown = projected;
    }
    hovered = candidate?.id || null;
    draw();
    return { screen: toScreen(shown, view, width, height), position, label: `${number(shown.x)}, ${number(shown.y)}` };
  },
  clearPreview() { touchPreview = false; pointer = null; hovered = null; draw(); },
  construct(position, target) {
    if (gesture) return;
    withTouchHit(target, () => {
      if (['rope','spring'].includes(activeTool)) constructRope(position, false);
      else construct(position);
    });
  },
  select(target) {
    selection.clear(); selected = target?.id || null; hovered = null;
    if (isPoint(target)) triggerRipple(target);
    refresh();
  },
  start(event, target) { withTouchHit(target, () => startPointer(event)); },
  move: movePointer,
  finish: finishGesture,
  cancel(event) { finishGesture({ type: 'pointercancel', pointerId: event.pointerId }); },
  context(event, target) {
    cancelPending(); selection.clear(); selected = target?.id || null; hovered = null;
    refresh();
    const position = { x: event.clientX, y: event.clientY };
    if (selected) objectMenu.openQuick(selected, canvas, position); else objectMenu.openCanvas(canvas, position);
  },
  beginPinch(points) {
    objectMenu.close();
    gesture = { mode: 'pinch', points, view: { ...view } };
  },
  movePinch(points) {
    if (gesture?.mode !== 'pinch') return;
    view = pinchView(gesture.view, gesture.points, points, width, height); draw();
  },
  endPinch() { if (gesture?.mode === 'pinch') gesture = null; pointer = null; draw(); },
});

element('touch-properties').addEventListener('click', () => {
  mobileUI.show(true); documentEditor.showObjects();
  element('objects').querySelector(`[data-id="${CSS.escape(selected || '')}"]`)?.scrollIntoView({ block: 'nearest' });
});
element('touch-object-menu').addEventListener('click', () => {
  if (selected) objectMenu.openQuick(selected, element('touch-object-menu'));
});
element('touch-cancel').addEventListener('click', () => { touchInteraction.close(); cancelPending(); pointer = null; setHint(''); refresh(); });

function resize() {
  const bounds = canvas.getBoundingClientRect();
  width = bounds.width;
  height = bounds.height;
  textLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
  if (renderer && width && height) renderer.resize(width, height, window.devicePixelRatio || 1);
  draw();
}
new ResizeObserver(resize).observe(element('canvas-wrap'));
window.addEventListener('resize', resize);
setTool('select');
try {
  renderer = await GeometryRenderer.create(canvas, showError, draw);
  resize();
  document.documentElement.dataset.renderer = 'webgpu';
} catch (error) { showError(error); }
