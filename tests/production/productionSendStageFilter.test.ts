import { describe, expect, it } from 'vitest';
import { ProductionStage } from '../../types';
import {
  PRODUCTION_SEND_STAGE_FILTER_ALL,
  batchMatchesProductionSendStageFilter,
  buildProductionSendStageFilterOptions,
  filterBatchesByProductionSendStage,
  filterProductionSendRowsByStage,
} from '../../features/production/productionSendStageFilter';

const batch = (
  overrides: {
    current_stage: ProductionStage;
    pending_dispatch?: boolean;
    quantity?: number;
    id?: string;
  },
) => ({
  id: overrides.id ?? 'b1',
  quantity: overrides.quantity ?? 1,
  current_stage: overrides.current_stage,
  pending_dispatch: overrides.pending_dispatch,
});

const row = (
  sku: string,
  batchDetails: ReturnType<typeof batch>[],
) => ({ sku, batchDetails });

describe('production send stage filters', () => {
  it('keeps Τεχνίτης pending and dispatched as separate selectable filters', () => {
    const pending = batch({ current_stage: ProductionStage.Polishing, pending_dispatch: true, quantity: 2 });
    const dispatched = batch({ current_stage: ProductionStage.Polishing, pending_dispatch: false, quantity: 3 });

    expect(batchMatchesProductionSendStageFilter(pending, 'Polishing:pending')).toBe(true);
    expect(batchMatchesProductionSendStageFilter(pending, 'Polishing:dispatched')).toBe(false);
    expect(batchMatchesProductionSendStageFilter(dispatched, 'Polishing:dispatched')).toBe(true);
    expect(batchMatchesProductionSendStageFilter(dispatched, 'Polishing:pending')).toBe(false);
    expect(batchMatchesProductionSendStageFilter(pending, ProductionStage.Polishing as never)).toBe(false);
  });

  it('shows only products that have a batch in the selected stage', () => {
    const rows = [
      row('PN001', [batch({ current_stage: ProductionStage.Waxing, quantity: 2 })]),
      row('PN002', [batch({ current_stage: ProductionStage.Casting, quantity: 1 })]),
      row('PN003', [
        batch({ id: 'w', current_stage: ProductionStage.Waxing, quantity: 1 }),
        batch({ id: 'c', current_stage: ProductionStage.Casting, quantity: 4 }),
      ]),
      row('PN004', []),
    ];

    const waxing = filterProductionSendRowsByStage(rows, ProductionStage.Waxing);
    expect(waxing.map((item) => item.sku)).toEqual(['PN001', 'PN003']);

    const all = filterProductionSendRowsByStage(rows, PRODUCTION_SEND_STAGE_FILTER_ALL);
    expect(all).toHaveLength(4);
  });

  it('filters visible batches to the selected Τεχνίτης substage', () => {
    const batches = [
      batch({ id: 'p', current_stage: ProductionStage.Polishing, pending_dispatch: true, quantity: 2 }),
      batch({ id: 'd', current_stage: ProductionStage.Polishing, pending_dispatch: false, quantity: 5 }),
      batch({ id: 'w', current_stage: ProductionStage.Waxing, quantity: 1 }),
    ];

    expect(filterBatchesByProductionSendStage(batches, 'Polishing:pending').map((item) => item.id)).toEqual(['p']);
    expect(filterBatchesByProductionSendStage(batches, 'Polishing:dispatched').map((item) => item.id)).toEqual(['d']);
    expect(filterBatchesByProductionSendStage(batches, PRODUCTION_SEND_STAGE_FILTER_ALL)).toHaveLength(3);
  });

  it('builds color-coded options with both Τεχνίτης substages and piece counts', () => {
    const options = buildProductionSendStageFilterOptions([
      batch({ current_stage: ProductionStage.Waxing, quantity: 2 }),
      batch({ current_stage: ProductionStage.Waxing, quantity: 3 }),
      batch({ current_stage: ProductionStage.Polishing, pending_dispatch: true, quantity: 4 }),
      batch({ current_stage: ProductionStage.Polishing, pending_dispatch: false, quantity: 1 }),
      batch({ current_stage: ProductionStage.Ready, quantity: 6 }),
    ]);

    expect(options.map((option) => option.key)).toEqual([
      ProductionStage.Waxing,
      'Polishing:pending',
      'Polishing:dispatched',
      ProductionStage.Ready,
    ]);
    expect(options.find((option) => option.key === ProductionStage.Waxing)?.quantity).toBe(5);
    expect(options.find((option) => option.key === 'Polishing:pending')).toMatchObject({
      label: 'Τεχνίτης σε Αναμονή',
      chipLabel: 'Τεχν. Αναμονή',
      quantity: 4,
      colorKey: 'teal',
    });
    expect(options.find((option) => option.key === 'Polishing:dispatched')).toMatchObject({
      label: 'Τεχνίτης στον Τεχνίτη',
      chipLabel: 'Τεχν. Στον Τεχν.',
      quantity: 1,
      colorKey: 'blue',
    });
    expect(options.some((option) => option.key === ProductionStage.Polishing)).toBe(false);
  });
});
