export const productionKeys = {
  all: ['production'] as const,
  batches: () => [...productionKeys.all, 'batches'] as const,
  boardBatches: () => [...productionKeys.all, 'board-batches'] as const,
  batch: (batchId: string) => [...productionKeys.all, 'batch', batchId] as const,
  batchHistory: (batchId: string) => [...productionKeys.all, 'history', batchId] as const,
  batchHistoryEntries: () => ['batchStageHistory'] as const,
  boardBatchHistoryEntries: () => ['batchStageHistory', 'board'] as const,
  alerts: () => [...productionKeys.all, 'alerts'] as const,
  stageBatches: () => [...productionKeys.all, 'stage-batches'] as const,
};
