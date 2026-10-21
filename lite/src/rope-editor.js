import { isPoint } from './geometry.js';
import { isSoftBody } from './soft-body.js';
import { localizeDOM } from './i18n.js';
import { anchorWorld, ropeAnchor, ropeParents } from './rope.js';

export function createRopeControls(panel,actions,addNumber){
  const spring=actions.get().type==='spring';
  const controls=document.createElement('div');controls.className='physics-controls rope-controls';
  addNumber('length','rope.length',.001,100000,'any',controls);
  addNumber('radius',spring?'spring.radius':'rope.radius',.002,10,.005,controls);
  if(spring){addNumber('coilRadius','spring.coilRadius',.005,10,.01,controls);addNumber('turns','spring.turns',2,64,1,controls);}
  addNumber('segments','rope.segments',4,128,1,controls);
  addNumber('stiffness',spring?'spring.stiffness':'rope.stiffness',.001,1,.001,controls);
  addNumber('damping','rope.damping',0,1,.01,controls);
  panel.append(controls);
  const flags=[];
  for(const [key,label]of [['collideGeometry','rope.collideGeometry'],['collideBodies','rope.collideBodies']]){
    const row=document.createElement('label');row.className='physics-freefall';
    const input=document.createElement('input'),caption=document.createElement('span');input.type='checkbox';input.dataset.parameter=key;caption.dataset.i18n=label;
    input.addEventListener('change',()=>{const checked=input.checked;actions.change(o=>{o[key]=checked});actions.end()});row.append(input,caption);panel.append(row);flags.push({input,key});
  }
  const anchors=[];
  for(let index=0;index<2;index++){
    const section=document.createElement('fieldset');section.className='rope-anchor';
    const legend=document.createElement('legend');legend.dataset.i18n=index?'rope.end':'rope.start';
    const select=document.createElement('select');select.dataset.anchor=String(index);select.dataset.i18nAriaLabel=index?'rope.end':'rope.start';
    select.addEventListener('change',()=>{
      const id=select.value,all=actions.resolved(),object=all.get(id);
      actions.change(rope=>{const point=anchorWorld(rope.anchors[index],all)||{x:0,y:0};rope.anchors[index]=ropeAnchor(object,point);rope.parents=ropeParents(rope);if(object?.type==='physicsBody'||isSoftBody(object))rope.ignored=[...new Set([...rope.ignored,object.id])];});actions.end();
    });
    const fields=document.createElement('div');fields.className='physics-controls';
    addNumber(`anchors.${index}.point.x`,'rope.anchorX',undefined,undefined,'any',fields);
    addNumber(`anchors.${index}.point.y`,'rope.anchorY',undefined,undefined,'any',fields);
    const center=document.createElement('button');center.type='button';center.dataset.i18n='rope.center';center.dataset.action=`rope-center-${index}`;
    center.addEventListener('click',()=>{
      const rope=actions.get(),object=actions.resolved().get(rope.anchors[index].objectId);
      if(object)actions.change(o=>{o.anchors[index]=ropeAnchor(object,{x:0,y:0})});actions.end();
    });
    const note=document.createElement('p');note.className='physics-note';note.dataset.i18n=spring?'spring.anchorNote':'rope.anchorNote';
    section.append(legend,select,fields,center,note);panel.append(section);anchors.push({select,center,index});
  }
  const note=document.createElement('p');note.className='physics-note';note.dataset.i18n=spring?'spring.note':'rope.note';panel.append(note);
  let optionsKey='';
  return rope=>{
    for(const {input,key}of flags)input.checked=rope[key];
    const candidates=actions.all().filter(o=>o.type==='physicsBody'||isSoftBody(o)||isPoint(o));
    const key=JSON.stringify(candidates.map(o=>[o.id,o.name]));
    if(key!==optionsKey){
      optionsKey=key;
      for(const {select}of anchors){
        select.replaceChildren();const fixed=document.createElement('option');fixed.value='';fixed.dataset.i18n='rope.fixed';select.append(fixed);
        for(const o of candidates){const option=document.createElement('option');option.value=o.id;option.textContent=o.name;select.append(option);}
      }
    }
    for(const {select,center,index}of anchors){select.value=rope.anchors[index].objectId||'';center.disabled=!select.value;}
    localizeDOM(panel);
  };
}
