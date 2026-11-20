// MONGOLIAN MEDIA — Service Worker (Production PWA Standard Offline Engine)
const CACHE_NAME = 'mm-korean-v49';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/glassmorphism.css',
  '/js/api.js',
  '/js/speech_engine.js',
  '/js/storage_manager.js',
  '/js/alphabet_data.js',
  '/js/curriculum_data.js',
  '/js/pwa.js',
  '/js/app.js',
  '/apple-touch-icon.png',
  '/apple-touch-icon-180x180.png',
  '/app-icon-192.png',
  '/app-icon-512.png',
  '/mascot-icon-v1.png',
  '/favicon.ico',
  '/assets/logo.jpg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW v49] Pre-caching core assets...');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW v49] Deleting outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip API calls completely (Auth / sync happens when online)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 1. Navigation Requests (Opening app, root, index.html)
  if (event.request.mode === 'navigate' || event.request.destination === 'document' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          // Stale While Revalidate: update in background if online
          if (navigator.onLine) {
            fetch(event.request).then((fresh) => {
              if (fresh && fresh.status === 200) {
                caches.open(CACHE_NAME).then((c) => c.put(event.request, fresh));
              }
            }).catch(() => {});
          }
          return cached;
        }

        // Try / or /index.html fallback from cache
        return caches.match('/').then((cRoot) => {
          if (cRoot) return cRoot;
          return caches.match('/index.html').then((cIndex) => {
            if (cIndex) return cIndex;
            return fetch(event.request);
          });
        });
      }).catch(() => {
        // Offline fallback
        return caches.match('/').then((cRoot) => cRoot || caches.match('/index.html'));
      })
    );
    return;
  }

  // 2. Static Asset Requests (CSS, JS, Images, Icons)
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) {
        return cached;
      }
      return caches.match(url.pathname, { ignoreSearch: true }).then((cachedPath) => {
        if (cachedPath) {
          return cachedPath;
        }
        return fetch(event.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return networkRes;
        }).catch(() => {
          return caches.match(url.pathname, { ignoreSearch: true });
        });
      });
    })
  );
});
