import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { productionKeys, productionRepository } from '../../features/production';
import { BatchStageHistoryEntry, ProductionBatch } from '../../types';
import { isLocalMode, supabase } from '../../lib/supabase';

export const useProductionBatches = () => {
  const queryClient = useQueryClient();
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Realtime: keep Production boards in sync across devices (not used in local mode).
  // Includes retry-on-error so a dropped connection never leaves the board stuck.
  useEffect(() => {
    if (isLocalMode) return;

    const invalidateBatches = () => {
      void queryClient.invalidateQueries({ queryKey: productionKeys.all });
    };
    const invalidateHistory = () => {
      void queryClient.invalidateQueries({ queryKey: productionKeys.all });
      void queryClient.invalidateQueries({ queryKey: productionKeys.batchHistoryEntries() });
    };

    const subscribe = () => {
      const channel = supabase
        .channel('realtime:production')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, invalidateBatches)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'batch_stage_history' }, invalidateHistory)
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Clean up and retry after a short delay so the board never goes stale.
            void supabase.removeChannel(channel);
            channelRef.current = null;
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              subscribe();
            }, 3000);
          }
        });
      channelRef.current = channel;
    };

    subscribe();

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient]);

  return useQuery<ProductionBatch[]>({
    queryKey: productionKeys.batches(),
    queryFn: productionRepository.getProductionBatches,
    // Safety-net polling: catches any edge cases where realtime missed an event
    // (e.g. brief network blip between CHANNEL_ERROR and the 3-second retry).
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
