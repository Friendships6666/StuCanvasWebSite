const startup=window.stucanvasStartup;
// Dynamic import keeps the loader independent of failures in the main graph,
// and avoids holding the window load event while waiting for that same event.
Promise.all([import('./app.js'),startup?.assetsReady()]).then(async([app])=>{
  if(!startup)throw new Error('Startup controller unavailable');
  await app.whenReady();
  await startup.finish();
  if(document.documentElement.dataset.bootState==='ready')document.documentElement.dataset.renderer='webgpu';
}).catch(error=>{
  console.error(error);
  if(startup)startup.fail(error);else document.documentElement.dataset.bootState='failed';
});
