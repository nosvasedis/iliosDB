const CACHE_NAME = 'ilios-erp-v1.14'; // Increment cache version to ensure new SW is installed

// Critical static assets for initial load (Cache First)
const CRITICAL_ASSETS = [
  '/', // The root path, essential for PWA to start offline
  '/index.html',
  '/index.tsx', // The main entry point JS module
  '/manifest.json',
  '/App.tsx', // Explicitly listing all .tsx/.ts files that are part of the app bundle
  '/components/UIProvider.tsx',
  '/components/AuthContext.tsx',
  '/components/AuthScreen.tsx',
  '/components/SetupScreen.tsx',
  '/components/Dashboard.tsx',
  '/components/Inventory.tsx',
  '/components/ProductRegistry.tsx',
  '/components/PricingManager.tsx',
  '/components/SettingsPage.tsx',
  '/components/MaterialsPage.tsx',
  '/components/MoldsPage.tsx',
  '/components/CollectionsPage.tsx',
  '/components/BarcodeView.tsx',
  '/components/BatchPrintPage.tsx',
  '/components/OrdersPage.tsx',
  '/components/ProductionPage.tsx',
  '/components/CustomersPage.tsx',
  '/components/AiStudio.tsx',
  '/components/OrderInvoiceView.tsx',
  '/components/ProductionWorkerView.tsx',
  '/components/AggregatedProductionView.tsx',
  '/components/PreparationView.tsx',
  '/components/TechnicianView.tsx',
  '/components/ProductDetails.tsx',
  '/components/BarcodeScanner.tsx',
  '/components/SuppliersPage.tsx',
  '/constants.ts',
  '/types.ts',
  '/lib/supabase.ts',
  '/lib/offlineDb.ts',
  '/lib/appwrite.ts', // Even if not used, if it's in the project, cache it.
  '/lib/gemini.ts',
  '/utils/pricingEngine.ts',
  '/utils/imageHelpers.ts',
  '/utils/sizing.ts',
  '/utils/exportUtils.ts',
  '/appwrite_schema.json' // Any other JSON/static data referenced by the app
];

// Essential third-party libraries from the importmap (Cache First)
const LIB_ASSETS = [
  'https://esm.sh/react@18.2.0',
  'https://esm.sh/react@18.2.0/jsx-runtime', // Often implicitly imported by React components
  'https://esm.sh/react-dom@18.2.0',
  'https://esm.sh/react-dom@18.2.0/client',
  'https://esm.sh/@supabase/supabase-js@2',
  'https://esm.sh/@tanstack/react-query@5?external=react,react-dom',
  'https://esm.sh/lucide-react@0.344.0?external=react,react-dom',
  'https://esm.sh/recharts@2.12.0?external=react,react-dom',
  'https://esm.sh/jsbarcode@3.11.5',
  'https://esm.sh/@google/genai@1.30.0',
  'https://esm.sh/react-zxing@2.0.0?external=react',
  'https://esm.sh/pdfjs-dist@4.4.168',
  'https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.mjs', // PDF.js worker
  'https://cdn.tailwindcss.com', // Tailwind CSS CDN
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap' // Google Fonts
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('SW: Pre-caching critical assets v1.14');
      const assetsToCache = [...CRITICAL_ASSETS, ...LIB_ASSETS];
      await cache.addAll(assetsToCache).catch(error => {
          console.error('SW: Some critical assets failed to pre-cache:', error);
          // Don't re-throw, continue if some failed but not all
      });
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

  // 1. ALWAYS BYPASS FOR SUPABASE API AND CLOUDFLARE WORKER (for image upload/silver price fetch)
  // Images from R2 public URL (pub-07bab0635aee4da18c155fcc9dc3bb36.r2.dev) are fine to cache though.
  if (url.host.includes('supabase.co') || url.host.includes('ilios-image-handler.iliosdb.workers.dev')) {
    return; // Bypass Service Worker for Supabase and Cloudflare Worker APIs
  }

  // 2. NAVIGATION requests (main HTML page for PWA) - Cache First, then Network
  // This ensures the PWA starts even if offline.
  if (event.request.mode === 'navigate' || (url.pathname === '/' && url.origin === self.location.origin)) {
    event.respondWith(
      caches.match('/index.html').then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // If not in cache, try network
        return fetch(event.request);
      })
    );
    return;
  }

  // 3. ASSET STRATEGY: Cache First, then Network for all other assets
  // This ensures offline functionality by serving from cache immediately if available.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // If not in cache, try to fetch from network and then cache
      return fetch(event.request).then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic' && // Don't cache opaque responses (cross-origin without CORS)
          (url.origin === self.location.origin || // Your own assets
           url.host.includes('esm.sh') || // ESM.sh libraries
           url.host.includes('cdn.tailwindcss.com') || // Tailwind CSS
           url.host.includes('pub-07bab0635aee4da18c155fcc9dc3bb36.r2.dev')) // R2 Images
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // If network fetch also fails, and no cache found, log and return a fallback or error.
        // For critical app loading, pre-caching handles this. This catch is more for dynamic content.
        console.warn('SW: Fetch failed and no cache for:', event.request.url);
        return new Response('Application is offline and resource not available in cache.', {status: 503, statusText: 'Service Unavailable', headers: new Headers({'Content-Type': 'text/plain'})});
      });
    })
  );
});
