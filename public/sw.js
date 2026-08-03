const workerUrl = new URL(self.location.href);
const cacheVersion = (workerUrl.searchParams.get('v') || 'dev').replace(/[^a-z0-9_-]/gi, '_');
const CACHE_NAME = `ilios-runtime-${cacheVersion}`;
const IMAGE_CACHE_NAME = 'ilios-viewed-product-images-v1';
const IMAGE_CACHE_LIMIT = 200;
const PRECACHE_URLS = ['/manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== IMAGE_CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      )
    ).then(() => self.clients.claim())
  );
});

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

  if (isProductImageRequest(event.request, url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok || response.type === 'opaque') {
            await cache.put(event.request, response.clone());
            void trimImageCache(cache);
          }
          return response;
        } catch {
          return new Response('', { status: 503, statusText: 'Image unavailable offline' });
        }
      })
    );
    return;
  }

  if (isBypassedRequest(url)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/index.html', responseToCache);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match('/index.html');
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
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request))
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
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }

        return response;
      });
    })
  );
});
