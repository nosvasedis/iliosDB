import { useQuery } from '@tanstack/react-query';
import { productionKeys, productionRepository } from '../../features/production';
import { BatchStageHistoryEntry, ProductionBatch } from '../../types';

/** Matches global React Query staleTime — realtime invalidation handles live updates. */
const PRODUCTION_BATCHES_SAFETY_POLL_MS = 1000 * 60 * 5;

export const useProductionBatches = () => {
  return useQuery<ProductionBatch[]>({
    queryKey: productionKeys.batches(),
    queryFn: productionRepository.getProductionBatches,
    // Safety-net polling if a websocket event is missed; realtime remains primary.
    refetchInterval: PRODUCTION_BATCHES_SAFETY_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
};

export const useBatchStageHistoryEntries = () => {
  return useQuery<BatchStageHistoryEntry[]>({
    queryKey: productionKeys.batchHistoryEntries(),
    queryFn: productionRepository.getBatchStageHistoryEntries,
  });
};
