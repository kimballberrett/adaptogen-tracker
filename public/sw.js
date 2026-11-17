// Service worker: keeps the app's files on the phone so it opens instantly and works with
// no signal. All of her data is already on the phone (see local.js); this covers the code.
//
// Files are answered from the cache right away, then refreshed in the background, so an
// update to the app shows up on the next open after it is published.

const CACHE = 'sips-v2';
const SHELL = [
  './',
  './styles.css',
  './app.js',
  './icons.js',
  './local.js',
  './fonts/urbanist-latin.woff2',
  './favicon.svg',
  './icon-180.png',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  // Every page URL is the same single-page app, so navigations use the cached start page.
  const key = request.mode === 'navigate' ? self.registration.scope : request;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(fresh); // let the background refresh finish
        return cached;
      }
      return fresh;
    }),
  );
});
