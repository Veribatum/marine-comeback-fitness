const CACHE_NAME="marine-comeback-journey-v1";
const APP_URL=new URL("./index.html",self.registration.scope).href;
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(async cache=>{
    const response=await fetch(APP_URL,{cache:"reload"});
    if(!response.ok)throw new Error("App could not be cached");
    await cache.put(APP_URL,response);
    await self.skipWaiting();
  }));
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
