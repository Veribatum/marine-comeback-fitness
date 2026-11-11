const CACHE_NAME="marine-comeback-evening-v5";
const APP_URL=new URL("./index.html",self.registration.scope).href;
const CUES_URL=new URL("./run-cues.mp3",self.registration.scope).href;
const OFFLINE_ASSETS=[CUES_URL,...["evening.js","evening.css"].map(path=>new URL(path,self.registration.scope).href)];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(async cache=>{
    await cache.addAll([APP_URL,...OFFLINE_ASSETS].map(url=>new Request(url,{cache:"reload"})));
    await self.skipWaiting();
  }));
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification('Marine Comeback', {
    body: typeof payload.body === 'string' ? payload.body.slice(0,240) : 'Marine, your goblin pep talk is ready. Time for the gym.',
    icon: new URL('./icons/icon-192.png', self.registration.scope).href,
    badge: new URL('./icons/icon-192.png', self.registration.scope).href,
    tag: typeof payload.tag === 'string' ? payload.tag : 'marine-gym-reminder',
    data: { type: payload.type === 'marine-evening-reminder' ? 'marine-evening-reminder' : 'marine-gym-reminder' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const type = event.notification.data?.type;
  if (!['marine-gym-reminder', 'marine-evening-reminder'].includes(type)) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find(window => window.url.startsWith(self.registration.scope));
    if (client) {
      await client.focus();
      client.postMessage({ type });
      return;
    }
    const target = new URL(type === 'marine-evening-reminder' ? './?mission=evening' : './?mission=departure', self.registration.scope);
    await self.clients.openWindow(target.href);
  })());
});
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith("marine-comeback")&&key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||event.request.method!=="GET")return;
  if(OFFLINE_ASSETS.includes(url.href)){
    event.respondWith(caches.open(CACHE_NAME).then(async cache=>await cache.match(url.href)||fetch(event.request)));
    return;
  }
  if(event.request.mode==="navigate"){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      try{
        const response=await fetch(event.request);
        if(response.ok&&response.headers.get("content-type")?.includes("text/html"))await cache.put(APP_URL,response.clone());
        return response;
      }catch(error){
        const fallback=await cache.match(APP_URL);
        return fallback||new Response("Offline. Reconnect to load Marine Comeback.",{status:503,headers:{"Content-Type":"text/plain"}});
      }
    })());
  }
});

