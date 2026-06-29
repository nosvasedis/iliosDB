import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isLocalMode, supabase } from '../../lib/supabase';
import { isInspectionModeActive } from '../../lib/inspectionMode';
import { INSPECTION_REALTIME_TABLES } from '../../lib/inspectionAllowedTables';
import {
  getRealtimeInvalidationDomainsForTable,
  invalidateRealtimeDomain,
  refetchRealtimeActiveQueries,
} from '../../lib/queryInvalidation';
import { tryPatchRealtimeCache } from '../../lib/realtimeCachePatch';
import { createRealtimeInvalidationScheduler } from './realtimeInvalidationScheduler';

export const CORE_REALTIME_TABLES = [
  'products',
  'product_variants',
  'product_stock',
  'recipes',
  'product_molds',
  'product_collections',
  'collections',
  'materials',
  'molds',
  'warehouses',
  'global_settings',
  'orders',
  'order_shipments',
  'order_shipment_items',
  'order_delivery_plans',
  'order_delivery_reminders',
  'production_batches',
  'batch_stage_history',
  'tag_color_overrides',
  'customers',
  'suppliers',
  'profiles',
  'supplier_orders',
  'offers',
  'legal_settings',
  'legal_numbering_sequences',
  'legal_carriers',
  'legal_documents',
  'legal_document_lines',
  'legal_transmissions',
  'legal_delivery_events',
  'legal_sync_runs',
  'proforma_documents',
  'proforma_document_lines',
  'price_snapshots',
  'price_snapshot_items',
  'stock_movements',
] as const;

const CHANNEL_NAME = 'realtime:app-data';
const RETRY_MS = 3000;
const READY_REFRESH_MIN_INTERVAL_MS = 30000;

export function useRealtimeInvalidation(): void {
  const queryClient = useQueryClient();
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const schedulerRef = useRef<ReturnType<typeof createRealtimeInvalidationScheduler> | null>(null);
  const lastReadyRefreshRef = useRef(0);

  useEffect(() => {
    if (isLocalMode) return;

    const realtimeTables = isInspectionModeActive()
      ? [...INSPECTION_REALTIME_TABLES]
      : [...CORE_REALTIME_TABLES];

    schedulerRef.current = createRealtimeInvalidationScheduler((domain, sourceTables) =>
      invalidateRealtimeDomain(queryClient, domain, sourceTables),
    );

    const handleChange = (payload: {
      table?: string;
      eventType?: string;
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => {
      if (tryPatchRealtimeCache(queryClient, payload as any)) {
        return;
      }
      if (!payload.table) return;
      const domains = getRealtimeInvalidationDomainsForTable(payload.table);
      domains.forEach((domain) => schedulerRef.current?.schedule(domain, payload.table));
    };

    const subscribe = () => {
      let channel = supabase.channel(
        isInspectionModeActive() ? 'realtime:inspection-legal' : CHANNEL_NAME,
      );

      realtimeTables.forEach((table) => {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          handleChange,
        );
      });

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          const now = Date.now();
          if (now - lastReadyRefreshRef.current >= READY_REFRESH_MIN_INTERVAL_MS) {
            lastReadyRefreshRef.current = now;
            void refetchRealtimeActiveQueries(queryClient);
          }
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void supabase.removeChannel(channel);
          channelRef.current = null;
          if (!retryTimerRef.current) {
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              subscribe();
            }, RETRY_MS);
          }
        }
      });

      channelRef.current = channel;
    };

    subscribe();

    return () => {
      schedulerRef.current?.dispose();
      schedulerRef.current = null;
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
}
