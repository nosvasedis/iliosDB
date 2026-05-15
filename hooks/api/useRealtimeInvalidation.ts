import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isLocalMode, supabase } from '../../lib/supabase';
import {
  getRealtimeInvalidationDomainsForTable,
  invalidateRealtimeDomain,
} from '../../lib/queryInvalidation';
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
  'price_snapshots',
  'price_snapshot_items',
  'stock_movements',
] as const;

const CHANNEL_NAME = 'realtime:app-data';
const RETRY_MS = 3000;

export function useRealtimeInvalidation(): void {
  const queryClient = useQueryClient();
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const schedulerRef = useRef<ReturnType<typeof createRealtimeInvalidationScheduler> | null>(null);

  useEffect(() => {
    if (isLocalMode) return;

    schedulerRef.current = createRealtimeInvalidationScheduler((domain) =>
      invalidateRealtimeDomain(queryClient, domain),
    );

    const handleChange = (payload: { table?: string }) => {
      if (!payload.table) return;
      const domains = getRealtimeInvalidationDomainsForTable(payload.table);
      domains.forEach((domain) => schedulerRef.current?.schedule(domain));
    };

    const subscribe = () => {
      let channel = supabase.channel(CHANNEL_NAME);

      CORE_REALTIME_TABLES.forEach((table) => {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          handleChange,
        );
      });

      channel.subscribe((status) => {
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
