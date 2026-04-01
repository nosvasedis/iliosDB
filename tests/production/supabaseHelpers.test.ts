import { describe, expect, it } from 'vitest';
import { ProductionStage, ProductionType } from '../../types';
import {
  buildInitialBatchHistoryEntry,
  canMoveBatchToStage,
  getBatchSnapshotById,
  getOrderSnapshotById,
} from '../../features/production/supabaseHelpers';

describe('production supabase helpers', () => {
  it('finds snapshots by id and builds initial history entries', () => {
    expect(getBatchSnapshotById([{ id: 'b1' } as any], 'b1')).toEqual({ id: 'b1' });
    expect(getOrderSnapshotById([{ id: 'o1' } as any], 'o1')).toEqual({ id: 'o1' });

    const entry = buildInitialBatchHistoryEntry({
      id: 'b2',
      current_stage: ProductionStage.Casting,
      created_at: '2024-01-01T00:00:00.000Z',
    }, 'Tester', null);

    expect(entry.batch_id).toBe('b2');
    expect(entry.to_stage).toBe(ProductionStage.Casting);
    expect(entry.moved_by).toBe('Tester');
    expect(entry.notes).toBeNull();
  });

  it('keeps batch movement guards aligned with production rules', () => {
    expect(canMoveBatchToStage({
      id: 'b1',
      sku: 'PN1',
      quantity: 1,
      current_stage: ProductionStage.Setting,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      priority: 'Normal',
      requires_setting: false,
      requires_assembly: false,
      product_details: { production_type: ProductionType.InHouse } as any,
    }, ProductionStage.Setting)).toBe(false);

    expect(canMoveBatchToStage({
      id: 'b2',
      sku: 'PN2',
      quantity: 1,
      current_stage: ProductionStage.AwaitingDelivery,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      priority: 'Normal',
      requires_setting: false,
      requires_assembly: false,
      product_details: { production_type: ProductionType.Imported } as any,
    }, ProductionStage.AwaitingDelivery)).toBe(false);
  });
});
