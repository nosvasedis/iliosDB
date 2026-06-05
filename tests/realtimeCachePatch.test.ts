import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { orderKeys } from '../features/orders/keys';
import { tryPatchRealtimeCache } from '../lib/realtimeCachePatch';
import { OrderStatus } from '../types';

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
});
