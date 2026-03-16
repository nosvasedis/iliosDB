import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { UIProvider } from './components/UIProvider';

const PERSIST_CACHE_KEY = 'ilios-react-query-cache';
const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const CHUNK_RELOAD_FLAG = 'ilios-chunk-reload-attempted';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Data is fresh for 5 minutes
      gcTime: ONE_DAY_MS, // Keep cache 24h so persisted data is not GC'd before restore
      refetchOnWindowFocus: false,
    },
  },
});

const localStoragePersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: PERSIST_CACHE_KEY,
  throttleTime: 1000,
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const isChunkLoadError = (value: unknown) => {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === 'string'
        ? value
        : '';

  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed')
  );
};

const recoverFromChunkLoadError = async () => {
  if (sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return;
  sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  }

  window.location.reload();
};

window.addEventListener('error', (event) => {
  if (isChunkLoadError(event.error ?? event.message)) {
    void recoverFromChunkLoadError();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadError(event.reason)) {
    event.preventDefault();
    void recoverFromChunkLoadError();
  }
});

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: localStoragePersister,
        maxAge: ONE_DAY_MS,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key = query.queryKey[0];
            return key === 'products' || key === 'productsCatalog';
          },
        },
      }}
    >
      <UIProvider>
        <App />
      </UIProvider>
    </PersistQueryClientProvider>
  </React.StrictMode>
);
