// MONGOLIAN MEDIA — Service Worker
// Caches App Shell, Brand Assets & UI scripts for fast offline shell loading.
// Protected user content is strictly authorized by the backend server.

const CACHE_NAME = 'mm-korean-v17';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/glassmorphism.css',
  './js/api.js',
  './js/speech_engine.js',
  './js/storage_manager.js',
  './js/alphabet_data.js',
  './js/curriculum_data.js',
  './js/pwa.js',
  './js/app.js',
  './assets/logo.jpg',
  './assets/mascot.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './assets/app_icon.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell...');
      return cache.addAll(SHELL_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never cache API calls in service worker
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        // Cache static files dynamically if valid
        if (res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
