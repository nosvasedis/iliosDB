
const CACHE_NAME = 'ilios-erp-v1.4';

// These are the CRITICAL files needed to start the app engine
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/index.tsx',
  '/App.tsx',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  
  // All dependencies from importmap MUST be pre-cached for offline cold boot
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

const EXTERNAL_LIB_DOMAINS = [
  'esm.sh',
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'pub-07bab0635aee4da18c155fcc9dc3bb36.r2.dev'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Pre-caching all assets for offline reliability');
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
            console.log('SW: Removing old cache', cacheName);
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

  const urlString = event.request.url;
  let url;
  try {
    url = new URL(urlString);
  } catch (e) {
    return;
  }

  // API calls to Supabase should never be cached by SW
  if (url.host.includes('supabase.co')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. Return from cache immediately if we have it
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. Otherwise fetch from network and cache for later
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        // Only cache GET requests from our trusted domains
        const isExternalLib = EXTERNAL_LIB_DOMAINS.some(d => url.host.includes(d));
        if (isExternalLib || url.origin === location.origin) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }

        return networkResponse;
      }).catch((error) => {
        // 3. OFFLINE FALLBACK for SPA navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html') || caches.match('/');
        }
        throw error;
      });
    })
  );
});
