import { describe, expect, it } from 'vitest';
import { OrderItem } from '../../types';
import {
  buildShippedByDemandKey,
  demandKeyForItem,
  buildNaturalKeyDemandCount,
} from '../../features/production/orderBatchReconcile';
import {
  allowsNewProductionPart,
  allowsNewProductionPartOrderEdit,
  orderNeedsProductionEditDialog,
} from '../../features/production/orderProductionEdit';
import { OrderStatus } from '../../types';

describe('buildShippedByDemandKey', () => {
  it('allocates legacy shipment rows without line_id to matching line-id demand keys', () => {
    const items: OrderItem[] = [
      { sku: 'PN056', variant_suffix: 'H', quantity: 1, price_at_order: 100, line_id: 'line-h' },
      { sku: 'PN056', variant_suffix: 'X', quantity: 1, price_at_order: 100, line_id: 'line-x' },
    ];
    const keyOptions = { naturalKeyDemandCount: buildNaturalKeyDemandCount(items) };

    const shipped = buildShippedByDemandKey(items, [
      { sku: 'PN056', variant_suffix: 'H', quantity: 1, line_id: null },
    ]);

    expect(shipped[demandKeyForItem(items[0], keyOptions)]).toBe(1);
    expect(shipped[demandKeyForItem(items[1], keyOptions)]).toBeUndefined();
  });

  it('allocates duplicate catalog rows FIFO when shipment lacks line_id', () => {
    const items: OrderItem[] = [
      { sku: 'BDA001', variant_suffix: 'XPR', quantity: 1, price_at_order: 50, line_id: 'line-1' },
      { sku: 'BDA001', variant_suffix: 'XPR', quantity: 1, price_at_order: 50, line_id: 'line-2' },
    ];
    const keyOptions = { naturalKeyDemandCount: buildNaturalKeyDemandCount(items) };

    const shipped = buildShippedByDemandKey(items, [
      { sku: 'BDA001', variant_suffix: 'XPR', quantity: 2, line_id: null },
    ]);

    expect(shipped[demandKeyForItem(items[0], keyOptions)]).toBe(1);
    expect(shipped[demandKeyForItem(items[1], keyOptions)]).toBe(1);
  });

  it('respects shipment line_id when present', () => {
    const items: OrderItem[] = [
      { sku: 'BDA001', variant_suffix: 'XPR', quantity: 1, price_at_order: 50, line_id: 'line-1' },
      { sku: 'BDA001', variant_suffix: 'XPR', quantity: 1, price_at_order: 50, line_id: 'line-2' },
    ];
    const keyOptions = { naturalKeyDemandCount: buildNaturalKeyDemandCount(items) };

    const shipped = buildShippedByDemandKey(items, [
      { sku: 'BDA001', variant_suffix: 'XPR', quantity: 1, line_id: 'line-2' },
    ]);

    expect(shipped[demandKeyForItem(items[0], keyOptions)]).toBeUndefined();
    expect(shipped[demandKeyForItem(items[1], keyOptions)]).toBe(1);
  });
});

describe('order production edit rules', () => {
  const baseOrder = {
    id: 'ORD-1',
    customer_name: 'Client',
    created_at: '2026-01-01T00:00:00.000Z',
    status: OrderStatus.InProduction,
    total_price: 100,
    vat_rate: 0.24,
    discount_percent: 0,
    items: [
      { sku: 'PN040', variant_suffix: 'H', quantity: 1, price_at_order: 100, line_id: 'line-1' },
    ],
  };

  it('includes Partially Delivered in production edit dialog statuses', () => {
    expect(orderNeedsProductionEditDialog(OrderStatus.PartiallyDelivered)).toBe(true);
  });

  it('allows new part only when existing lines are untouched and a new line is added', () => {
    const afterItems: OrderItem[] = [
      ...baseOrder.items,
      { sku: 'PN041', variant_suffix: 'H', quantity: 1, price_at_order: 80 },
    ];
    expect(allowsNewProductionPart(baseOrder.items, afterItems)).toBe(true);
    expect(
      allowsNewProductionPartOrderEdit(baseOrder, { ...baseOrder, items: afterItems }),
    ).toBe(true);
  });

  it('disallows new part when an existing line is modified or removed', () => {
    expect(
      allowsNewProductionPart(baseOrder.items, [
        { sku: 'PN040', variant_suffix: 'H', quantity: 2, price_at_order: 100, line_id: 'line-1' },
      ]),
    ).toBe(false);

    expect(
      allowsNewProductionPart(baseOrder.items, [
        { sku: 'PN041', variant_suffix: 'H', quantity: 1, price_at_order: 80 },
      ]),
    ).toBe(false);
  });

  it('disallows new part when order header fields change', () => {
    const afterItems: OrderItem[] = [
      ...baseOrder.items,
      { sku: 'PN041', variant_suffix: 'H', quantity: 1, price_at_order: 80 },
    ];
    expect(
      allowsNewProductionPartOrderEdit(baseOrder, {
        ...baseOrder,
        notes: 'changed',
        items: afterItems,
      }),
    ).toBe(false);
  });
});
