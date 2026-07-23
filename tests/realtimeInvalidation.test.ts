import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getRealtimeDomainsForTables,
  getRealtimeInvalidationDomainsForTable,
  invalidateRealtimeDomain,
} from '../lib/queryInvalidation';
import { createRealtimeInvalidationScheduler } from '../hooks/api/realtimeInvalidationScheduler';
import {
  shouldRemoveRealtimeChannelOnStatus,
  shouldRetryRealtimeChannelOnStatus,
} from '../hooks/realtimeChannelLifecycle';
import {
  CORE_REALTIME_CHANNEL_GROUPS,
  CORE_REALTIME_TABLES,
  getRealtimeChannelGroups,
} from '../hooks/api/useRealtimeInvalidation';

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

  it('maps production batch changes to every visible dependent surface', () => {
    expect(getRealtimeInvalidationDomainsForTable('production_batches')).toEqual(['production', 'orders', 'deliveries']);
  });

  it('refreshes warehouse metadata and canonical inventory labels together', () => {
    expect(getRealtimeInvalidationDomainsForTable('warehouses')).toEqual(['resources', 'inventory']);
  });

  it('groups every core realtime table exactly once', () => {
    const groupedTables = CORE_REALTIME_CHANNEL_GROUPS.flatMap((group) => group.tables);

    expect(new Set(groupedTables)).toEqual(new Set(CORE_REALTIME_TABLES));
    expect(groupedTables).toHaveLength(new Set(groupedTables).size);
  });

  it('derives group readiness domains from grouped tables', () => {
    const groups = getRealtimeChannelGroups(false);
    const productionGroup = groups.find((group) => group.id === 'production');

    expect(productionGroup?.tables).toEqual(['production_batches', 'batch_stage_history']);
    expect(getRealtimeDomainsForTables(productionGroup?.tables ?? [])).toEqual(['production', 'orders', 'deliveries']);
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

describe('realtime channel lifecycle', () => {
  it('does not remove a channel while handling its CLOSED callback', () => {
    expect(shouldRemoveRealtimeChannelOnStatus('CLOSED')).toBe(false);
  });

  it('removes failed channels before retrying', () => {
    expect(shouldRemoveRealtimeChannelOnStatus('CHANNEL_ERROR')).toBe(true);
    expect(shouldRemoveRealtimeChannelOnStatus('TIMED_OUT')).toBe(true);
    expect(shouldRemoveRealtimeChannelOnStatus('SUBSCRIBED')).toBe(false);
  });

  it('retries after failed or closed channel states', () => {
    expect(shouldRetryRealtimeChannelOnStatus('CHANNEL_ERROR')).toBe(true);
    expect(shouldRetryRealtimeChannelOnStatus('TIMED_OUT')).toBe(true);
    expect(shouldRetryRealtimeChannelOnStatus('CLOSED')).toBe(true);
    expect(shouldRetryRealtimeChannelOnStatus('SUBSCRIBED')).toBe(false);
  });
});
