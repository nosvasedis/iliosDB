import { useQuery } from '@tanstack/react-query';
import { productionKeys, productionRepository } from '../../features/production';
import { BatchStageHistoryEntry, ProductionBatch } from '../../types';

const THIRTY_MINUTES_MS = 1000 * 60 * 30;

export const useProductionBatches = () => {
  return useQuery<ProductionBatch[]>({
    queryKey: productionKeys.batches(),
    queryFn: productionRepository.getProductionBatches,
    staleTime: THIRTY_MINUTES_MS,
  });
};

export const useProductionBoardBatches = () => {
  return useQuery<ProductionBatch[]>({
    queryKey: productionKeys.boardBatches(),
    queryFn: productionRepository.getProductionBoardBatches,
    staleTime: THIRTY_MINUTES_MS,
  });
};

export const useBatchStageHistoryEntries = () => {
  return useQuery<BatchStageHistoryEntry[]>({
    queryKey: productionKeys.batchHistoryEntries(),
    queryFn: productionRepository.getBatchStageHistoryEntries,
    staleTime: THIRTY_MINUTES_MS,
  });
};

export const useProductionBoardBatchStageHistoryEntries = () => {
  return useQuery<BatchStageHistoryEntry[]>({
    queryKey: productionKeys.boardBatchHistoryEntries(),
    queryFn: productionRepository.getProductionBoardBatchStageHistoryEntries,
    staleTime: THIRTY_MINUTES_MS,
  });
};
