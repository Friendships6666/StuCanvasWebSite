// Deliberately independent of the application module graph: the first screen
// stays usable while fonts, styles, math input and WebGPU are still loading.
(() => {
  const root=document.documentElement;
  const loader=document.getElementById('startup');
  const axes=[...loader.querySelectorAll('[data-startup-axis]')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const events=new AbortController();
  let completion=null;
  let language=navigator.languages?.[0]||navigator.language||'en';
  try{language=localStorage.getItem('stucanvas.locale')||language;}catch{}
  try{const locale=new Intl.Locale(language);language=locale.language==='zh'?(locale.script==='Hant'||!locale.script&&['TW','HK','MO'].includes(locale.region)?'zh-TW':'zh-CN'):'en';}catch{language='en';}
  const catalog=new URL(`./locales/${language}.js`,document.currentScript.src);
  import(catalog.href).then(({default:messages})=>{
    for(const key of ['loading','failed','retry'])loader.querySelector(`[data-i18n="startup.${key}"]`).textContent=messages[`startup.${key}`];
  }).catch(()=>{});
  try{
    const theme=JSON.parse(localStorage.getItem('stucanvas.theme')||'null');
    const dark=theme?.selection==='cyan-dark'||(!theme?.selection||theme.selection==='system')&&matchMedia('(prefers-color-scheme: dark)').matches;
    if(theme?.selection==='wine-light'||dark){root.style.setProperty('--startup-background',dark?'#0b0b0b':'#fffaf9');root.style.setProperty('--startup-ink',dark?'#62f5eb':'#a6243b');root.style.setProperty('--startup-muted',dark?'#bec5c7':'#687585');}
  }catch{}
  const fail=error=>{
    if(root.dataset.bootState==='ready')return;
    root.dataset.bootState='failed';
    for(const animation of loader.getAnimations())animation.cancel();
    loader.style.opacity='1';
    for(const axis of axes){for(const animation of axis.getAnimations())animation.cancel();axis.style.animation='none';axis.style.transform='none';}
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
      const animations=axes.map(axis=>{
        const matrix=new DOMMatrixReadOnly(getComputedStyle(axis).transform);
        const angle=(Math.atan2(matrix.b,matrix.a)*180/Math.PI+360)%360;
        axis.style.animation='none';axis.style.transform=`rotate(${angle}deg)`;
        return axis.animate([{transform:`rotate(${angle}deg)`},{transform:'rotate(360deg)'}],{duration:620,easing:'cubic-bezier(.2,.65,.2,1)',fill:'forwards'});
      });
      await Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));
      for(const animation of animations)animation.cancel();
    }
    for(const axis of axes){axis.style.animation='none';axis.style.transform='none';}
    if(root.dataset.bootState==='failed')return;
    root.dataset.bootState='aligned';
    if(!reduced.matches)await new Promise(resolve=>setTimeout(resolve,140));
    if(root.dataset.bootState==='failed')return;
    root.dataset.bootState='revealing';
    if(!reduced.matches)await loader.animate([{opacity:1},{opacity:0}],{duration:180,easing:'ease-out',fill:'forwards'}).finished.catch(()=>{});
    if(root.dataset.bootState==='failed')return;
    const shell=document.getElementById('app-shell');shell.inert=false;shell.removeAttribute('aria-hidden');
    loader.remove();events.abort();root.dataset.bootState='ready';root.setAttribute('aria-busy','false');
  })();
  window.stucanvasStartup={assetsReady,finish,fail};
  if(root.dataset.bootState==='failed')fail();
})();
