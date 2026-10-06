const CACHE_NAME='marine-comeback-companion-phase2';
const ASSETS=['./manifest.json','./icon-192.svg','./icon-512.svg','./phase2.css','./phase2.js'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim()});
function injectPhase2(html){
 const card='<section class="card phase2FitnessCard" id="fitnessPhase2"><h2>Fitness</h2><div class="small">Log the work. Coach handles progression.</div><div class="phase2ChoiceGrid"><button class="yellow" type="button" onclick="openRunPhase2()">RUN</button><button type="button" onclick="openGymPhase2()">GYM DAY</button></div><div class="phase2Miles">This week\'s running: <strong id="phase2WeeklyMiles">0.00 mi</strong></div></section>';
 const overlay='<div class="phase2Overlay" id="phase2FitnessOverlay" aria-hidden="true"><div class="phase2Panel"><div class="phase2Header"><div><h2 id="phase2Title">FITNESS</h2><div class="small" id="phase2Subtitle">App remembers. Coach decides.</div></div><button class="phase2Close" type="button" onclick="closeFitnessPhase2()">×</button></div><div id="phase2Content"></div></div></div><link rel="stylesheet" href="phase2.css"><script src="phase2.js"></script>';
 if(!html.includes('id="fitnessPhase2"'))html=html.replace('<section class="card" id="lifeBalance">',card+'<section class="card" id="lifeBalance">');
 html=html.replace('<button class="yellow" onclick="startPlanetFitnessMission()">Start PF Circuit Mission</button>','<button class="yellow" type="button" onclick="openFitnessPhase2()">Fitness — Run / Gym Day</button>');
 html=html.replace('Complete Planet Fitness circuit mission.','Complete today\'s fitness mission.');
 if(!html.includes('src="phase2.js"'))html=html.replace('</body>',overlay+'</body>');
 return html;
}
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.mode==='navigate'||u.pathname.endsWith('/index.html')||u.pathname.endsWith('/')){
  e.respondWith(fetch(e.request).then(async r=>{const t=await r.text();return new Response(injectPhase2(t),{status:r.status,statusText:r.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})}).catch(()=>caches.match('./index.html')));
  return;
 }
 e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});