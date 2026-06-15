import { describe, expect, it } from 'vitest';
import { OrderShipment, OrderShipmentItem } from '../../types';
import {
  getItemFulfillmentKind,
  getItemShipmentAllocations,
  itemKey,
} from '../../utils/shipmentUtils';

const shipments: OrderShipment[] = [
  {
    id: 'ship-1',
    order_id: 'o1',
    shipment_number: 1,
    shipped_at: '2026-01-10T10:00:00.000Z',
    shipped_by: 'Tester',
    created_at: '2026-01-10T10:00:00.000Z',
  },
  {
    id: 'ship-2',
    order_id: 'o1',
    shipment_number: 2,
    shipped_at: '2026-02-10T10:00:00.000Z',
    shipped_by: 'Tester',
    created_at: '2026-02-10T10:00:00.000Z',
  },
];

describe('item fulfillment status', () => {
  it('returns shipment allocations sorted by shipment number', () => {
    const key = itemKey('SKU1', 'XPR', '58');
    const shipmentItems: OrderShipmentItem[] = [
      {
        id: 'si-2',
        shipment_id: 'ship-2',
        sku: 'SKU1',
        variant_suffix: 'XPR',
        size_info: '58',
        quantity: 2,
        price_at_order: 100,
      },
      {
        id: 'si-1',
        shipment_id: 'ship-1',
        sku: 'SKU1',
        variant_suffix: 'XPR',
        size_info: '58',
        quantity: 3,
        price_at_order: 100,
      },
    ];

    expect(getItemShipmentAllocations(key, shipments, shipmentItems)).toEqual([
      expect.objectContaining({ shipmentNumber: 1, quantity: 3 }),
      expect.objectContaining({ shipmentNumber: 2, quantity: 2 }),
    ]);
  });

  it('classifies fully delivered lines', () => {
    expect(
      getItemFulfillmentKind({ quantity: 5, shippedQty: 5, remainingQty: 0 })
    ).toBe('fully_delivered');
  });

  it('classifies partially delivered lines with production remainder', () => {
    expect(
      getItemFulfillmentKind({ quantity: 10, shippedQty: 4, remainingQty: 0 })
    ).toBe('partially_delivered');
  });

  it('classifies lines fully in production', () => {
    expect(
      getItemFulfillmentKind({ quantity: 8, shippedQty: 0, remainingQty: 0 })
    ).toBe('in_production');
  });

  it('classifies lines that still need production send', () => {
    expect(
      getItemFulfillmentKind({ quantity: 8, shippedQty: 2, remainingQty: 3 })
    ).toBe('remaining');
  });
});
