import type { OrderItem, Product } from '../../types';
import type { InventoryAvailability } from '../inventory/types';
import { getOrderCatalogPrice, type OrderPriceMode } from '../../utils/orderPricing';

/** Facts shown next to each code in the order builder's Smart Entry — no guesses, only what is true. */

const lineKey = (sku: string, suffix: string | null | undefined) => `${sku}|${suffix || ''}`;

export interface QuantityIndex {
  /** `${sku}|${suffix}` → summed quantity (all sizes). */
  byVariant: Map<string, number>;
  /** Master SKU → summed quantity (all variants and sizes). */
  bySku: Map<string, number>;
}

function emptyIndex(): QuantityIndex {
  return { byVariant: new Map(), bySku: new Map() };
}

function addTo(index: QuantityIndex, sku: string, suffix: string | null | undefined, qty: number) {
  const k = lineKey(sku, suffix);
  index.byVariant.set(k, (index.byVariant.get(k) || 0) + qty);
  index.bySku.set(sku, (index.bySku.get(sku) || 0) + qty);
}

/** How many pieces of each code are already on the order being built. */
export function buildOrderQuantityIndex(items: OrderItem[]): QuantityIndex {
  const index = emptyIndex();
  for (const item of items) addTo(index, item.sku, item.variant_suffix, item.quantity);
  return index;
}

/** Available (unreserved) stock per code in one warehouse, summed across sizes. */
export function buildAvailabilityIndex(rows: InventoryAvailability[] | undefined, warehouseId: string): QuantityIndex {
  const index = emptyIndex();
  for (const row of rows || []) {
    if (row.warehouseId !== warehouseId) continue;
    addTo(index, row.productSku, row.variantSuffix, Math.max(0, row.available || 0));
  }
  return index;
}

export function quantityFor(index: QuantityIndex, sku: string, suffix?: string | null): number {
  return suffix === undefined ? index.bySku.get(sku) || 0 : index.byVariant.get(lineKey(sku, suffix)) || 0;
}

/** Catalog unit price span across a product's sellable codes, in the order's price mode. */
export function catalogPriceRange(product: Product, mode: OrderPriceMode): { min: number; max: number } | null {
  const suffixes = product.variants?.length ? product.variants.map((v) => v.suffix) : [undefined];
  const prices = suffixes.map((s) => getOrderCatalogPrice(product, s, mode)).filter((p) => p > 0);
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
