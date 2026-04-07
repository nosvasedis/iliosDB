import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { productionKeys, productionRepository } from '../../features/production';
import { BatchStageHistoryEntry, ProductionBatch } from '../../types';
import { isLocalMode, supabase } from '../../lib/supabase';

export const useProductionBatches = () => {
  const queryClient = useQueryClient();

  // Realtime: keep Production boards in sync across devices (not used in local mode).
  useEffect(() => {
    if (isLocalMode) return;

    const channel = supabase
      .channel('realtime:production')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_batches' },
        () => {
          void queryClient.invalidateQueries({ queryKey: productionKeys.all });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'batch_stage_history' },
        () => {
          void queryClient.invalidateQueries({ queryKey: productionKeys.all });
          void queryClient.invalidateQueries({ queryKey: productionKeys.batchHistoryEntries() });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

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
