import { describe, expect, it } from 'vitest';
import type { OrderItem, Product } from '../../types';
import type { InventoryAvailability } from '../../features/inventory/types';
import {
  buildAvailabilityIndex,
  buildOrderQuantityIndex,
  catalogPriceRange,
  quantityFor,
} from '../../features/orders/smartEntryInsights';

const row = (productSku: string, variantSuffix: string, available: number, warehouseId = 'central', sizeInfo = '') =>
  ({ productSku, variantSuffix, available, warehouseId, sizeInfo }) as InventoryAvailability;

describe('smartEntryInsights', () => {
  it('sums order quantities per code and per master', () => {
    const items = [
      { sku: 'SK1', variant_suffix: 'P', quantity: 2, size_info: '52' },
      { sku: 'SK1', variant_suffix: 'P', quantity: 1, size_info: '54' },
      { sku: 'SK1', variant_suffix: 'X', quantity: 4 },
      { sku: 'RN2', quantity: 1 },
    ] as OrderItem[];
    const index = buildOrderQuantityIndex(items);
    expect(quantityFor(index, 'SK1', 'P')).toBe(3);
    expect(quantityFor(index, 'SK1')).toBe(7);
    expect(quantityFor(index, 'RN2', '')).toBe(1);
    expect(quantityFor(index, 'BR3')).toBe(0);
  });

  it('counts only the requested warehouse and never goes negative', () => {
    const index = buildAvailabilityIndex(
      [row('SK1', 'P', 3, 'central', '52'), row('SK1', 'P', 2, 'central', '54'), row('SK1', 'X', -1), row('SK1', 'P', 9, 'showroom')],
      'central',
    );
    expect(quantityFor(index, 'SK1', 'P')).toBe(5);
    expect(quantityFor(index, 'SK1', 'X')).toBe(0);
    expect(quantityFor(index, 'SK1')).toBe(5);
    expect(quantityFor(buildAvailabilityIndex(undefined, 'central'), 'SK1')).toBe(0);
  });

  it('reports the catalog price span in the order price mode', () => {
    const product = {
      sku: 'SK1',
      selling_price: 10,
      variants: [
        { suffix: 'P', description: '', stock_qty: 0, selling_price: 12 },
        { suffix: 'X', description: '', stock_qty: 0 },
      ],
    } as Product;
    expect(catalogPriceRange(product, 'wholesale')).toEqual({ min: 10, max: 12 });
    expect(catalogPriceRange(product, 'retail')).toEqual({ min: 30, max: 36 });
    expect(catalogPriceRange({ sku: 'Z', selling_price: 0 } as Product, 'wholesale')).toBeNull();
  });
});
