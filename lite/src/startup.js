// Deliberately independent of the application module graph: the first screen
// stays usable while fonts, styles, math input and WebGPU are still loading.
(() => {
  const root=document.documentElement;
  const loader=document.getElementById('startup');
  const axes=[...loader.querySelectorAll('[data-startup-axis]')];
  const rotors=()=>[...axes,...loader.querySelectorAll('[data-startup-rotor]')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const events=new AbortController();
  let completion=null;
  let language=navigator.languages?.[0]||navigator.language||'en';
  try{language=localStorage.getItem('stucanvas.locale')||language;}catch{}
  try{const locale=new Intl.Locale(language);language=locale.language==='zh'?(locale.script==='Hant'||!locale.script&&['TW','HK','MO'].includes(locale.region)?'zh-TW':'zh-CN'):'en';}catch{language='en';}
  const catalog=new URL(`./locales/${language}.js`,document.currentScript.src);
  import(catalog.href).then(({default:messages})=>{
    for(const key of ['failed','retry'])loader.querySelector(`[data-i18n="startup.${key}"]`).textContent=messages[`startup.${key}`];
  }).catch(()=>{});
  // These background sources follow three bearings from the original pulsar
  // map. Project from its exact common origin so the rays meet the logo axes
  // after calibration, including on narrow and landscape screens.
  const navigation=loader.querySelector('.startup-navigation');
  const instrument=loader.querySelector('.startup-instrument');
  const svg=(name,attributes={})=>{
    const node=document.createElementNS('http://www.w3.org/2000/svg',name);
    for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
    return node;
  };
  const arrangePulsars=()=>{
    if(!loader.isConnected)return;
    const bounds=loader.getBoundingClientRect();
    const logo=loader.querySelector('.startup-logo');
    const origin=new DOMPoint(108,139).matrixTransform(logo.getScreenCTM());
    const center={x:origin.x-bounds.left,y:origin.y-bounds.top};
    const margin=bounds.width<600?34:64;
    navigation.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
    const sources=[];
    for(const [index,dx,dy] of [[3,87.4,-109.02],[6,72.68,113.62],[10,-94.3,8.28]]){
      const distance=Math.min((dx>0?bounds.width-margin-center.x:margin-center.x)/dx,(dy>0?bounds.height-margin-center.y:margin-center.y)/dy)*.92;
      const x=center.x+dx*distance,y=center.y+dy*distance;
      const source=svg('g',{'data-startup-pulsar':index,style:`--delay:-${sources.length*.8}s`});
      const bearing=`M${x} ${y}L${center.x} ${center.y}`;
      source.append(svg('path',{class:'startup-ranging-line',d:bearing}),svg('path',{class:'startup-ranging-pulse',d:bearing,pathLength:100}));
      const star=svg('g',{class:'startup-pulsar',transform:`translate(${x} ${y})`});
      star.append(svg('circle',{r:8,class:'startup-pulsar-wave'}),svg('circle',{r:2.2,fill:'currentColor',stroke:'none'}),svg('circle',{r:5,stroke:'currentColor','stroke-opacity':.45}));
      const beam=svg('g',{class:'startup-pulsar-rotor','data-startup-rotor':'',style:`--period:${4800+sources.length*1200}ms;--phase:${index*17}deg`});
      beam.append(svg('path',{class:'startup-pulsar-beam',d:'M-1-3-3-25 3-25 1-3ZM-1 3-3 25 3 25 1 3Z'}),svg('ellipse',{rx:11,ry:3,stroke:'currentColor','stroke-opacity':.55}));
      star.append(beam);source.append(star);sources.push(source);
    }
    navigation.querySelector('[data-startup-ranging]').replaceChildren(...sources);
  };
  const layout=new ResizeObserver(arrangePulsars);
  layout.observe(loader);layout.observe(instrument);layout.observe(loader.querySelector('.startup-content'));arrangePulsars();
  const fail=error=>{
    if(root.dataset.bootState==='ready')return;
    root.dataset.bootState='failed';
    for(const animation of loader.getAnimations({subtree:true}))animation.cancel();
    loader.style.opacity='1';
    for(const axis of rotors()){for(const animation of axis.getAnimations())animation.cancel();axis.style.animation='none';axis.style.transform='none';}
    const detail=document.getElementById('gpu-error');
    loader.querySelector('.startup-detail').textContent=detail&&!detail.hidden?detail.textContent:'';
    root.setAttribute('aria-busy','false');
  };
  document.addEventListener('keydown',event=>{
    if(loader.isConnected){
      event.stopImmediatePropagation();
      if(root.dataset.bootState!=='failed')event.preventDefault();
    }
  },{capture:true,signal:events.signal});
  document.addEventListener('error',event=>{
    if(event.target.matches?.('[data-startup-required], [data-startup-style]'))fail();
  },{capture:true,signal:events.signal});
  const assetsReady=()=>Promise.all([
    new Promise(resolve=>document.readyState==='complete'?resolve():window.addEventListener('load',resolve,{once:true})),
    ...[...document.querySelectorAll('[data-startup-style]')].map(link=>new Promise((resolve,reject)=>{
      const failed=()=>reject(new Error(`Stylesheet failed: ${link.href}`));
      if(link.dataset.failed){failed();return;}
      if(link.sheet){link.media='all';resolve();return;}
      link.addEventListener('load',()=>{link.media='all';resolve();},{once:true});
      link.addEventListener('error',failed,{once:true});
    })),
  ]);
  const finish=()=>completion||=(async()=>{
    if(root.dataset.bootState==='failed')return;
    root.dataset.bootState='settling';
    if(!reduced.matches){
      const animations=rotors().map(axis=>{
        const matrix=new DOMMatrixReadOnly(getComputedStyle(axis).transform);
        const angle=(Math.atan2(matrix.b,matrix.a)*180/Math.PI+360)%360;
        axis.style.animation='none';axis.style.transform=`rotate(${angle}deg)`;
        // Slow instrument rings take the nearest reference stop; the logo
        // axes complete their forward sweep into the original mark.
        const stop=axis.hasAttribute('data-startup-rotor')?Math.round(angle/360)*360:360;
        return axis.animate([{transform:`rotate(${angle}deg)`},{transform:`rotate(${stop}deg)`}],{duration:620,easing:'cubic-bezier(.2,.65,.2,1)',fill:'forwards'});
      });
      await Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));
      for(const animation of animations)animation.cancel();
    }
    for(const axis of rotors()){axis.style.animation='none';axis.style.transform='none';}
    if(root.dataset.bootState==='failed')return;
    root.dataset.bootState='aligned';
    if(!reduced.matches)await new Promise(resolve=>setTimeout(resolve,140));
    if(root.dataset.bootState==='failed')return;
    root.dataset.bootState='revealing';
    if(!reduced.matches)await loader.animate([{opacity:1},{opacity:0}],{duration:180,easing:'ease-out',fill:'forwards'}).finished.catch(()=>{});
    if(root.dataset.bootState==='failed')return;
    const shell=document.getElementById('app-shell');shell.inert=false;shell.removeAttribute('aria-hidden');
    layout.disconnect();loader.remove();events.abort();root.dataset.bootState='ready';root.setAttribute('aria-busy','false');
  })();
  window.stucanvasStartup={assetsReady,finish,fail};
  if(root.dataset.bootState==='failed')fail();
})();
