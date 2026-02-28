import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { UIProvider } from './components/UIProvider';

const PERSIST_CACHE_KEY = 'ilios-react-query-cache';
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

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
