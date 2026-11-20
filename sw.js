// MONGOLIAN MEDIA — Service Worker (iOS Safari & Android PWA Hardened)
// Cache version: mm-korean-v41
const CACHE_NAME = 'mm-korean-v41';
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

// Clean WebKit / iOS Safari redirect flag so cached responses can be served offline without WebKit rejection
function cleanResponse(response) {
  if (!response || !response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

// Pre-cache all shell assets on installation
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW v41] Installing & pre-caching all shell assets...');
      for (const url of SHELL_ASSETS) {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (res && res.status === 200) {
            await cache.put(url, cleanResponse(res));
          }
        } catch (err) {
          console.warn('[SW v41] Pre-cache fail for:', url, err);
        }
      }
      // Guarantee /index.html and / are cached
      try {
        const indexRes = await fetch('/index.html', { cache: 'no-cache' });
        if (indexRes && indexRes.status === 200) {
          await cache.put('/index.html', cleanResponse(indexRes.clone()));
          await cache.put('/', cleanResponse(indexRes.clone()));
        }
      } catch (err) {}
    })
  );
});

// Purge old cache versions and claim clients immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            console.log('[SW v41] Purging outdated cache:', k);
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Cache-First for Navigation (iOS Safari offline lifeline)
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
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        // 1. Check Cache FIRST (Essential for iOS Safari offline!)
        let cached = await cache.match('/index.html', { ignoreSearch: true })
                  || await cache.match('/', { ignoreSearch: true })
                  || await cache.match(e.request, { ignoreSearch: true });

        if (cached) {
          // If online, update cache in background (Stale While Revalidate)
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            fetch(e.request).then(async (netRes) => {
              if (netRes && netRes.status === 200) {
                const clean = cleanResponse(netRes);
                await cache.put('/index.html', clean.clone());
                await cache.put('/', clean);
              }
            }).catch(() => {});
          }
          return cleanResponse(cached);
        }

        // 2. If not in cache yet (initial load), fetch from network
        try {
          const netRes = await fetch(e.request);
          if (netRes && netRes.status === 200) {
            const clean = cleanResponse(netRes);
            cache.put('/index.html', clean.clone()).catch(() => {});
            cache.put('/', clean).catch(() => {});
            return cleanResponse(netRes.clone());
          }
          return netRes;
        } catch (fetchErr) {
          const fallback = await cache.match('/index.html', { ignoreSearch: true }) || await cache.match('/', { ignoreSearch: true });
          if (fallback) return cleanResponse(fallback);
          throw fetchErr;
        }
      })()
    );
    return;
  }

  // 2. Static Assets (JS, CSS, Images, Icons, Audio)
  // Cache-First with ignoreSearch so ?v=41 matches cached /js/app.js
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Cache-First with ignoreSearch
      let cached = await cache.match(e.request, { ignoreSearch: true });
      if (!cached) {
        cached = await cache.match(url.pathname, { ignoreSearch: true });
      }
      if (cached) {
        return cleanResponse(cached);
      }

      // Try network
      try {
        const netRes = await fetch(e.request);
        if (netRes && netRes.status === 200 && (netRes.type === 'basic' || netRes.type === 'cors')) {
          const clean = cleanResponse(netRes);
          cache.put(e.request, clean.clone()).catch(() => {});
          cache.put(url.pathname, clean).catch(() => {});
          return cleanResponse(netRes.clone());
        }
        return netRes;
      } catch (err) {
        const fallback = await cache.match(url.pathname, { ignoreSearch: true });
        if (fallback) return cleanResponse(fallback);
        throw err;
      }
    })()
  );
});
