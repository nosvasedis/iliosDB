import { describe, expect, it } from 'vitest';
import { Order, OrderStatus, ProductionStage } from '../../types';
import {
  buildPartialDeliveryProgressSegments,
  getOrderProductionQtyProgress,
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
