// MONGOLIAN MEDIA — Service Worker (iOS Apple & Android Bulletproof Offline Engine v52)
const CACHE_NAME = 'mm-korean-v52';

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

function getContentType(path) {
  if (path.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.ico')) return 'image/x-icon';
  return 'text/html; charset=utf-8';
}

// CRITICAL FOR IOS SAFARI: Reconstructs a response with clean headers and forced redirected=false
async function cleanResponse(response, defaultType) {
  if (!response) return response;
  try {
    const blob = await response.blob();
    const ctype = response.headers.get('content-type') || defaultType || 'text/html; charset=utf-8';
    return new Response(blob, {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': ctype,
        'Cache-Control': 'public, max-age=31536000'
      }
    });
  } catch (e) {
    return response;
  }
}

const OFFLINE_HTML_FALLBACK = `<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>MONGOLIAN MEDIA — Офлайн горим</title>
</head>
<body style="background:#090d16;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;text-align:center;padding:50px 20px;">
  <div style="font-size:48px;margin-bottom:16px;">🟢</div>
  <h2 style="margin-bottom:12px;">MONGOLIAN MEDIA</h2>
  <p style="color:#94a3b8;margin-bottom:24px;">Офлайн горим амжилттай бэлтгэгдсэн байна.</p>
  <button onclick="location.reload()" style="background:#2563eb;color:#ffffff;border:none;padding:12px 28px;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;">Дахин ачаалах</button>
</body>
</html>`;

// Resilient Parallel Pre-caching
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[SW v52] Installing resilient parallel cache...');

      // 1. First priority: Cache HTML shell
      try {
        const rootRes = await fetch('/index.html', { cache: 'no-cache' });
        if (rootRes && rootRes.ok) {
          const blob = await rootRes.blob();
          const makeHtml = () => new Response(blob, {
            status: 200,
            statusText: 'OK',
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=31536000'
            }
          });
          await cache.put('/', makeHtml());
          await cache.put('/index.html', makeHtml());
          await cache.put(new URL('/', self.location.origin).href, makeHtml());
          await cache.put(new URL('/index.html', self.location.origin).href, makeHtml());
        }
      } catch (err) {
        console.warn('[SW v52] Root HTML fetch failed:', err);
      }

      // 2. Parallel non-blocking caching of remaining assets
      const remainingAssets = PRECACHE_ASSETS.filter(u => u !== '/' && u !== '/index.html');
      const fetchTasks = remainingAssets.map(async (url) => {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (res && res.ok) {
            const blob = await res.blob();
            const ctype = res.headers.get('content-type') || getContentType(url);
            const makeRes = () => new Response(blob, {
              status: 200,
              statusText: 'OK',
              headers: {
                'Content-Type': ctype,
                'Cache-Control': 'public, max-age=31536000'
              }
            });
            await cache.put(url, makeRes());
            await cache.put(new URL(url, self.location.origin).href, makeRes());
          }
        } catch (e) {
          console.warn('[SW v52] Precache failed for:', url);
        }
      });

      await Promise.allSettled(fetchTasks);
      console.log('[SW v52] Pre-caching finished successfully!');
    })()
  );
});

// Purge old caches and claim all clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.disable();
        } catch (err) {}
      }
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW v52] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
      console.log('[SW v52] Claimed clients.');
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
        try {
          const cache = await caches.open(CACHE_NAME);

          // 1. Check current cache
          let cached = await cache.match(event.request, { ignoreSearch: true });
          if (!cached) cached = await cache.match('/index.html', { ignoreSearch: true });
          if (!cached) cached = await cache.match('/', { ignoreSearch: true });
          if (!cached) cached = await cache.match(new URL('/index.html', self.location.origin).href, { ignoreSearch: true });
          if (!cached) cached = await cache.match(new URL('/', self.location.origin).href, { ignoreSearch: true });

          // 2. Check all caches in storage
          if (!cached) {
            cached = await caches.match('/index.html', { ignoreSearch: true })
                  || await caches.match('/', { ignoreSearch: true });
          }

          if (cached) {
            return await cleanResponse(cached, 'text/html; charset=utf-8');
          }

          // 3. Network fetch if online
          try {
            const netRes = await fetch(event.request);
            if (netRes && netRes.ok) {
              const blob = await netRes.blob();
              const makeHtml = () => new Response(blob, {
                status: 200,
                statusText: 'OK',
                headers: {
                  'Content-Type': 'text/html; charset=utf-8',
                  'Cache-Control': 'public, max-age=31536000'
                }
              });
              await cache.put('/', makeHtml());
              await cache.put('/index.html', makeHtml());
              await cache.put(new URL('/', self.location.origin).href, makeHtml());
              await cache.put(new URL('/index.html', self.location.origin).href, makeHtml());
              return makeHtml();
            }
            return netRes;
          } catch (netErr) {
            // Offline fallback
            const fb = await cache.match('/index.html', { ignoreSearch: true })
                    || await cache.match('/', { ignoreSearch: true });
            if (fb) return await cleanResponse(fb, 'text/html; charset=utf-8');
            return new Response(OFFLINE_HTML_FALLBACK, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
          }
        } catch (fatalErr) {
          return new Response(OFFLINE_HTML_FALLBACK, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
      })()
    );
    return;
  }

  // 2. Static Asset Requests (CSS, JS, Images, Icons)
  event.respondWith(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        let cached = await cache.match(event.request, { ignoreSearch: true });
        if (!cached) cached = await cache.match(url.pathname, { ignoreSearch: true });
        if (!cached) cached = await cache.match(new URL(url.pathname, self.location.origin).href, { ignoreSearch: true });

        if (cached) {
          return await cleanResponse(cached, getContentType(url.pathname));
        }

        // Try network
        try {
          const netRes = await fetch(event.request);
          if (netRes && netRes.ok) {
            const blob = await netRes.blob();
            const ctype = netRes.headers.get('content-type') || getContentType(url.pathname);
            const makeR = () => new Response(blob, {
              status: 200,
              statusText: 'OK',
              headers: {
                'Content-Type': ctype,
                'Cache-Control': 'public, max-age=31536000'
              }
            });
            cache.put(event.request, makeR()).catch(() => {});
            cache.put(url.pathname, makeR()).catch(() => {});
            cache.put(new URL(url.pathname, self.location.origin).href, makeR()).catch(() => {});
            return makeR();
          }
          return netRes;
        } catch (netErr) {
          const fb = await cache.match(url.pathname, { ignoreSearch: true })
                  || await cache.match(new URL(url.pathname, self.location.origin).href, { ignoreSearch: true });
          if (fb) return await cleanResponse(fb, getContentType(url.pathname));
          return new Response('', { status: 404 });
        }
      } catch (err) {
        return new Response('', { status: 404 });
      }
    })()
  );
});
