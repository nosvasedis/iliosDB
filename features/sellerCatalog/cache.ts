import { offlineDb } from '../../lib/offlineDb';
import { isSellerCatalogSnapshot } from './mapper';
import { SellerCatalogSnapshot } from './types';

export const SELLER_CATALOG_CACHE_KEY = 'seller_catalog_snapshot_v1';

export const sellerCatalogCache = {
  async read(): Promise<SellerCatalogSnapshot | null> {
    const value = await offlineDb.getValue<unknown>(SELLER_CATALOG_CACHE_KEY);
    return isSellerCatalogSnapshot(value) ? value : null;
  },

  async write(snapshot: SellerCatalogSnapshot): Promise<void> {
    if (!isSellerCatalogSnapshot(snapshot)) {
      throw new Error('Refusing to persist an invalid seller catalogue snapshot.');
    }
    await offlineDb.saveValue(SELLER_CATALOG_CACHE_KEY, snapshot);
  },
};
