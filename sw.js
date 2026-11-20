// MONGOLIAN MEDIA — Service Worker (Production Offline Engine v61)
// Built strictly on drive.uugiscar.com offline architecture

const VERSION = 'v61';
const SHELL_CACHE = `shell-${VERSION}`;
const IMAGE_CACHE = 'images-v1';

const SHELL = [
  './',
  '/',
  'index.html',
  '/index.html',
  'manifest.json',
  '/manifest.json',
  'css/glassmorphism.css',
  '/css/glassmorphism.css',
  'js/pwa.js',
  '/js/pwa.js',
  'js/api.js',
  '/js/api.js',
  'js/storage_manager.js',
  '/js/storage_manager.js',
  'js/speech_engine.js',
  '/js/speech_engine.js',
  'js/alphabet_data.js',
  '/js/alphabet_data.js',
  'js/curriculum_data.js',
  '/js/curriculum_data.js',
  'js/app.js',
  '/js/app.js',
  'apple-touch-icon.png',
  '/apple-touch-icon.png',
  'favicon.ico',
  '/favicon.ico',
  'assets/logo.jpg',
  '/assets/logo.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return Promise.all(
        SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Precache item failed:', url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, IMAGE_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !keep.has(k) && (k.startsWith('shell-') || k.startsWith('mm-korean-')))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Network first so deploys show up immediately; cache when offline. */
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    // no-cache: always revalidate with the server, so a deploy is never hidden by the HTTP cache
    const response = await fetch(request, { cache: 'no-cache' });
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    // Offline document navigation fallback: return cached root app shell
    if (request.mode === 'navigate') {
      const fallback =
        (await cache.match('./')) ||
        (await cache.match('/')) ||
        (await cache.match('index.html')) ||
        (await cache.match('/index.html'));
      if (fallback) return fallback;
    }

    // Try matching URL pathname directly
    const url = new URL(request.url);
    const pathCached = await cache.match(url.pathname, { ignoreSearch: true });
    if (pathCached) return pathCached;

    throw err;
  }
}

/** Static assets (images, icons) */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone()).catch(() => {});
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
    if (
      url.pathname.startsWith('/assets/') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.ico')
    ) {
      event.respondWith(cacheFirst(request, IMAGE_CACHE));
    } else {
      event.respondWith(networkFirst(request));
    }
  }
});
