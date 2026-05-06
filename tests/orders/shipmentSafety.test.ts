import { describe, expect, it } from 'vitest';
import { buildTransferPlan } from '../../features/orders/transferHelpers';
import { getReadyToShipItems } from '../../utils/shipmentUtils';
import {
  getDuplicateActiveDeliveryPlanGroups,
  hasBlockingShipmentIssues,
  validateShipmentRequest,
} from '../../utils/shipmentSafety';
import { Order, OrderDeliveryPlan, OrderStatus, ProductionBatch, ProductionStage } from '../../types';

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ORD-1',
    customer_name: 'Demo',
    created_at: '2026-01-01T00:00:00.000Z',
    status: OrderStatus.PartiallyDelivered,
    items: [],
    total_price: 0,
    ...overrides,
  };
}

function readyBatch(overrides: Partial<ProductionBatch>): ProductionBatch {
  return {
    id: overrides.id || crypto.randomUUID(),
    order_id: 'ORD-1',
    sku: 'SP001',
    quantity: 1,
    current_stage: ProductionStage.Ready,
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    priority: 'Normal',
    requires_setting: false,
    ...overrides,
  } as ProductionBatch;
}

describe('shipment safety', () => {
  it('keeps ready-to-ship rows separate by line_id', () => {
    const items = getReadyToShipItems('ORD-1', [
      readyBatch({ id: 'b1', line_id: 'line-a', quantity: 1 }),
      readyBatch({ id: 'b2', line_id: 'line-b', quantity: 2 }),
    ]);

    expect(items).toHaveLength(2);
    expect(items.map((item) => [item.line_id, item.quantity]).sort()).toEqual([
      ['line-a', 1],
      ['line-b', 2],
    ]);
  });

  it('blocks shipment requests that exceed the remaining quantity', () => {
    const o = order({
      items: [{ sku: 'SP001', quantity: 2, price_at_order: 10, line_id: 'line-a' }],
    });

    const issues = validateShipmentRequest(
      o,
      [{ id: 'si1', shipment_id: 's1', sku: 'SP001', quantity: 1, price_at_order: 10, line_id: 'line-a' }],
      [readyBatch({ id: 'b1', line_id: 'line-a', quantity: 2 })],
      [{ sku: 'SP001', quantity: 2, line_id: 'line-a' }],
    );

    expect(hasBlockingShipmentIssues(issues)).toBe(true);
    expect(issues[0].title).toContain('περισσότερα τεμάχια');
    expect(issues[0]).toEqual(expect.objectContaining({ remainingQty: 1, readyQty: 2, selectedQty: 2 }));
  });

  it('blocks transfers when ready quantity does not exactly match the remaining quantity', () => {
    const orderA = order({
      items: [{ sku: 'SP001', quantity: 3, price_at_order: 10, line_id: 'line-a' }],
    });
    const orderB = order({ id: 'ORD-2', status: OrderStatus.InProduction, items: [] });

    const plan = buildTransferPlan(
      orderA,
      orderB,
      { shipments: [], items: [{ id: 'si1', shipment_id: 's1', sku: 'SP001', quantity: 1, price_at_order: 10, line_id: 'line-a' }] },
      [readyBatch({ id: 'b1', line_id: 'line-a', quantity: 1 })],
    );

    expect(plan.isValid).toBe(false);
    expect(plan.quantityIssues).toHaveLength(1);
    expect(plan.quantityIssues[0]).toEqual(expect.objectContaining({ remainingQty: 2, readyQty: 1 }));
  });

  it('blocks transfers when a ready batch has no remaining order line', () => {
    const orderA = order({
      items: [{ sku: 'SP001', quantity: 1, price_at_order: 10, line_id: 'line-a' }],
    });
    const orderB = order({ id: 'ORD-2', status: OrderStatus.InProduction, items: [] });

    const plan = buildTransferPlan(
      orderA,
      orderB,
      { shipments: [], items: [{ id: 'si1', shipment_id: 's1', sku: 'SP001', quantity: 1, price_at_order: 10, line_id: 'line-a' }] },
      [readyBatch({ id: 'orphan', sku: 'SP002', line_id: 'line-b', quantity: 1 })],
    );

    expect(plan.isValid).toBe(false);
    expect(plan.quantityIssues[0].title).toContain('χωρίς αντίστοιχο υπόλοιπο');
  });

  it('detects duplicate active delivery plans per order', () => {
    const plans = [
      { id: 'p1', order_id: 'ORD-1', plan_status: 'active', planning_mode: 'exact', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
      { id: 'p2', order_id: 'ORD-1', plan_status: 'active', planning_mode: 'exact', created_at: '2026-01-02T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z' },
      { id: 'p3', order_id: 'ORD-2', plan_status: 'cancelled', planning_mode: 'exact', created_at: '2026-01-03T00:00:00.000Z', updated_at: '2026-01-03T00:00:00.000Z' },
    ] as OrderDeliveryPlan[];

    const duplicates = getDuplicateActiveDeliveryPlanGroups(plans);

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].orderId).toBe('ORD-1');
    expect(duplicates[0].plans.map((plan) => plan.id)).toEqual(['p1', 'p2']);
  });
});

