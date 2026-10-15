const CACHE = 'test-arena-shell-__BUILD_VERSION__';
const BASE = new URL('./', self.location.href);
const local = path => new URL(path, BASE).href;
const offline = local('offline.html');
const maintenance = local('maintenance.html');
const staticFiles = ['maintenance.html','offline.html','arena.svg','manifest.webmanifest','icons/arena-192.png','icons/arena-512.png','icons/apple-touch-icon.png'].map(local);
self.addEventListener('install', event => {event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(staticFiles)).then(()=>self.skipWaiting()));});
self.addEventListener('message', event => {if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();});
self.addEventListener('activate', event => {event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('test-arena-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()).then(()=>{void self.clients.matchAll({type:'window'}).then(clients=>{for(const client of clients)if(client.url.startsWith(BASE.href)&&client.url!==maintenance)void client.navigate(maintenance).catch(()=>{});});}));});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  // Auth, Firestore, Functions and API/data responses are never intercepted.
  if (event.request.mode === 'navigate') {
    event.respondWith(url.href===maintenance?fetch(maintenance).catch(()=>caches.match(maintenance)):Promise.resolve(Response.redirect(maintenance,302)));
  } else if (staticFiles.includes(url.href) || /^assets\/[^/]+-[A-Za-z0-9_-]+\.(js|css|woff2?)$/.test(url.pathname.slice(BASE.pathname.length))) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const saved = await cache.match(event.request);
      if (saved) return saved;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    }));
  }
});
