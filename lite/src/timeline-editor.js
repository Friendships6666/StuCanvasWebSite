import { MAX_TIMELINE_TIME } from './timeline-state.js';
import { t, localizeDOM } from './i18n.js';

export function createTimelineEditor(container, actions) {
  const panel = document.createElement('section'); panel.className = 'global-timeline'; panel.id = 'global-timeline';
  panel.dataset.i18nAriaLabel = 'timeline.title'; panel.hidden = true;
  const heading = document.createElement('strong'); heading.dataset.i18n = 'timeline.title';
  const header = document.createElement('div'); header.className = 'timeline-header';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.className = 'timeline-close';
  close.dataset.i18nAriaLabel = 'timeline.close'; close.dataset.action = 'timeline-close';
  close.addEventListener('click', () => { panel.hidden = true; actions.uiChanged?.(); });
  header.append(heading, close);
  let drag = null, location = null;
  function place(x, y) {
    location = { x: Math.max(0, Math.min(x, container.clientWidth - panel.offsetWidth)),
      y: Math.max(0, Math.min(y, container.clientHeight - panel.offsetHeight)) };
    panel.style.left = `${location.x}px`; panel.style.top = `${location.y}px`; panel.style.bottom = 'auto';
  }
  header.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const box = panel.getBoundingClientRect(), parent = container.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: box.left - parent.left, top: box.top - parent.top };
    header.setPointerCapture(event.pointerId); event.preventDefault();
  });
  window.addEventListener('pointermove', event => {
    if (drag?.id === event.pointerId) place(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
  });
  for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, event => {
    if (drag?.id !== event.pointerId) return;
    drag = null; actions.uiChanged?.();
  });
  window.addEventListener('blur', () => { if (drag) { drag = null; actions.uiChanged?.(); } });
  const resize = new ResizeObserver(() => { if (location && !panel.hidden) place(location.x, location.y); });
  resize.observe(container); resize.observe(panel);
  const details = document.createElement('button'); details.type = 'button'; details.className = 'timeline-details'; details.dataset.i18n = 'timeline.details';
  details.setAttribute('aria-expanded', 'false');
  details.addEventListener('click', () => { const open = panel.classList.toggle('timeline-expanded'); details.setAttribute('aria-expanded', String(open)); actions.uiChanged?.(); });
  const clock = document.createElement('output'); clock.className = 'timeline-clock';
  const buttons = document.createElement('div'); buttons.className = 'timeline-buttons';
  const controls = {};
  for (const [command, key] of [['play','physics.play'],['step','physics.step'],['reset','physics.reset']]) {
    const button = document.createElement('button'); button.type='button'; button.dataset.action=`timeline-${command}`; button.dataset.i18n=key;
    button.addEventListener('click', ()=>actions.command(command)); buttons.append(button); controls[command]=button;
  }
  const track = document.createElement('input'); track.type='range'; track.min=0; track.max=30; track.step=1/120;
  track.dataset.i18nAriaLabel='timeline.scrub'; track.dataset.parameter='timeline-track';
  // Commit a drag once, so crossing the track does not repeatedly resimulate.
  track.addEventListener('pointerdown',()=>{ if(actions.get().running) actions.command('play'); });
  track.addEventListener('change',()=>actions.command('seek',track.valueAsNumber));
  const fields = document.createElement('div'); fields.className='timeline-fields';
  const inputs={};
  for (const [key,label,min,max,step] of [['time','physics.seek',0,MAX_TIMELINE_TIME,'any'],['duration','physics.duration',0,MAX_TIMELINE_TIME,'any'],['playbackRate','physics.rate',.05,4,.05]]) {
    const row=document.createElement('label'),caption=document.createElement('span'),input=document.createElement('input');
    caption.dataset.i18n=label;input.type='number';input.min=min;input.step=step;input.dataset.parameter=`timeline-${key}`;input.dataset.i18nAriaLabel=label;
    if(max!==undefined)input.max=max;
    const apply=()=>{
      if(!input.checkValidity()||!Number.isFinite(input.valueAsNumber)){input.setAttribute('aria-invalid','true');return;}
      input.removeAttribute('aria-invalid');
      if(key==='time')actions.command('seek',input.valueAsNumber);
      else actions.change(state=>{state[key]=input.valueAsNumber; if(key==='duration'&&state.duration>0&&state.duration<state.time)state.duration=state.time;});
    };
    input.addEventListener('change',apply);
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();input.blur();}});
    row.append(caption,input);fields.append(row);inputs[key]=input;
  }
  const seek=document.createElement('button');seek.type='button';seek.dataset.i18n='timeline.go';seek.dataset.action='timeline-seek';
  seek.addEventListener('click',()=>{if(inputs.time.checkValidity()&&Number.isFinite(inputs.time.valueAsNumber)&&Math.abs(inputs.time.valueAsNumber-actions.get().time)>1e-6)actions.command('seek',inputs.time.valueAsNumber)});fields.append(seek);
  const note=document.createElement('p');note.className='physics-note';note.dataset.i18n='timeline.note';
  panel.append(header,clock,details,buttons,track,fields,note);container.append(panel);
  let seeking=false;
  // Serialize gestures at the UI boundary; cancelling remains available through
  // the normal pause/edit controls in the application.
  const command=actions.command;
  actions.command=async(...args)=>{if(seeking&&args[0]!=='play')return;seeking=args[0]==='seek';sync();try{return await command(...args)}finally{seeking=false;sync()}};
  function sync() {
    const state=actions.get();
    controls.play.dataset.i18n=state.running || seeking?'physics.pause':'physics.play';
    controls.step.disabled=controls.reset.disabled=seeking;seek.disabled=seeking;
    track.disabled=seeking;
    clock.textContent=t('timeline.clock',{time:state.time.toFixed(2),end:state.duration>0?state.duration.toFixed(2):'∞'});
    if(document.activeElement!==track){track.max=state.duration||Math.max(30,Math.ceil((state.time+1)/30)*30);track.value=state.time;}
    for(const [key,input]of Object.entries(inputs))if(document.activeElement!==input)input.value=Number(state[key].toFixed(6));
    panel.setAttribute('aria-busy',String(seeking));localizeDOM(panel);
  }
  sync.open = point => {
    panel.hidden = false; sync();
    if (point) { const box = container.getBoundingClientRect(); place(point.x - box.left, point.y - box.top); }
    else if (location) place(location.x, location.y);
    actions.uiChanged?.();
  };
  sync.read = () => ({ visible: !panel.hidden, position: location && { ...location }, expanded: panel.classList.contains('timeline-expanded') });
  sync.apply = value => {
    panel.hidden = value?.visible !== true;
    panel.classList.toggle('timeline-expanded', value?.expanded === true);
    details.setAttribute('aria-expanded', String(value?.expanded === true));
    location = value?.position ? { ...value.position } : null;
    if (location) { if (!panel.hidden) place(location.x, location.y); }
    else { panel.style.removeProperty('left'); panel.style.removeProperty('top'); panel.style.removeProperty('bottom'); }
    sync();
  };
  return sync;
}
