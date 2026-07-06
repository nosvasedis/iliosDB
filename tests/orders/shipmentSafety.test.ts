import { describe, expect, it } from 'vitest';
import { buildTransferPlan, canOfferRemainingTransfer, getCandidateTransferTargetOrders } from '../../features/orders/transferHelpers';
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

  it('allows a fully Ready order to be transferred into another active order', () => {
    const orderA = order({
      status: OrderStatus.Ready,
      items: [{ sku: 'SP001', quantity: 2, price_at_order: 10, line_id: 'line-a' }],
    });
    const orderB = order({ id: 'ORD-2', status: OrderStatus.InProduction, items: [] });

    const plan = buildTransferPlan(
      orderA,
      orderB,
      { shipments: [], items: [] },
      [readyBatch({ id: 'b1', line_id: 'line-a', quantity: 2 })],
    );

    expect(plan.isValid).toBe(true);
    expect(plan.transferItems).toEqual([
      expect.objectContaining({ sku: 'SP001', quantity: 2, line_id: 'line-a' }),
    ]);
    expect(plan.batchesToRepoint.map((batch) => batch.id)).toEqual(['b1']);
    expect(plan.newOrderBItems).toEqual([
      expect.objectContaining({ sku: 'SP001', quantity: 2, line_id: 'line-a' }),
    ]);
  });

  it('offers remaining transfer for legacy PartiallyDelivered orders', () => {
    const orderA = order({
      items: [{ sku: 'SP001', quantity: 2, price_at_order: 10, line_id: 'line-a' }],
    });

    expect(canOfferRemainingTransfer(orderA, [])).toBe(true);
  });

  it('offers remaining transfer for Ready orders', () => {
    const orderA = order({
      status: OrderStatus.Ready,
      items: [{ sku: 'SP001', quantity: 2, price_at_order: 10, line_id: 'line-a' }],
    });

    expect(canOfferRemainingTransfer(orderA, [])).toBe(true);
  });

  it('offers remaining transfer for production-ready orders even before status catches up', () => {
    const orderA = order({
      status: OrderStatus.InProduction,
      items: [{ sku: 'SP001', quantity: 2, price_at_order: 10, line_id: 'line-a' }],
    });

    expect(canOfferRemainingTransfer(orderA, [], true)).toBe(true);
  });

  it('does not offer remaining transfer for in-production orders without derived readiness or shipment fallback', () => {
    const orderA = order({
      status: OrderStatus.InProduction,
      items: [{ sku: 'SP001', quantity: 2, price_at_order: 10, line_id: 'line-a' }],
    });

    expect(canOfferRemainingTransfer(orderA, [], false)).toBe(false);
  });

  it('builds a valid transfer plan for a production-ready order whose saved status is still in production', () => {
    const orderA = order({
      status: OrderStatus.InProduction,
      items: [{ sku: 'SP001', quantity: 2, price_at_order: 10, line_id: 'line-a' }],
    });
    const orderB = order({ id: 'ORD-2', status: OrderStatus.InProduction, items: [] });

    const plan = buildTransferPlan(
      orderA,
      orderB,
      { shipments: [], items: [] },
      [readyBatch({ id: 'b1', line_id: 'line-a', quantity: 2 })],
    );

    expect(plan.isValid).toBe(true);
    expect(plan.transferItems).toEqual([
      expect.objectContaining({ sku: 'SP001', quantity: 2, line_id: 'line-a' }),
    ]);
    expect(plan.batchesToRepoint.map((batch) => batch.id)).toEqual(['b1']);
  });

  it('finds active same-customer transfer targets sorted newest first', () => {
    const source = order({
      id: 'ORD-A',
      customer_id: 'cust-1',
      customer_name: 'Demo',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const olderTarget = order({
      id: 'ORD-B',
      customer_id: 'cust-1',
      customer_name: 'Demo',
      status: OrderStatus.InProduction,
      created_at: '2026-01-02T00:00:00.000Z',
    });
    const newerTarget = order({
      id: 'ORD-C',
      customer_id: 'cust-1',
      customer_name: 'Demo',
      status: OrderStatus.Pending,
      created_at: '2026-01-03T00:00:00.000Z',
    });
    const closedTarget = order({
      id: 'ORD-D',
      customer_id: 'cust-1',
      customer_name: 'Demo',
      status: OrderStatus.Delivered,
      created_at: '2026-01-04T00:00:00.000Z',
    });
    const otherCustomer = order({
      id: 'ORD-E',
      customer_id: 'cust-2',
      customer_name: 'Other',
      status: OrderStatus.InProduction,
      created_at: '2026-01-05T00:00:00.000Z',
    });

    expect(getCandidateTransferTargetOrders(source, [
      source,
      olderTarget,
      newerTarget,
      closedTarget,
      otherCustomer,
    ]).map((candidate) => candidate.id)).toEqual(['ORD-C', 'ORD-B']);
  });

  it('offers remaining transfer when shipment history has unshipped items despite status drift', () => {
    const orderA = order({
      status: OrderStatus.Ready,
      items: [{ sku: 'SP001', quantity: 2, price_at_order: 10, line_id: 'line-a' }],
    });

    expect(canOfferRemainingTransfer(orderA, [
      { id: 'si1', shipment_id: 's1', sku: 'SP001', quantity: 1, price_at_order: 10, line_id: 'line-a' },
    ])).toBe(true);
  });

  it('does not offer remaining transfer for closed orders', () => {
    const orderA = order({
      status: OrderStatus.Delivered,
      items: [{ sku: 'SP001', quantity: 2, price_at_order: 10, line_id: 'line-a' }],
    });

    expect(canOfferRemainingTransfer(orderA, [
      { id: 'si1', shipment_id: 's1', sku: 'SP001', quantity: 1, price_at_order: 10, line_id: 'line-a' },
    ])).toBe(false);
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

