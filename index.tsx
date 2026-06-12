import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { UIProvider } from './components/UIProvider';
import { registerQueryClient } from './lib/queryClientRegistry';
import { productionKeys } from './features/production/keys';
import { orderKeys } from './features/orders/keys';
import {
  finalizeChunkRecoveryNavigation,
  isChunkLoadError,
  recoverFromChunkLoadError,
} from './lib/chunkLoadRecovery';
import { isInspectionModeActive } from './lib/inspectionMode';

const PERSIST_CACHE_KEY = 'ilios-react-query-cache';
const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const THIRTY_MINUTES_MS = 1000 * 60 * 30;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: THIRTY_MINUTES_MS,
      gcTime: ONE_DAY_MS,
      refetchOnWindowFocus: false,
    },
  },
});

registerQueryClient(queryClient);

const PERSISTED_QUERY_ROOT_KEYS = new Set([
  'products',
  'productsCatalog',
  'materials',
  'molds',
  'collections',
  'orders',
  'customers',
  'production',
  'batchStageHistory',
  'settings',
  'suppliers',
  'warehouses',
]);

const localStoragePersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: PERSIST_CACHE_KEY,
  throttleTime: 1000,
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

window.addEventListener('error', (event) => {
  if (isChunkLoadError(event.error ?? event.message)) {
    void recoverFromChunkLoadError(import.meta.url);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadError(event.reason)) {
    event.preventDefault();
    void recoverFromChunkLoadError(import.meta.url);
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
            if (isInspectionModeActive()) {
              return false;
            }
            const key = query.queryKey[0];
            if (typeof key === 'string' && PERSISTED_QUERY_ROOT_KEYS.has(key)) {
              return true;
            }
            if (Array.isArray(query.queryKey) && query.queryKey[0] === orderKeys.all[0]) {
              return query.queryKey.length === 1 || query.queryKey[1] === 'list';
            }
            if (Array.isArray(query.queryKey) && query.queryKey[0] === productionKeys.all[0]) {
              return true;
            }
            return false;
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

finalizeChunkRecoveryNavigation();
