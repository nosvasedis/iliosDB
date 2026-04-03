import { describe, expect, it } from 'vitest';
import { ProductionStage } from '../../types';
import { getOrderProductionQtyProgress } from '../../utils/orderReadiness';

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
