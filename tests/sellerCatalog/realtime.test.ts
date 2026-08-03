import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSellerCatalogRealtimeScheduler,
  resolveSellerCatalogRealtimePayload,
} from '../../features/sellerCatalog';

const CENTRAL = '00000000-0000-0000-0000-000000000001';

describe('seller catalogue realtime batching', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces recoverable SKU events into one partial refresh', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createSellerCatalogRealtimeScheduler(refresh, 500);
    scheduler.schedule({ table: 'products', new: { sku: 'A1' } });
    scheduler.schedule({ table: 'product_variants', new: { product_sku: 'A1' } });
    scheduler.schedule({ table: 'product_collections', new: { product_sku: 'B2' } });

    await vi.advanceTimersByTimeAsync(500);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(['A1', 'B2']);
  });

  it('ignores non-Central inventory and reconciles Central inventory', async () => {
    expect(resolveSellerCatalogRealtimePayload({
      table: 'inventory_balances',
      new: { warehouse_id: 'showroom', product_sku: 'A1' },
    })).toEqual({ type: 'ignore' });

    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createSellerCatalogRealtimeScheduler(refresh, 500);
    scheduler.schedule({
      table: 'inventory_balances',
      new: { warehouse_id: CENTRAL, product_sku: 'A1' },
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(refresh).toHaveBeenCalledWith(['A1']);
  });

  it('falls back to one full refresh for missing keys and bursts over 50 SKUs', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createSellerCatalogRealtimeScheduler(refresh, 500);
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
