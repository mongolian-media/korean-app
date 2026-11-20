// MONGOLIAN MEDIA — Service Worker (iOS Safari & Android PWA Hardened)
// Cache version: mm-korean-v40
const CACHE_NAME = 'mm-korean-v40';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/app-icon.png',
  '/app-icon-192.png',
  '/app-icon-512.png',
  '/mascot-icon-v1.png',
  '/favicon.ico',
  '/css/glassmorphism.css',
  '/js/api.js',
  '/js/speech_engine.js',
  '/js/storage_manager.js',
  '/js/alphabet_data.js',
  '/js/curriculum_data.js',
  '/js/pwa.js',
  '/js/app.js',
  '/assets/logo.jpg'
];

// Clean WebKit / iOS Safari redirect flag so cached responses can be served offline
function cleanResponse(response) {
  if (!response || !response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW v40] Pre-caching all assets with cleanResponse...');
      await Promise.allSettled(
        SHELL_ASSETS.map(async (asset) => {
          try {
            const res = await fetch(asset, { cache: 'no-cache' });
            if (res.status === 200) {
              await cache.put(asset, cleanResponse(res));
            }
          } catch (err) {
            console.warn('[SW v40] Failed to cache asset:', asset, err);
          }
        })
      );
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            console.log('[SW v40] Purging outdated cache:', k);
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip API calls completely (Auth / sync happens when online)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 1. Navigation Requests (HTML / App Shell)
  const isNav = e.request.mode === 'navigate' ||
                e.request.destination === 'document' ||
                url.pathname === '/' ||
                url.pathname === '/index.html' ||
                url.pathname.endsWith('.html') ||
                (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html'));

  if (isNav) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.status === 200) {
            const clone = cleanResponse(res.clone());
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/index.html', clone);
              cache.put('/', cleanResponse(res.clone()));
            });
          }
          return res;
        })
        .catch(async () => {
          // OFFLINE FALLBACK: Always serve the cached HTML shell
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match('/index.html', { ignoreSearch: true })
                      || await cache.match('/', { ignoreSearch: true })
                      || await caches.match('/index.html')
                      || await caches.match('/');
          if (cached) return cached;
          return new Response('<h1>Офлайн горим</h1><p>Интернэтээ асааж 1 удаа ачаална уу.</p>', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        })
    );
    return;
  }

  // 2. Static Assets (JS, CSS, Icons, Images, Audio)
  // Cache-First with ignoreSearch so ?v=40 matches cached /js/app.js
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return caches.match(url.pathname, { ignoreSearch: true }).then((pathCached) => {
        if (pathCached) return pathCached;
        return fetch(e.request).then((res) => {
          if (res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            const clone = cleanResponse(res.clone());
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => {
          // If completely offline and asset not found with query, try matching raw pathname
          return caches.match(url.pathname, { ignoreSearch: true });
        });
      });
    })
  );
});
