import { describe, expect, it } from 'vitest';
import { Order, OrderStatus, ProductionStage } from '../../types';
import {
  buildOrderProductionStageSegments,
  buildPartialDeliveryProgressSegments,
  getOrderItemProductionStageBreakdown,
  getOrderProductionQtyProgress,
  getShipmentReadiness,
  orderStatusShowsProductionProgress,
} from '../../utils/orderReadiness';

describe('orderStatusShowsProductionProgress', () => {
  it('is true for in-production and partial delivery', () => {
    expect(orderStatusShowsProductionProgress(OrderStatus.InProduction)).toBe(true);
    expect(orderStatusShowsProductionProgress(OrderStatus.PartiallyDelivered)).toBe(true);
    expect(orderStatusShowsProductionProgress(OrderStatus.Pending)).toBe(false);
    expect(orderStatusShowsProductionProgress(OrderStatus.Delivered)).toBe(false);
  });
});

describe('buildPartialDeliveryProgressSegments', () => {
  it('splits shipped vs ready vs wip from order lines and batches', () => {
    const order = {
      id: 'o1',
      items: [
        { sku: 'A', quantity: 4, price_at_order: 10 },
        { sku: 'B', quantity: 6, price_at_order: 10 },
      ],
    } as Order;

    const batches = [
      {
        id: 'b1',
        order_id: 'o1',
        sku: 'A',
        quantity: 2,
        current_stage: ProductionStage.Ready,
        created_at: '',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
      },
      {
        id: 'b2',
        order_id: 'o1',
        sku: 'B',
        quantity: 6,
        current_stage: ProductionStage.Waxing,
        created_at: '',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
      },
    ];

    const r = buildPartialDeliveryProgressSegments(order, batches);
    expect(r).not.toBeNull();
    expect(r!.segments.reduce((s, x) => s + x.pct, 0)).toBe(100);
    expect(r!.segments.some((s) => s.className.includes('slate-600') && s.qty === 2)).toBe(true);
    expect(r!.segments.some((s) => s.qty === 2 && s.className.includes('emerald'))).toBe(true);
    expect(r!.segments.some((s) => s.qty === 6 && s.className.includes('amber'))).toBe(true);
  });
});

describe('getOrderProductionQtyProgress', () => {
  it('returns zero when there are no batches for the order', () => {
    expect(getOrderProductionQtyProgress('o1', [])).toEqual({ readyQty: 0, totalQty: 0, percent: 0 });
    expect(
      getOrderProductionQtyProgress('o1', [
        {
          id: '1',
          order_id: 'o2',
          sku: 'X',
          quantity: 5,
          current_stage: ProductionStage.Ready,
          created_at: '',
          updated_at: '',
          priority: 'Normal',
          requires_setting: false,
        },
      ])
    ).toEqual({ readyQty: 0, totalQty: 0, percent: 0 });
  });

  it('weights by quantity and rounds percent', () => {
    const batches = [
      {
        id: 'a',
        order_id: 'o1',
        sku: 'A',
        quantity: 3,
        current_stage: ProductionStage.Ready,
        created_at: '',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
      },
      {
        id: 'b',
        order_id: 'o1',
        sku: 'B',
        quantity: 7,
        current_stage: ProductionStage.Waxing,
        created_at: '',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
      },
    ];
    expect(getOrderProductionQtyProgress('o1', batches)).toEqual({ readyQty: 3, totalQty: 10, percent: 30 });
  });
});

describe('getOrderItemProductionStageBreakdown', () => {
  it('groups matching batches by stage and keeps any unbatched remainder', () => {
    const item = {
      sku: 'A',
      quantity: 6,
      variant_suffix: 'X',
      size_info: '54',
      line_id: 'line-1',
    } as Order['items'][number];

    const batches = [
      {
        id: 'b1',
        order_id: 'o1',
        sku: 'A',
        variant_suffix: 'X',
        size_info: '54',
        quantity: 2,
        current_stage: ProductionStage.Waxing,
        created_at: '',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
        line_id: 'line-1',
      },
      {
        id: 'b2',
        order_id: 'o1',
        sku: 'A',
        variant_suffix: 'X',
        size_info: '54',
        quantity: 1,
        current_stage: ProductionStage.Casting,
        created_at: '',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
        line_id: 'line-1',
      },
    ];

    expect(getOrderItemProductionStageBreakdown(item, batches)).toEqual([
      { kind: 'stage', stage: ProductionStage.Waxing, quantity: 2 },
      { kind: 'stage', stage: ProductionStage.Casting, quantity: 1 },
      { kind: 'unbatched', quantity: 3 },
    ]);
  });
});

describe('getShipmentReadiness', () => {
  it('aggregates τεμάχια (quantities), not just batch counts', () => {
    const batches = [
      {
        id: 'a',
        order_id: 'o1',
        sku: 'X',
        quantity: 10,
        current_stage: ProductionStage.Ready,
        created_at: '2025-01-01T10:00:00.000Z',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
      },
      {
        id: 'b',
        order_id: 'o1',
        sku: 'Y',
        quantity: 3,
        current_stage: ProductionStage.Waxing,
        created_at: '2025-01-01T10:00:00.000Z',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
      },
      {
        id: 'c',
        order_id: 'o1',
        sku: 'Z',
        quantity: 7,
        current_stage: ProductionStage.Casting,
        created_at: '2025-01-02T11:00:00.000Z',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
      },
    ];
    const r = getShipmentReadiness('o1', batches);
    expect(r.total_batches).toBe(3);
    expect(r.ready_batches).toBe(1);
    expect(r.total_qty).toBe(20);
    expect(r.ready_qty).toBe(10);
    expect(r.ready_fraction).toBeCloseTo(0.5);
    expect(r.shipments).toHaveLength(2);
    const first = r.shipments[0];
    expect(first.total).toBe(2);
    expect(first.ready).toBe(1);
    expect(first.total_qty).toBe(13);
    expect(first.ready_qty).toBe(10);
  });
});

describe('buildOrderProductionStageSegments', () => {
  it('builds stage-based order segments and distributes the full 100%', () => {
    const order = {
      id: 'o1',
      items: [
        { sku: 'A', quantity: 4, price_at_order: 10 },
        { sku: 'B', quantity: 6, price_at_order: 10 },
      ],
    } as Order;

    const batches = [
      {
        id: 'b1',
        order_id: 'o1',
        sku: 'A',
        quantity: 3,
        current_stage: ProductionStage.Waxing,
        created_at: '',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
      },
      {
        id: 'b2',
        order_id: 'o1',
        sku: 'B',
        quantity: 2,
        current_stage: ProductionStage.Ready,
        created_at: '',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
      },
    ];

    const result = buildOrderProductionStageSegments(order, batches);
    expect(result).not.toBeNull();
    expect(result!.totalQty).toBe(10);
    expect(result!.assignedQty).toBe(5);
    expect(result!.segments.reduce((sum, segment) => sum + segment.pct, 0)).toBe(100);
    expect(result!.segments).toEqual([
      { kind: 'stage', stage: ProductionStage.Waxing, quantity: 3, pct: 30 },
      { kind: 'stage', stage: ProductionStage.Ready, quantity: 2, pct: 20 },
      { kind: 'unbatched', quantity: 5, pct: 50 },
    ]);
  });
});
