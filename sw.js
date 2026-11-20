// MONGOLIAN MEDIA — Service Worker (Production Offline Engine v59)
// Built specifically to eliminate iOS WebKit / Safari offline redirect errors
const VERSION = 'v59';
const SHELL_CACHE = `mm-korean-${VERSION}`;

const SHELL = [
  '/',
  './',
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

/**
 * Strips the internal 'redirected' flag by constructing a fresh Response object.
 * iOS Safari / WebKit strictly blocks service worker responses if redirected === true
 * during offline navigation, throwing "Safari can't open the page because your iPhone is not connected to the internet".
 */
function cleanResponse(response) {
  if (!response) return response;
  return new Response(response.body, {
    status: response.status || 200,
    statusText: response.statusText || 'OK',
    headers: response.headers
  });
}

// 1. Install: Precache all essential files atomically, cleaning every response
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      for (const url of SHELL) {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (res && (res.ok || res.type === 'opaque')) {
            const clean = new Response(res.body, {
              status: res.status,
              statusText: res.statusText,
              headers: res.headers
            });
            await cache.put(url, clean);
          }
        } catch (e) {
          console.warn('[SW] Precache item failed:', url, e);
        }
      }
    })
  );
  self.skipWaiting();
});

// 2. Activate: Purge old caches and claim clients immediately once the new cache is ready
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

// 3. NetworkFirst for dynamic & navigation requests; always strips redirected flag for Safari
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response && response.ok) {
      const clean = new Response(response.clone().body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      cache.put(request, clean).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cleanResponse(cached);

    const url = new URL(request.url);
    const cachedPath = await cache.match(url.pathname, { ignoreSearch: true });
    if (cachedPath) return cleanResponse(cachedPath);

    // Offline document navigation fallback: return clean cached root app shell
    if (request.mode === 'navigate' || request.destination === 'document' || url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '') {
      const rootCached = await cache.match('/index.html', { ignoreSearch: true })
                      || await cache.match('/', { ignoreSearch: true })
                      || await cache.match('./', { ignoreSearch: true });
      if (rootCached) return cleanResponse(rootCached);
    }
    throw err;
  }
}

// 4. CacheFirst for static assets (icons, logo images)
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cleanResponse(cached);
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      const clean = new Response(response.clone().body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      cache.put(request, clean).catch(() => {});
    }
    return response;
  } catch (e) {
    const fallback = await cache.match(request, { ignoreSearch: true });
    if (fallback) return cleanResponse(fallback);
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
