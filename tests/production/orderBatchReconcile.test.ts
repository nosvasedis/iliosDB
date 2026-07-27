import { describe, expect, it } from 'vitest';
import { OrderItem, ProductionBatch, ProductionStage } from '../../types';
import {
  bindProductionLineIds,
  bindLegacyBatchLineIds,
  planNonDuplicateProductionSendItems,
  planLineIdIdentityMorphs,
  planSameSkuIdentitySubstitutions,
  resolveUniqueOrderLineId,
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

  it('binds a legacy batch to the unique existing order line without changing quantities', () => {
    const items: OrderItem[] = [
      { sku: 'RN307', variant_suffix: 'P', size_info: '62', quantity: 1, price_at_order: 100, line_id: 'line-p-62' },
      { sku: 'RN307', variant_suffix: 'D', quantity: 2, price_at_order: 90, line_id: 'line-d' },
    ];
    const batches: ProductionBatch[] = [
      { ...baseBatch, id: 'batch-p', sku: 'RN307', variant_suffix: 'P', size_info: '62', quantity: 1, line_id: null },
      { ...baseBatch, id: 'batch-d', sku: 'RN307', variant_suffix: 'D', quantity: 2, line_id: null },
    ];

    const result = bindLegacyBatchLineIds(items, batches);

    expect(result.unresolvedBatchIds).toEqual([]);
    expect(result.batchLineIdUpdates).toEqual([
      { batchId: 'batch-p', line_id: 'line-p-62' },
      { batchId: 'batch-d', line_id: 'line-d' },
    ]);
    expect(result.batches.map(({ line_id, quantity }) => ({ line_id, quantity }))).toEqual([
      { line_id: 'line-p-62', quantity: 1 },
      { line_id: 'line-d', quantity: 2 },
    ]);
  });

  it('never guesses a line id when the natural identity is ambiguous', () => {
    const items: OrderItem[] = [
      { sku: 'SP001', quantity: 1, price_at_order: 100, line_id: 'line-a' },
      { sku: 'SP001', quantity: 1, price_at_order: 120, line_id: 'line-b' },
    ];
    const batch = { ...baseBatch, id: 'batch-ambiguous', sku: 'SP001', quantity: 1, line_id: null };

    expect(resolveUniqueOrderLineId(batch, items)).toBeNull();
    expect(bindLegacyBatchLineIds(items, [batch])).toEqual({
      batches: [batch],
      batchLineIdUpdates: [],
      unresolvedBatchIds: ['batch-ambiguous'],
    });
  });

  it('uses exact notes only to disambiguate duplicated natural identities', () => {
    const items: OrderItem[] = [
      { sku: 'SP001', quantity: 1, price_at_order: 100, notes: 'Μονόγραμμα Α', line_id: 'line-a' },
      { sku: 'SP001', quantity: 1, price_at_order: 120, notes: 'Μονόγραμμα Β', line_id: 'line-b' },
    ];

    expect(resolveUniqueOrderLineId(
      { sku: 'SP001', notes: '  μονόγραμμα β ', line_id: null },
      items,
    )).toBe('line-b');
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

  it('skips partial production send quantities already covered by existing batches', () => {
    const itemsToSend = [
      { sku: 'DM100', variant: 'X', qty: 16, size_info: '52', line_id: 'line-new' },
    ];
    const existingBatches: ProductionBatch[] = [
      {
        ...baseBatch,
        id: 'batch-existing',
        sku: 'DM100',
        variant_suffix: 'X',
        quantity: 16,
        size_info: '52',
        line_id: 'line-new',
      },
    ];

    expect(planNonDuplicateProductionSendItems(itemsToSend, existingBatches)).toEqual([]);
  });

  it('only sends the missing remainder when an existing batch partially covers a line', () => {
    const itemsToSend = [
      { sku: 'DM100', variant: 'X', qty: 16, size_info: '52', line_id: 'line-new' },
    ];
    const existingBatches: ProductionBatch[] = [
      {
        ...baseBatch,
        id: 'batch-existing',
        sku: 'DM100',
        variant_suffix: 'X',
        quantity: 6,
        size_info: '52',
        line_id: 'line-new',
      },
    ];

    expect(planNonDuplicateProductionSendItems(itemsToSend, existingBatches)).toEqual([
      { sku: 'DM100', variant: 'X', qty: 10, size_info: '52', line_id: 'line-new' },
    ]);
  });
});
