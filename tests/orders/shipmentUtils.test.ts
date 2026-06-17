import { describe, expect, it } from 'vitest';
import { Order, OrderStatus } from '../../types';
import { getRemainingOrderItems, getShippedQuantitiesForOrderLines, itemKey } from '../../utils/shipmentUtils';

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

  it('allocates legacy shipment rows without line_id onto order lines that have line_id', () => {
    const orderItems = [
      { sku: 'PN056', variant_suffix: 'H', quantity: 1, price_at_order: 100, line_id: 'line-h' },
      { sku: 'PN056', variant_suffix: 'X', quantity: 1, price_at_order: 100, line_id: 'line-x' },
    ] as Order['items'];

    const shipped = getShippedQuantitiesForOrderLines(orderItems, [
      {
        id: 'shipment-item-1',
        shipment_id: 'shipment-1',
        sku: 'PN056',
        variant_suffix: 'H',
        quantity: 1,
        price_at_order: 100,
        line_id: null,
      },
    ] as any);

    const order = {
      id: 'o2',
      customer_name: 'Test',
      created_at: '',
      status: OrderStatus.PartiallyDelivered,
      items: orderItems,
      total_price: 200,
    } as Order;

    const remaining = getRemainingOrderItems(order, [
      {
        id: 'shipment-item-1',
        shipment_id: 'shipment-1',
        sku: 'PN056',
        variant_suffix: 'H',
        quantity: 1,
        price_at_order: 100,
        line_id: null,
      },
    ] as any);

    expect(shipped.get(itemKey('PN056', 'H', null, null, null, 'line-h'))).toBe(1);
    expect(remaining).toEqual([
      expect.objectContaining({ sku: 'PN056', variant_suffix: 'X', quantity: 1, line_id: 'line-x' }),
    ]);
  });
});
