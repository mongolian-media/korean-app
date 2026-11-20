// MONGOLIAN MEDIA — Service Worker
// Cache version: mm-korean-v30
const CACHE_NAME = 'mm-korean-v32';
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
      console.log('[SW v30] Pre-caching app shell assets...');
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[SW v30] Pre-cache partial fail:', err);
      });
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            console.log('[SW v30] Purging outdated cache:', k);
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip API calls completely
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-First for Navigation (HTML) & Manifest to guarantee instant updates
  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/manifest.json') {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        return caches.match(e.request).then(cached => cached || caches.match('/index.html'));
      })
    );
    return;
  }

  // Cache-First for static assets (icons, css, js)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
