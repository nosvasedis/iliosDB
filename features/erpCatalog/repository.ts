import { supabase, SYSTEM_IDS, R2_PUBLIC_URL } from '../../lib/supabase';
import { Product } from '../../types';
import { attachSuppliersToProductRows, mapProductsWithRelations } from '../products/mappers';
import { isVisibleProductCatalogRow } from '../products/catalogVisibility';
import { ErpProductsBySkusPayload } from './types';

function asRowArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

export function mapErpProductsBySkusPayload(payload: ErpProductsBySkusPayload): Product[] {
  const products = asRowArray(payload.products).filter(isVisibleProductCatalogRow);
  if (products.length === 0) return [];

  const suppliers = asRowArray(payload.suppliers);
  const withSuppliers = attachSuppliersToProductRows(products, suppliers);

  return mapProductsWithRelations(
    withSuppliers as any,
    {
      variants: asRowArray(payload.product_variants) as any,
      recipes: asRowArray(payload.recipes) as any,
      molds: asRowArray(payload.product_molds) as any,
      collections: asRowArray(payload.product_collections) as any,
      stock: asRowArray(payload.inventory_balances) as any,
    },
    {
      publicImageBaseUrl: R2_PUBLIC_URL,
      centralWarehouseId: SYSTEM_IDS.CENTRAL,
      showroomWarehouseId: SYSTEM_IDS.SHOWROOM,
    },
  );
}

export async function getErpProductsBySkus(skus: readonly string[]): Promise<Product[]> {
  const unique = [...new Set(skus.map((sku) => sku.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  if (unique.length > 100) {
    throw new Error('getErpProductsBySkus accepts at most 100 SKUs.');
  }

  const { data, error } = await supabase.rpc('get_erp_products_by_skus', {
    p_skus: unique,
  });
  if (error) throw error;
  return mapErpProductsBySkusPayload((data ?? {}) as ErpProductsBySkusPayload);
}
