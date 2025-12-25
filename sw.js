const CACHE_NAME = 'ilios-erp-v1.11';

// The "App Shell" - Using root-relative paths for better standard compliance
const CORE_ASSETS = [
  'index.html',
  'index.tsx',
  'App.tsx',
  'manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Essential Libraries
const ESSENTIAL_LIBS = [
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
      console.log('SW: Pre-caching v1.11 Assets');
      const allToCache = [...CORE_ASSETS, ...ESSENTIAL_LIBS];
      for (const url of allToCache) {
        try {
          const response = await fetch(url, { cache: 'no-store' });
          if (response.ok) {
            await cache.put(url, response);
          }
        } catch (e) {
          console.warn(`SW: Failed to pre-cache ${url}`, e);
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
    // This is the line that causes "Failed to construct 'URL': Invalid URL" 
    // on non-standard protocols like intent:// or android-app://
    url = new URL(event.request.url);
  } catch (err) {
    // Silently ignore requests that aren't valid URLs (e.g. extension schemes)
    return;
  }

  // 1. ALWAYS BYPASS FOR SUPABASE API/AUTH
  if (url.host.includes('supabase.co')) return;

  // 2. NAVIGATION STRATEGY (Cold Boot fix)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('index.html') || caches.match('./index.html');
      })
    );
    return;
  }

  // 3. STALE-WHILE-REVALIDATE for everything else
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
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
      }).catch(() => {
        return null;
      });

      return cachedResponse || fetchPromise;
    })
  );
});