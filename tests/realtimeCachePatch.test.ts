import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { orderKeys } from '../features/orders/keys';
import { productionKeys } from '../features/production/keys';
import { tryPatchRealtimeCache } from '../lib/realtimeCachePatch';
import { OrderStatus, ProductionStage } from '../types';

describe('realtime cache patching', () => {
  it('patches a visible canonical inventory balance immediately and still schedules a view refresh', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['products'], [{
      sku: 'KL201',
      stock_qty: 0,
      sample_qty: 0,
      variants: [{ suffix: 'X', stock_qty: 0 }],
    }]);
    queryClient.setQueryData(['inventory', 'availability'], [{
      productSku: 'KL201',
      variantSuffix: 'X',
      sizeInfo: '',
      warehouseId: 'central',
      warehouseName: 'Κεντρική Αποθήκη',
      warehouseType: 'Central',
      onHand: 0,
      reserved: 0,
      available: 0,
      incoming: 0,
      outstandingDemand: 0,
      productionDemand: 0,
      purchaseDemand: 0,
      projectedAvailable: 0,
      reorderPoint: 0,
      preferredSupplierId: null,
      updatedAt: '2026-07-23T08:00:00.000Z',
    }]);

    const fullyHandled = tryPatchRealtimeCache(queryClient, {
      table: 'inventory_balances',
      eventType: 'UPDATE',
      new: {
        product_sku: 'KL201',
        variant_suffix: 'X',
        size_info: '',
        warehouse_id: 'central',
        on_hand: 2,
        reserved: 0,
        updated_at: '2026-07-23T08:27:06.000Z',
      },
      old: {},
      schema: 'public',
      commit_timestamp: '2026-07-23T08:27:06.000Z',
      errors: null,
    } as any);

    expect(fullyHandled).toBe(false);
    expect(queryClient.getQueryData<any[]>(['inventory', 'availability'])?.[0]).toEqual(
      expect.objectContaining({
        productSku: 'KL201',
        variantSuffix: 'X',
        onHand: 2,
        available: 2,
        projectedAvailable: 2,
        updatedAt: '2026-07-23T08:27:06.000Z',
      }),
    );
    expect(queryClient.getQueryData<any[]>(['products'])?.[0].stock_qty).toBe(0);
    expect(queryClient.getQueryData<any[]>(['products'])?.[0].variants[0]).toEqual(
      expect.objectContaining({ stock_qty: 2, available_qty: 2 }),
    );
  });

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

  it('preserves full order items when realtime status updates omit unchanged JSON columns', () => {
    const queryClient = new QueryClient();
    const cachedOrder = {
      id: 'ord-ship-undo',
      customer_name: 'Ada',
      created_at: '2024-01-01T00:00:00.000Z',
      status: OrderStatus.PartiallyDelivered,
      total_price: 30,
      items: [
        { sku: 'PN1', quantity: 2, price_at_order: 10 },
        { sku: 'PN2', quantity: 1, price_at_order: 10 },
      ],
    } as any;
    const realtimeStatusOnlyRow = {
      id: 'ord-ship-undo',
      customer_name: 'Ada',
      created_at: '2024-01-01T00:00:00.000Z',
      status: OrderStatus.InProduction,
      total_price: 30,
    } as any;

    queryClient.setQueryData(orderKeys.detail(cachedOrder.id), cachedOrder);
    queryClient.setQueryData(orderKeys.all, [cachedOrder]);
    queryClient.setQueryData(orderKeys.productionBoard(), [cachedOrder]);
    queryClient.setQueryData(orderKeys.list(), [{ ...cachedOrder, items: [], item_count: 2, item_total_qty: 3 }]);

    const patched = tryPatchRealtimeCache(queryClient, {
      table: 'orders',
      eventType: 'UPDATE',
      new: realtimeStatusOnlyRow,
      old: { id: 'ord-ship-undo' },
      schema: 'public',
      commit_timestamp: '2024-01-01T00:00:01.000Z',
      errors: null,
    } as any);

    expect(patched).toBe(true);
    expect(queryClient.getQueryData<any>(orderKeys.detail(cachedOrder.id))).toEqual(
      expect.objectContaining({
        status: OrderStatus.InProduction,
        items: cachedOrder.items,
      }),
    );
    expect(queryClient.getQueryData<any[]>(orderKeys.all)?.[0].items).toEqual(cachedOrder.items);
    expect(queryClient.getQueryData<any[]>(orderKeys.productionBoard())?.[0].items).toEqual(cachedOrder.items);
    expect(queryClient.getQueryData<any[]>(orderKeys.list())?.[0]).toEqual(
      expect.objectContaining({
        status: OrderStatus.InProduction,
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
