import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '../../components/AuthContext';
import { loadInspectionSnapshot, loadLegalCatalog } from '../../features/inspection/repository';
import type { InspectionFilters } from '../../features/inspection/types';

export function useInspectionSnapshot(filters: InspectionFilters) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => queryClient.getMutationCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'success') {
      void queryClient.invalidateQueries({ queryKey: ['inspection'] });
    }
  }), [queryClient]);
  return useQuery({ queryKey: ['inspection', 'snapshot', profile?.id, filters],
    queryFn: ({ signal }) => loadInspectionSnapshot(filters, signal), enabled: !!profile?.id,
    retry: false, staleTime: 0, refetchOnWindowFocus: true });
}
export function useLegalCatalog(enabled = true) {
  const { profile } = useAuth();
  return useQuery({ queryKey: ['legal_catalog', profile?.id], queryFn: ({ signal }) => loadLegalCatalog(signal),
    enabled: enabled && !!profile?.id, retry: false, staleTime: 0 });
}
