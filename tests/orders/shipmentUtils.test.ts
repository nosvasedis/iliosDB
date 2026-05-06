import { describe, expect, it } from 'vitest';
import { Order, OrderStatus } from '../../types';
import { getRemainingOrderItems } from '../../utils/shipmentUtils';

describe('shipment utils', () => {
  it('attributes shipped quantities to same SKU note variants by line_id', () => {
    const order = {
      id: 'o1',
      customer_name: 'Ada',
      created_at: '',
      status: OrderStatus.PartiallyDelivered,
      items: [
        { sku: 'BDA001', variant_suffix: 'XPR', quantity: 1, price_at_order: 67, notes: 'KO-PR-KO', line_id: 'note-line' },
        { sku: 'BDA001', variant_suffix: 'XPR', quantity: 1, price_at_order: 67, line_id: 'normal-line' },
      ],
      total_price: 134,
    } as Order;

    const remaining = getRemainingOrderItems(order, [
      {
        id: 'shipment-item-1',
        shipment_id: 'shipment-1',
        sku: 'BDA001',
        variant_suffix: 'XPR',
        quantity: 1,
        price_at_order: 67,
        line_id: 'note-line',
      },
    ] as any);

    expect(remaining).toEqual([
      expect.objectContaining({
        sku: 'BDA001',
        variant_suffix: 'XPR',
        quantity: 1,
        line_id: 'normal-line',
      }),
    ]);
  });
});
