// MONGOLIAN MEDIA — Service Worker (Production Offline Engine v64)
// Built strictly on drive.uugiscar.com offline architecture with Safari 206 Audio Range support

const VERSION = 'v64';
const SHELL_CACHE = `shell-${VERSION}`;
const IMAGE_CACHE = 'images-v2';
const AUDIO_CACHE = 'mm-korean-audio-v1';

const SHELL = [
  './',
  '/',
  'index.html',
  '/index.html',
  'manifest.json',
  '/manifest.json',
  'css/glassmorphism.css',
  '/css/glassmorphism.css',
  'js/pwa.js',
  '/js/pwa.js',
  'js/api.js',
  '/js/api.js',
  'js/storage_manager.js',
  '/js/storage_manager.js',
  'js/speech_engine.js',
  '/js/speech_engine.js',
  'js/alphabet_data.js',
  '/js/alphabet_data.js',
  'js/curriculum_data.js',
  '/js/curriculum_data.js',
  'js/app.js',
  '/js/app.js',
  'apple-touch-icon-180x180-v62.png',
  '/apple-touch-icon-180x180-v62.png',
  'apple-touch-icon.png',
  '/apple-touch-icon.png',
  'app-icon-192.png',
  '/app-icon-192.png',
  'app-icon-512.png',
  '/app-icon-512.png',
  'favicon.ico',
  '/favicon.ico',
  'favicon.png',
  '/favicon.png',
  'assets/sunset_rider_bg.jpg',
  '/assets/sunset_rider_bg.jpg',
  'assets/logo.jpg',
  '/assets/logo.jpg'
];

// 1. Install: Atomically cache all shell files natively
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return Promise.all(
        SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Precache item failed:', url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// 2. Activate: Retain audio cache and active shell, purge older version caches
self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, IMAGE_CACHE, AUDIO_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !keep.has(k) && (k.startsWith('shell-') || k.startsWith('images-') || k.startsWith('mm-korean-v')))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Network first so deploys show up immediately; cache when offline. */
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const isNav =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    (request.headers.get('accept') && request.headers.get('accept').includes('text/html'));

  try {
    // no-cache: always revalidate with the server, so a deploy is never hidden by the HTTP cache
    const response = await fetch(request, { cache: 'no-cache' });
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    // Try matching URL pathname directly
    try {
      const url = new URL(request.url);
      const pathCached = await cache.match(url.pathname, { ignoreSearch: true });
      if (pathCached) return pathCached;
    } catch (_) {}

    // Offline document navigation fallback: ALWAYS return cached root app shell directly
    if (isNav) {
      const fallback =
        (await cache.match('/')) ||
        (await cache.match('./')) ||
        (await cache.match('/index.html')) ||
        (await cache.match('index.html'));
      if (fallback) return fallback;

      // Exhaustive fallback: check all cached shell URLs
      const keys = await cache.keys();
      for (const k of keys) {
        if (k.url.endsWith('/') || k.url.endsWith('index.html')) {
          const m = await cache.match(k);
          if (m) return m;
        }
      }
    }

    throw err;
  }
}

/** Static assets (images, icons, background wallpapers) */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  let cached = await cache.match(request, { ignoreSearch: true });
  if (!cached) {
    const shellCache = await caches.open(SHELL_CACHE);
    cached = await shellCache.match(request, { ignoreSearch: true });
  }
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (e) {
    const shellCache = await caches.open(SHELL_CACHE);
    const fallback =
      (await cache.match(request, { ignoreSearch: true })) ||
      (await shellCache.match(request, { ignoreSearch: true }));
    if (fallback) return fallback;
    throw e;
  }
}

/**
 * Audio Range Request Handler:
 * Specifically handles Safari / iOS WebKit HTTP 206 Partial Content requests
 * for cached Korean pronunciation MP3 streams.
 */
async function handleAudioRequest(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const url = new URL(request.url);
  const cacheKey = url.pathname + url.search;

  // 1. Check audio cache
  let cachedResponse = await cache.match(cacheKey);
  if (!cachedResponse) {
    cachedResponse = await cache.match(request);
  }

  // 2. If not cached and online, fetch complete audio from network without Range header
  if (!cachedResponse) {
    try {
      const cleanUrl = url.pathname + url.search;
      const netRes = await fetch(cleanUrl, {
        headers: { 'Accept': 'audio/mpeg' }
      });
      if (netRes && netRes.ok) {
        await cache.put(cacheKey, netRes.clone());
        cachedResponse = netRes;
      } else {
        return netRes || new Response('Audio not available offline', {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    } catch (e) {
      return new Response('Audio not available offline', {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  }

  // 3. Range header handling for Safari / WebKit 206 Partial Content
  const rangeHeader = request.headers.get('Range');
  if (!rangeHeader) {
    return cachedResponse;
  }

  try {
    const arrayBuffer = await cachedResponse.arrayBuffer();
    const total = arrayBuffer.byteLength;
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10) || 0;
    const end = parts[1] ? parseInt(parts[1], 10) : total - 1;

    if (start >= total || end >= total) {
      return new Response('', {
        status: 416,
        statusText: 'Range Not Satisfiable',
        headers: { 'Content-Range': `bytes */${total}` }
      });
    }

    const chunk = arrayBuffer.slice(start, end + 1);
    return new Response(chunk, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': cachedResponse.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': chunk.byteLength.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000'
      }
    });
  } catch (err) {
    return cachedResponse;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Audio stream caching with 206 Partial Content Range support for Safari
  if (url.pathname === '/api/tts') {
    event.respondWith(handleAudioRequest(request));
    return;
  }

  // 2. Bypass all other API calls (Auth / sync happens when online)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (url.origin === location.origin) {
    if (
      url.pathname.startsWith('/assets/') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.jpeg') ||
      url.pathname.endsWith('.ico') ||
      url.pathname.endsWith('.svg')
    ) {
      event.respondWith(cacheFirst(request, IMAGE_CACHE));
    } else {
      event.respondWith(networkFirst(request));
    }
  }
});
