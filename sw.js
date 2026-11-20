// MONGOLIAN MEDIA — Service Worker (iOS Safari & Android PWA Hardened)
// Cache version: mm-korean-v45
const CACHE_NAME = 'mm-korean-v45';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/glassmorphism.css?v=20',
  '/js/api.js?v=45',
  '/js/speech_engine.js?v=45',
  '/js/storage_manager.js?v=45',
  '/js/alphabet_data.js?v=45',
  '/js/curriculum_data.js?v=45',
  '/js/pwa.js?v=45',
  '/js/app.js?v=45',
  '/apple-touch-icon.png',
  '/apple-touch-icon-180x180.png',
  '/app-icon-192.png',
  '/app-icon-512.png',
  '/favicon.ico',
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
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[SW v42] Installing & pre-caching all shell assets...');
      
      // 1. Guarantee /index.html and / first
      try {
        const indexRes = await fetch('/index.html', { cache: 'reload' });
        if (indexRes && indexRes.status === 200) {
          const clean1 = cleanResponse(indexRes);
          await cache.put('/index.html', clean1.clone());
          await cache.put('/', clean1);
        }
      } catch (err) {}

      // 2. Parallel pre-cache remaining assets
      await Promise.allSettled(
        SHELL_ASSETS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'reload' });
            if (res && res.status === 200) {
              const clean = cleanResponse(res);
              await cache.put(url, clean.clone());
              await cache.put(url.split('?')[0], clean);
            }
          } catch (e) {}
        })
      );
    })()
  );
});

// Purge old cache versions and claim clients immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            console.log('[SW v42] Purging outdated cache:', k);
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
          
          // Emergency offline HTML fallback so Safari NEVER displays a network error screen
          return new Response(
            `<!DOCTYPE html><html lang="mn"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>MONGOLIAN MEDIA</title><style>body{background:#090d16;color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;text-align:center;box-sizing:border-box;}h2{margin:0 0 10px 0;font-size:22px;color:#38bdf8;}p{color:#94a3b8;font-size:14px;max-width:320px;line-height:1.6;margin-bottom:24px;}button{background:#2563eb;color:#fff;border:none;padding:14px 28px;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;}</style></head><body><div style="font-size:50px;margin-bottom:12px;">📚</div><h2>MONGOLIAN MEDIA</h2><p>Офлайн горим бэлтгэгдэж байна. Доорх товчийг дарж апп руугаа орно уу.</p><button onclick="window.location.reload()">🔄 Апп-ыг нээх</button></body></html>`,
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
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
