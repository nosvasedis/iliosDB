
const CACHE_NAME = 'ilios-erp-v1.5';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/index.tsx',
  '/App.tsx',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

const LIB_ASSETS = [
  'https://esm.sh/react@18.2.0',
  'https://esm.sh/react@18.2.0/',
  'https://esm.sh/react-dom@18.2.0',
  'https://esm.sh/react-dom@18.2.0/',
  'https://esm.sh/react-dom@18.2.0/client',
  'https://esm.sh/recharts@2.12.0?external=react,react-dom',
  'https://esm.sh/lucide-react@0.344.0?external=react,react-dom',
  'https://esm.sh/@supabase/supabase-js@2',
  'https://esm.sh/@tanstack/react-query@5?external=react,react-dom',
  'https://esm.sh/appwrite@14.0.0',
  'https://esm.sh/jsbarcode@3.11.5',
  'https://esm.sh/@google/genai@1.30.0',
  'https://esm.sh/react-zxing@2.0.0?external=react',
  'https://esm.sh/pdfjs-dist@4.4.168'
];

const ALL_ASSETS = [...CORE_ASSETS, ...LIB_ASSETS];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('SW: Starting Resilient Install');
      // We loop so that if one library fails, the whole SW doesn't crash
      for (const url of ALL_ASSETS) {
        try {
          const response = await fetch(url, { cache: 'reload' });
          if (response.ok) {
            await cache.put(url, response);
          }
        } catch (e) {
          console.warn(`SW: Failed to pre-cache ${url}`, e);
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

  const url = new URL(event.request.url);

  // Never intercept Supabase - handled by offlineDb.ts sync logic
  if (url.host.includes('supabase.co')) return;

  // 1. NAVIGATION FALLBACK (The most important for mobile "Cold Boot")
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html')
        .then(cached => cached || fetch(event.request))
        .catch(() => caches.match('/'))
    );
    return;
  }

  // 2. CACHE-FIRST STRATEGY for all other assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        // Cache external libs and local assets dynamically
        if (networkResponse.ok && (
            url.host.includes('esm.sh') || 
            url.host.includes('cdn.tailwindcss.com') ||
            url.origin === location.origin
        )) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for missing images
        if (event.request.destination === 'image') {
          return new Response('', { status: 404 });
        }
      });
    })
  );
});
