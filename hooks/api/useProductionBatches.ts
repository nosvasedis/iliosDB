import { useQuery } from '@tanstack/react-query';
import { productionKeys, productionRepository } from '../../features/production';
import { BatchStageHistoryEntry, ProductionBatch } from '../../types';

export const useProductionBatches = () => {
  return useQuery<ProductionBatch[]>({
    queryKey: productionKeys.batches(),
    queryFn: productionRepository.getProductionBatches,
    // Safety-net polling: the root realtime listener does the immediate refresh;
    // this catches any edge case where a websocket event is missed.
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
};

export const useBatchStageHistoryEntries = () => {
  return useQuery<BatchStageHistoryEntry[]>({
    queryKey: productionKeys.batchHistoryEntries(),
    queryFn: productionRepository.getBatchStageHistoryEntries,
  });
};
