import { describe, expect, it } from 'vitest';
import { OrderStatus, ProductionStage } from '../../types';
import {
  buildLatestShipmentPrintData,
  buildOrderLabelPrintItems,
  buildOrderItemIdentityKey,
  buildSyntheticAggregatedBatches,
} from '../../features/orders/printHelpers';

describe('orders print helpers', () => {
  it('builds latest shipment data with the remaining order and totals', () => {
    const order = {
      id: 'ord-1',
      customer_name: 'Ada',
      created_at: '2024-01-01T00:00:00.000Z',
      status: OrderStatus.InProduction,
      items: [
        { sku: 'PN1', quantity: 4, variant_suffix: '', price_at_order: 10 },
        { sku: 'PN2', quantity: 2, variant_suffix: 'X', price_at_order: 20 },
      ],
      total_price: 0,
      vat_rate: 0.24,
      discount_percent: 10,
    } as const;

    const shipmentSnapshot = {
      shipments: [
        { id: 'ship-1', order_id: 'ord-1', shipment_number: 1, shipped_at: '2024-01-01T10:00:00.000Z', shipped_by: 'tester', created_at: '2024-01-01T10:00:00.000Z' },
        { id: 'ship-2', order_id: 'ord-1', shipment_number: 2, shipped_at: '2024-01-02T10:00:00.000Z', shipped_by: 'tester', created_at: '2024-01-02T10:00:00.000Z' },
      ],
      items: [
        { id: 'item-1', shipment_id: 'ship-1', sku: 'PN1', variant_suffix: '', size_info: null, cord_color: null, enamel_color: null, quantity: 1, price_at_order: 10 },
        { id: 'item-2', shipment_id: 'ship-2', sku: 'PN2', variant_suffix: 'X', size_info: null, cord_color: null, enamel_color: null, quantity: 1, price_at_order: 20 },
      ],
    };

    const result = buildLatestShipmentPrintData(order as any, shipmentSnapshot as any);

    expect(result?.shipment.id).toBe('ship-2');
    expect(result?.shipmentItems).toHaveLength(1);
    expect(result?.remainingOrder.items).toEqual([
      { sku: 'PN1', quantity: 3, variant_suffix: '', price_at_order: 10 },
      { sku: 'PN2', quantity: 1, variant_suffix: 'X', price_at_order: 20 },
    ]);
    expect(result?.remainingOrder.total_price).toBeCloseTo(55.8, 5);
  });

  it('builds label print items and synthetic aggregated batches', () => {
    const order = {
      id: 'ord-2',
      customer_name: 'Bea',
      created_at: '2024-02-01T00:00:00.000Z',
      status: OrderStatus.Pending,
      items: [
        { sku: 'PN1', quantity: 2, variant_suffix: '', size_info: '52', price_at_order: 12 },
      ],
      total_price: 24,
    } as any;

    const products = [
      {
        sku: 'PN1',
        variants: [{ suffix: '', description: 'Lustre', stock_qty: 0 }],
      },
    ] as any;

    const labelItems = buildOrderLabelPrintItems(order, products);
    const syntheticBatches = buildSyntheticAggregatedBatches(order);

    expect(labelItems).toEqual([
      {
        product: products[0],
        variant: products[0].variants[0],
        quantity: 2,
        size: '52',
        format: 'standard',
      },
    ]);
    expect(syntheticBatches).toEqual([
      expect.objectContaining({
        id: 'synthetic-ord-2-0',
        order_id: 'ord-2',
        sku: 'PN1',
        variant_suffix: '',
        quantity: 2,
        current_stage: ProductionStage.AwaitingDelivery,
        requires_setting: false,
        size_info: '52',
      }),
    ]);
  });

  it('builds stable identity keys for item matching', () => {
    const key = buildOrderItemIdentityKey({
      sku: 'PN1',
      variant_suffix: 'X',
      size_info: '52',
      cord_color: null,
      enamel_color: null,
      line_id: 'line-1',
    });

    expect(key).toContain('PN1::X::52');
    expect(key).toContain('lid:line-1');
  });
});
