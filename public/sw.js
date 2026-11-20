// MONGOLIAN MEDIA — Service Worker (iOS Safari & Android PWA Bulletproof Offline Engine)
// Cache version: mm-korean-v47
const CACHE_NAME = 'mm-korean-v47';

const EMBEDDED_APP_SHELL_HTML = `<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#090d16">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="Солонгос Яриа">
  <link rel="manifest" href="/manifest.json?v=47">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180x180.png">
  <link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-152x152.png">
  <link rel="apple-touch-icon" sizes="120x120" href="/apple-touch-icon-120x120.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="apple-touch-icon-precomposed" href="/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="180x180" href="/apple-touch-icon-180x180.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/app-icon-192.png">
  <link rel="icon" type="image/png" sizes="512x512" href="/app-icon-512.png">
  <link rel="shortcut icon" href="/apple-touch-icon.png">
  <title>MONGOLIAN MEDIA — Солонгос хэлний сургалт</title>
  <link rel="stylesheet" href="css/glassmorphism.css?v=20">
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(function(r) { console.log('[SW Head Reg v47]', r.scope); if(r.update) r.update(); })
        .catch(function(e) { console.warn('[SW Head Reg Err]', e); });
    }
  </script>
</head>
<body>
  <div style="position: fixed; inset: 0; width: 100vw; height: 100vh; overflow: hidden; pointer-events: none; z-index: 0;">
    <div class="ambient-glow-1"></div>
    <div class="ambient-glow-2"></div>
  </div>
  <div class="app-container">
    <div id="pwa-install-bar">
      <div class="banner-left">
        <span style="font-size: 20px;">📲</span>
        <span>Аппыг гар утсан дээрээ суулгах уу?</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button id="btn-pwa-install" class="banner-btn" style="display: none;">Суулгах</button>
        <button id="btn-ios-install" class="banner-btn" style="display: none;" onclick="PWA.showInstallModal()">Заавар</button>
        <button class="banner-close" onclick="PWA.dismissBanner()">&times;</button>
      </div>
    </div>
    <header class="app-header">
      <div class="header-brand" onclick="App.navigate('home')">
        <img src="assets/logo.jpg" alt="MONGOLIAN MEDIA Logo" class="header-logo">
        <div class="brand-titles">
          <h1>MONGOLIAN MEDIA</h1>
          <span class="tagline">Солонгос хэл — өдөр тутам ба ажил</span>
        </div>
      </div>
      <div class="header-actions">
        <button id="theme-toggle-btn" class="icon-btn" title="Өнгөний горим солих">
          <span id="theme-icon">🌙</span>
        </button>
        <button class="icon-btn" onclick="App.navigate('profile')" title="Хувийн тохиргоо">
          <span>👤</span>
        </button>
      </div>
    </header>
    <main id="main-content"></main>
  </div>
  <nav class="mobile-bottom-nav">
    <button class="nav-item active" data-view="home"><span class="nav-icon">🏠</span><span>Нүүр</span></button>
    <button class="nav-item" data-view="alphabet"><span class="nav-icon">🔤</span><span>Үсэг</span></button>
    <button class="nav-item" data-view="lessons-list"><span class="nav-icon">📚</span><span>Хичээл</span></button>
    <button class="nav-item" data-view="review"><span class="nav-icon">🔄</span><span>Давтлага</span></button>
    <button class="nav-item" data-view="vocab"><span class="nav-icon">⭐</span><span>Үгс</span></button>
    <button class="nav-item" data-view="profile"><span class="nav-icon">👤</span><span>Профайл</span></button>
  </nav>
  <div id="app-modal-overlay" class="modal-overlay" onclick="if(event.target===this) App.closeModal()">
    <div class="modal-content">
      <button class="modal-close" onclick="App.closeModal()">&times;</button>
      <h3 id="modal-title-text" style="font-size: 16px; font-weight: 800; margin-bottom: 14px; color: var(--text-main);">Гарчиг</h3>
      <div id="modal-body-area"></div>
    </div>
  </div>
  <script src="js/api.js?v=47"></script>
  <script src="js/storage_manager.js?v=47"></script>
  <script src="js/speech_engine.js?v=47"></script>
  <script src="js/pwa.js?v=47"></script>
  <script src="js/alphabet_data.js?v=47"></script>
  <script src="js/curriculum_data.js?v=47"></script>
  <script src="js/app.js?v=47"></script>
</body>
</html>`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/glassmorphism.css?v=20',
  '/js/api.js?v=47',
  '/js/speech_engine.js?v=47',
  '/js/storage_manager.js?v=47',
  '/js/alphabet_data.js?v=47',
  '/js/curriculum_data.js?v=47',
  '/js/pwa.js?v=47',
  '/js/app.js?v=47',
  '/apple-touch-icon.png',
  '/apple-touch-icon-180x180.png',
  '/app-icon-192.png',
  '/app-icon-512.png',
  '/favicon.ico',
  '/assets/logo.jpg'
];

// Clean WebKit / iOS Safari compression and redirect headers
function makeSafeCacheResponse(blobOrText, originalRes, defaultContentType) {
  const safeHeaders = new Headers();
  if (originalRes && originalRes.headers) {
    for (const [key, val] of originalRes.headers.entries()) {
      const lower = key.toLowerCase();
      // CRITICAL FOR IOS SAFARI: Never allow compression headers in cached responses!
      if (lower !== 'content-encoding' && lower !== 'content-length' && lower !== 'transfer-encoding') {
        safeHeaders.set(key, val);
      }
    }
  }
  if (defaultContentType && !safeHeaders.get('content-type')) {
    safeHeaders.set('content-type', defaultContentType);
  }
  return new Response(blobOrText, {
    status: (originalRes && originalRes.status) || 200,
    statusText: (originalRes && originalRes.statusText) || 'OK',
    headers: safeHeaders
  });
}

// Pre-cache all shell assets on installation
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[SW v47] Installing & pre-caching all shell assets...');
      
      // 1. Instantly seed index.html from EMBEDDED_APP_SHELL_HTML
      const embeddedRes1 = new Response(EMBEDDED_APP_SHELL_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
      const embeddedRes2 = new Response(EMBEDDED_APP_SHELL_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
      await cache.put('/index.html', embeddedRes1);
      await cache.put('/', embeddedRes2);

      // 2. Fetch fresh index.html from network if available and sanitize
      try {
        const indexRes = await fetch('/index.html', { cache: 'no-cache' });
        if (indexRes && indexRes.status === 200) {
          const blob = await indexRes.blob();
          const clean1 = makeSafeCacheResponse(blob, indexRes, 'text/html; charset=utf-8');
          const clean2 = makeSafeCacheResponse(blob, indexRes, 'text/html; charset=utf-8');
          await cache.put('/index.html', clean1);
          await cache.put('/', clean2);
        }
      } catch (err) {}

      // 3. Parallel pre-cache remaining assets
      await Promise.allSettled(
        SHELL_ASSETS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (res && res.status === 200) {
              const blob = await res.blob();
              let ctype = '';
              if (url.includes('.js')) ctype = 'application/javascript; charset=utf-8';
              else if (url.includes('.css')) ctype = 'text/css; charset=utf-8';
              else if (url.includes('.json')) ctype = 'application/json; charset=utf-8';
              else if (url.includes('.png')) ctype = 'image/png';
              else if (url.includes('.jpg')) ctype = 'image/jpeg';
              
              const safe = makeSafeCacheResponse(blob, res, ctype);
              await cache.put(url, safe.clone());
              await cache.put(url.split('?')[0], safe);
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
    (async () => {
      // Enable navigation preload if supported (iOS 15.4+)
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (err) {}
      }
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            console.log('[SW v47] Purging outdated cache:', k);
            return caches.delete(k);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// Fetch event: Cache-First for Navigation (iOS Safari offline lifeline)
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip API calls completely except if handling offline tts
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
        try {
          const cache = await caches.open(CACHE_NAME);

          // Check Cache FIRST across all caches
          let cached = await cache.match('/index.html', { ignoreSearch: true })
                    || await cache.match('/', { ignoreSearch: true })
                    || await cache.match(e.request, { ignoreSearch: true })
                    || await caches.match('/index.html')
                    || await caches.match('/');

          if (cached) {
            const blob = await cached.blob();
            const safeResponse = makeSafeCacheResponse(blob, cached, 'text/html; charset=utf-8');

            // If online, update cache in background (Stale While Revalidate)
            if (typeof navigator !== 'undefined' && navigator.onLine) {
              fetch(e.request).then(async (netRes) => {
                if (netRes && netRes.status === 200) {
                  const netBlob = await netRes.blob();
                  const fresh1 = makeSafeCacheResponse(netBlob, netRes, 'text/html; charset=utf-8');
                  const fresh2 = makeSafeCacheResponse(netBlob, netRes, 'text/html; charset=utf-8');
                  await cache.put('/index.html', fresh1);
                  await cache.put('/', fresh2);
                }
              }).catch(() => {});
            }
            return safeResponse;
          }

          // If not in cache yet (initial load), fetch from network
          try {
            // Check navigation preload response if available
            const preloadRes = await e.preloadResponse;
            if (preloadRes && preloadRes.status === 200) {
              const pBlob = await preloadRes.blob();
              const safeP1 = makeSafeCacheResponse(pBlob, preloadRes, 'text/html; charset=utf-8');
              const safeP2 = makeSafeCacheResponse(pBlob, preloadRes, 'text/html; charset=utf-8');
              cache.put('/index.html', safeP1).catch(() => {});
              cache.put('/', safeP2).catch(() => {});
              return makeSafeCacheResponse(pBlob, preloadRes, 'text/html; charset=utf-8');
            }

            const netRes = await fetch(e.request);
            if (netRes && netRes.status === 200) {
              const nBlob = await netRes.blob();
              const safeN1 = makeSafeCacheResponse(nBlob, netRes, 'text/html; charset=utf-8');
              const safeN2 = makeSafeCacheResponse(nBlob, netRes, 'text/html; charset=utf-8');
              cache.put('/index.html', safeN1).catch(() => {});
              cache.put('/', safeN2).catch(() => {});
              return makeSafeCacheResponse(nBlob, netRes, 'text/html; charset=utf-8');
            }
            return netRes;
          } catch (fetchErr) {
            return new Response(EMBEDDED_APP_SHELL_HTML, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
          }
        } catch (fatalNavErr) {
          return new Response(EMBEDDED_APP_SHELL_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
      })()
    );
    return;
  }

  // 2. Static Assets (JS, CSS, Images, Icons, Audio)
  e.respondWith(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);

        // Cache-First with ignoreSearch
        let cached = await cache.match(e.request, { ignoreSearch: true });
        if (!cached) {
          cached = await cache.match(url.pathname, { ignoreSearch: true });
        }
        if (!cached) {
          cached = await caches.match(url.pathname, { ignoreSearch: true });
        }

        if (cached) {
          const blob = await cached.blob();
          let ctype = '';
          if (url.pathname.endsWith('.js')) ctype = 'application/javascript; charset=utf-8';
          else if (url.pathname.endsWith('.css')) ctype = 'text/css; charset=utf-8';
          else if (url.pathname.endsWith('.json')) ctype = 'application/json; charset=utf-8';
          else if (url.pathname.endsWith('.png')) ctype = 'image/png';
          else if (url.pathname.endsWith('.jpg')) ctype = 'image/jpeg';
          return makeSafeCacheResponse(blob, cached, ctype);
        }

        // Try network
        try {
          const netRes = await fetch(e.request);
          if (netRes && netRes.status === 200 && (netRes.type === 'basic' || netRes.type === 'cors')) {
            const blob = await netRes.blob();
            let ctype = '';
            if (url.pathname.endsWith('.js')) ctype = 'application/javascript; charset=utf-8';
            else if (url.pathname.endsWith('.css')) ctype = 'text/css; charset=utf-8';
            else if (url.pathname.endsWith('.json')) ctype = 'application/json; charset=utf-8';
            else if (url.pathname.endsWith('.png')) ctype = 'image/png';
            else if (url.pathname.endsWith('.jpg')) ctype = 'image/jpeg';
            
            const safe = makeSafeCacheResponse(blob, netRes, ctype);
            cache.put(e.request, safe.clone()).catch(() => {});
            cache.put(url.pathname, safe).catch(() => {});
            return makeSafeCacheResponse(blob, netRes, ctype);
          }
          return netRes;
        } catch (err) {
          const fallback = await cache.match(url.pathname, { ignoreSearch: true }) || await caches.match(url.pathname, { ignoreSearch: true });
          if (fallback) {
            const fbBlob = await fallback.blob();
            return makeSafeCacheResponse(fbBlob, fallback);
          }
          
          if (url.pathname.endsWith('.js')) {
            return new Response('/* offline script placeholder */', {
              status: 200,
              headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
            });
          }
          if (url.pathname.endsWith('.css')) {
            return new Response('/* offline style placeholder */', {
              status: 200,
              headers: { 'Content-Type': 'text/css; charset=utf-8' }
            });
          }
          return new Response('', { status: 404 });
        }
      } catch (fatalAssetErr) {
        return new Response('', { status: 404 });
      }
    })()
  );
});
