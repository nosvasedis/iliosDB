import { useQuery } from '@tanstack/react-query';
import { productionKeys, productionRepository } from '../../features/production';
import { BatchStageHistoryEntry, ProductionBatch } from '../../types';

export const useProductionBatches = () => {
  return useQuery<ProductionBatch[]>({
    queryKey: productionKeys.batches(),
    queryFn: productionRepository.getProductionBatches,
  });
};

export const useBatchStageHistoryEntries = () => {
  return useQuery<BatchStageHistoryEntry[]>({
    queryKey: productionKeys.batchHistoryEntries(),
    queryFn: productionRepository.getBatchStageHistoryEntries,
  });
};
