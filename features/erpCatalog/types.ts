import { Product } from '../../types';

export const ERP_CATALOG_SCHEMA_VERSION = 1;
export const ERP_PRODUCTS_SNAPSHOT_KEY = 'erp_products_snapshot_v1';
export const ERP_CATALOG_META_KEY = 'erp_catalog_sync_meta_v1';

export const ERP_CATALOG_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;
export const ERP_CATALOG_RECONNECT_GAP_MS = 60 * 1000;
export const ERP_CATALOG_SKU_BURST_LIMIT = 50;

export type ErpCatalogSyncMeta = {
  schemaVersion: number;
  fullSyncedAt: number;
  cacheSavedAt: number;
};

export type ErpProductsSnapshot = {
  schemaVersion: number;
  fullSyncedAt: number;
  cacheSavedAt: number;
  products: Product[];
};

export type ErpProductsBySkusPayload = {
  schema_version?: number;
  products?: unknown[];
  product_variants?: unknown[];
  recipes?: unknown[];
  product_molds?: unknown[];
  product_collections?: unknown[];
  inventory_balances?: unknown[];
  suppliers?: unknown[];
};

export function isErpCatalogSyncMeta(value: unknown): value is ErpCatalogSyncMeta {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.schemaVersion === 'number'
    && typeof row.fullSyncedAt === 'number'
    && typeof row.cacheSavedAt === 'number';
}

export function isErpProductsSnapshot(value: unknown): value is ErpProductsSnapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.schemaVersion === 'number'
    && typeof row.fullSyncedAt === 'number'
    && typeof row.cacheSavedAt === 'number'
    && Array.isArray(row.products);
}
