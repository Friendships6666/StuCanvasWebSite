import { localizeDOM, onLocaleChange, t } from './i18n.js';
import { mainWindowId } from './render-targets.js';

const svg = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"/></svg>';
export function createCoordinateWindows(container, actions) {
  const windows = new Map();
  let depth = 5;
  const copy = value => JSON.parse(JSON.stringify(value));
  function fit(entry) {
    const width=Math.min(entry.state.width,Math.max(200,container.clientWidth-16));
    const height=Math.min(entry.state.height,Math.max(180,container.clientHeight-16));
    const x=Math.max(0,Math.min(entry.state.x,container.clientWidth-width));
    const y=Math.max(0,Math.min(entry.state.y,container.clientHeight-height));
    Object.assign(entry.panel.style,{left:`${x}px`,top:`${y}px`,width:`${width}px`,height:`${height}px`});
    actions.resize(entry.context);
  }
  function close(entry, notify=true) {
    if(!windows.has(entry.state.id))return;
    if(!actions.remove(entry.context))return;
    windows.delete(entry.state.id);entry.lifecycle.abort();entry.observer.disconnect();entry.panel.remove();
    if(notify){actions.closed?.(entry.state.id);actions.changed();}
  }
  function add(state) {
    const panel=document.createElement('section');panel.className='coordinate-window';panel.dataset.coordinateWindow=state.id;
    panel.dataset.i18nAriaLabel='coordinates.window';
    const header=document.createElement('div');header.className='coordinate-window-header';
    const grip=document.createElement('span');grip.className='coordinate-window-grip';grip.textContent='⠿';grip.setAttribute('aria-hidden','true');
    const title=document.createElement('span');title.className='coordinate-window-title';title.textContent=state.id;title.title=state.id;
    const toggle=document.createElement('button');toggle.type='button';toggle.dataset.coordinateType=state.view.coordinateSystem||'cartesian';
    const updateType=()=>{
      const type=toggle.dataset.coordinateType;
      toggle.setAttribute('aria-label',`${t('coordinates.type')}: ${t(`coordinates.${type}`)}`);toggle.title=toggle.getAttribute('aria-label');
      toggle.innerHTML=type==='polar'?'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3.5"/><path d="M2 10h16M10 2v16m-6-14 12 12M4 16 16 4"/></svg>':'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M3 14h14m-11 3V3m-3 3 3-3 3 3m5 5 3 3-3 3"/></svg>';
    };
    const home=document.createElement('button');home.type='button';home.dataset.i18nAriaLabel='ui.home';
    home.innerHTML='<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 5v4h4M4 9a6 6 0 1 1 0 4M8 10h4m-2-2v4"/></svg>';
    const dismiss=document.createElement('button');dismiss.type='button';dismiss.dataset.i18nAriaLabel='coordinates.close';dismiss.dataset.action='coordinate-close';dismiss.innerHTML=svg;
    header.append(grip,title,toggle,home,dismiss);
    const body=document.createElement('div');body.className='coordinate-window-body';
    const canvas=document.createElement('canvas');canvas.id=`coordinate-${state.id}`;canvas.tabIndex=0;canvas.dataset.windowId=state.id;canvas.dataset.i18nAriaLabel='ui.drawingArea';
    const layer=document.createElementNS('http://www.w3.org/2000/svg','svg');layer.classList.add('text-layer');layer.setAttribute('aria-hidden','true');
    const error=document.createElement('p');error.className='coordinate-window-error';error.hidden=true;error.setAttribute('role','status');
    const resize=document.createElement('button');resize.type='button';resize.className='coordinate-window-resize';resize.dataset.i18nAriaLabel='coordinates.resize';
    resize.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="m5 12 7-7m-2 7 2-2"/></svg>';
    body.append(canvas,layer,error);panel.append(header,body,resize);container.append(panel);
    const lifecycle=new AbortController(),signal=lifecycle.signal;
    const context=actions.create(canvas,layer,copy(state.view),error,state.id);
    const entry={state:copy(state),panel,context,lifecycle,toggle,updateType,observer:new ResizeObserver(()=>actions.resize(context))};
    windows.set(state.id,entry);entry.observer.observe(body);
    updateType();
    panel.addEventListener('pointerdown',()=>{panel.style.zIndex=String(++depth);},{signal});
    toggle.addEventListener('click',()=>{const type=toggle.dataset.coordinateType==='polar'?'cartesian':'polar';if(actions.type(context,type)===false)return;toggle.dataset.coordinateType=type;updateType();actions.changed();},{signal});
    home.addEventListener('click',()=>{actions.home(context);actions.changed();},{signal});
    dismiss.addEventListener('click',()=>close(entry),{signal});
    let drag=null;
    const begin=(event,sizing)=>{
      if(event.button!==0||!sizing&&event.target.closest('button,select'))return;
      if(!actions.canTransform())return;
      event.preventDefault();const box=panel.getBoundingClientRect(),parent=container.getBoundingClientRect();
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:box.left-parent.left,top:box.top-parent.top,width:box.width,height:box.height,sizing};
      event.currentTarget.setPointerCapture(event.pointerId);
    };
    header.addEventListener('pointerdown',event=>begin(event,false),{signal});resize.addEventListener('pointerdown',event=>begin(event,true),{signal});
    window.addEventListener('pointermove',event=>{
      if(drag?.id!==event.pointerId)return;
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(drag.sizing){entry.state.width=Math.max(200,Math.min(container.clientWidth-drag.left,drag.width+dx));entry.state.height=Math.max(180,Math.min(container.clientHeight-drag.top,drag.height+dy));}
      else{entry.state.x=drag.left+dx;entry.state.y=drag.top+dy;}
      fit(entry);
    },{signal});
    for(const event of ['pointerup','pointercancel'])window.addEventListener(event,e=>{if(drag?.id===e.pointerId){drag=null;actions.changed();}},{signal});
    window.addEventListener('blur',()=>{if(drag){drag=null;actions.changed();}},{signal});
    resize.addEventListener('keydown',event=>{
      const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[event.key];
      if(!delta)return;event.preventDefault();entry.state.width=Math.max(200,entry.state.width+delta[0]);entry.state.height=Math.max(180,entry.state.height+delta[1]);fit(entry);actions.changed();
    },{signal});
    fit(entry);localizeDOM(panel);return entry;
  }
  new ResizeObserver(()=>{for(const entry of windows.values())fit(entry);}).observe(container);
  onLocaleChange(()=>{for(const entry of windows.values()){localizeDOM(entry.panel);entry.updateType();}});
  return {
    add(point) {
      const parent=container.getBoundingClientRect(),count=windows.size;
      let index=1;while(windows.has(`window-${index}`))index++;
      add({id:`window-${index}`,view:{...actions.view()},x:point?point.x-parent.left:24+count%5*24,y:point?point.y-parent.top:24+count%5*24,width:420,height:330});
      actions.changed();
    },
    ids(){return [mainWindowId,...windows.keys()];},
    read(){return [...windows.values()].map(entry=>({...copy(entry.state),view:actions.read(entry.context)}));},
    apply(states=[]) {
      const ids=new Set(states.map(state=>state.id));
      for(const entry of windows.values())if(!ids.has(entry.state.id))close(entry,false);
      for(const state of states){
        const entry=windows.get(state.id);
        if(!entry){add(state);continue;}
        entry.state=copy(state);actions.apply(entry.context,copy(state.view));entry.toggle.dataset.coordinateType=state.view.coordinateSystem||'cartesian';entry.updateType();fit(entry);
      }
    },
  };
}
