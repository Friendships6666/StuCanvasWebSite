import { liquidMass } from './liquid.js';
import { localizeDOM, t } from './i18n.js';

export function createLiquidControls(panel,actions,addNumber) {
  const fields=document.createElement('div');fields.className='physics-controls liquid-controls';
  for(const [key,label,min,max,step] of [
    ['density','liquid.density',.001,100000,'any'],['viscosity','liquid.viscosity',0,1,.01],
    ['pressure','liquid.pressure',1,2000,1],['cohesion','liquid.cohesion',0,1,.01],['buoyancy','liquid.buoyancy',0,3,.05],
  ])addNumber(key,label,min,max,step,fields);
  const summary=document.createElement('output');summary.className='physics-note';summary.dataset.role='liquid-summary';
  const note=document.createElement('p');note.className='physics-note';note.dataset.i18n='liquid.note';
  panel.append(fields,summary,note);
  const flags=[];
  for(const [key,label]of [['collideGeometry','rope.collideGeometry'],['collideBodies','rope.collideBodies']]) {
    const row=document.createElement('label'),input=document.createElement('input'),caption=document.createElement('span');
    row.className='physics-freefall';input.type='checkbox';input.dataset.parameter=key;caption.dataset.i18n=label;
    input.addEventListener('change',()=>{const checked=input.checked;actions.change(o=>{o[key]=checked});actions.end()});
    row.append(input,caption);panel.append(row);flags.push({key,input});
  }
  return object=>{
    for(const {key,input}of flags)input.checked=object[key];
    summary.textContent=t('liquid.summary',{count:object.particleCount,volume:Number(object.volume.toPrecision(5)),mass:Number(liquidMass(object).toPrecision(5))});
    localizeDOM(panel);
  };
}
