import { describe, expect, it } from 'vitest';
import { applyInventoryAvailabilityToProducts, type InventoryAvailability } from '../../features/inventory';

const baseProduct = {
  sku: 'KL201',
  prefix: 'KL',
  category: 'Κολιέ',
  gender: 'Unisex',
  image_url: null,
  weight_g: 2,
  plating_type: 'X',
  production_type: 'In House',
  active_price: 10,
  draft_price: 10,
  selling_price: 20,
  stock_qty: 0,
  sample_qty: 0,
  molds: [],
  is_component: false,
  variants: [{ suffix: 'X', description: 'Ασημί', stock_qty: 0 }],
  recipe: [],
  labor: {},
} as any;

function row(overrides: Partial<InventoryAvailability>): InventoryAvailability {
  return {
    productSku: 'KL201',
    variantSuffix: 'X',
    sizeInfo: '',
    warehouseId: 'central',
    warehouseName: 'Κεντρική Αποθήκη',
    warehouseType: 'Central',
    onHand: 2,
    reserved: 0,
    available: 2,
    incoming: 0,
    outstandingDemand: 0,
    productionDemand: 0,
    purchaseDemand: 0,
    projectedAvailable: 2,
    reorderPoint: 0,
    preferredSupplierId: null,
    updatedAt: '2026-07-23T08:00:00.000Z',
    ...overrides,
  };
}

describe('canonical inventory product projection', () => {
  it('projects KL201X stock without incorrectly assigning it to the bare master SKU', () => {
    const [product] = applyInventoryAvailabilityToProducts([baseProduct], [row({})]);
    expect(product.stock_qty).toBe(0);
    expect(product.variants?.[0]).toEqual(expect.objectContaining({
      suffix: 'X',
      stock_qty: 2,
      available_qty: 2,
      location_stock: { central: 2 },
    }));
  });

  it('aggregates sizes per warehouse and preserves direct showroom stock', () => {
    const [product] = applyInventoryAvailabilityToProducts([baseProduct], [
      row({ sizeInfo: '52', onHand: 1, available: 1 }),
      row({ sizeInfo: '54', onHand: 2, reserved: 1, available: 1 }),
      row({
        sizeInfo: '54',
        warehouseId: 'showroom',
        warehouseName: 'Δειγματολόγιο',
        warehouseType: 'Showroom',
        onHand: 3,
        reserved: 0,
        available: 3,
      }),
    ]);
    expect(product.variants?.[0]).toEqual(expect.objectContaining({
      stock_qty: 3,
      available_qty: 2,
      stock_by_size: { '52': 1, '54': 2 },
      location_stock: { central: 3, showroom: 3 },
    }));
  });
});
