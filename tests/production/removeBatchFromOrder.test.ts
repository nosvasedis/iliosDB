import { describe, expect, it } from 'vitest';
import { Order, OrderItem, OrderStatus, ProductionBatch, ProductionStage } from '../../types';
import { calculateOrderFinancials } from '../../features/orders/orderFinancials';
import { planRemoveProductionBatchFromOrder } from '../../features/production/removeBatchFromOrder';

const baseBatch = {
  order_id: 'ORD-1',
  created_at: '2026-01-01T10:00:00.000Z',
  updated_at: '2026-01-01T10:00:00.000Z',
  priority: 'Normal' as const,
  type: 'Νέα' as const,
  requires_setting: false,
  requires_assembly: false,
  current_stage: ProductionStage.Waxing,
};

function orderWith(items: OrderItem[], overrides: Partial<Order> = {}): Order {
  const vatRate = overrides.vat_rate ?? 0.24;
  const discountPercent = overrides.discount_percent ?? 0;
  return {
    id: 'ORD-1',
    customer_name: 'Πελάτης',
    created_at: '2026-01-01T00:00:00.000Z',
    status: OrderStatus.InProduction,
    vat_rate: vatRate,
    discount_percent: discountPercent,
    total_price: calculateOrderFinancials(items, discountPercent, vatRate).payableNow,
    items,
    ...overrides,
  };
}

function saleLine(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    sku: 'PN040',
    variant_suffix: 'H',
    quantity: 2,
    price_at_order: 100,
    line_id: 'line-sale',
    fulfillment_mode: 'sale',
    ...overrides,
  };
}

describe('planRemoveProductionBatchFromOrder', () => {
  it('reduces the matching line_id quantity and recalculates sale payableNow', () => {
    const items = [
      saleLine({ quantity: 3 }),
      saleLine({ sku: 'PN041', line_id: 'line-keep', quantity: 1, price_at_order: 50 }),
    ];
    const order = orderWith(items, { discount_percent: 10, vat_rate: 0.24 });
    const batch: ProductionBatch = {
      ...baseBatch,
      id: 'batch-1',
      sku: 'PN040',
      variant_suffix: 'H',
      quantity: 1,
      line_id: 'line-sale',
    };

    const result = planRemoveProductionBatchFromOrder(order, batch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removedLine).toBe(false);
    expect(result.previousQty).toBe(3);
    expect(result.nextQty).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ line_id: 'line-sale', quantity: 2, price_at_order: 100 });
    expect(result.items[1]).toEqual(items[1]);
    expect(result.total_price).toBe(
      calculateOrderFinancials(result.items, 10, 0.24).payableNow,
    );
    expect(result.total_price).toBeCloseTo(279, 8);
  });

  it('drops the line when the remaining quantity is zero', () => {
    const items = [
      saleLine({ quantity: 1 }),
      saleLine({ sku: 'PN041', line_id: 'line-keep', quantity: 1, price_at_order: 80 }),
    ];
    const order = orderWith(items);
    const batch: ProductionBatch = {
      ...baseBatch,
      id: 'batch-1',
      sku: 'PN040',
      variant_suffix: 'H',
      quantity: 1,
      line_id: 'line-sale',
    };

    const result = planRemoveProductionBatchFromOrder(order, batch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removedLine).toBe(true);
    expect(result.previousQty).toBe(1);
    expect(result.nextQty).toBe(0);
    expect(result.items).toEqual([items[1]]);
    expect(result.total_price).toBe(calculateOrderFinancials(result.items, 0, 0.24).payableNow);
  });

  it('matches a unique legacy batch without line_id to the only catalog line', () => {
    const items = [
      saleLine({ line_id: 'line-unique', quantity: 2, size_info: '54' }),
      saleLine({ sku: 'PN041', line_id: 'line-other', quantity: 1, price_at_order: 40 }),
    ];
    const order = orderWith(items);
    const batch: ProductionBatch = {
      ...baseBatch,
      id: 'batch-legacy',
      sku: 'PN040',
      variant_suffix: 'H',
      quantity: 1,
      size_info: '54',
      line_id: null,
    };

    const result = planRemoveProductionBatchFromOrder(order, batch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0]).toMatchObject({ line_id: 'line-unique', quantity: 1 });
    expect(result.items[1]).toEqual(items[1]);
  });

  it('refuses to guess when duplicate catalog identities have no unique line', () => {
    const items = [
      saleLine({ sku: 'SP001', variant_suffix: undefined, line_id: 'line-a', notes: 'Α' }),
      saleLine({ sku: 'SP001', variant_suffix: undefined, line_id: 'line-b', notes: 'Β' }),
    ];
    const order = orderWith(items);
    const batch: ProductionBatch = {
      ...baseBatch,
      id: 'batch-ambiguous',
      sku: 'SP001',
      quantity: 1,
      line_id: null,
    };

    expect(planRemoveProductionBatchFromOrder(order, batch)).toEqual({
      ok: false,
      reason: 'line_not_found',
    });
  });

  it('refuses when the remaining line quantity would fall below shipped qty', () => {
    const items = [saleLine({ quantity: 2 }), saleLine({ sku: 'PN041', line_id: 'line-keep', quantity: 1 })];
    const order = orderWith(items);
    const batch: ProductionBatch = {
      ...baseBatch,
      id: 'batch-1',
      sku: 'PN040',
      variant_suffix: 'H',
      quantity: 2,
      line_id: 'line-sale',
    };

    expect(planRemoveProductionBatchFromOrder(order, batch, { 'line-sale': 1 })).toEqual({
      ok: false,
      reason: 'would_go_below_shipped',
    });
  });

  it('refuses when deleting the last remaining line would empty the order', () => {
    const order = orderWith([saleLine({ quantity: 1 })]);
    const batch: ProductionBatch = {
      ...baseBatch,
      id: 'batch-1',
      sku: 'PN040',
      variant_suffix: 'H',
      quantity: 1,
      line_id: 'line-sale',
    };

    expect(planRemoveProductionBatchFromOrder(order, batch)).toEqual({
      ok: false,
      reason: 'would_empty_order',
    });
  });

  it('reduces a consignment line without changing sale total_price', () => {
    const items = [
      saleLine({ quantity: 1, price_at_order: 80 }),
      {
        sku: 'CONS-1',
        quantity: 3,
        price_at_order: 50,
        line_id: 'line-cons',
        fulfillment_mode: 'consignment' as const,
      },
    ];
    const order = orderWith(items);
    const previousTotal = order.total_price;
    const batch: ProductionBatch = {
      ...baseBatch,
      id: 'batch-cons',
      sku: 'CONS-1',
      quantity: 2,
      line_id: 'line-cons',
      workflow_kind: 'consignment',
    };

    const result = planRemoveProductionBatchFromOrder(order, batch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.find((item) => item.line_id === 'line-cons')?.quantity).toBe(1);
    expect(result.total_price).toBe(previousTotal);
    expect(result.total_price).toBe(calculateOrderFinancials(result.items, 0, 0.24).payableNow);
  });

  it('refuses repair batches instead of mutating the order catalog', () => {
    const order = orderWith([saleLine(), saleLine({ sku: 'PN041', line_id: 'line-keep', quantity: 1 })]);
    const batch: ProductionBatch = {
      ...baseBatch,
      id: 'batch-repair',
      sku: 'PN040',
      variant_suffix: 'H',
      quantity: 1,
      line_id: 'line-sale',
      workflow_kind: 'repair',
      repair_item_id: 'repair-1',
    };

    expect(planRemoveProductionBatchFromOrder(order, batch)).toEqual({
      ok: false,
      reason: 'repair_batch',
    });
  });

  it('refuses when the batch quantity exceeds the current line quantity', () => {
    const order = orderWith([
      saleLine({ quantity: 1 }),
      saleLine({ sku: 'PN041', line_id: 'line-keep', quantity: 1 }),
    ]);
    const batch: ProductionBatch = {
      ...baseBatch,
      id: 'batch-1',
      sku: 'PN040',
      variant_suffix: 'H',
      quantity: 2,
      line_id: 'line-sale',
    };

    expect(planRemoveProductionBatchFromOrder(order, batch)).toEqual({
      ok: false,
      reason: 'batch_qty_exceeds_line',
    });
  });
});
