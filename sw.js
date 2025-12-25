
const CACHE_NAME = 'ilios-erp-v1.13';

// Shell assets - the minimum required files to boot the UI
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/index.tsx',
  '/App.tsx',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Essential third-party libraries from the importmap
const LIB_ASSETS = [
  'https://esm.sh/react@18.2.0',
  'https://esm.sh/react-dom@18.2.0',
  'https://esm.sh/react-dom@18.2.0/client',
  'https://esm.sh/@supabase/supabase-js@2',
  'https://esm.sh/@tanstack/react-query@5?external=react,react-dom',
  'https://esm.sh/lucide-react@0.344.0?external=react,react-dom'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('SW: Pre-caching shell v1.13');
      const assets = [...SHELL_ASSETS, ...LIB_ASSETS];
      for (const asset of assets) {
        try {
          const response = await fetch(asset, { cache: 'reload' });
          if (response.ok) {
            await cache.put(asset, response);
          }
        } catch (e) {
          console.warn('SW: Failed to pre-cache', asset);
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map(k => k !== CACHE_NAME && caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  let url;
  try {
    url = new URL(event.request.url);
  } catch (err) {
    return;
  }

  // 1. ALWAYS BYPASS FOR SUPABASE
  if (url.host.includes('supabase.co')) return;

  // 2. NAVIGATION (PWA Launch or Refresh) - CACHE FIRST WITH SEARCH IGNORED
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/', { ignoreSearch: true }).then((cached) => {
        // Return cached root or index.html if available, otherwise fetch
        return cached || caches.match('/index.html', { ignoreSearch: true }) || fetch(event.request);
      }).catch(() => fetch(event.request))
    );
    return;
  }

  // 3. ASSET STRATEGY: Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && (
            url.origin === self.location.origin || 
            url.host.includes('esm.sh') || 
            url.host.includes('cdn.tailwindcss.com') ||
            url.host.includes('pub-07bab0635aee4da18c155fcc9dc3bb36.r2.dev')
        )) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});
