import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isLocalMode, supabase } from '../../lib/supabase';
import { isInspectionModeActive } from '../../lib/inspectionMode';
import { INSPECTION_REALTIME_TABLES } from '../../lib/inspectionAllowedTables';
import {
  getRealtimeDomainsForTables,
  getRealtimeInvalidationDomainsForTable,
  invalidateRealtimeDomain,
  refetchRealtimeDomains,
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

type CoreRealtimeTable = typeof CORE_REALTIME_TABLES[number];

export type RealtimeChannelGroup = {
  id: string;
  channelName: string;
  tables: readonly CoreRealtimeTable[];
};

export const CORE_REALTIME_CHANNEL_GROUPS: readonly RealtimeChannelGroup[] = [
  {
    id: 'products',
    channelName: `${CHANNEL_NAME}:products`,
    tables: [
      'products',
      'product_variants',
      'product_stock',
      'recipes',
      'product_molds',
      'product_collections',
      'collections',
      'stock_movements',
    ],
  },
  {
    id: 'orders-deliveries',
    channelName: `${CHANNEL_NAME}:orders-deliveries`,
    tables: [
      'orders',
      'order_shipments',
      'order_shipment_items',
      'order_delivery_plans',
      'order_delivery_reminders',
      'tag_color_overrides',
    ],
  },
  {
    id: 'production',
    channelName: `${CHANNEL_NAME}:production`,
    tables: ['production_batches', 'batch_stage_history'],
  },
  {
    id: 'resources',
    channelName: `${CHANNEL_NAME}:resources`,
    tables: ['materials', 'molds', 'warehouses'],
  },
  {
    id: 'contacts-settings',
    channelName: `${CHANNEL_NAME}:contacts-settings`,
    tables: [
      'global_settings',
      'customers',
      'suppliers',
      'profiles',
      'supplier_orders',
      'offers',
      'price_snapshots',
      'price_snapshot_items',
    ],
  },
  {
    id: 'legal',
    channelName: `${CHANNEL_NAME}:legal`,
    tables: [
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
    ],
  },
] as const;

export function getRealtimeChannelGroups(inspectionModeActive = isInspectionModeActive()): RealtimeChannelGroup[] {
  if (inspectionModeActive) {
    return [
      {
        id: 'inspection-legal',
        channelName: 'realtime:inspection-legal',
        tables: [...INSPECTION_REALTIME_TABLES] as CoreRealtimeTable[],
      },
    ];
  }
  return CORE_REALTIME_CHANNEL_GROUPS.map((group) => ({ ...group, tables: [...group.tables] }));
}

export function useRealtimeInvalidation(): void {
  const queryClient = useQueryClient();
  const retryTimerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const channelRefs = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());
  const schedulerRef = useRef<ReturnType<typeof createRealtimeInvalidationScheduler> | null>(null);
  const lastReadyRefreshRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (isLocalMode) return;

    let disposed = false;
    const realtimeGroups = getRealtimeChannelGroups();

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

    const scheduleRetry = (group: RealtimeChannelGroup) => {
      if (disposed || retryTimerRefs.current.has(group.id)) return;
      const timer = setTimeout(() => {
        retryTimerRefs.current.delete(group.id);
        subscribeGroup(group);
      }, RETRY_MS);
      retryTimerRefs.current.set(group.id, timer);
    };

    const subscribeGroup = (group: RealtimeChannelGroup) => {
      if (disposed) return;
      let channel = supabase.channel(group.channelName);

      group.tables.forEach((table) => {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          handleChange,
        );
      });

      channel.subscribe((status) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          const now = Date.now();
          const lastReadyRefresh = lastReadyRefreshRef.current.get(group.id) ?? 0;
          if (now - lastReadyRefresh >= READY_REFRESH_MIN_INTERVAL_MS) {
            lastReadyRefreshRef.current.set(group.id, now);
            void refetchRealtimeDomains(queryClient, getRealtimeDomainsForTables(group.tables));
          }
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          void supabase.removeChannel(channel);
          channelRefs.current.delete(group.id);
          scheduleRetry(group);
        }
      });

      channelRefs.current.set(group.id, channel);
    };

    realtimeGroups.forEach((group) => subscribeGroup(group));

    return () => {
      disposed = true;
      schedulerRef.current?.dispose();
      schedulerRef.current = null;
      retryTimerRefs.current.forEach((timer) => clearTimeout(timer));
      retryTimerRefs.current.clear();
      channelRefs.current.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
      channelRefs.current.clear();
    };
  }, [queryClient]);
}
