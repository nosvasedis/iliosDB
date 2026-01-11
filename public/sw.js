
const CACHE_NAME = 'ilios-erp-v1.15'; // Incremented version to force update

// Critical App Shell - Only essential files for booting up.
// Other files will be cached lazily (on first use) by the fetch listener.
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/index.tsx',
  '/manifest.json',
  '/App.tsx',
  '/MobileApp.tsx', // Critical for routing
  '/constants.ts',
  '/types.ts',
  '/lib/supabase.ts',
  '/lib/offlineDb.ts',
  '/lib/gemini.ts',
  '/lib/appwrite.ts',
  '/utils/pricingEngine.ts',
  '/utils/imageHelpers.ts',
  '/utils/sizing.ts',
  '/utils/exportUtils.ts',
  '/components/UIProvider.tsx',
  '/components/AuthContext.tsx',
  '/components/AuthScreen.tsx',
  '/components/SetupScreen.tsx',
  // Essential Layouts
  '/components/mobile/MobileLayout.tsx',
  '/components/employee/EmployeeLayout.tsx',
  '/components/mobile/MobileAuthScreen.tsx',
  '/components/mobile/MobileSetupScreen.tsx'
];

// Essential third-party libraries (Must match importmap exactly)
const LIB_ASSETS = [
  'https://esm.sh/react@18.2.0',
  'https://esm.sh/react@18.2.0/jsx-runtime',
  'https://esm.sh/react-dom@18.2.0',
  'https://esm.sh/react-dom@18.2.0/client',
  'https://esm.sh/@supabase/supabase-js@2.39.7',
  'https://esm.sh/@tanstack/react-query@5.22.2?external=react,react-dom',
  'https://esm.sh/lucide-react@0.344.0?external=react,react-dom',
  'https://esm.sh/recharts@2.12.0?external=react,react-dom',
  'https://esm.sh/jsbarcode@3.11.5',
  'https://esm.sh/qrcode@1.5.3',
  'https://esm.sh/@google/genai@1.30.0',
  'https://esm.sh/react-zxing@2.0.0?external=react,react-dom', // Fixed URL to match importmap
  'https://esm.sh/pdfjs-dist@4.4.168',
  'https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.mjs',
  'https://esm.sh/html2canvas@1.4.1',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('SW: Pre-caching critical assets v1.15');
      // We use Promise.allSettled to ensure that if one non-critical asset fails (e.g. external font),
      // it doesn't break the entire installation.
      // However, for CRITICAL_ASSETS, we ideally want them all.
      
      // Strategy: Try to cache critical assets. If one fails, log it but don't crash the worker unless it's fatal.
      // For simplicity in this robust version, we iterate and catch individual errors.
      
      const assets = [...CRITICAL_ASSETS, ...LIB_ASSETS];
      const promises = assets.map(url => 
        cache.add(url).catch(err => console.warn(`SW: Failed to cache ${url}:`, err))
      );
      
      await Promise.all(promises);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames.map(cacheName => {
        if (cacheName !== CACHE_NAME) {
          console.log('SW: Deleting old cache', cacheName);
          return caches.delete(cacheName);
        }
        return Promise.resolve();
      })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Bypass strategy
  if (
      url.host.includes('supabase.co') || 
      url.host.includes('ilios-image-handler.iliosdb.workers.dev') ||
      url.pathname.startsWith('/api/') // General API escape hatch
  ) {
    return;
  }

  // 2. Navigation strategy (HTML)
  if (event.request.mode === 'navigate' || (url.pathname === '/' && url.origin === self.location.origin)) {
    event.respondWith(
      caches.match('/index.html').then((cached) => {
        return cached || fetch(event.request).catch(() => {
            // Offline fallback could go here
            return new Response('Offline - Ilios ERP', { status: 200, headers: { 'Content-Type': 'text/plain' } });
        });
      })
    );
    return;
  }

  // 3. Stale-While-Revalidate for Assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // If we have a cache hit, return it immediately
      // But ALSO fetch from network to update cache in background (for next time)
      // This ensures components update without requiring a full SW version bump for every small change
      
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic' &&
          (url.origin === self.location.origin || 
           url.host.includes('esm.sh') || 
           url.host.includes('cdn.tailwindcss.com') ||
           url.host.includes('pub-07bab0635aee4da18c155fcc9dc3bb36.r2.dev'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
