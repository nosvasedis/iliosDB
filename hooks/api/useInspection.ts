import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../../components/AuthContext';
import { loadInspectionSnapshot, loadLegalCatalog } from '../../features/inspection/repository';
import type { InspectionFilters } from '../../features/inspection/types';
import { isLocalMode } from '../../lib/supabase';

const CATALOG_FRESH_MS = 60_000;
const CATALOG_RETRY_MS = 8_000;

const readOnline = () => typeof navigator === 'undefined' || navigator.onLine;
const subscribeOnline = (listener: () => void) => {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
};

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
export function useLegalCatalog(recoverWhileCreating: boolean) {
  const { profile } = useAuth();
  const online = useSyncExternalStore(subscribeOnline, readOnline, () => true);
  const enabled = !!profile?.id && !isLocalMode;
  const canRefresh = enabled && online;
  const query = useQuery({
    queryKey: ['legal_catalog', profile?.id],
    queryFn: ({ signal }) => loadLegalCatalog(signal),
    enabled,
    networkMode: 'offlineFirst',
    staleTime: (catalog) => catalog.state.data?.saved ? 0 : CATALOG_FRESH_MS,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: true,
    retry: false,
    refetchInterval: (catalog) => recoverWhileCreating && canRefresh && catalog.state.fetchStatus === 'idle'
      && (catalog.state.status === 'error' || catalog.state.data?.saved) ? CATALOG_RETRY_MS : false,
  });
  return { query, canRefresh, ready: canRefresh && query.data?.saved === false };
}
