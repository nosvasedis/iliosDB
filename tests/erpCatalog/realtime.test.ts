import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createErpCatalogRealtimeScheduler,
  mergeProductsBySku,
  resolveErpProductRealtimePayload,
} from '../../features/erpCatalog';
import { Product } from '../../types';

describe('ERP catalogue realtime batching', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces recoverable SKU events into one partial refresh', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createErpCatalogRealtimeScheduler(refresh, 500);
    scheduler.schedule({ table: 'products', new: { sku: 'A1' } });
    scheduler.schedule({ table: 'product_variants', new: { product_sku: 'A1' } });
    scheduler.schedule({ table: 'recipes', new: { parent_sku: 'B2' } });

    await vi.advanceTimersByTimeAsync(500);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(['A1', 'B2']);
  });

  it('falls back to full refresh for collections, missing keys, and bursts over 50 SKUs', async () => {
    expect(resolveErpProductRealtimePayload({ table: 'collections', new: { id: 1 } })).toEqual({ type: 'full' });

    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createErpCatalogRealtimeScheduler(refresh, 500);
    for (let index = 0; index < 51; index += 1) {
      scheduler.schedule({ table: 'products', new: { sku: `SKU${index}` } });
    }
    await vi.advanceTimersByTimeAsync(500);
    expect(refresh).toHaveBeenCalledWith(undefined);

    refresh.mockClear();
    scheduler.schedule({ table: 'product_variants', new: {} });
    await vi.advanceTimersByTimeAsync(500);
    expect(refresh).toHaveBeenCalledWith(undefined);
  });
});

describe('mergeProductsBySku', () => {
  it('replaces requested SKUs and keeps others', () => {
    const current = [
      { sku: 'A' } as Product,
      { sku: 'B' } as Product,
    ];
    const partial = [{ sku: 'B', description: 'updated' } as Product];
    const merged = mergeProductsBySku(current, partial, ['B']);
    expect(merged.map((p) => p.sku)).toEqual(['A', 'B']);
    expect((merged[1] as any).description).toBe('updated');
  });
});
