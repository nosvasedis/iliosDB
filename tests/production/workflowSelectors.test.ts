import { describe, expect, it } from 'vitest';
import { Gender, ProductionStage, ProductionType } from '../../types';
import {
  buildLabelPrintQueue,
  getNextProductionStage,
  groupProductionBatchesByStage,
  groupProductionBatchesForDisplay,
} from '../../features/production/workflowSelectors';

describe('production workflow selectors', () => {
  it('resolves next stages including skipped and imported flows', () => {
    expect(getNextProductionStage(ProductionStage.AwaitingDelivery, {
      id: 'b1',
      sku: 'PN1',
      quantity: 1,
      current_stage: ProductionStage.AwaitingDelivery,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      priority: 'Normal',
      requires_setting: false,
      product_details: { production_type: ProductionType.Imported } as any,
    })).toBe(ProductionStage.Labeling);

    expect(getNextProductionStage(ProductionStage.Casting, {
      id: 'b2',
      sku: 'PN2',
      quantity: 1,
      current_stage: ProductionStage.Casting,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      priority: 'Normal',
      requires_setting: false,
      requires_assembly: false,
    })).toBe(ProductionStage.Polishing);
  });

  it('groups batches by stage and display hierarchy', () => {
    const batches = [
      {
        id: 'b1',
        sku: 'PN2',
        quantity: 1,
        current_stage: ProductionStage.Waxing,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: true,
        product_details: { gender: Gender.Women, collections: [1] } as any,
      },
      {
        id: 'b2',
        sku: 'PN1',
        quantity: 2,
        current_stage: ProductionStage.Waxing,
        created_at: '2024-01-02T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: true,
        product_details: { gender: Gender.Women, collections: [1] } as any,
      },
    ] as any;

    const byStage = groupProductionBatchesByStage(batches);
    const byDisplay = groupProductionBatchesForDisplay(
      batches,
      new Map([[1, { name: 'Spring' }]]),
      'gender',
      'alpha',
    );

    expect(byStage.Waxing).toHaveLength(2);
    expect(byDisplay[Gender.Women].Spring.map((batch) => batch.sku)).toEqual(['PN1', 'PN2']);
  });

  it('builds label print queues in customer order', () => {
    const products = new Map([
      ['PN1', { sku: 'PN1', variants: [{ suffix: '', description: 'Lustre', stock_qty: 0 }] }],
    ] as any);

    const queue = buildLabelPrintQueue([
      {
        id: 'b1',
        sku: 'PN1',
        quantity: 2,
        current_stage: ProductionStage.Ready,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: false,
        customer_name: 'Zeta',
      },
      {
        id: 'b2',
        sku: 'PN1',
        quantity: 1,
        current_stage: ProductionStage.Ready,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        priority: 'Normal',
        requires_setting: false,
        customer_name: 'Alpha',
      },
    ] as any, 'customer', products);

    expect(queue.map((item) => item.quantity)).toEqual([1, 2]);
  });
});
