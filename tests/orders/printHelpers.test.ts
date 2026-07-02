import { describe, expect, it } from 'vitest';
import { Order, OrderShipment, OrderShipmentItem, OrderStatus, ProductionStage } from '../../types';
import {
  buildLatestShipmentPrintData,
  buildOrderLabelPrintItems,
  buildOrderItemIdentityKey,
  buildShipmentPrintPayloads,
  buildSyntheticAggregatedBatches,
  getShipmentPrintDecision,
} from '../../features/orders/printHelpers';

describe('orders print helpers', () => {
  const makeOrder = (overrides: Partial<Order> = {}): Order => ({
    id: 'ord-smart-print',
    customer_name: 'Smart Print Customer',
    created_at: '2026-06-01T10:00:00.000Z',
    status: OrderStatus.InProduction,
    items: [
      { sku: 'PN1', quantity: 2, variant_suffix: '', price_at_order: 10, line_id: 'line-1' },
      { sku: 'PN2', quantity: 1, variant_suffix: 'X', price_at_order: 20, line_id: 'line-2' },
    ],
    total_price: 40,
    vat_rate: 0.24,
    discount_percent: 0,
    ...overrides,
  });

  const makeShipment = (overrides: Partial<OrderShipment> = {}): OrderShipment => ({
    id: 'ship-1',
    order_id: 'ord-smart-print',
    shipment_number: 1,
    shipped_at: '2026-06-02T10:00:00.000Z',
    shipped_by: 'tester',
    notes: null,
    created_at: '2026-06-02T10:00:00.000Z',
    ...overrides,
  });

  const makeShipmentItem = (overrides: Partial<OrderShipmentItem> = {}): OrderShipmentItem => ({
    id: 'shipment-item-1',
    shipment_id: 'ship-1',
    sku: 'PN1',
    variant_suffix: '',
    size_info: null,
    cord_color: null,
    enamel_color: null,
    quantity: 1,
    price_at_order: 10,
    line_id: 'line-1',
    ...overrides,
  });

  it('classifies a one-part full shipment as normal order printing', () => {
    const order = makeOrder({ status: OrderStatus.Delivered });
    const snapshot = {
      shipments: [makeShipment()],
      items: [
        makeShipmentItem({ id: 'item-1', sku: 'PN1', quantity: 2, line_id: 'line-1' }),
        makeShipmentItem({ id: 'item-2', sku: 'PN2', variant_suffix: 'X', quantity: 1, price_at_order: 20, line_id: 'line-2' }),
      ],
    };

    const decision = getShipmentPrintDecision(order, snapshot);

    expect(decision.kind).toBe('single_full');
    expect(decision.latestShipmentData).toBeNull();
    expect(decision.shipmentPrintPayloads).toHaveLength(1);
  });

  it('classifies a one-part partial shipment and returns the remaining order', () => {
    const order = makeOrder();
    const snapshot = {
      shipments: [makeShipment()],
      items: [
        makeShipmentItem({ id: 'item-1', sku: 'PN1', quantity: 1, line_id: 'line-1' }),
      ],
    };

    const decision = getShipmentPrintDecision(order, snapshot);

    expect(decision.kind).toBe('single_partial');
    expect(decision.latestShipmentData?.remainingOrder.items).toEqual([
      expect.objectContaining({ sku: 'PN1', quantity: 1, line_id: 'line-1' }),
      expect.objectContaining({ sku: 'PN2', quantity: 1, line_id: 'line-2' }),
    ]);
  });

  it('classifies multiple shipments as a multi-part print choice even when fully delivered', () => {
    const order = makeOrder({ status: OrderStatus.Delivered });
    const snapshot = {
      shipments: [
        makeShipment({ id: 'ship-1', shipment_number: 1, shipped_at: '2026-06-02T10:00:00.000Z' }),
        makeShipment({ id: 'ship-2', shipment_number: 2, shipped_at: '2026-06-03T10:00:00.000Z' }),
      ],
      items: [
        makeShipmentItem({ id: 'item-1', shipment_id: 'ship-1', sku: 'PN1', quantity: 2, line_id: 'line-1' }),
        makeShipmentItem({ id: 'item-2', shipment_id: 'ship-2', sku: 'PN2', variant_suffix: 'X', quantity: 1, price_at_order: 20, line_id: 'line-2' }),
      ],
    };

    const decision = getShipmentPrintDecision(order, snapshot);

    expect(decision.kind).toBe('multi_part');
    expect(decision.latestShipmentData).toBeNull();
    expect(decision.shipmentPrintPayloads.map((payload) => payload.shipment.id)).toEqual(['ship-2', 'ship-1']);
  });

  it('ignores shipment rows that have no printable shipment items', () => {
    const order = makeOrder({ status: OrderStatus.Delivered });
    const decision = getShipmentPrintDecision(order, {
      shipments: [makeShipment()],
      items: [],
    });

    expect(decision.kind).toBe('none');
    expect(decision.latestShipmentData).toBeNull();
    expect(decision.shipmentPrintPayloads).toEqual([]);
  });

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

  it('builds shipment print payloads even when an order has no remaining items', () => {
    const order = {
      id: 'ord-shipped',
      customer_name: 'Dana',
      created_at: '2024-01-01T00:00:00.000Z',
      status: OrderStatus.Delivered,
      items: [
        { sku: 'PN1', quantity: 1, variant_suffix: '', price_at_order: 10 },
        { sku: 'PN2', quantity: 1, variant_suffix: '', price_at_order: 20 },
      ],
      total_price: 30,
    } as any;

    const shipmentSnapshot = {
      shipments: [
        { id: 'ship-1', order_id: 'ord-shipped', shipment_number: 1, shipped_at: '2024-01-01T10:00:00.000Z', shipped_by: 'tester', created_at: '2024-01-01T10:00:00.000Z' },
        { id: 'ship-2', order_id: 'ord-shipped', shipment_number: 2, shipped_at: '2024-01-02T10:00:00.000Z', shipped_by: 'tester', created_at: '2024-01-02T10:00:00.000Z' },
      ],
      items: [
        { id: 'item-1', shipment_id: 'ship-1', sku: 'PN1', variant_suffix: '', size_info: null, cord_color: null, enamel_color: null, quantity: 1, price_at_order: 10 },
        { id: 'item-2', shipment_id: 'ship-2', sku: 'PN2', variant_suffix: '', size_info: null, cord_color: null, enamel_color: null, quantity: 1, price_at_order: 20 },
      ],
    };

    expect(buildLatestShipmentPrintData(order, shipmentSnapshot as any)).toBeNull();

    const payloads = buildShipmentPrintPayloads(order, shipmentSnapshot as any);
    expect(payloads.map((p) => p.shipment.id)).toEqual(['ship-2', 'ship-1']);
    expect(payloads.map((p) => p.shipmentItems)).toHaveLength(2);
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

  it('matches production batch to order item when both use line_id (SP)', () => {
    const itemKey = buildOrderItemIdentityKey({
      sku: 'SP',
      variant_suffix: null,
      size_info: null,
      cord_color: null,
      enamel_color: null,
      line_id: 'sp-line-99',
    });
    const batchKey = buildOrderItemIdentityKey({
      sku: 'SP',
      variant_suffix: undefined,
      size_info: undefined,
      cord_color: null,
      enamel_color: null,
      line_id: 'sp-line-99',
    });
    expect(batchKey).toBe(itemKey);
  });

  it('keeps same SKU note variants separate when line_id is present', () => {
    const notedKey = buildOrderItemIdentityKey({
      sku: 'BDA001',
      variant_suffix: 'XPR',
      size_info: null,
      cord_color: null,
      enamel_color: null,
      line_id: 'note-line',
    });
    const normalKey = buildOrderItemIdentityKey({
      sku: 'BDA001',
      variant_suffix: 'XPR',
      size_info: null,
      cord_color: null,
      enamel_color: null,
      line_id: 'normal-line',
    });

    expect(notedKey).not.toBe(normalKey);
  });
});
