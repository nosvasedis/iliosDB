// A cache policy version, independent of deployments. Hashed assets are immutable.
const CACHE_NAME = 'ilios-runtime-safe-v1';
// v1 cached opaque responses, including undetectable HTTP errors. Start fresh.
const IMAGE_CACHE_NAME = 'ilios-viewed-product-images-v2';
const IMAGE_CACHE_LIMIT = 200;
const PRECACHE_URLS = ['/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// Never take over live pages, or delete another build's resources on activation.

function isBypassedRequest(url) {
  return (
    url.host.includes('supabase.co')
  );
}

function isProductImageRequest(request, url) {
  return request.destination === 'image'
    && url.host.includes('ilios-image-handler.iliosdb.workers.dev');
}

async function trimImageCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - IMAGE_CACHE_LIMIT;
  if (excess > 0) {
    await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
  }
}

function isAppAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/');
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && (url.pathname === '/version.json' || url.pathname === '/sw.js')) {
    event.respondWith(fetch(new Request(event.request, { cache: 'no-store' })));
    return;
  }

  if (isProductImageRequest(event.request, url)) {
    event.respondWith(
      (async () => {
        // Storage can be unavailable/full. It must never prevent online photos.
        let cache;
        try {
          cache = await caches.open(IMAGE_CACHE_NAME);
          const cached = await cache.match(event.request);
          if (cached?.ok && cached.headers.get('Content-Type')?.startsWith('image/')) return cached;
        } catch { /* Fetch normally without a cache. */ }
        try {
          // The image Worker allows CORS. Read status/type so a 404/503 cannot
          // become a permanently cached opaque "photo".
          const response = await fetch(new Request(event.request, { mode: 'cors', credentials: 'omit' }));
          if (cache && response.ok && response.headers.get('Content-Type')?.startsWith('image/')) {
            event.waitUntil(cache.put(event.request, response.clone())
              .then(() => trimImageCache(cache)).catch(() => {}));
          }
          return response;
        } catch {
          return new Response('', { status: 503, statusText: 'Image unavailable offline' });
        }
      })()
    );
    return;
  }

  if (isBypassedRequest(url)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(new Request(event.request, { cache: 'no-cache' }))
        .then((response) => {
          if (!response.ok) throw new Error('Navigation unavailable');
          if (response.ok) {
            const responseToCache = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put('/index.html', responseToCache)).catch(() => {}));
          }
          return response;
        })
        .catch(async () => {
          const current = await caches.open(CACHE_NAME);
          const cachedResponse = await current.match('/index.html') || await caches.match('/index.html');
          return (
            cachedResponse ||
            new Response('Application is offline.', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain' }),
            })
          );
        })
    );
    return;
  }

  if (isAppAsset(url)) {
    event.respondWith(
      (async () => {
        const valid = response => response && response.ok && (
          !/\.(?:m?js|css)$/.test(url.pathname) ||
          (/\.css$/.test(url.pathname) ? /text\/css/i : /javascript|ecmascript/i).test(response.headers.get('Content-Type') || '')
        );
        const cached = await caches.match(event.request);
        if (valid(cached)) return cached;
        try {
          const response = await fetch(event.request);
          if (!valid(response)) throw new Error('Asset unavailable');
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {}));
          return response;
        } catch {
          const fallback = await caches.match(event.request);
          return valid(fallback) ? fallback : new Response('Asset unavailable', { status: 503 });
        }
      })()
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        if (
          response.ok &&
          response.type === 'basic' &&
          (url.origin === self.location.origin ||
            url.host.includes('esm.sh') ||
            url.host.includes('cdn.tailwindcss.com') ||
            url.host.includes('fonts.googleapis.com') ||
            url.host.includes('fonts.gstatic.com') ||
            url.host.includes('pub-07bab0635aee4da18c155fcc9dc3bb36.r2.dev'))
        ) {
          const responseToCache = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache)).catch(() => {}));
        }

        return response;
      });
    })
  );
});
