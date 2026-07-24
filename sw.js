// Tiny service worker — makes the app installable and usable offline.
// Strategy: network-first. Always try the live version (so config/app updates
// show up immediately when online), and only fall back to the cached copy
// when the phone is offline.
const CACHE = 'wc-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  // Delete any old caches so stale files can't linger on a user's phone.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never cache logins/writes

  // For our own files, force a fresh copy from the server (bypass the phone's
  // HTTP cache) so app updates always take effect the next time online.
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  const fetchReq = sameOrigin
    ? new Request(req.url, { cache: 'reload', credentials: 'same-origin' })
    : req;

  event.respondWith(
    fetch(fetchReq)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
