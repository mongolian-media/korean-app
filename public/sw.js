// MONGOLIAN MEDIA — Service Worker (iOS Apple & Android Bulletproof Offline Engine v51)
const CACHE_NAME = 'mm-korean-v51';

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
  '/apple-touch-icon-152x152.png',
  '/apple-touch-icon-120x120.png',
  '/app-icon-192.png',
  '/app-icon-512.png',
  '/mascot-icon-v1.png',
  '/favicon.ico',
  '/assets/logo.jpg'
];

// Helper to make pristine, unconsumed responses from a blob
function createFreshResponse(blob, contentType) {
  return new Response(blob, {
    status: 200,
    statusText: 'OK',
    headers: {
      'Content-Type': contentType || 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000'
    }
  });
}

// Resilient Pre-caching for iOS Safari and Android
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[SW v51] Installing resilient offline cache...');

      // 1. Guaranteed first priority: HTML App Shell (both / and /index.html)
      try {
        const rootRes = await fetch('/', { cache: 'no-cache' });
        if (rootRes && rootRes.ok) {
          const blob = await rootRes.blob();
          await cache.put('/', createFreshResponse(blob, 'text/html; charset=utf-8'));
          await cache.put('/index.html', createFreshResponse(blob, 'text/html; charset=utf-8'));
          await cache.put(new URL('/', self.location.origin).href, createFreshResponse(blob, 'text/html; charset=utf-8'));
          await cache.put(new URL('/index.html', self.location.origin).href, createFreshResponse(blob, 'text/html; charset=utf-8'));
        }
      } catch (err) {
        console.warn('[SW v51] Root HTML initial fetch warn:', err);
      }

      // 2. Individual non-blocking asset caching (prevent all-or-nothing crash on iOS)
      for (const url of PRECACHE_ASSETS) {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (res && res.ok) {
            const blob = await res.blob();
            const ctype = res.headers.get('content-type') || '';
            await cache.put(url, createFreshResponse(blob, ctype));
            await cache.put(new URL(url, self.location.origin).href, createFreshResponse(blob, ctype));
          }
        } catch (e) {
          console.warn('[SW v51] Asset fetch warn for:', url, e);
        }
      }
      console.log('[SW v51] Pre-caching completed successfully!');
    })()
  );
});

// Purge outdated caches and take immediate control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Disable navigationPreload to prevent iOS WebKit -1009 abort bug
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.disable();
        } catch (err) {}
      }
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW v51] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
      console.log('[SW v51] Activated and claimed all clients.');
    })()
  );
});

// Fetch Interception: Resilient Cache-First for Offline Support
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip API calls completely (Auth / sync happens when online)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 1. Navigation / Document Requests (Opening app, root, index.html)
  const isHtml = event.request.mode === 'navigate' ||
                 event.request.destination === 'document' ||
                 url.pathname === '/' ||
                 url.pathname === '/index.html' ||
                 (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'));

  if (isHtml) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        // Try exact match or relative/absolute fallbacks
        let cached = await cache.match(event.request, { ignoreSearch: true });
        if (!cached) {
          cached = await cache.match('/index.html', { ignoreSearch: true });
        }
        if (!cached) {
          cached = await cache.match('/', { ignoreSearch: true });
        }
        if (!cached) {
          cached = await cache.match(new URL('/index.html', self.location.origin).href, { ignoreSearch: true });
        }
        if (!cached) {
          cached = await cache.match(new URL('/', self.location.origin).href, { ignoreSearch: true });
        }
        if (!cached) {
          cached = await caches.match('/index.html', { ignoreSearch: true })
                || await caches.match('/', { ignoreSearch: true });
        }

        if (cached) {
          // Stale While Revalidate if online
          if (navigator.onLine) {
            fetch(event.request).then(async (fresh) => {
              if (fresh && fresh.ok) {
                const blob = await fresh.blob();
                const c = await caches.open(CACHE_NAME);
                await c.put('/', createFreshResponse(blob, 'text/html; charset=utf-8'));
                await c.put('/index.html', createFreshResponse(blob, 'text/html; charset=utf-8'));
                await c.put(new URL('/', self.location.origin).href, createFreshResponse(blob, 'text/html; charset=utf-8'));
                await c.put(new URL('/index.html', self.location.origin).href, createFreshResponse(blob, 'text/html; charset=utf-8'));
              }
            }).catch(() => {});
          }
          return cached;
        }

        // If not in cache yet, try network
        try {
          const netRes = await fetch(event.request);
          if (netRes && netRes.ok) {
            const blob = await netRes.blob();
            await cache.put('/', createFreshResponse(blob, 'text/html; charset=utf-8'));
            await cache.put('/index.html', createFreshResponse(blob, 'text/html; charset=utf-8'));
            await cache.put(new URL('/', self.location.origin).href, createFreshResponse(blob, 'text/html; charset=utf-8'));
            await cache.put(new URL('/index.html', self.location.origin).href, createFreshResponse(blob, 'text/html; charset=utf-8'));
            return createFreshResponse(blob, 'text/html; charset=utf-8');
          }
          return netRes;
        } catch (netErr) {
          // Final offline safety fallback
          const fb = await cache.match('/index.html', { ignoreSearch: true })
                  || await cache.match('/', { ignoreSearch: true })
                  || await caches.match('/index.html')
                  || await caches.match('/');
          if (fb) return fb;
          return new Response(
            '<!DOCTYPE html><html lang="mn"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>MONGOLIAN MEDIA</title></head><body style="background:#090d16;color:#fff;text-align:center;padding:50px;font-family:sans-serif;"><h2>MONGOLIAN MEDIA</h2><p>Офлайн горим бэлтгэгдэж байна. Дахин ачаална уу.</p><button onclick="location.reload()" style="padding:10px 20px;border-radius:8px;background:#3b82f6;color:#fff;border:none;cursor:pointer;font-weight:700;">Дахин ачаалах</button></body></html>',
            {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
          );
        }
      })()
    );
    return;
  }

  // 2. Static Asset Requests (CSS, JS, Images, Icons)
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      let cached = await cache.match(event.request, { ignoreSearch: true });
      if (!cached) {
        cached = await cache.match(url.pathname, { ignoreSearch: true });
      }
      if (!cached) {
        cached = await cache.match(new URL(url.pathname, self.location.origin).href, { ignoreSearch: true });
      }
      if (!cached) {
        cached = await caches.match(event.request, { ignoreSearch: true })
              || await caches.match(url.pathname, { ignoreSearch: true });
      }

      if (cached) {
        return cached;
      }

      try {
        const netRes = await fetch(event.request);
        if (netRes && netRes.ok) {
          const blob = await netRes.blob();
          const ctype = netRes.headers.get('content-type') || '';
          cache.put(event.request, createFreshResponse(blob, ctype)).catch(() => {});
          cache.put(url.pathname, createFreshResponse(blob, ctype)).catch(() => {});
          cache.put(new URL(url.pathname, self.location.origin).href, createFreshResponse(blob, ctype)).catch(() => {});
          return createFreshResponse(blob, ctype);
        }
        return netRes;
      } catch (err) {
        const fb = await cache.match(url.pathname, { ignoreSearch: true })
                || await cache.match(new URL(url.pathname, self.location.origin).href, { ignoreSearch: true });
        if (fb) return fb;
        return new Response('', { status: 404 });
      }
    })()
  );
});
