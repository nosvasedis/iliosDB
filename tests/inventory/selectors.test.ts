import { describe, expect, it } from 'vitest';
import type { InventoryAvailability, InventoryReservation } from '../../features/inventory';
import { Gender, PlatingType, ProductionType } from '../../types';
import {
  calculateInventoryTotals,
  ensureCatalogInventoryAvailability,
  groupInventoryAvailability,
  inventoryIdentityKey,
  matchesInventoryAvailabilitySearch,
  reservationQuantityForLine,
} from '../../features/inventory';

const row = (overrides: Partial<InventoryAvailability> = {}): InventoryAvailability => ({
  productSku: 'SK100',
  variantSuffix: '',
  sizeInfo: '',
  warehouseId: 'warehouse-central',
  warehouseName: 'Κεντρική Αποθήκη',
  warehouseType: 'Central',
  onHand: 10,
  reserved: 3,
  available: 7,
  incoming: 2,
  outstandingDemand: 4,
  productionDemand: 3,
  purchaseDemand: 1,
  projectedAvailable: 5,
  openOrderQuantity: 10,
  shippedQuantity: 4,
  remainingOrderQuantity: 6,
  allocatedQuantity: 2,
  reorderPoint: 5,
  preferredSupplierId: null,
  updatedAt: '2026-07-22T10:00:00.000Z',
  ...overrides,
});

describe('canonical inventory selectors', () => {
  it('sums canonical columns without adding size quantities on top of aggregate values', () => {
    const totals = calculateInventoryTotals([
      row({ sizeInfo: '52', onHand: 4, reserved: 1, available: 3, projectedAvailable: 1 }),
      row({ sizeInfo: '54', onHand: 6, reserved: 2, available: 4, projectedAvailable: 4 }),
    ]);

    expect(totals).toMatchObject({
      onHand: 10,
      reserved: 3,
      available: 7,
      incoming: 4,
      outstandingDemand: 8,
      projectedAvailable: 5,
      openOrderQuantity: 20,
      shippedQuantity: 8,
      remainingOrderQuantity: 12,
      allocatedQuantity: 4,
    });
    expect(totals.available).toBe(totals.onHand - totals.reserved);
  });

  it('counts low stock only when a reorder policy is configured', () => {
    const totals = calculateInventoryTotals([
      row({ available: 0, reorderPoint: 0 }),
      row({ productSku: 'SK101', available: 2, reorderPoint: 3 }),
      row({ productSku: 'SK102', available: 4, reorderPoint: 3 }),
    ]);
    expect(totals.lowStockCount).toBe(1);
  });

  it('uses the complete SKU, variant, size, and warehouse identity', () => {
    expect(inventoryIdentityKey(row({ variantSuffix: 'XPR', sizeInfo: '54' })))
      .toBe('SK100::XPR::54::warehouse-central');
  });

  it('groups size and warehouse balances inside variants and variants inside the main SKU', () => {
    const groups = groupInventoryAvailability([
      row({ productSku: 'SK200', variantSuffix: 'XPR', sizeInfo: '54', warehouseId: 'showroom', warehouseName: 'Εκθετήριο', warehouseType: 'Showroom', onHand: 2, reserved: 0, available: 2 }),
      row({ productSku: 'SK100', variantSuffix: 'XLE', sizeInfo: '52' }),
      row({ productSku: 'SK200', variantSuffix: 'XPR', sizeInfo: '52', onHand: 3, reserved: 1, available: 2 }),
      row({ productSku: 'SK200', variantSuffix: '', sizeInfo: '' }),
    ]);

    expect(groups.map((group) => group.productSku)).toEqual(['SK100', 'SK200']);
    expect(groups[1].variants.map((variant) => variant.variantSuffix)).toEqual(['', 'XPR']);
    expect(groups[1].variants[1]).toMatchObject({
      sizeCount: 2,
      warehouseCount: 2,
      totals: {
        onHand: 5,
        reserved: 1,
        available: 4,
      },
    });
    expect(groups[1].totals.onHand).toBe(15);
  });

  it('sorts SKU, variant, size, and warehouse labels naturally', () => {
    const groups = groupInventoryAvailability([
      row({ productSku: 'SK10', variantSuffix: 'X2', sizeInfo: '54' }),
      row({ productSku: 'SK2', variantSuffix: 'X10', sizeInfo: '52' }),
      row({ productSku: 'SK10', variantSuffix: 'X2', sizeInfo: '52' }),
      row({ productSku: 'SK10', variantSuffix: 'X1', sizeInfo: '' }),
    ]);

    expect(groups.map((group) => group.productSku)).toEqual(['SK2', 'SK10']);
    expect(groups[1].variants.map((variant) => variant.variantSuffix)).toEqual(['X1', 'X2']);
    expect(groups[1].variants[1].rows.map((item) => item.sizeInfo)).toEqual(['52', '54']);
  });

  it('keeps catalog variants reachable before their first physical count', () => {
    const rows = ensureCatalogInventoryAvailability(
      [row({ productSku: 'SK100', variantSuffix: 'XLE' })],
      [{
        sku: 'SK100',
        prefix: 'SK',
        category: 'Δαχτυλίδια',
        gender: Gender.Unisex,
        image_url: null,
        weight_g: 1,
        plating_type: PlatingType.None,
        production_type: ProductionType.InHouse,
        active_price: 0,
        draft_price: 0,
        selling_price: 0,
        stock_qty: 0,
        sample_qty: 0,
        molds: [],
        is_component: false,
        variants: [
          { suffix: 'XLE', description: '', stock_qty: 0 },
          { suffix: 'XPR', description: '', stock_qty: 0 },
        ],
        recipe: [],
        labor: {
          casting_cost: 0,
          setter_cost: 0,
          technician_cost: 0,
          plating_cost_x: 0,
          plating_cost_d: 0,
          subcontract_cost: 0,
        },
      }],
      {
        id: 'warehouse-central',
        name: 'Κεντρική Αποθήκη',
        type: 'Central',
        is_system: true,
      },
    );

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      productSku: 'SK100',
      variantSuffix: 'XPR',
      warehouseName: 'Κεντρική Αποθήκη',
      onHand: 0,
      available: 0,
    });
  });

  it('groups a catalog-scale set into one navigable record per main SKU', () => {
    const catalogRows = Array.from({ length: 7_000 }, (_, index) => row({
      productSku: `SK${index + 1}`,
      variantSuffix: index % 2 === 0 ? 'XLE' : 'XPR',
      onHand: index % 7,
      reserved: 0,
      available: index % 7,
    }));

    const groups = groupInventoryAvailability(catalogRows);

    expect(groups).toHaveLength(7_000);
    expect(groups[0].productSku).toBe('SK1');
    expect(groups.at(-1)?.productSku).toBe('SK7000');
    expect(groups.every((group) => group.variants.length === 1)).toBe(true);
  });

  it('finds a scanned full variant SKU as one search value', () => {
    const inventoryRow = row({
      productSku: 'SK100',
      variantSuffix: 'XLE',
      sizeInfo: '54',
    });

    expect(matchesInventoryAvailabilitySearch(inventoryRow, 'SK100XLE')).toBe(true);
    expect(matchesInventoryAvailabilitySearch(inventoryRow, 'δαχτυλίδι', ['Δαχτυλίδι με πέτρα'])).toBe(true);
    expect(matchesInventoryAvailabilitySearch(inventoryRow, 'SK999')).toBe(false);
  });

  it('allocates reservations by stable order line id', () => {
    const reservations: InventoryReservation[] = [
      {
        id: 'r1', orderId: 'o1', orderLineId: 'line-1', productSku: 'SK100', variantSuffix: 'X', sizeInfo: '54',
        warehouseId: 'warehouse-central', initialQuantity: 2, quantity: 2, state: 'active', createdAt: '', updatedAt: '',
      },
      {
        id: 'r2', orderId: 'o1', orderLineId: 'line-2', productSku: 'SK100', variantSuffix: 'X', sizeInfo: '54',
        warehouseId: 'warehouse-central', initialQuantity: 3, quantity: 3, state: 'active', createdAt: '', updatedAt: '',
      },
      {
        id: 'r3', orderId: 'o1', orderLineId: 'line-1', productSku: 'SK100', variantSuffix: 'X', sizeInfo: '54',
        warehouseId: 'warehouse-central', initialQuantity: 1, quantity: 0, state: 'consumed', createdAt: '', updatedAt: '',
      },
    ];
    expect(reservationQuantityForLine(reservations, 'line-1', 'SK100', 'X', '54')).toBe(2);
    expect(reservationQuantityForLine(reservations, 'line-2', 'SK100', 'X', '54')).toBe(3);
  });
});
