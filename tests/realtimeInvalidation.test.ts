import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getRealtimeInvalidationDomainsForTable,
  invalidateRealtimeDomain,
} from '../lib/queryInvalidation';
import { createRealtimeInvalidationScheduler } from '../hooks/api/realtimeInvalidationScheduler';

describe('realtime invalidation mapping', () => {
  it('maps product variant changes to the product/catalog domain', async () => {
    expect(getRealtimeInvalidationDomainsForTable('product_variants')).toEqual(['products']);

    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    } as any;

    await invalidateRealtimeDomain(queryClient, 'products');

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: ['products'] });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: ['productsCatalog'] });
  });

  it('maps shipment table changes to order and delivery surfaces', () => {
    expect(getRealtimeInvalidationDomainsForTable('order_shipment_items')).toEqual(['orders', 'deliveries']);
  });
});

describe('realtime invalidation scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces duplicate product graph events while keeping separate domains', async () => {
    const invalidateDomain = vi.fn().mockResolvedValue(undefined);
    const scheduler = createRealtimeInvalidationScheduler(invalidateDomain, 400);

    scheduler.schedule('products');
    scheduler.schedule('products');
    scheduler.schedule('resources');

    expect(invalidateDomain).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(399);
    expect(invalidateDomain).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(invalidateDomain).toHaveBeenCalledTimes(2);
    expect(invalidateDomain).toHaveBeenCalledWith('products', undefined);
    expect(invalidateDomain).toHaveBeenCalledWith('resources', undefined);
  });

  it('merges source tables for the same domain within the debounce window', async () => {
    const invalidateDomain = vi.fn().mockResolvedValue(undefined);
    const scheduler = createRealtimeInvalidationScheduler(invalidateDomain, 400);

    scheduler.schedule('production', 'production_batches');
    scheduler.schedule('production', 'batch_stage_history');

    await vi.advanceTimersByTimeAsync(400);

    expect(invalidateDomain).toHaveBeenCalledTimes(1);
    expect(invalidateDomain).toHaveBeenCalledWith('production', ['production_batches', 'batch_stage_history']);
  });
});
