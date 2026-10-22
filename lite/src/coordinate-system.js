import { clipLinear, gridStep, projectCircle, toScreen } from './projection.js';
import { mainWindowId, validWindowId } from './render-targets.js';
import { defaultSnapSettings, polarSteps } from './grid-snap.js';

export const coordinateTypes = ['cartesian', 'polar'];
export const validCoordinateType = value => coordinateTypes.includes(value);
export const validCoordinateView = value => value && typeof value === 'object'
  && ['x', 'y', 'scale'].every(key => Number.isFinite(value[key])) && value.scale > 0
  && (value.coordinateSystem === undefined || validCoordinateType(value.coordinateSystem));
export function validCoordinateWindows(value) {
  return Array.isArray(value) && new Set(value.map(item => item?.id)).size === value.length
    && value.every(item => item && validWindowId(item.id) && item.id !== mainWindowId
      && validCoordinateView(item.view) && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(item[key]))
      && item.width >= 200 && item.width <= 10000 && item.height >= 180 && item.height <= 10000);
}

// Only the background changes. Objects and function samplers keep Cartesian
// world coordinates; polar snapping converts back to the same x/y space.
export function polarGrid(view, width, height, options, draw) {
  const settings = options.snapGrid || defaultSnapSettings;
  const center = options.snapGrid ? { x: settings.originX, y: settings.originY } : { x: 0, y: 0 };
  const origin = toScreen(center, view, width, height);
  const nearest = Math.hypot(Math.max(0, -origin.x, origin.x-width), Math.max(0, -origin.y, origin.y-height));
  const farthest = Math.max(...[0,width].flatMap(x => [0,height].map(y => Math.hypot(x-origin.x,y-origin.y))));
  if (!Number.isFinite(farthest)) return;
  const raw = options.snapGrid ? polarSteps(settings, view.scale) : { radius: gridStep(view.scale)/5, angle: Math.PI/12 };
  const radiusStep = raw.radius * Math.max(1, Math.ceil(12/(raw.radius*view.scale)));
  const referenceRadius = Math.max(1, Math.min(width,height)/2);
  const angleStep = raw.angle * Math.max(1, Math.ceil(22/(referenceRadius*raw.angle)), Math.ceil(Math.PI*2/(raw.angle*180)));
  const majorStep = gridStep(view.scale);
  if (options.grid && Number.isFinite(radiusStep) && radiusStep > 0) {
    const first = Math.max(1, Math.ceil(nearest/view.scale/radiusStep));
    const last = Math.floor(farthest/view.scale/radiusStep);
    for (let i=0;i<160 && first+i<=last;i++) {
      const radius=(first+i)*radiusStep;
      const major=Math.abs(radius/majorStep-Math.round(radius/majorStep))<1e-7;
      const projected=projectCircle({first:center,radius},view,width,height);
      if (projected) draw.circle(projected,major);
      const labelStride=Math.max(1,Math.ceil(48/(radiusStep*view.scale)));
      if (options.axes && (first+i)%labelStride===0) draw.text(Number(radius.toPrecision(8)).toString(),origin.x+radius*view.scale+4,origin.y-5);
    }
    for(let i=0;i<180 && i*angleStep<Math.PI*2-1e-10;i++) {
      const angle=i*angleStep;
      const ray=clipLinear({type:'ray',first:center,second:{x:center.x+Math.cos(angle),y:center.y+Math.sin(angle)}},view,width,height,0);
      if(ray)draw.line(ray.first,ray.second,false);
      if(options.axes && origin.x>20 && origin.x<width-20 && origin.y>20 && origin.y<height-20){
        const distance=Math.min(origin.x,width-origin.x,origin.y,height-origin.y)*.8;
        const labelStride=Math.max(1,Math.ceil(36/Math.max(1e-12,distance*angleStep)));
        if(i%labelStride===0)draw.text(`${Math.round(angle*180/Math.PI*1e6)/1e6}°`,origin.x+Math.cos(angle)*distance,origin.y-Math.sin(angle)*distance,'middle');
      }
    }
  }
  if(options.axes){
    const ray=clipLinear({type:'ray',first:center,second:{x:center.x+1,y:center.y}},view,width,height,0);
    if(ray)draw.line(ray.first,ray.second,true);
    draw.text('0',origin.x-6,origin.y+15,'end');
  }
}
