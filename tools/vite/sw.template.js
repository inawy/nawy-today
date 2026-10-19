/* Nawy Today service worker (D-009, D-027). Generated at build: __VERSION__ and __PRECACHE__ are
   replaced by tools/vite/pwa.ts. Hand-written, no library.

   - Offline: the whole app is precached; page loads are answered from the cache.
   - Isolation (D-009): every cache this worker creates starts with "nawy-today:" and it only ever
     deletes caches with that prefix. It never answers a request for another origin.
   - Updates are NEVER applied behind the user's back: a new worker installs and waits. The page
     asks it to take over (message SKIP_WAITING) only when the user presses "update". */
const PREFIX = 'nawy-today:';
const CACHE = PREFIX + 'v' + '__VERSION__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `reload` skips the HTTP cache so a half-updated server can never poison the cache.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // One page app: every navigation inside the scope is the shell.
    event.respondWith(
      caches
        .match('./index.html', { cacheName: CACHE })
        .then((cached) => cached || fetch(request)),
    );
    return;
  }
  event.respondWith(
    caches.match(request, { cacheName: CACHE }).then((cached) => cached || fetch(request)),
  );
});
