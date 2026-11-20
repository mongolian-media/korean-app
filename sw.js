// MONGOLIAN MEDIA — Service Worker (iOS Apple & Android Bulletproof Offline Engine v57)
// Built on drive.uugiscar.com production standard: updateViaCache: 'none', atomic addAll, response.clone()
const VERSION = 'v57';
const SHELL_CACHE = `mm-korean-${VERSION}`;

const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/glassmorphism.css',
  '/js/pwa.js',
  '/js/api.js',
  '/js/speech_engine.js',
  '/js/storage_manager.js',
  '/js/alphabet_data.js',
  '/js/curriculum_data.js',
  '/js/app.js',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/assets/logo.jpg'
];

// Precache all essential shell files atomically. If any file fails, install fails cleanly.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// Purge old caches and claim clients immediately once the new cache is active
self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !keep.has(k) && k.startsWith('mm-korean')).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/** Network first so deploys show up immediately; cache when offline.
 *  Uses response.clone() and only caches valid (ok) responses. */
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    // no-cache: always revalidate with the server so new deploys are detected immediately
    const response = await fetch(request, { cache: 'no-cache' });
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    const url = new URL(request.url);
    const cachedPath = await cache.match(url.pathname, { ignoreSearch: true });
    if (cachedPath) return cachedPath;

    // Offline document navigation fallback: return cached root app shell
    if (request.mode === 'navigate' || request.destination === 'document' || url.pathname === '/' || url.pathname === '/index.html') {
      const rootCached = await cache.match('/index.html', { ignoreSearch: true }) || await cache.match('/', { ignoreSearch: true });
      if (rootCached) return rootCached;
    }
    throw err;
  }
}

/** Static icons, logos, and images: serve from cache first */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const fallback = await cache.match(request, { ignoreSearch: true });
    if (fallback) return fallback;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Bypass API calls completely (Auth / sync happens when online)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.ico')) {
      event.respondWith(cacheFirst(request, SHELL_CACHE));
    } else {
      event.respondWith(networkFirst(request));
    }
  }
});

// Skip waiting & claim message triggers
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLAIM_CLIENTS') {
    self.clients.claim().catch(() => {});
  }
  if (event.data && event.data.type === 'FORCE_PRECACHE') {
    event.waitUntil(
      caches.open(SHELL_CACHE)
        .then((cache) => cache.addAll(SHELL))
        .then(() => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ success: true, cacheName: SHELL_CACHE });
          }
        })
    );
  }
});
