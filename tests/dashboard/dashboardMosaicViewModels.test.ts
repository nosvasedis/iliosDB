import { describe, expect, it } from 'vitest';
import { Order, OrderStatus, ProductionStage } from '../../types';
import { countReadyOrders } from '../../features/dashboard/dashboardMosaicViewModels';

describe('countReadyOrders', () => {
  const baseBatch = {
    created_at: '',
    updated_at: '',
    priority: 'Normal' as const,
    requires_setting: false,
  };

  it('returns 0 when orders are undefined', () => {
    expect(countReadyOrders(undefined, [])).toBe(0);
  });

  it('counts orders with status Ready', () => {
    const orders = [
      { id: 'o1', status: OrderStatus.Ready, items: [] },
      { id: 'o2', status: OrderStatus.Pending, items: [] },
    ] as Order[];
    expect(countReadyOrders(orders, [])).toBe(1);
  });

  it('counts InProduction orders that are 100% ready via batches', () => {
    const orders = [
      {
        id: 'o1',
        status: OrderStatus.InProduction,
        items: [{ sku: 'A', quantity: 2, price_at_order: 10 }],
      },
    ] as Order[];
    const batches = [
      { ...baseBatch, id: 'b1', order_id: 'o1', sku: 'A', quantity: 2, current_stage: ProductionStage.Ready },
    ];
    expect(countReadyOrders(orders, batches)).toBe(1);
  });

  it('excludes delivered and cancelled orders even when batches are ready', () => {
    const orders = [
      {
        id: 'o1',
        status: OrderStatus.Delivered,
        items: [{ sku: 'A', quantity: 1, price_at_order: 10 }],
      },
      {
        id: 'o2',
        status: OrderStatus.Cancelled,
        items: [{ sku: 'B', quantity: 1, price_at_order: 10 }],
      },
    ] as Order[];
    const batches = [
      { ...baseBatch, id: 'b1', order_id: 'o1', sku: 'A', quantity: 1, current_stage: ProductionStage.Ready },
      { ...baseBatch, id: 'b2', order_id: 'o2', sku: 'B', quantity: 1, current_stage: ProductionStage.Ready },
    ];
    expect(countReadyOrders(orders, batches)).toBe(0);
  });

  it('does not count orders with incomplete production', () => {
    const orders = [
      {
        id: 'o1',
        status: OrderStatus.InProduction,
        items: [{ sku: 'A', quantity: 5, price_at_order: 10 }],
      },
    ] as Order[];
    const batches = [
      { ...baseBatch, id: 'b1', order_id: 'o1', sku: 'A', quantity: 3, current_stage: ProductionStage.Ready },
      { ...baseBatch, id: 'b2', order_id: 'o1', sku: 'A', quantity: 2, current_stage: ProductionStage.Polishing },
    ];
    expect(countReadyOrders(orders, batches)).toBe(0);
  });
});
