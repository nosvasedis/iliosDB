import { describe, expect, it } from 'vitest';
import { OrderItem, ProductionBatch, ProductionStage } from '../../types';
import {
  bindProductionLineIds,
  planLineIdIdentityMorphs,
  planSameSkuIdentitySubstitutions,
} from '../../features/production/orderBatchReconcile';

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

describe('order batch reconciliation planning', () => {
  it('binds line ids to legacy batches that share the same catalog identity', () => {
    const items: OrderItem[] = [
      { sku: 'DA082', variant_suffix: 'HSB', quantity: 1, price_at_order: 100 },
    ];
    const batches: ProductionBatch[] = [
      { ...baseBatch, id: 'batch-1', sku: 'DA082', variant_suffix: 'HSB', quantity: 1 },
    ];

    const result = bindProductionLineIds(items, batches);
    expect(result.items[0].line_id).toBeTruthy();
    expect(result.batchLineIdUpdates).toEqual([{ batchId: 'batch-1', line_id: result.items[0].line_id }]);
  });

  it('plans a line-id morph when catalog identity changes on the same row', () => {
    const item: OrderItem = {
      sku: 'DA082',
      variant_suffix: 'HMAX',
      quantity: 1,
      price_at_order: 100,
      line_id: 'line-1',
    };
    const batches: ProductionBatch[] = [
      {
        ...baseBatch,
        id: 'batch-1',
        sku: 'DA082',
        variant_suffix: 'HSB',
        quantity: 1,
        line_id: 'line-1',
      },
    ];

    expect(planLineIdIdentityMorphs([item], batches)).toEqual([{ batchId: 'batch-1', item }]);
  });

  it('plans a same-SKU substitution morph for legacy rows without line ids', () => {
    const items: OrderItem[] = [
      { sku: 'DA082', variant_suffix: 'HMAX', quantity: 1, price_at_order: 100 },
    ];
    const batches: ProductionBatch[] = [
      { ...baseBatch, id: 'batch-1', sku: 'DA082', variant_suffix: 'HSB', quantity: 1 },
    ];

    expect(planSameSkuIdentitySubstitutions(items, batches, {})).toEqual([
      {
        batchIds: ['batch-1'],
        item: items[0],
        quantity: 1,
      },
    ]);
  });

  it('does not substitute when surplus and deficit are different master SKUs', () => {
    const items: OrderItem[] = [
      { sku: 'RN100', variant_suffix: 'X', quantity: 1, price_at_order: 50 },
    ];
    const batches: ProductionBatch[] = [
      { ...baseBatch, id: 'batch-1', sku: 'DA082', variant_suffix: 'HSB', quantity: 1 },
    ];

    expect(planSameSkuIdentitySubstitutions(items, batches, {})).toEqual([]);
  });

  it('does not substitute when multiple orphan surplus groups exist', () => {
    const items: OrderItem[] = [
      { sku: 'DA082', variant_suffix: 'HMAX', quantity: 1, price_at_order: 100 },
      { sku: 'DA091', variant_suffix: 'XPR', quantity: 1, price_at_order: 120 },
    ];
    const batches: ProductionBatch[] = [
      { ...baseBatch, id: 'batch-1', sku: 'DA082', variant_suffix: 'HSB', quantity: 1 },
      { ...baseBatch, id: 'batch-2', sku: 'DA091', variant_suffix: 'X', quantity: 1 },
    ];

    expect(planSameSkuIdentitySubstitutions(items, batches, {})).toEqual([]);
  });
});
