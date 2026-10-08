const CACHE = 'test-arena-shell-__BUILD_VERSION__';
const BASE = new URL('./', self.location.href);
const local = path => new URL(path, BASE).href;
const offline = local('offline.html');
const staticFiles = ['offline.html','arena.svg','manifest.webmanifest','icons/arena-192.png','icons/arena-512.png','icons/apple-touch-icon.png'].map(local);
self.addEventListener('install', event => {event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(staticFiles)));});
self.addEventListener('message', event => {if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();});
self.addEventListener('activate', event => {event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('test-arena-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  // Auth, Firestore, Functions and API/data responses are never intercepted.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => response.status === 404 ? fetch(BASE) : response).catch(() => caches.match(offline)));
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
