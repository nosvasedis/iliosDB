
const CACHE_NAME = 'ilios-erp-v1.8';

// The "App Shell" - using root-relative paths for better standard compliance
const CORE_ASSETS = [
  'index.html',
  'index.tsx',
  'App.tsx',
  'manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Essential Libraries (Initial Boot)
const ESSENTIAL_LIBS = [
  'https://esm.sh/react@18.2.0',
  'https://esm.sh/react-dom@18.2.0',
  'https://esm.sh/react-dom@18.2.0/client',
  'https://esm.sh/@supabase/supabase-js@2',
  'https://esm.sh/@tanstack/react-query@5?external=react,react-dom',
  'https://esm.sh/lucide-react@0.344.0?external=react,react-dom'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('SW: Pre-caching v1.8 Essential Shell');
      const allToCache = [...CORE_ASSETS, ...ESSENTIAL_LIBS];
      for (const url of allToCache) {
        try {
          const response = await fetch(url, { cache: 'reload' });
          if (response.ok) {
            await cache.put(url, response);
          }
        } catch (e) {
          console.warn(`SW: Failed to pre-cache ${url}`);
        }
      }
      return self.skipWaiting();
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
    // If URL is invalid or uses an unsupported protocol (e.g., chrome-extension://), skip it
    return;
  }

  // 1. BYPASS FOR SUPABASE
  if (url.host.includes('supabase.co')) return;

  // 2. NAVIGATION STRATEGY (The Cold Boot Fix)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html')
        .then(cached => cached || fetch(event.request))
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  // 3. STALE-WHILE-REVALIDATE for everything else
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Only cache valid responses from known domains
        if (networkResponse.ok && (
            url.origin === self.location.origin || 
            url.host.includes('esm.sh') || 
            url.host.includes('cdn.tailwindcss.com') ||
            url.host.includes('pub-07bab0635aee4da18c155fcc9dc3bb36.r2.dev')
        )) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => {
        // Fail silently and let the browser handle it or rely on cache
      });

      return cachedResponse || fetchPromise;
    })
  );
});
