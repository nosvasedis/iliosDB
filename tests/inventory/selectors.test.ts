import { describe, expect, it } from 'vitest';
import type { InventoryAvailability, InventoryReservation } from '../../features/inventory';
import {
  calculateInventoryTotals,
  inventoryIdentityKey,
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
