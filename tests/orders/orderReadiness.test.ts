import { describe, expect, it } from 'vitest';
import { Order, OrderStatus, ProductionStage } from '../../types';
import {
  buildInProductionCollapsedProgressSegments,
  buildOrderPipelineProductionStageSegments,
  buildOrderProductionStageSegments,
  buildPartialDeliveryProgressSegments,
  getOrderItemProductionStageBreakdown,
  getShipmentReadiness,
  getOrderReadinessPercent,
  isOrderReady,
  isOrderReadyForShipment,
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

describe('isOrderReady', () => {
  const baseBatch = {
    created_at: '',
    updated_at: '',
    priority: 'Normal' as const,
    requires_setting: false,
  };

  it('is false when there are no batches', () => {
    const order = { id: 'o1', items: [{ sku: 'A', quantity: 2, price_at_order: 1 }] } as Order;
    expect(isOrderReady(order, [])).toBe(false);
  });

  it('does not throw when a lightweight cached order has no items array', () => {
    const order = {
      id: 'o1',
      status: OrderStatus.InProduction,
      item_count: 1,
      item_total_qty: 2,
    } as Order;
    const batches = [
      { ...baseBatch, id: 'a', order_id: 'o1', sku: 'A', quantity: 2, current_stage: ProductionStage.Ready },
    ];
    expect(isOrderReady(order, batches)).toBe(false);
    expect(buildInProductionCollapsedProgressSegments(order, batches)).toBeNull();
  });

  it('is false when all batches are Ready but batch qty is less than order lines', () => {
    const order = {
      id: 'o1',
      items: [
        { sku: 'A', quantity: 5, price_at_order: 10 },
        { sku: 'B', quantity: 5, price_at_order: 10 },
      ],
    } as Order;
    const batches = [
      { ...baseBatch, id: 'a', order_id: 'o1', sku: 'A', quantity: 5, current_stage: ProductionStage.Ready },
    ];
    expect(isOrderReady(order, batches)).toBe(false);
  });

  it('is true when batch quantities match order total and every batch is Ready', () => {
    const order = {
      id: 'o1',
      items: [
        { sku: 'A', quantity: 3, price_at_order: 10 },
        { sku: 'B', quantity: 7, price_at_order: 10 },
      ],
    } as Order;
    const batches = [
      { ...baseBatch, id: 'a', order_id: 'o1', sku: 'A', quantity: 3, current_stage: ProductionStage.Ready },
      { ...baseBatch, id: 'b', order_id: 'o1', sku: 'B', quantity: 7, current_stage: ProductionStage.Ready },
    ];
    expect(isOrderReady(order, batches)).toBe(true);
  });

  it('is false when one batch is not Ready even if quantities match', () => {
    const order = { id: 'o1', items: [{ sku: 'A', quantity: 2, price_at_order: 10 }] } as Order;
    const batches = [
      { ...baseBatch, id: 'a', order_id: 'o1', sku: 'A', quantity: 2, current_stage: ProductionStage.Waxing },
    ];
    expect(isOrderReady(order, batches)).toBe(false);
  });

  it('is false when batch total does not match items total', () => {
    const order = { id: 'o1', items: [{ sku: 'A', quantity: 2, price_at_order: 10 }] } as Order;
    const batches = [
      { ...baseBatch, id: 'a', order_id: 'o1', sku: 'A', quantity: 3, current_stage: ProductionStage.Ready },
    ];
    expect(isOrderReady(order, batches)).toBe(false);
  });

  it('is true for PartiallyDelivered when all remaining batches are Ready even if lines sum to original order', () => {
    const order = {
      id: 'o1',
      status: OrderStatus.PartiallyDelivered,
      items: [
        { sku: 'A', quantity: 10, price_at_order: 10 },
        { sku: 'B', quantity: 5, price_at_order: 10 },
      ],
    } as Order;
    const batches = [
      { ...baseBatch, id: 'a', order_id: 'o1', sku: 'B', quantity: 5, current_stage: ProductionStage.Ready },
    ];
    expect(isOrderReady(order, batches)).toBe(true);
  });
});

describe('getOrderReadinessPercent / isOrderReadyForShipment', () => {
  const baseBatch = {
    created_at: '',
    updated_at: '',
    priority: 'Normal' as const,
    requires_setting: false,
  };

  it('treats PartiallyDelivered as 100% when shipped qty plus ready batches cover the order', () => {
    const order = {
      id: 'o1',
      status: OrderStatus.PartiallyDelivered,
      items: [{ sku: 'A', quantity: 10, price_at_order: 10 }],
    } as Order;
    const batches = [
      { ...baseBatch, id: 'b1', order_id: 'o1', sku: 'A', quantity: 5, current_stage: ProductionStage.Ready },
    ];
    expect(getOrderReadinessPercent(order, batches, 5)).toBe(100);
    expect(isOrderReadyForShipment(order, batches, 5)).toBe(true);
  });

  it('is ready for shipment when everything was shipped and no batches remain', () => {
    const order = {
      id: 'o1',
      status: OrderStatus.PartiallyDelivered,
      items: [{ sku: 'A', quantity: 6, price_at_order: 10 }],
    } as Order;
    expect(isOrderReady(order, [])).toBe(false);
    expect(getOrderReadinessPercent(order, [], 6)).toBe(100);
    expect(isOrderReadyForShipment(order, [], 6)).toBe(true);
  });

  it('excludes archived ready orders from shipment readiness', () => {
    const order = {
      id: 'o1',
      status: OrderStatus.Ready,
      is_archived: true,
      items: [{ sku: 'A', quantity: 1, price_at_order: 10 }],
    } as Order;
    expect(isOrderReadyForShipment(order, [])).toBe(false);
  });
});

describe('buildInProductionCollapsedProgressSegments', () => {
  const baseBatch = {
    created_at: '',
    updated_at: '',
    priority: 'Normal' as const,
    requires_setting: false,
  };

  it('uses full order qty as denominator and shows unbatched remainder', () => {
    const order = {
      id: 'o1',
      items: [
        { sku: 'A', quantity: 4, price_at_order: 10 },
        { sku: 'B', quantity: 6, price_at_order: 10 },
      ],
    } as Order;
    const batches = [
      { ...baseBatch, id: 'b1', order_id: 'o1', sku: 'A', quantity: 3, current_stage: ProductionStage.Waxing },
      { ...baseBatch, id: 'b2', order_id: 'o1', sku: 'B', quantity: 2, current_stage: ProductionStage.Ready },
    ];
    const r = buildInProductionCollapsedProgressSegments(order, batches);
    expect(r).not.toBeNull();
    expect(r!.itemsTotal).toBe(10);
    expect(r!.readyPercentVsOrder).toBe(20);
    expect(r!.segments.reduce((s, x) => s + x.pct, 0)).toBe(100);
    expect(r!.segments.find((s) => s.className.includes('emerald'))?.qty).toBe(2);
    expect(r!.segments.find((s) => s.className.includes('amber'))?.qty).toBe(3);
    expect(r!.segments.find((s) => s.className.includes('slate-300'))?.qty).toBe(5);
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
    expect(r!.itemsTotal).toBe(10);
    expect(r!.batchTotal).toBe(8);
    expect(r!.shippedQty).toBe(2);
    expect(r!.readyQty).toBe(2);
    expect(r!.wipQty).toBe(6);
    expect(r!.remainderQty).toBe(0);
  });
});

describe('buildOrderPipelineProductionStageSegments', () => {
  it('distributes 100% across stages using only batch quantities (no unbatched slice)', () => {
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
    const r = buildOrderPipelineProductionStageSegments('o1', batches);
    expect(r).not.toBeNull();
    expect(r!.pipelineQty).toBe(8);
    expect(r!.segments.every((s) => s.kind === 'stage')).toBe(true);
    expect(r!.segments.reduce((s, x) => s + x.pct, 0)).toBe(100);
    expect(r!.segments.find((s) => s.stage === ProductionStage.Ready)?.quantity).toBe(2);
    expect(r!.segments.find((s) => s.stage === ProductionStage.Waxing)?.quantity).toBe(6);
  });

  it('keeps Technician pending and dispatched pipeline quantities separate', () => {
    const batches = [
      {
        id: 'b1',
        order_id: 'o1',
        sku: 'A',
        quantity: 2,
        current_stage: ProductionStage.Polishing,
        pending_dispatch: true,
        created_at: '',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
      },
      {
        id: 'b2',
        order_id: 'o1',
        sku: 'B',
        quantity: 3,
        current_stage: ProductionStage.Polishing,
        pending_dispatch: false,
        created_at: '',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
      },
    ];

    const result = buildOrderPipelineProductionStageSegments('o1', batches);
    expect(result).not.toBeNull();
    expect(result!.segments).toEqual([
      { kind: 'stage', stage: ProductionStage.Polishing, pendingDispatch: true, quantity: 2, pct: 40 },
      { kind: 'stage', stage: ProductionStage.Polishing, pendingDispatch: false, quantity: 3, pct: 60 },
    ]);
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

  it('does not mix production stages for same SKU note variants with different line ids', () => {
    const notedItem = {
      sku: 'BDA001',
      quantity: 1,
      variant_suffix: 'XPR',
      line_id: 'note-line',
    } as Order['items'][number];

    const batches = [
      {
        id: 'noted-batch',
        order_id: 'o1',
        sku: 'BDA001',
        variant_suffix: 'XPR',
        quantity: 1,
        current_stage: ProductionStage.Ready,
        created_at: '',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
        notes: 'KO-PR-KO',
        line_id: 'note-line',
      },
      {
        id: 'normal-batch',
        order_id: 'o1',
        sku: 'BDA001',
        variant_suffix: 'XPR',
        quantity: 1,
        current_stage: ProductionStage.Waxing,
        created_at: '',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
        line_id: 'normal-line',
      },
    ];

    expect(getOrderItemProductionStageBreakdown(notedItem, batches)).toEqual([
      { kind: 'stage', stage: ProductionStage.Ready, quantity: 1 },
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

  it('keeps Technician pending and dispatched order quantities separate', () => {
    const order = {
      id: 'o1',
      items: [
        { sku: 'A', quantity: 2, price_at_order: 10 },
        { sku: 'B', quantity: 3, price_at_order: 10 },
      ],
    } as Order;

    const batches = [
      {
        id: 'b1',
        order_id: 'o1',
        sku: 'A',
        quantity: 2,
        current_stage: ProductionStage.Polishing,
        pending_dispatch: true,
        created_at: '',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
      },
      {
        id: 'b2',
        order_id: 'o1',
        sku: 'B',
        quantity: 3,
        current_stage: ProductionStage.Polishing,
        pending_dispatch: false,
        created_at: '',
        updated_at: '',
        priority: 'Normal',
        requires_setting: false,
      },
    ];

    const result = buildOrderProductionStageSegments(order, batches);
    expect(result).not.toBeNull();
    expect(result!.segments).toEqual([
      { kind: 'stage', stage: ProductionStage.Polishing, pendingDispatch: true, quantity: 2, pct: 40 },
      { kind: 'stage', stage: ProductionStage.Polishing, pendingDispatch: false, quantity: 3, pct: 60 },
    ]);
  });
});
