const CACHE_NAME='marine-comeback-companion-v7-goblin-assets';
const ASSETS=["./", "./index.html", "./manifest.json", "./icon-192.svg", "./icon-512.svg", "./goblins/hydration-goblin.webp", "./goblins/gym-goblin.webp", "./goblins/recovery-goblin.webp", "./goblins/meal-prep-goblin.webp", "./goblins/dadbod-goblin.webp", "./goblins/cardio-goblin.webp", "./goblins/drill-sergeant-goblin.webp", "./goblins/bench-press-goblin.webp", "./goblins/stretching-goblin.webp"];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))});
