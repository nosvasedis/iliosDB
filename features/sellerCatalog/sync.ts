import { QueryClient } from '@tanstack/react-query';
import { sellerCatalogCache } from './cache';
import { getSellerCatalogSnapshot } from './repository';
import { SellerCatalogSnapshot } from './types';

export const sellerCatalogKeys = {
  all: ['sellerCatalog', 'v1'] as const,
};

export const SELLER_CATALOG_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;
export const SELLER_CATALOG_RECONNECT_GAP_MS = 60 * 1000;
const REALTIME_CACHE_WRITE_THROTTLE_MS = 1000;
const fullRefreshes = new WeakMap<QueryClient, Promise<SellerCatalogSnapshot>>();

let pendingCacheSnapshot: SellerCatalogSnapshot | null = null;
let cacheWriteTimer: ReturnType<typeof setTimeout> | null = null;

function writeCacheQuietly(snapshot: SellerCatalogSnapshot): Promise<void> {
  return sellerCatalogCache.write(snapshot).catch((error) => {
    console.warn('Seller catalogue cache write failed:', error);
  });
}

function scheduleRealtimeCacheWrite(snapshot: SellerCatalogSnapshot): void {
  pendingCacheSnapshot = snapshot;
  if (cacheWriteTimer) return;
  cacheWriteTimer = setTimeout(() => {
    cacheWriteTimer = null;
    const next = pendingCacheSnapshot;
    pendingCacheSnapshot = null;
    if (next) void writeCacheQuietly(next);
  }, REALTIME_CACHE_WRITE_THROTTLE_MS);
}

export function shouldRefreshSellerCatalog(
  snapshot: SellerCatalogSnapshot | null | undefined,
  now = Date.now(),
): boolean {
  return !snapshot || now - snapshot.fullSyncedAt >= SELLER_CATALOG_REFRESH_COOLDOWN_MS;
}

export function mergeSellerCatalogSnapshot(
  current: SellerCatalogSnapshot,
  partial: SellerCatalogSnapshot,
  requestedSkus: readonly string[],
): SellerCatalogSnapshot {
  const replacedSkus = new Set(requestedSkus);
  const products = current.products
    .filter((product) => !replacedSkus.has(product.sku))
    .concat(partial.products)
    .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }));

  return {
    ...partial,
    fullSyncedAt: current.fullSyncedAt,
    cacheSavedAt: Date.now(),
    products,
  };
}

export async function refreshSellerCatalog(
  queryClient: QueryClient,
  skus?: readonly string[],
): Promise<SellerCatalogSnapshot> {
  if (skus && skus.length > 0) {
    const current = queryClient.getQueryData<SellerCatalogSnapshot>(sellerCatalogKeys.all);
    if (current) {
      const partial = await getSellerCatalogSnapshot(skus);
      const merged = mergeSellerCatalogSnapshot(current, partial, skus);
      queryClient.setQueryData(sellerCatalogKeys.all, merged);
      scheduleRealtimeCacheWrite(merged);
      return merged;
    }
  }

  const existingRefresh = fullRefreshes.get(queryClient);
  if (existingRefresh) return existingRefresh;

  const refresh = (async () => {
    const snapshot = await getSellerCatalogSnapshot();
    await writeCacheQuietly(snapshot);
    queryClient.setQueryData(sellerCatalogKeys.all, snapshot);
    return snapshot;
  })();
  fullRefreshes.set(queryClient, refresh);
  try {
    return await refresh;
  } finally {
    fullRefreshes.delete(queryClient);
  }
}

export async function restoreSellerCatalog(queryClient: QueryClient): Promise<SellerCatalogSnapshot | null> {
  const current = queryClient.getQueryData<SellerCatalogSnapshot>(sellerCatalogKeys.all);
  if (current) return current;
  const cached = await sellerCatalogCache.read();
  if (cached) queryClient.setQueryData(sellerCatalogKeys.all, cached);
  return cached;
}
