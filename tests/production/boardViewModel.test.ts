import { describe, expect, it } from 'vitest';
import { Gender, MaterialType, OrderStatus, ProductionStage } from '../../types';
import {
  buildBatchesByOrderId,
  buildProductionAssemblyCandidates,
  buildProductionHealthSummary,
  buildProductionQuickPickEntries,
  buildProductionTimingSnapshots,
  enrichProductionBatchesForBoard,
} from '../../features/production/boardViewModel';
import { buildLabelPrintQueue as buildWorkflowLabelPrintQueue } from '../../features/production/workflowSelectors';
import { buildBatchStageHistoryMap } from '../../features/production/selectors';

describe('production board view model', () => {
  const product = {
    sku: 'RZ1',
    gender: Gender.Women,
    image_url: 'https://example.test/pn1.jpg',
    recipe: [{ type: 'raw', id: 'stone-1', quantity: 1 }],
    collections: [1],
    variants: [],
  } as any;

  const order = {
    id: 'ord-1',
    customer_id: 'cust-1',
    customer_name: 'Ada',
    status: OrderStatus.InProduction,
    notes: 'rush',
    items: [
      {
        sku: 'RZ1',
        variant_suffix: '',
        quantity: 3,
        price_at_order: 12,
        price_override: true,
      },
    ],
    created_at: '2024-01-03T00:00:00.000Z',
    is_archived: false,
  } as any;

  const batches = [
    {
      id: 'b-ready',
      order_id: 'ord-1',
      sku: 'RZ1',
      variant_suffix: '',
      quantity: 1,
      current_stage: ProductionStage.Ready,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      priority: 'Normal',
      requires_setting: false,
    },
    {
      id: 'b-polish',
      order_id: 'ord-1',
      sku: 'RZ1',
      variant_suffix: '',
      quantity: 1,
      current_stage: ProductionStage.Polishing,
      pending_dispatch: true,
      created_at: '2024-01-02T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z',
      priority: 'Normal',
      requires_setting: false,
    },
  ] as any;

  it('enriches batches without requiring timing recalculation', () => {
    const enriched = enrichProductionBatchesForBoard(
      batches,
      new Map([['RZ1', product]]),
      new Map([['stone-1', { id: 'stone-1', name: 'LE stone', type: MaterialType.Stone } as any]]),
      new Map([['ord-1', order]]),
    );

    expect(enriched[0]).toEqual(expect.objectContaining({
      customer_name: 'Ada',
      product_image: product.image_url,
      requires_setting: true,
      requires_assembly: true,
      overridden_price: 12,
    }));
    expect(enriched[0].timingLabel).toBeUndefined();
  });

  it('carries order item size into production label print items when batch size is missing', () => {
    const sizedProduct = {
      ...product,
      sku: 'DA100',
      prefix: 'DA',
      variants: [{ suffix: '', description: 'Lustre', stock_qty: 0, selling_price: 40 }],
      selling_price: 40,
    } as any;
    const sizedOrder = {
      ...order,
      items: [
        {
          sku: 'DA100',
          variant_suffix: '',
          quantity: 1,
          price_at_order: 35,
          price_override: true,
          size_info: '58',
        },
      ],
    } as any;
    const sizedBatch = {
      ...batches[0],
      sku: 'DA100',
      quantity: 1,
      size_info: undefined,
    } as any;

    const enriched = enrichProductionBatchesForBoard(
      [sizedBatch],
      new Map([['DA100', sizedProduct]]),
      new Map(),
      new Map([['ord-1', sizedOrder]]),
    );
    const labelItems = buildWorkflowLabelPrintQueue(enriched, 'as_sent', new Map([['DA100', sizedProduct]]));

    expect(enriched[0].size_info).toBe('58');
    expect(labelItems[0]).toEqual(expect.objectContaining({ size: '58' }));
  });

  it('tolerates production-board orders whose items are temporarily missing', () => {
    const partialOrder = { ...order, items: undefined } as any;
    const enriched = enrichProductionBatchesForBoard(
      batches,
      new Map([['RZ1', product]]),
      new Map([['stone-1', { id: 'stone-1', name: 'LE stone', type: MaterialType.Stone } as any]]),
      new Map([['ord-1', partialOrder]]),
    );
    const byOrder = buildBatchesByOrderId(enriched);

    expect(enriched).toHaveLength(2);
    expect(enriched[0].customer_name).toBe('Ada');
    expect(enriched[0].overridden_price).toBeUndefined();
    expect(buildProductionAssemblyCandidates([partialOrder], enriched, byOrder)).toEqual([]);
  });

  it('builds quick-pick totals and assembly candidates from shared order buckets', () => {
    const enriched = enrichProductionBatchesForBoard(
      batches,
      new Map([['RZ1', product]]),
      new Map([['stone-1', { id: 'stone-1', name: 'LE stone', type: MaterialType.Stone } as any]]),
      new Map([['ord-1', order]]),
    );
    const byOrder = buildBatchesByOrderId(enriched);
    const quickPick = buildProductionQuickPickEntries([order], byOrder);
    const assembly = buildProductionAssemblyCandidates([order], enriched, byOrder);

    expect(quickPick).toHaveLength(1);
    expect(quickPick[0]).toEqual(expect.objectContaining({
      batchesCount: 2,
      totalQty: 2,
      readyQty: 1,
      inProgressQty: 1,
    }));
    expect(quickPick[0].stageBreakdown[ProductionStage.Polishing]).toBe(1);

    expect(assembly).toHaveLength(1);
    expect(assembly[0].totalAssemblyQty).toBe(2);
    expect(assembly[0].polishingPendingQty).toBe(1);
  });

  it('computes timing snapshots separately from static batch enrichment', () => {
    const enriched = enrichProductionBatchesForBoard(
      batches,
      new Map([['RZ1', product]]),
      new Map([['stone-1', { id: 'stone-1', name: 'LE stone', type: MaterialType.Stone } as any]]),
      new Map([['ord-1', order]]),
    );
    const history = buildBatchStageHistoryMap([
      {
        id: 'h1',
        batch_id: 'b-polish',
        from_stage: ProductionStage.Casting,
        to_stage: ProductionStage.Polishing,
        moved_at: '2024-01-10T00:00:00.000Z',
        moved_by: 'Tester',
      } as any,
    ]);

    const timing = buildProductionTimingSnapshots(enriched, history, new Date('2024-01-11T12:00:00.000Z').getTime());
    const health = buildProductionHealthSummary(enriched, timing);

    expect(timing.get('b-polish')?.stageEnteredAt).toBe('2024-01-10T00:00:00.000Z');
    expect(health.ready).toBe(1);
    expect(health.inProgress).toBe(1);
  });
});
