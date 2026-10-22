import { softCenter, softVelocity } from './soft-body.js';
import { localizeDOM, t } from './i18n.js';

export function createSoftControls(panel,actions,addNumber) {
  const smoothing=document.createElement('div');smoothing.className='physics-smoothing';
  const smoothInput=addNumber('smoothing','physics.smoothing',0,100,1,smoothing);
  const smoothRange=document.createElement('input');smoothRange.type='range';smoothRange.min=0;smoothRange.max=100;smoothRange.step=1;
  smoothRange.dataset.parameter='smoothing-range';smoothRange.dataset.i18nAriaLabel='physics.smoothing';
  smoothRange.addEventListener('input',()=>actions.change(object=>{object.smoothing=smoothRange.valueAsNumber;}));
  for(const event of ['change','blur'])smoothRange.addEventListener(event,actions.end);
  const smoothNote=document.createElement('p');smoothNote.className='physics-note';smoothNote.dataset.i18n='soft.smoothingNote';
  smoothNote.id=`soft-smoothing-note-${actions.get().id}`;
  for(const input of [smoothInput,smoothRange])input.setAttribute('aria-describedby',smoothNote.id);
  const restore=document.createElement('button');restore.type='button';restore.dataset.i18n='physics.smoothingReset';restore.dataset.action='physics-smoothing-reset';
  restore.addEventListener('click',()=>{actions.change(object=>{object.smoothing=0;});actions.end();});
  smoothing.append(smoothRange,smoothNote,restore);panel.append(smoothing);
  const fields=document.createElement('div');fields.className='physics-controls soft-controls';
  for(const [key,label,min,max,step]of [
    ['stretchStiffness','soft.stretch',0,1,.01],['shearStiffness','soft.shear',0,1,.01],['bendStiffness','soft.bend',0,1,.01],
    ['areaStiffness','soft.area',0,1,.01],['damping','soft.damping',0,1,.01],['collisionRadius','soft.collisionRadius',.25,1.5,.05],
  ])addNumber(key,label,min,max,step,fields);
  const motion=[];
  for(const [key,label]of [['position.x','physics.positionX'],['position.y','physics.positionY'],['velocity.x','physics.velocityX'],['velocity.y','physics.velocityY']]){
    const [type,axis]=key.split('.'),row=document.createElement('label'),caption=document.createElement('span'),input=document.createElement('input');
    caption.dataset.i18n=label;input.type='number';input.step='any';input.dataset.parameter=key;input.dataset.i18nAriaLabel=label;
    const read=object=>(type==='position'?softCenter(object):softVelocity(object))[axis];
    input.addEventListener('focus',()=>{actions.begin();input.value=read(actions.get());});
    input.addEventListener('input',()=>{
      const value=input.valueAsNumber,valid=input.value!==''&&Number.isFinite(value);input.setAttribute('aria-invalid',String(!valid));if(!valid)return;
      actions.change(object=>{const delta=value-read(object);for(const node of object.nodes)node[type][axis]+=delta;if(type==='position')object.time=0;});
    });
    input.addEventListener('blur',()=>{actions.end();input.value=read(actions.get());input.removeAttribute('aria-invalid');});
    input.addEventListener('keydown',event=>{if(event.key==='Enter')input.blur();});row.append(caption,input);fields.append(row);motion.push({input,read});
  }
  panel.append(fields);
  const flags=[];
  for(const [key,label]of [['selfCollision','soft.selfCollision'],['showMesh','soft.showMesh'],['collideGeometry','rope.collideGeometry'],['collideBodies','rope.collideBodies']]){
    const row=document.createElement('label'),input=document.createElement('input'),caption=document.createElement('span');row.className='physics-freefall';
    input.type='checkbox';input.dataset.parameter=key;caption.dataset.i18n=label;
    input.addEventListener('change',()=>{const value=input.checked;actions.change(object=>{object[key]=value;});actions.end();});row.append(input,caption);panel.append(row);flags.push({key,input});
  }
  const summary=document.createElement('output');summary.className='physics-note';summary.dataset.role='soft-summary';
  const note=document.createElement('p');note.className='physics-note';note.dataset.i18n='soft.note';panel.append(summary,note);
  return object=>{
    if(document.activeElement!==smoothRange)smoothRange.value=object.smoothing??0;
    restore.disabled=!(object.smoothing>0);
    for(const {key,input}of flags)input.checked=object[key];
    for(const {input,read}of motion)if(document.activeElement!==input)input.value=Number(read(object).toPrecision(9));
    summary.textContent=t('soft.summary',{nodes:object.nodes.length,triangles:object.mesh.triangles.length,subdivisions:object.mesh.subdivisions});localizeDOM(panel);
  };
}
