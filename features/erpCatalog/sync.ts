import { QueryClient, InfiniteData } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { offlineDb } from '../../lib/offlineDb';
import { Product } from '../../types';
import { productKeys } from '../products/keys';
import { erpCatalogCache } from './cache';
import { getErpProductsBySkus } from './repository';
import {
  ERP_CATALOG_REFRESH_COOLDOWN_MS,
  ERP_CATALOG_SCHEMA_VERSION,
  ErpProductsSnapshot,
} from './types';

const REALTIME_CACHE_WRITE_THROTTLE_MS = 1000;
const fullRefreshes = new WeakMap<QueryClient, Promise<Product[]>>();

let pendingSnapshot: ErpProductsSnapshot | null = null;
let cacheWriteTimer: ReturnType<typeof setTimeout> | null = null;

function writeSnapshotQuietly(snapshot: ErpProductsSnapshot): Promise<void> {
  return erpCatalogCache.writeSnapshot(snapshot).catch((error) => {
    console.warn('ERP catalogue snapshot write failed:', error);
  });
}

function writeMetaQuietly(fullSyncedAt: number, cacheSavedAt = Date.now()): Promise<void> {
  return erpCatalogCache.writeMeta({
    schemaVersion: ERP_CATALOG_SCHEMA_VERSION,
    fullSyncedAt,
    cacheSavedAt,
  }).catch((error) => {
    console.warn('ERP catalogue sync meta write failed:', error);
  });
}

function scheduleSnapshotWrite(snapshot: ErpProductsSnapshot): void {
  pendingSnapshot = snapshot;
  if (cacheWriteTimer) return;
  cacheWriteTimer = setTimeout(() => {
    cacheWriteTimer = null;
    const next = pendingSnapshot;
    pendingSnapshot = null;
    if (next) void writeSnapshotQuietly(next);
  }, REALTIME_CACHE_WRITE_THROTTLE_MS);
}

export function shouldRefreshErpCatalog(
  fullSyncedAt: number | null | undefined,
  now = Date.now(),
): boolean {
  return !fullSyncedAt || now - fullSyncedAt >= ERP_CATALOG_REFRESH_COOLDOWN_MS;
}

export function mergeProductsBySku(
  current: Product[],
  partial: Product[],
  requestedSkus: readonly string[],
): Product[] {
  const replaced = new Set(requestedSkus);
  return current
    .filter((product) => !replaced.has(product.sku))
    .concat(partial)
    .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }));
}

function mergeProductsCatalogPages(
  data: InfiniteData<{ products: Product[]; hasMore: boolean }> | undefined,
  partial: Product[],
  requestedSkus: readonly string[],
): InfiniteData<{ products: Product[]; hasMore: boolean }> | undefined {
  if (!data) return data;
  const bySku = new Map(partial.map((product) => [product.sku, product]));
  const replaced = new Set(requestedSkus);
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      products: page.products.map((product) => {
        if (!replaced.has(product.sku)) return product;
        return bySku.get(product.sku) ?? product;
      }).filter((product) => !(replaced.has(product.sku) && !bySku.has(product.sku))),
    })),
  };
}

export function mergeProductsIntoCache(
  queryClient: QueryClient,
  products: Product[],
  requestedSkus: readonly string[],
): Product[] {
  const current = queryClient.getQueryData<Product[]>(productKeys.all) ?? [];
  const merged = mergeProductsBySku(current, products, requestedSkus);
  queryClient.setQueryData(productKeys.all, merged);

  queryClient.setQueriesData<InfiniteData<{ products: Product[]; hasMore: boolean }>>(
    { queryKey: ['productsCatalog'] },
    (existing) => mergeProductsCatalogPages(existing, products, requestedSkus),
  );

  void erpCatalogCache.readMeta().then((meta) => {
    const fullSyncedAt = meta?.fullSyncedAt ?? Date.now();
    const snapshot: ErpProductsSnapshot = {
      schemaVersion: ERP_CATALOG_SCHEMA_VERSION,
      fullSyncedAt,
      cacheSavedAt: Date.now(),
      products: merged,
    };
    scheduleSnapshotWrite(snapshot);
    void writeMetaQuietly(snapshot.fullSyncedAt, snapshot.cacheSavedAt);
  });
  return merged;
}

export function removeProductsFromCache(queryClient: QueryClient, skus: readonly string[]): Product[] {
  const removed = new Set(skus);
  const current = queryClient.getQueryData<Product[]>(productKeys.all) ?? [];
  const next = current.filter((product) => !removed.has(product.sku));
  queryClient.setQueryData(productKeys.all, next);
  queryClient.setQueriesData<InfiniteData<{ products: Product[]; hasMore: boolean }>>(
    { queryKey: ['productsCatalog'] },
    (existing) => {
      if (!existing) return existing;
      return {
        ...existing,
        pages: existing.pages.map((page) => ({
          ...page,
          products: page.products.filter((product) => !removed.has(product.sku)),
        })),
      };
    },
  );
  const snapshot: ErpProductsSnapshot = {
    schemaVersion: ERP_CATALOG_SCHEMA_VERSION,
    fullSyncedAt: Date.now(),
    cacheSavedAt: Date.now(),
    products: next,
  };
  scheduleSnapshotWrite(snapshot);
  void writeMetaQuietly(snapshot.fullSyncedAt, snapshot.cacheSavedAt);
  return next;
}

async function persistFullCatalogMirror(products: Product[]): Promise<void> {
  const now = Date.now();
  const snapshot: ErpProductsSnapshot = {
    schemaVersion: ERP_CATALOG_SCHEMA_VERSION,
    fullSyncedAt: now,
    cacheSavedAt: now,
    products,
  };
  await writeSnapshotQuietly(snapshot);
  await writeMetaQuietly(now, now);

  // Best-effort atomic raw-table mirror for offline fetchFullTable fallback.
  try {
    const tables: Record<string, any[]> = {};
    for (const tableName of [
      'products',
      'product_variants',
      'recipes',
      'product_molds',
      'product_collections',
      'inventory_balances',
      'suppliers',
    ] as const) {
      const rows = await offlineDb.getTable(tableName);
      if (rows) tables[tableName] = rows;
    }
    if (Object.keys(tables).length > 0) {
      await offlineDb.saveTablesAtomic(tables);
    }
  } catch (error) {
    console.warn('ERP catalogue raw-table atomic mirror failed:', error);
  }
}

export async function persistErpProductsAfterFullFetch(products: Product[]): Promise<void> {
  await persistFullCatalogMirror(products);
}

export async function refreshErpProducts(
  queryClient: QueryClient,
  skus?: readonly string[],
): Promise<Product[]> {
  if (skus && skus.length > 0) {
    const current = queryClient.getQueryData<Product[]>(productKeys.all);
    if (current && current.length > 0) {
      try {
        const partial = await getErpProductsBySkus(skus);
        // Deleted SKUs: RPC returns nothing for them → remove from cache.
        const returned = new Set(partial.map((product) => product.sku));
        const missing = skus.filter((sku) => !returned.has(sku));
        if (missing.length > 0) {
          removeProductsFromCache(queryClient, missing);
        }
        if (partial.length > 0) {
          return mergeProductsIntoCache(queryClient, partial, skus);
        }
        return queryClient.getQueryData<Product[]>(productKeys.all) ?? [];
      } catch (error) {
        console.warn('ERP catalogue SKU refresh failed; falling back to full sync:', error);
      }
    }
  }

  const existing = fullRefreshes.get(queryClient);
  if (existing) return existing;

  const refresh = (async () => {
    const products = await api.getProducts();
    queryClient.setQueryData(productKeys.all, products);
    await persistFullCatalogMirror(products);
    return products;
  })();
  fullRefreshes.set(queryClient, refresh);
  try {
    return await refresh;
  } finally {
    fullRefreshes.delete(queryClient);
  }
}

export async function restoreErpProducts(queryClient: QueryClient): Promise<Product[] | null> {
  const current = queryClient.getQueryData<Product[]>(productKeys.all);
  if (current && current.length > 0) return current;
  const cached = await erpCatalogCache.readSnapshot();
  if (cached?.products?.length) {
    queryClient.setQueryData(productKeys.all, cached.products);
    return cached.products;
  }
  return null;
}

export async function getErpCatalogFullSyncedAt(): Promise<number | null> {
  const meta = await erpCatalogCache.readMeta();
  return meta?.fullSyncedAt ?? null;
}
