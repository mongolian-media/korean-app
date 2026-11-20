// MONGOLIAN MEDIA — Service Worker
// Cache version: mm-korean-v39
const CACHE_NAME = 'mm-korean-v39';
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

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW v39] Resilient pre-caching app shell assets...');
      return Promise.allSettled(
        SHELL_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('[SW v39] Failed to pre-cache individual asset:', asset, err);
          })
        )
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
            console.log('[SW v39] Purging outdated cache:', k);
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
  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('.html')) {
    // If completely offline, return cached shell instantly
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      e.respondWith(
        caches.match('/index.html', { ignoreSearch: true }).then((cached) => {
          return cached || caches.match('/', { ignoreSearch: true });
        })
      );
      return;
    }

    // When online, try network with instant cache fallback
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        return caches.match(e.request, { ignoreSearch: true }).then((cached) => {
          return cached || caches.match('/index.html', { ignoreSearch: true }) || caches.match('/', { ignoreSearch: true });
        });
      })
    );
    return;
  }

  // 2. Static Assets (JS, CSS, Icons, Fonts, Audio, Images)
  // Cache-First with ignoreSearch so ?v=39 matches cached /js/app.js
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return caches.match(url.pathname, { ignoreSearch: true }).then((pathCached) => {
        if (pathCached) return pathCached;
        return fetch(e.request).then((res) => {
          if (res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => {
          // If offline and asset is an HTML/JS, try matching pathname
          return caches.match(url.pathname, { ignoreSearch: true });
        });
      });
    })
  );
});
