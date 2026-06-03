import { describe, expect, it, vi } from 'vitest';
// Import keys only — avoid features/*/index barrels that pull in repository → lib/supabase (localStorage at module load breaks Vitest/Node).
import { deliveryKeys } from '../features/deliveries/keys';
import { orderKeys } from '../features/orders/keys';
import { productionKeys } from '../features/production/keys';
import {
  invalidateAndRefetchAfterShipmentChange,
  invalidateOrdersAndBatches,
  invalidateProductionBatches,
  invalidateRealtimeDomain,
  invalidateShipmentUndoQueries,
} from '../lib/queryInvalidation';

describe('query invalidation helpers', () => {
  it('invalidates modular production batch caches and history', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    } as any;

    await invalidateProductionBatches(queryClient);

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(5);
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: productionKeys.batches() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: productionKeys.boardBatches() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(3, { queryKey: productionKeys.all });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(4, { queryKey: productionKeys.batchHistoryEntries() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(5, { queryKey: productionKeys.boardBatchHistoryEntries() });
  });

  it('realtime production_batches changes refresh the batch list only', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    } as any;

    await invalidateRealtimeDomain(queryClient, 'production', ['production_batches']);

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: productionKeys.batches() });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: productionKeys.boardBatches() });
  });

  it('realtime batch_stage_history changes refresh history and the batch list', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    } as any;

    await invalidateRealtimeDomain(queryClient, 'production', ['batch_stage_history']);

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(4);
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: productionKeys.batches() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: productionKeys.boardBatches() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(3, { queryKey: productionKeys.batchHistoryEntries() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(4, { queryKey: productionKeys.boardBatchHistoryEntries() });
  });

  it('invalidates orders alongside all production batch caches', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    } as any;

    await invalidateOrdersAndBatches(queryClient);

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(12);
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: orderKeys.all });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: orderKeys.list() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(3, { queryKey: orderKeys.productionBoard() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(8, { queryKey: productionKeys.batches() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(9, { queryKey: productionKeys.boardBatches() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(10, { queryKey: productionKeys.all });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(11, { queryKey: productionKeys.batchHistoryEntries() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(12, { queryKey: productionKeys.boardBatchHistoryEntries() });
  });

  it('invalidates every surface affected by undoing a shipment', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    } as any;

    await invalidateShipmentUndoQueries(queryClient, 'order-1');

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(20);
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: orderKeys.all });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: orderKeys.list() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(3, { queryKey: orderKeys.productionBoard() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(13, { queryKey: orderKeys.shipments() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(14, { queryKey: orderKeys.shipmentsForOrder('order-1') });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(15, { queryKey: orderKeys.shipmentItems() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(16, { queryKey: ['order-shipments'] });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(17, { queryKey: deliveryKeys.plans() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(18, { queryKey: deliveryKeys.reminders() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(19, { queryKey: deliveryKeys.shipments() });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(20, { queryKey: deliveryKeys.shipmentItems() });
  });

  it('invalidates shipment caches then refetches active order/production/delivery queries', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      refetchQueries: vi.fn().mockResolvedValue(undefined),
    } as any;

    await invalidateAndRefetchAfterShipmentChange(queryClient, 'order-1');

    expect(queryClient.invalidateQueries).toHaveBeenCalled();
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({ queryKey: orderKeys.all, type: 'active' });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({ queryKey: orderKeys.list(), type: 'active' });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({ queryKey: orderKeys.productionBoard(), type: 'active' });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({ queryKey: productionKeys.batches(), type: 'active' });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({ queryKey: productionKeys.boardBatches(), type: 'active' });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({ queryKey: orderKeys.shipmentsForOrder('order-1'), type: 'active' });
  });
});
