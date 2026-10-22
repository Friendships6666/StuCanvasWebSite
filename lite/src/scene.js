import { rendersInWindow } from './render-targets.js';
import { isFlexible } from './rope.js';
import { isLiquid } from './liquid.js';
import { isSoftBody, softCenter } from './soft-body.js';
import { flexiblePath as ropePath } from './spring.js';
import { surfaceSegments, paintedSurfaceSegments, surfaceColor } from './surface-friction.js';
import { clipLinear, gridStep, gridTicks, projectCircle, toScreen } from './projection.js';
import { snapSteps } from './grid-snap.js';
import { isPoint } from './geometry.js';
import { isPhysicsBody, bodyRectangles } from './physics.js';
import { bodyGeometry } from './physics-shape.js';
import { physicsMaterial } from './physics-material.js';
import { cadPrimitives, trimCadSources } from './cad.js';
import { objectColor, objectOpacity } from './object-style.js';
import { regionScreenProjection } from './regions.js';
import { regionMesh } from './region-mesh.js';
import { polarGrid } from './coordinate-system.js';
import { isPlot } from './plot/types.js';
import { conicSegments, isConic } from './conics.js';
import { isMeasurement, measurementLayout } from './measurements.js';

import { getTheme, rgba } from './themes.js';
const format = value => value === 0 ? '0' : Number(value.toPrecision(12)).toString();
let packedShapes = new Float32Array(81920);

export function buildScene(objects, view, width, height, options = {}) {
  const palette = getTheme().canvas;
  const selectionColor = rgba(palette.selection);
  let used = 0;
  const reserve = () => {
    if (used + 20 > packedShapes.length) {
      const grown = new Float32Array(packedShapes.length * 2);
      grown.set(packedShapes);
      packedShapes = grown;
    }
  };
  const labels = [];
  let tracing = false;
  let textOpacity = 1;
  const groups = [];
  const viewportBounds = [0, 0, width, height];
  const add = (bounds, geometry, style, color, fill = color) => {
    const values = [...bounds, ...geometry, ...style, ...color, ...fill];
    if (values.every(Number.isFinite)) {
      reserve();
      packedShapes.set(values, used);
      used += 20;
    }
  };
  const cloudPoint = (screenX, screenY, radius, color) => {
    reserve();
    packedShapes[used] = screenX - radius - 2;
    packedShapes[used + 1] = screenY - radius - 2;
    packedShapes[used + 2] = 2 * radius + 4;
    packedShapes[used + 3] = 2 * radius + 4;
    packedShapes[used + 4] = screenX;
    packedShapes[used + 5] = screenY;
    packedShapes.fill(0, used + 6, used + 12);
    packedShapes[used + 8] = 1;
    packedShapes[used + 10] = radius;
    packedShapes.set(color, used + 12);
    packedShapes.set(color, used + 16);
    used += 20;
  };
  const line = (first, second, halfWidth, color) => {
    const left = Math.max(0, Math.min(first.x, second.x) - halfWidth - 2);
    const top = Math.max(0, Math.min(first.y, second.y) - halfWidth - 2);
    const right = Math.min(width, Math.max(first.x, second.x) + halfWidth + 2);
    const bottom = Math.min(height, Math.max(first.y, second.y) + halfWidth + 2);
    if (right > left && bottom > top) add([left, top, right - left, bottom - top], [first.x, first.y, second.x, second.y], [0, halfWidth, 0, 0], color);
  };
  const point = (position, radius, border, color, fill = color) => {
    if (position.x < -radius || position.x > width + radius || position.y < -radius || position.y > height + radius) return;
    add([position.x - radius - 2, position.y - radius - 2, 2 * radius + 4, 2 * radius + 4], [position.x, position.y, 0, 0], [1, border, radius, 0], color, fill);
  };
  const rectangle = (left, top, right, bottom, color) => {
    left = Math.max(0, left);
    top = Math.max(0, top);
    right = Math.min(width, right);
    bottom = Math.min(height, bottom);
    if (right > left && bottom > top) add([left, top, right - left, bottom - top], [left, top, right, bottom], [4, 0, 0, 0], color);
  };
  const drawRipple = ripple => {
    const elapsed = (options.now ?? performance.now()) - ripple.started;
    const progress = Math.max(0, Math.min(1, elapsed / ripple.duration));
    const position = toScreen(ripple, view, width, height);
    const radius = 6 + progress * 30;
    const stroke = 1.8;
    const alpha = (1 - progress) * 0.8;
    if (alpha <= 0 || position.x < -radius || position.x > width + radius || position.y < -radius || position.y > height + radius) return;
    const color = rgba(palette.accent, alpha);
    add([position.x - radius - stroke - 2, position.y - radius - stroke - 2, 2 * (radius + stroke + 2), 2 * (radius + stroke + 2)], [position.x, position.y, 0, 0], [2, stroke, radius, 0], color);
  };
  const arcPoints = object => {
    const center = toScreen(object.first, view, width, height);
    const start = Math.atan2(object.arcStart.y - object.first.y, object.arcStart.x - object.first.x);
    const radius = object.radius * view.scale;
    const steps = Math.max(12, Math.min(192, Math.ceil(Math.abs(object.sweep) * Math.max(radius, 8) / 7)));
    return Array.from({ length: steps + 1 }, (_, index) => {
      const angle = start + object.sweep * index / steps;
      return { x: center.x + Math.cos(angle) * radius, y: center.y - Math.sin(angle) * radius };
    });
  };
  const drawArc = (object, halfWidth, color) => {
    const points = arcPoints(object);
    for (let index = 1; index < points.length; index++) line(points[index - 1], points[index], halfWidth, color);
    return points;
  };
  const selectionFrame = (position, radius, halfWidth, color) => {
    const arm = 4;
    const left = position.x - radius;
    const right = position.x + radius;
    const top = position.y - radius;
    const bottom = position.y + radius;
    line({ x: left, y: top + arm }, { x: left, y: top }, halfWidth, color);
    line({ x: left, y: top }, { x: left + arm, y: top }, halfWidth, color);
    line({ x: right - arm, y: top }, { x: right, y: top }, halfWidth, color);
    line({ x: right, y: top }, { x: right, y: top + arm }, halfWidth, color);
    line({ x: left, y: bottom - arm }, { x: left, y: bottom }, halfWidth, color);
    line({ x: left, y: bottom }, { x: left + arm, y: bottom }, halfWidth, color);
    line({ x: right - arm, y: bottom }, { x: right, y: bottom }, halfWidth, color);
    line({ x: right, y: bottom - arm }, { x: right, y: bottom }, halfWidth, color);
  };
  const text = (value, x, y, color = palette.text, anchor = 'start', size = 12, measurement = false) => {
    if (tracing && !measurement) return;
    if (x < -20 || y < -20 || x > width + 20 || y > height + 20) return;
    labels.push({ value, x, y, color, anchor, size, opacity: textOpacity, measurement });
  };
  const step = gridStep(view.scale);
  const horizontal = gridTicks(view.x, view.scale, width, step);
  const vertical = gridTicks(view.y, view.scale, height, step, true);
  if(view.coordinateSystem==='polar'){
    polarGrid(view,width,height,options,{
      line:(a,b,axis)=>line(a,b,axis ? .65 : .35,rgba(axis?palette.axes:palette.gridMinor)),
      circle:(circle,major)=>{
        let bounds=viewportBounds;
        if(circle.kind===2){
          const [x,y]=circle.geometry,r=circle.radius+2;
          const left=Math.max(0,x-r),top=Math.max(0,y-r),right=Math.min(width,x+r),bottom=Math.min(height,y+r);
          if(right<=left||bottom<=top)return;
          bounds=[left,top,right-left,bottom-top];
        }
        add(bounds,circle.geometry,[circle.kind,major ? .6 : .35,circle.radius,0],rgba(major?palette.gridMajor:palette.gridMinor));
      },
      text:(value,x,y,anchor='start')=>text(value,x,y,palette.text,anchor,11),
    });
  } else {
  if (options.grid) {
    if (options.snapGrid) {
      const settings = options.snapGrid, steps = snapSteps(settings, view.scale);
      for (const axis of ['x', 'y']) {
        const enabled = settings.axis === 'both' || settings.axis === axis;
        const rawStep = enabled ? steps[axis] : step / 5;
        // Display a subset of the exact lattice at distant zoom levels. Never
        // generate millions of subpixel lines for a very fine custom grid.
        const interval = rawStep * Math.max(1, Math.ceil(8 / (rawStep * view.scale)));
        if (!Number.isFinite(interval) || interval <= 0) continue;
        const origin = enabled ? settings[axis === 'x' ? 'originX' : 'originY'] : 0;
        for (const tick of gridTicks(view[axis] - origin, view.scale, axis === 'x' ? width : height, interval, axis === 'y')) {
          if (axis === 'x') line({ x: tick.screen, y: 0 }, { x: tick.screen, y: height }, .4, rgba(palette.gridMinor));
          else line({ x: 0, y: tick.screen }, { x: width, y: tick.screen }, .4, rgba(palette.gridMinor));
        }
      }
    } else {
      for (const tick of gridTicks(view.x, view.scale, width, step / 5)) line({ x: tick.screen, y: 0 }, { x: tick.screen, y: height }, 0.35, rgba(palette.gridMinor));
      for (const tick of gridTicks(view.y, view.scale, height, step / 5, true)) line({ x: 0, y: tick.screen }, { x: width, y: tick.screen }, 0.35, rgba(palette.gridMinor));
      for (const tick of horizontal) line({ x: tick.screen, y: 0 }, { x: tick.screen, y: height }, 0.6, rgba(palette.gridMajor));
      for (const tick of vertical) line({ x: 0, y: tick.screen }, { x: width, y: tick.screen }, 0.6, rgba(palette.gridMajor));
    }
  }
  const origin = toScreen({ x: 0, y: 0 }, view, width, height);
  if (options.axes) {
    const axisColor = rgba(palette.axes);
    if (origin.y >= 0 && origin.y <= height) {
      line({ x: 0, y: origin.y }, { x: width, y: origin.y }, 0.65, axisColor);
      line({ x: width - 5, y: origin.y - 3 }, { x: width - 1, y: origin.y }, 0.6, axisColor);
      line({ x: width - 5, y: origin.y + 3 }, { x: width - 1, y: origin.y }, 0.6, axisColor);
      for (const tick of horizontal) if (tick.value !== 0) text(format(tick.value), tick.screen, Math.min(height - 3, origin.y + 16), palette.text, 'middle', 11);
    }
    if (origin.x >= 0 && origin.x <= width) {
      line({ x: origin.x, y: 0 }, { x: origin.x, y: height }, 0.65, axisColor);
      line({ x: origin.x - 3, y: 5 }, { x: origin.x, y: 1 }, 0.6, axisColor);
      line({ x: origin.x + 3, y: 5 }, { x: origin.x, y: 1 }, 0.6, axisColor);
      for (const tick of vertical) if (tick.value !== 0) text(format(tick.value), Math.max(25, origin.x - 8), tick.screen + 4, palette.text, 'end', 11);
    }
    if (origin.x >= 0 && origin.x <= width && origin.y >= 0 && origin.y <= height) text('0', origin.x - 7, origin.y + 16, palette.text, 'end', 11);
  }
  }
  const visible = trimCadSources([...(options.traces || []), ...objects].filter(object=>object.preview||rendersInWindow(object,options.windowId))).flatMap(cadPrimitives).filter(object => !object.hidden);
  const ordered = [...visible.filter(object => object.type === 'region'), ...visible.filter(object => !isPoint(object) && !isMeasurement(object) && object.type !== 'region'), ...visible.filter(isPoint), ...visible.filter(isMeasurement)];
  ordered.sort((first, second) => Number(!!second.historical) - Number(!!first.historical));
  for (const object of ordered) {
    tracing = !!object.historical;
    if (object.type === 'slider' || object.type === 'javascript') continue;
    const highlighted = !options.clean && object.id && (options.selection?.has(object.id) || [options.selected, options.hovered, options.pending].includes(object.id));
    const alpha = objectOpacity(object) * (object.preview ? 0.45 : 1);
    if (alpha === 0) continue;
    textOpacity = alpha;
    const color = [1, 3, 5].map(offset => parseInt(objectColor(object).slice(offset, offset + 2), 16) / 255);
    const stroke = [...color, alpha];
    const halo = [...selectionColor.slice(0, 3), 0.28 * alpha];
    const halfWidth = (object.strokeWidth || 2.4) / 2;
    if (isSoftBody(object)) {
      const start=used/20;
      const points=object.nodes.map(node=>toScreen(node.position,view,width,height));
      for(const [one,two,three] of object.mesh.triangles){
        const a=points[one],b=points[two],c=points[three];
        const left=Math.max(0,Math.min(a.x,b.x,c.x)-2),top=Math.max(0,Math.min(a.y,b.y,c.y)-2);
        const right=Math.min(width,Math.max(a.x,b.x,c.x)+2),bottom=Math.min(height,Math.max(a.y,b.y,c.y)+2);
        if(right>left&&bottom>top)add([left,top,right-left,bottom-top],[a.x,a.y,b.x,b.y],[7,0,c.x,c.y],stroke);
      }
      if(used/20>start)groups.push({start,count:used/20-start});
      for(const [one,two] of object.mesh.boundary){
        const a=points[one],b=points[two];
        if(highlighted)line(a,b,halfWidth+3,halo);line(a,b,Math.max(.65,halfWidth),stroke);
      }
      if(object.showMesh&&!options.clean)for(const link of object.mesh.links)if(link.kind!=='bend')line(points[link.a],points[link.b],.45,[...color,alpha*.35]);
      const center=toScreen(softCenter(object),view,width,height);text(object.name,center.x+10,center.y-10,objectColor(object));
      continue;
    }
    if (isLiquid(object)) {
      const radius=Math.max(.7,object.radius*view.scale);
      const start=used/20,support=radius*2;
      for(const particle of object.particles) {
        const p=toScreen(particle.position,view,width,height);
        if(p.x < -support-6 || p.y < -support-6 || p.x > width+support+6 || p.y > height+support+6)continue;
        cloudPoint(p.x,p.y,support,stroke);
      }
      if(used/20>start){
        const liquid={color:stroke,halo:highlighted?halo:[0,0,0,0]},previous=groups.at(-1);
        // Adjacent pools with the same appearance share a continuous surface.
        if(previous?.liquid&&previous.start+previous.count===start&&previous.liquid.color.every((value,i)=>value===liquid.color[i])&&!tracing&&!previous.historical){
          previous.count+=used/20-start;
          if(liquid.halo[3]>previous.liquid.halo[3])previous.liquid.halo=liquid.halo;
        }
        else groups.push({start,count:used/20-start,liquid,historical:tracing});
      }
      continue;
    }
    if (isFlexible(object)) {
      const points=ropePath(object,Math.max(3,Math.min(12,Math.ceil(view.scale*object.length/object.segments/5)))).map(p=>toScreen(p,view,width,height));
      const radius=Math.max(1.5,object.radius*view.scale);
      for(let i=1;i<points.length;i++){
        if(highlighted)line(points[i-1],points[i],radius+4,halo);
        line(points[i-1],points[i],radius,stroke);
      }
      if(highlighted&&!object.historical)for(const p of [points[0],points.at(-1)])if(p)point(p,5,1.5,selectionColor,[...color,alpha]);
      continue;
    }
    if (isPhysicsBody(object)) {
      const material = physicsMaterial(object);
      const start = used / 20;
      const geometry = bodyGeometry(object);
      if (geometry.triangles) {
        const c = Math.cos(object.angle), s = Math.sin(object.angle);
        for (const triangle of geometry.triangles) {
          const points = triangle.map(p => toScreen({ x: object.position.x + p.x * c - p.y * s, y: object.position.y + p.x * s + p.y * c }, view, width, height));
          const left = Math.max(0, Math.min(...points.map(p => p.x)) - 2), top = Math.max(0, Math.min(...points.map(p => p.y)) - 2);
          const right = Math.min(width, Math.max(...points.map(p => p.x)) + 2), bottom = Math.min(height, Math.max(...points.map(p => p.y)) + 2);
          if (right > left && bottom > top) add([left, top, right - left, bottom - top], [points[0].x, points[0].y, points[1].x, points[1].y], [6, 0, points[2].x, points[2].y], [...color, alpha]);
        }
      } else for (const box of bodyRectangles(object)) {
        const center = toScreen(box, view, width, height);
        const halfX = box.width * view.scale / 2, halfY = box.height * view.scale / 2;
        const extentX = Math.abs(Math.cos(box.angle)) * halfX + Math.abs(Math.sin(box.angle)) * halfY + 2;
        const extentY = Math.abs(Math.sin(box.angle)) * halfX + Math.abs(Math.cos(box.angle)) * halfY + 2;
        const left = Math.max(0, center.x - extentX), top = Math.max(0, center.y - extentY);
        const right = Math.min(width, center.x + extentX), bottom = Math.min(height, center.y + extentY);
        if (right > left && bottom > top) add([left, top, right - left, bottom - top], [center.x, center.y, halfX, halfY], [5, 0, -box.angle, 0], [...color, highlighted ? Math.min(1, alpha * 1.15) : alpha]);
      }
      if (used / 20 > start) groups.push({ start, count: used / 20 - start, material: {
        ...material, origin: toScreen(object.position, view, width, height), angle: -object.angle,
        tileSize: material.tileSize * view.scale,
        tint: material.type === 'image' ? [1, 1, 1, 1] : rgba(getTheme().objects.physicsMaterial),
      } });
      const center = toScreen(object.position, view, width, height);
      if (highlighted) selectionFrame(center, 9, 1.25, [...selectionColor.slice(0, 3), alpha]);
      text(object.name, center.x + 10, center.y - 10, objectColor(object));
    } else if (object.type === 'region') {
      if (!object.region) continue;
      const mesh=regionMesh(object.region),projection=regionScreenProjection(object.region,view,width,height);
      const points=mesh.vertices.map(p=>({x:projection.horizontal(p.x),y:projection.vertical(p.y)}));
      const fill=[...color,highlighted?Math.min(1,alpha*1.15):alpha];
      for(let i=0;i<mesh.indices.length;i+=3){
        const a=points[mesh.indices[i]],b=points[mesh.indices[i+1]],c=points[mesh.indices[i+2]];
        const left=Math.max(0,Math.min(a.x,b.x,c.x)-2),top=Math.max(0,Math.min(a.y,b.y,c.y)-2);
        const right=Math.min(width,Math.max(a.x,b.x,c.x)+2),bottom=Math.min(height,Math.max(a.y,b.y,c.y)+2);
        if(right>left&&bottom>top)add([left,top,right-left,bottom-top],[a.x,a.y,b.x,b.y],[7,0,c.x,c.y],fill);
      }
    } else if (isMeasurement(object)) {
      const layout = measurementLayout(object, view, width, height);
      if (!layout) continue;
      const start = used / 20;
      for (const segment of layout.segments) {
        const color = segment.weak ? [...stroke.slice(0, 3), alpha * 0.45] : stroke;
        if (highlighted) line(segment.first, segment.second, halfWidth + 2, halo);
        line(segment.first, segment.second, Math.max(0.5, halfWidth * 0.65), color);
      }
      if (used / 20 > start) groups.push({ start, count: used / 20 - start });
      text(layout.label.value, layout.label.x, layout.label.y, objectColor(object), 'middle', 14, true);
    } else if (isPlot(object)) {
      const cloud = object.plot?.points;
      if (!cloud) continue;
      const start = used / 20;
      let label = null;
      for (let index = 0; index < cloud.length; index += 2) {
        const screenX = width / 2 + (cloud[index] - view.x) * view.scale;
        const screenY = height / 2 - (cloud[index + 1] - view.y) * view.scale;
        if (!Number.isFinite(screenX) || !Number.isFinite(screenY) || screenX < -8 || screenY < -8 || screenX > width + 8 || screenY > height + 8) continue;
        if (highlighted) cloudPoint(screenX, screenY, halfWidth + 2.2, halo);
        cloudPoint(screenX, screenY, halfWidth, stroke);
        if (!label && screenX > 16 && screenX < width - 40 && screenY > 24 && screenY < height - 24) label = { x: screenX, y: screenY };
      }
      if (used / 20 > start) groups.push({ start, count: used / 20 - start });
      if (label) text(object.name, label.x + 8, label.y - 8, objectColor(object));
    } else if (isPoint(object)) {
      const position = toScreen(object, view, width, height);
      if (highlighted) selectionFrame(position, 10, 1.25, [...selectionColor.slice(0, 3), alpha]);
      const radius = Math.max(1.5, (object.type === 'intersection' ? 5.5 : 5) + ((object.strokeWidth ?? 2.4) - 2.4) / 2);
      point(position, radius, Math.min(radius / 2, 1.15), rgba(palette.pointBorder, alpha), [...color, alpha]);
      if (!object.preview) text(object.name, position.x + 7, position.y - 10, objectColor(object), 'start', 15);
    } else if (isConic(object)) {
      const segments = conicSegments(object, view, width, height);
      const start = used / 20;
      for (const segment of segments) {
        if (highlighted) line(segment.start, segment.finish, halfWidth + 2.2, halo);
        line(segment.start, segment.finish, halfWidth, stroke);
      }
      if (used / 20 > start) groups.push({ start, count: used / 20 - start });
      const label = segments.find(segment => segment.start.x > 20 && segment.start.x < width - 40 && segment.start.y > 24 && segment.start.y < height - 24)?.start;
      if (!object.preview && label) text(object.name, label.x + 7, label.y - 7, objectColor(object));
    } else if (['semicircle', 'arc', 'circumArc', 'sector', 'circumSector'].includes(object.type)) {
      const startIndex = used / 20;
      const points = arcPoints(object);
      if (highlighted) drawArc(object, halfWidth + 2.2, halo);
      drawArc(object, halfWidth, stroke);
      if (object.type === 'sector' || object.type === 'circumSector') {
        const center = toScreen(object.first, view, width, height);
        const start = points[0];
        const end = points[points.length - 1];
        if (highlighted) {
          line(center, start, halfWidth + 2.2, halo);
          line(center, end, halfWidth + 2.2, halo);
        }
        line(center, start, halfWidth, stroke);
        line(center, end, halfWidth, stroke);
      }
      const labelPoint = points[Math.floor(points.length * 0.35)];
      if (!object.preview && labelPoint) text(object.name, labelPoint.x + 7, labelPoint.y - 7, objectColor(object));
      if (used / 20 > startIndex) groups.push({ start: startIndex, count: used / 20 - startIndex });
    } else if (object.type === 'circle') {
      const circle = projectCircle(object, view, width, height);
      if (!circle) continue;
      let bounds = viewportBounds;
      if (circle.kind === 2) {
        const margin = circle.radius + 10;
        const left = Math.max(0, circle.geometry[0] - margin);
        const top = Math.max(0, circle.geometry[1] - margin);
        bounds = [left, top, Math.min(width, circle.geometry[0] + margin) - left, Math.min(height, circle.geometry[1] + margin) - top];
      }
      if (bounds[2] <= 0 || bounds[3] <= 0) continue;
      if (highlighted) add(bounds, circle.geometry, [circle.kind, halfWidth + 2.2, circle.radius, 0], halo);
      add(bounds, circle.geometry, [circle.kind, halfWidth, circle.radius, 0], stroke);
      if (!object.preview && circle.kind === 2) text(object.name, circle.geometry[0] + circle.radius * 0.7 + 6, circle.geometry[1] - circle.radius * 0.7 - 6, objectColor(object));
    } else {
      const clipped = clipLinear(object, view, width, height);
      if (!clipped) continue;
      if (highlighted) line(clipped.first, clipped.second, halfWidth + 2.2, halo);
      line(clipped.first, clipped.second, halfWidth, stroke);
      if (!object.preview && object.name) {
        const position = { x: clipped.first.x * 0.94 + clipped.second.x * 0.06, y: clipped.first.y * 0.94 + clipped.second.y * 0.06 };
        text(object.name, Math.max(8, Math.min(width - 16, position.x + 6)), Math.max(16, Math.min(height - 10, position.y - 6)), objectColor(object));
      }
    }
  }
  tracing = false;
  textOpacity = 1;
  // Only the active brush's channel is visible. Editing colors never leak into
  // ordinary viewing or exports; the saved contact properties stay effective.
  const property = options.surfaceOverlay;
  const field = property === 'friction' ? 'surfaceFriction' : property === 'restitution' ? 'surfaceRestitution' : null;
  if (!options.clean && field) for (const object of ordered) {
    if (!object[field]?.length || object.invalid) continue;
    tracing = !!object.historical;
    const alpha = objectOpacity(object);
    if (!alpha) continue;
    const edges = paintedSurfaceSegments(object, surfaceSegments(object, view, width, height), field);
    for (const edge of edges) {
      const offset = object.type === 'physicsBody' || isSoftBody(object) ? .5 : (object.strokeWidth || 2.4) / 2 + 2;
      const screen = point => { const p = toScreen(point, view, width, height); return { x: p.x + edge.normal.x * offset, y: p.y - edge.normal.y * offset }; };
      const color = surfaceColor(edge.coefficient, property); color[3] = alpha;
      line(screen(edge.first), screen(edge.second), 1.8, color);
    }
  }
  if (!options.clean && options.surfaceBrush) {
    tracing = false;
    const brush = options.surfaceBrush, position = toScreen(brush.position, view, width, height);
    const color = brush.erase ? rgba(palette.text) : surfaceColor(brush.coefficient, brush.property);
    color[3] = brush.target ? .9 : .3;
    add([position.x - brush.radius - 2, position.y - brush.radius - 2, 2 * brush.radius + 4, 2 * brush.radius + 4],
      [position.x, position.y, 0, 0], [2, 1, brush.radius, 0], color);
    if (brush.target) {
      const { geometry, hit } = brush.target;
      const landing = toScreen(hit.position, view, width, height);
      const normal = { x: hit.normal.x, y: -hit.normal.y };
      const tip = { x: landing.x + normal.x * 18, y: landing.y + normal.y * 18 };
      const half = brush.radius;
      const edge = sign => ({ x: landing.x + normal.y * half * sign + normal.x * 3,
        y: landing.y - normal.x * half * sign + normal.y * 3 });
      line(position, landing, .65, color);
      line(edge(-1), edge(1), 2, color);
      line(landing, tip, 1, color);
      for (const sign of [-1, 1]) line(tip, { x: tip.x - normal.x * 5 + normal.y * sign * 4,
        y: tip.y - normal.y * 5 - normal.x * sign * 4 }, 1, color);
      point(landing, 3, 1, color, rgba(palette.background));
      text(`${geometry.name || geometry.id} · ${(hit.distance * view.scale).toFixed(1)} px`,
        Math.max(8, Math.min(width - 130, tip.x + 12)), Math.max(16, Math.min(height - 8, tip.y - 8)), palette.text, 'start', 12, true);
    }
  }
  if (!options.clean && options.physicsDrag) {
    const anchor = toScreen(options.physicsDrag.anchor,view,width,height);
    const target = toScreen(options.physicsDrag.target,view,width,height), color = rgba(palette.accent,.9);
    line(anchor,target,1,color);
    point(anchor,4,1,color,rgba(palette.background));
    point(target,5,1.5,color,rgba(palette.background));
  }
  if (!options.clean) for (const ripple of options.ripples || []) drawRipple(ripple);
  if (!options.clean && options.marquee) {
    const box = options.marquee;
    const color = rgba(palette.accent, 0.9);
    rectangle(box.left, box.top, box.right, box.bottom, rgba(palette.accent, 0.08));
    const corners = [{ x: box.left, y: box.top }, { x: box.right, y: box.top }, { x: box.right, y: box.bottom }, { x: box.left, y: box.bottom }];
    for (let index = 0; index < 4; index++) line(corners[index], corners[(index + 1) % 4], 0.65, color);
  }
  return { shapes: packedShapes.subarray(0, used), labels, groups };
}
