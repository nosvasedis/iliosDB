import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  refreshSellerCatalog,
  restoreSellerCatalog,
  sellerCatalogKeys,
  SELLER_CATALOG_RECONNECT_GAP_MS,
  shouldRefreshSellerCatalog,
} from './sync';

export function useSellerCatalog() {
  const queryClient = useQueryClient();
  const prewarmRef = useRef<Promise<{ error: unknown | null }> | null>(null);
  const offlineSinceRef = useRef<number | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [refreshError, setRefreshError] = useState<unknown>(null);
  const query = useQuery({
    queryKey: sellerCatalogKeys.all,
    queryFn: () => refreshSellerCatalog(queryClient),
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  useEffect(() => {
    let disposed = false;
    if (!prewarmRef.current) {
      prewarmRef.current = (async () => {
        const cached = await restoreSellerCatalog(queryClient);
        if (typeof navigator !== 'undefined' && navigator.onLine && shouldRefreshSellerCatalog(cached)) {
          try {
            await refreshSellerCatalog(queryClient);
          } catch (error) {
            return { error };
          }
        }
        return { error: null };
      })();
    }
    void prewarmRef.current.then(({ error }) => {
      if (disposed) return;
      setIsRestoring(false);
      setRefreshError(error);
    });
    return () => { disposed = true; };
  }, [queryClient]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOffline = () => {
      offlineSinceRef.current = Date.now();
    };
    const handleOnline = async () => {
      const offlineSince = offlineSinceRef.current;
      offlineSinceRef.current = null;
      if (offlineSince != null
        && Date.now() - offlineSince >= SELLER_CATALOG_RECONNECT_GAP_MS) {
        try {
          setRefreshError(null);
          await refreshSellerCatalog(queryClient);
        } catch (error) {
          setRefreshError(error);
        }
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [queryClient]);

  return {
    snapshot: query.data,
    isRestoring,
    isInitialLoading: !query.data && (isRestoring || query.isFetching),
    isRefreshing: !!query.data && query.isFetching,
    error: refreshError ?? query.error,
    refresh: () => refreshSellerCatalog(queryClient),
  };
}
