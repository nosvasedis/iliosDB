import { offlineDb } from '../../lib/offlineDb';
import {
  ERP_CATALOG_META_KEY,
  ERP_PRODUCTS_SNAPSHOT_KEY,
  ErpCatalogSyncMeta,
  ErpProductsSnapshot,
  isErpCatalogSyncMeta,
  isErpProductsSnapshot,
} from './types';

export const erpCatalogCache = {
  async readSnapshot(): Promise<ErpProductsSnapshot | null> {
    const value = await offlineDb.getValue<unknown>(ERP_PRODUCTS_SNAPSHOT_KEY);
    return isErpProductsSnapshot(value) ? value : null;
  },

  async writeSnapshot(snapshot: ErpProductsSnapshot): Promise<void> {
    if (!isErpProductsSnapshot(snapshot)) {
      throw new Error('Refusing to persist an invalid ERP products snapshot.');
    }
    await offlineDb.saveValue(ERP_PRODUCTS_SNAPSHOT_KEY, snapshot);
  },

  async readMeta(): Promise<ErpCatalogSyncMeta | null> {
    const value = await offlineDb.getValue<unknown>(ERP_CATALOG_META_KEY);
    return isErpCatalogSyncMeta(value) ? value : null;
  },

  async writeMeta(meta: ErpCatalogSyncMeta): Promise<void> {
    if (!isErpCatalogSyncMeta(meta)) {
      throw new Error('Refusing to persist invalid ERP catalogue sync meta.');
    }
    await offlineDb.saveValue(ERP_CATALOG_META_KEY, meta);
  },
};
