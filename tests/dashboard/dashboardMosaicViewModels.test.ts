import { describe, expect, it } from 'vitest';
import { Order, OrderStatus, ProductionStage } from '../../types';
import {
  buildReadyOrdersSummary,
  countReadyOrders,
} from '../../features/dashboard/dashboardMosaicViewModels';

describe('buildReadyOrdersSummary', () => {
  const baseBatch = {
    created_at: '',
    updated_at: '',
    priority: 'Normal' as const,
    requires_setting: false,
  };

  it('returns empty summary when orders are undefined', () => {
    expect(buildReadyOrdersSummary(undefined, [], new Map())).toEqual({
      total: 0,
      fullCount: 0,
      partialCount: 0,
      entries: [],
    });
  });

  it('counts orders with status Ready as full', () => {
    const orders = [
      { id: 'o1', status: OrderStatus.Ready, customer_name: 'A', items: [{ sku: 'X', quantity: 1, price_at_order: 1 }] },
      { id: 'o2', status: OrderStatus.Pending, customer_name: 'B', items: [] },
    ] as Order[];
    const summary = buildReadyOrdersSummary(orders, []);
    expect(summary.total).toBe(1);
    expect(summary.fullCount).toBe(1);
    expect(summary.partialCount).toBe(0);
  });

  it('counts InProduction orders that are 100% ready via batches as full', () => {
    const orders = [
      {
        id: 'o1',
        status: OrderStatus.InProduction,
        customer_name: 'Πελάτης',
        items: [{ sku: 'A', quantity: 2, price_at_order: 10 }],
      },
    ] as Order[];
    const batches = [
      { ...baseBatch, id: 'b1', order_id: 'o1', sku: 'A', quantity: 2, current_stage: ProductionStage.Ready },
    ];
    const summary = buildReadyOrdersSummary(orders, batches);
    expect(summary.total).toBe(1);
    expect(summary.fullCount).toBe(1);
    expect(summary.entries[0]?.readyQty).toBe(2);
  });

  it('counts PartiallyDelivered orders when shipped + ready covers the order', () => {
    const orders = [
      {
        id: 'o1',
        status: OrderStatus.PartiallyDelivered,
        customer_name: 'Μερική',
        items: [{ sku: 'A', quantity: 10, price_at_order: 10 }],
      },
    ] as Order[];
    const batches = [
      { ...baseBatch, id: 'b1', order_id: 'o1', sku: 'A', quantity: 5, current_stage: ProductionStage.Ready },
    ];
    const shippedQty = new Map([['o1', 5]]);
    const summary = buildReadyOrdersSummary(orders, batches, shippedQty);
    expect(summary.total).toBe(1);
    expect(summary.partialCount).toBe(1);
    expect(summary.fullCount).toBe(0);
    expect(summary.entries[0]).toMatchObject({
      kind: 'partial',
      readyQty: 5,
      shippedQty: 5,
      totalQty: 10,
    });
  });

  it('counts PartiallyDelivered when all items shipped and no batches remain', () => {
    const orders = [
      {
        id: 'o1',
        status: OrderStatus.PartiallyDelivered,
        customer_name: 'Ολοκληρωμένη αποστολή',
        items: [{ sku: 'A', quantity: 8, price_at_order: 10 }],
      },
    ] as Order[];
    const shippedQty = new Map([['o1', 8]]);
    const summary = buildReadyOrdersSummary(orders, [], shippedQty);
    expect(summary.total).toBe(1);
    expect(summary.partialCount).toBe(1);
  });

  it('excludes delivered, cancelled, and archived orders', () => {
    const orders = [
      {
        id: 'o1',
        status: OrderStatus.Delivered,
        customer_name: 'A',
        items: [{ sku: 'A', quantity: 1, price_at_order: 10 }],
      },
      {
        id: 'o2',
        status: OrderStatus.Cancelled,
        customer_name: 'B',
        items: [{ sku: 'B', quantity: 1, price_at_order: 10 }],
      },
      {
        id: 'o3',
        status: OrderStatus.Ready,
        customer_name: 'C',
        is_archived: true,
        items: [{ sku: 'C', quantity: 1, price_at_order: 10 }],
      },
    ] as Order[];
    expect(buildReadyOrdersSummary(orders, []).total).toBe(0);
  });

  it('does not count partial orders with incomplete next shipment', () => {
    const orders = [
      {
        id: 'o1',
        status: OrderStatus.PartiallyDelivered,
        customer_name: 'Μερική',
        items: [{ sku: 'A', quantity: 10, price_at_order: 10 }],
      },
    ] as Order[];
    const batches = [
      { ...baseBatch, id: 'b1', order_id: 'o1', sku: 'A', quantity: 3, current_stage: ProductionStage.Ready },
      { ...baseBatch, id: 'b2', order_id: 'o1', sku: 'A', quantity: 2, current_stage: ProductionStage.Polishing },
    ];
    const shippedQty = new Map([['o1', 3]]);
    expect(buildReadyOrdersSummary(orders, batches, shippedQty).total).toBe(0);
  });
});

describe('countReadyOrders', () => {
  it('delegates to buildReadyOrdersSummary', () => {
    const orders = [{ id: 'o1', status: OrderStatus.Ready, customer_name: 'A', items: [] }] as Order[];
    expect(countReadyOrders(orders, [])).toBe(1);
  });
});
