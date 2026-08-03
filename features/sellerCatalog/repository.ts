import { isLocalMode, supabase } from '../../lib/supabase';
import { parseSellerCatalogRpcSnapshot } from './mapper';
import { SellerCatalogSnapshot } from './types';

export async function getSellerCatalogSnapshot(skus?: readonly string[]): Promise<SellerCatalogSnapshot> {
  if (skus && skus.length > 100) {
    throw new Error('Seller catalogue reconciliation accepts at most 100 SKUs.');
  }
  if (isLocalMode || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    throw new Error('The seller catalogue is offline.');
  }

  const args = skus === undefined ? undefined : { p_skus: [...new Set(skus)] };
  const { data, error } = await supabase.rpc('get_seller_catalog_v1', args);
  if (error) throw error;
  return parseSellerCatalogRpcSnapshot(data);
}
