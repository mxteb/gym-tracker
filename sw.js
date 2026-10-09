'use strict';
const CACHE_PREFIX='gym-tracker-';
const CACHE_NAME='gym-tracker-v11-1-0';
const APP_SHELL=['./index.html','./i18n.js','./en.js','./styles.css','./theme.css','./storage.js','./data.js','./catalog.js','./calc.js','./visual.js','./app.js','./manifest.json','./assets/icon-192.png','./assets/icon-512.png','./assets/fonts/alexandria.woff','./assets/fonts/bigshoulders-stencil.woff','./assets/fonts/handjet.woff','./assets/fonts/plexarabic-Regular.woff','./assets/fonts/plexarabic-SemiBold.woff','./assets/fonts/plexarabic-Bold.woff','./assets/fonts/plexmono-Regular.woff','./assets/fonts/plexmono-SemiBold.woff','./assets/fonts/notokufi.woff'];
const home=new URL('./index.html',self.registration.scope).href;
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL.map(path => new Request(new URL(path,self.registration.scope), {cache:'reload'})));
  // Activation waits until existing pages close, keeping each app version coherent.
 })());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin)return;
 const isShell=APP_SHELL.some(path=>new URL(path,self.registration.scope).pathname===url.pathname);
 const isHome=req.mode==='navigate'&&(url.pathname===new URL(self.registration.scope).pathname||url.pathname===new URL(home).pathname);
 if(!isShell&&!isHome)return;
 // Versioned app-shell cache is updated atomically by a new worker installation.
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE_NAME);
  const key=isHome?home:new URL(url.pathname,url.origin).href;
  const cached=await cache.match(key);
  if(cached)return cached;
  try {
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
   let response;try{response=await fetch(req,{signal:controller.signal});}finally{clearTimeout(timer);}
   if(response.ok){try{await cache.put(key,response.clone());}catch{}return response;}
   if(isHome)return new Response('تعذر فتح التطبيق الآن. حاول مرة أخرى.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
   return response;
  } catch {
   return new Response(isHome?'التطبيق غير متاح بدون اتصال؛ افتحه مرة واحدة بالإنترنت.':'Offline',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }
 })());
});
