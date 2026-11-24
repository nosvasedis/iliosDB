import { onlineManager, useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { SILVER_HISTORY_PATH, SILVER_QUOTE_PATH } from '../../lib/silverMarketContract';
import type { SilverMarketHistory, SilverMarketQuote, SilverRange } from '../../lib/silverMarketContract';
import { CLOUDFLARE_WORKER_URL, isLocalMode, workerAuthHeaders } from '../../lib/supabase';

const QUOTE_REFRESH_MS = 60_000;
const HISTORY_REFRESH_MS = 5 * 60_000;
const getOnline = () => onlineManager.isOnline();

async function fetchSilverMarket<T>(path: string, signal: AbortSignal): Promise<T> {
  const headers = await workerAuthHeaders();
  const response = await fetch(`${CLOUDFLARE_WORKER_URL}${path}`, { headers, signal });
  if (!response.ok) throw new Error(`Silver market: HTTP ${response.status}`);
  return response.json();
}

export function useSilverMarket(range: SilverRange) {
  const online = useSyncExternalStore(onlineManager.subscribe, getOnline);
  const enabled = online && !isLocalMode;
  const quote = useQuery({
    queryKey: ['silverMarket', 'quote'],
    queryFn: ({ signal }) => fetchSilverMarket<SilverMarketQuote>(SILVER_QUOTE_PATH, signal),
    enabled,
    staleTime: 30_000,
    refetchInterval: QUOTE_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const history = useQuery({
    queryKey: ['silverMarket', 'history', range],
    queryFn: ({ signal }) => fetchSilverMarket<SilverMarketHistory>(`${SILVER_HISTORY_PATH}?range=${range}`, signal),
    enabled,
    staleTime: HISTORY_REFRESH_MS,
    refetchInterval: HISTORY_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });

  return { quote, history, online, canRefresh: enabled };
}
