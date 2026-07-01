import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { orderKeys } from '../features/orders/keys';
import { productionKeys } from '../features/production/keys';
import { tryPatchRealtimeCache } from '../lib/realtimeCachePatch';
import { OrderStatus, ProductionStage } from '../types';

describe('realtime cache patching', () => {
  it('keeps optimized order list rows summary-only while patching full order caches', () => {
    const queryClient = new QueryClient();
    const order = {
      id: 'ord-1',
      customer_name: 'Ada',
      created_at: '2024-01-01T00:00:00.000Z',
      status: OrderStatus.Pending,
      total_price: 30,
      items: [
        { sku: 'PN1', quantity: 2, price_at_order: 10 },
        { sku: 'PN2', quantity: 1, price_at_order: 10 },
      ],
    } as any;

    queryClient.setQueryData(orderKeys.all, []);
    queryClient.setQueryData(orderKeys.list(), []);
    queryClient.setQueryData(orderKeys.productionBoard(), []);

    const patched = tryPatchRealtimeCache(queryClient, {
      table: 'orders',
      eventType: 'INSERT',
      new: order,
      old: {},
      schema: 'public',
      commit_timestamp: '2024-01-01T00:00:01.000Z',
      errors: null,
    } as any);

    expect(patched).toBe(true);
    expect(queryClient.getQueryData<any[]>(orderKeys.all)?.[0].items).toHaveLength(2);
    expect(queryClient.getQueryData<any[]>(orderKeys.productionBoard())?.[0].items).toHaveLength(2);
    expect(queryClient.getQueryData<any[]>(orderKeys.list())?.[0]).toEqual(
      expect.objectContaining({
        id: 'ord-1',
        items: [],
        item_count: 2,
        item_total_qty: 3,
      }),
    );
  });

  it('patches visible production batches but still lets realtime invalidation refetch related surfaces', () => {
    const queryClient = new QueryClient();
    const cachedBatch = {
      id: 'batch-1',
      order_id: 'order-1',
      sku: 'RING-1',
      quantity: 2,
      current_stage: ProductionStage.Waxing,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      priority: 'Normal',
      requires_setting: false,
    } as any;
    const movedBatch = {
      ...cachedBatch,
      current_stage: ProductionStage.Casting,
      updated_at: '2024-01-01T00:00:01.000Z',
    };

    queryClient.setQueryData(productionKeys.batches(), [cachedBatch]);
    queryClient.setQueryData(productionKeys.boardBatches(), [cachedBatch]);

    const fullyHandled = tryPatchRealtimeCache(queryClient, {
      table: 'production_batches',
      eventType: 'UPDATE',
      new: movedBatch,
      old: cachedBatch,
      schema: 'public',
      commit_timestamp: '2024-01-01T00:00:01.000Z',
      errors: null,
    } as any);

    expect(fullyHandled).toBe(false);
    expect(queryClient.getQueryData<any[]>(productionKeys.batches())?.[0].current_stage).toBe(ProductionStage.Casting);
    expect(queryClient.getQueryData<any[]>(productionKeys.boardBatches())?.[0].current_stage).toBe(ProductionStage.Casting);
  });

  it('patches batch stage history caches without duplicating repeated payloads', () => {
    const queryClient = new QueryClient();
    const historyEntry = {
      id: 'history-1',
      batch_id: 'batch-1',
      from_stage: ProductionStage.Waxing,
      to_stage: ProductionStage.Casting,
      moved_by: 'Alex',
      moved_at: '2024-01-01T00:00:01.000Z',
    };
    const repeatedEntry = {
      ...historyEntry,
      moved_by: 'Alex Updated',
    };

    queryClient.setQueryData(productionKeys.batchHistoryEntries(), []);
    queryClient.setQueryData(productionKeys.boardBatchHistoryEntries(), []);

    const handledInsert = tryPatchRealtimeCache(queryClient, {
      table: 'batch_stage_history',
      eventType: 'INSERT',
      new: historyEntry,
      old: {},
      schema: 'public',
      commit_timestamp: '2024-01-01T00:00:01.000Z',
      errors: null,
    } as any);
    const handledRepeat = tryPatchRealtimeCache(queryClient, {
      table: 'batch_stage_history',
      eventType: 'UPDATE',
      new: repeatedEntry,
      old: historyEntry,
      schema: 'public',
      commit_timestamp: '2024-01-01T00:00:02.000Z',
      errors: null,
    } as any);

    expect(handledInsert).toBe(false);
    expect(handledRepeat).toBe(false);
    expect(queryClient.getQueryData<any[]>(productionKeys.batchHistoryEntries())).toEqual([repeatedEntry]);
    expect(queryClient.getQueryData<any[]>(productionKeys.boardBatchHistoryEntries())).toEqual([repeatedEntry]);
  });
});
