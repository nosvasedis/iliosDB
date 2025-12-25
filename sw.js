
const CACHE_NAME = 'ilios-erp-v1.2';

// Core "Shell" assets needed to boot the React engine
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/index.tsx',
  '/App.tsx',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Domains we want to cache aggressively for offline functionality
const EXTERNAL_LIB_DOMAINS = [
  'esm.sh',
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'pub-07bab0635aee4da18c155fcc9dc3bb36.r2.dev' // Your logo/icon storage
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip Supabase API calls - they are handled by our Sync Queue logic in the app
  if (url.host.includes('supabase.co')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. If it's in the cache, return it immediately (Ultra-fast boot)
      if (cachedResponse) {
        // Optional: Update cache in the background (Stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
          }
        }).catch(() => {}); // Ignore network errors in background
        
        return cachedResponse;
      }

      // 2. If not in cache, try network and THEN cache it
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && !EXTERNAL_LIB_DOMAINS.some(d => url.host.includes(d))) {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch((error) => {
        // 3. SPA Fallback: If network fails and it's a page navigation, return index.html
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html') || caches.match('/');
        }
        throw error;
      });
    })
  );
});
