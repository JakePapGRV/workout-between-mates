// Tiny service worker — makes the app installable and usable offline.
// Strategy: network-first. Always try the live version (so config/app updates
// show up immediately when online), and only fall back to the cached copy
// when the phone is offline.
const CACHE = 'wc-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never cache logins/writes
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
