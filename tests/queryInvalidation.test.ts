import { describe, expect, it, vi } from 'vitest';
// Import keys only — avoid features/*/index barrels that pull in repository → lib/supabase (localStorage at module load breaks Vitest/Node).
import { orderKeys } from '../features/orders/keys';
import { productionKeys } from '../features/production/keys';
import { invalidateOrdersAndBatches, invalidateProductionBatches } from '../lib/queryInvalidation';

describe('query invalidation helpers', () => {
  it('invalidates both legacy and modular production batch caches', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    } as any;

    await invalidateProductionBatches(queryClient);

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(3);
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: ['batches'] });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: productionKeys.all });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(3, { queryKey: productionKeys.batchHistoryEntries() });
  });

  it('invalidates orders alongside all production batch caches', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    } as any;

    await invalidateOrdersAndBatches(queryClient);

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(4);
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: orderKeys.all });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: ['batches'] });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(3, { queryKey: productionKeys.all });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(4, { queryKey: productionKeys.batchHistoryEntries() });
  });
});
