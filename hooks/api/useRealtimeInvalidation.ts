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
import {
  shouldRemoveRealtimeChannelOnStatus,
  shouldRetryRealtimeChannelOnStatus,
} from '../realtimeChannelLifecycle';
import { createRealtimeInvalidationScheduler } from './realtimeInvalidationScheduler';
import {
  createSellerCatalogRealtimeScheduler,
  SELLER_CATALOG_REALTIME_TABLES,
} from '../../features/sellerCatalog/realtime';
import { refreshSellerCatalog } from '../../features/sellerCatalog/sync';
import {
  createErpCatalogRealtimeScheduler,
  ERP_CATALOG_REALTIME_TABLES,
  getErpCatalogFullSyncedAt,
  refreshErpProducts,
  shouldRefreshErpCatalog,
} from '../../features/erpCatalog';

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
  'legal_external_item_aliases',
  'legal_transmissions',
  'legal_delivery_events',
  'legal_sync_runs',
  'proforma_documents',
  'proforma_document_lines',
  'price_snapshots',
  'price_snapshot_items',
  'stock_movements',
  'inventory_balances',
  'inventory_reservations',
  'inventory_events',
  'inventory_reorder_policies',
  'inventory_reconciliation_issues',
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

export type RealtimeScope = 'erp' | 'seller';

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
    id: 'inventory',
    channelName: `${CHANNEL_NAME}:inventory`,
    tables: [
      'inventory_balances',
      'inventory_reservations',
      'inventory_events',
      'inventory_reorder_policies',
      'inventory_reconciliation_issues',
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
      'legal_external_item_aliases',
      'legal_transmissions',
      'legal_delivery_events',
      'legal_sync_runs',
      'proforma_documents',
      'proforma_document_lines',
    ],
  },
] as const;

export const SELLER_REALTIME_CHANNEL_GROUPS: readonly RealtimeChannelGroup[] = [
  {
    id: 'seller-catalog',
    channelName: `${CHANNEL_NAME}:seller-catalog`,
    tables: SELLER_CATALOG_REALTIME_TABLES,
  },
  {
    id: 'seller-workflow',
    channelName: `${CHANNEL_NAME}:seller-workflow`,
    tables: ['orders', 'customers'],
  },
] as const;

export function getRealtimeChannelGroups(
  inspectionModeActive = isInspectionModeActive(),
  scope: RealtimeScope = 'erp',
): RealtimeChannelGroup[] {
  if (inspectionModeActive) {
    return [
      {
        id: 'inspection-legal',
        channelName: 'realtime:inspection-legal',
        tables: [...INSPECTION_REALTIME_TABLES] as CoreRealtimeTable[],
      },
    ];
  }
  const groups = scope === 'seller' ? SELLER_REALTIME_CHANNEL_GROUPS : CORE_REALTIME_CHANNEL_GROUPS;
  return groups.map((group) => ({ ...group, tables: [...group.tables] }));
}

export function useRealtimeInvalidation(scope: RealtimeScope = 'erp'): void {
  const queryClient = useQueryClient();
  const retryTimerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const channelRefs = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());
  const schedulerRef = useRef<ReturnType<typeof createRealtimeInvalidationScheduler> | null>(null);
  const sellerCatalogSchedulerRef = useRef<ReturnType<typeof createSellerCatalogRealtimeScheduler> | null>(null);
  const erpCatalogSchedulerRef = useRef<ReturnType<typeof createErpCatalogRealtimeScheduler> | null>(null);
  const lastReadyRefreshRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (isLocalMode) return;

    let disposed = false;
    const realtimeGroups = getRealtimeChannelGroups(isInspectionModeActive(), scope);

    schedulerRef.current = createRealtimeInvalidationScheduler((domain, sourceTables) =>
      invalidateRealtimeDomain(queryClient, domain, sourceTables),
    );
    if (scope === 'seller') {
      sellerCatalogSchedulerRef.current = createSellerCatalogRealtimeScheduler(async (skus) => {
        try {
          await refreshSellerCatalog(queryClient, skus);
        } catch (error) {
          console.warn('Seller catalogue realtime reconciliation failed:', error);
        }
      });
    } else if (scope === 'erp' && !isInspectionModeActive()) {
      erpCatalogSchedulerRef.current = createErpCatalogRealtimeScheduler(async (skus) => {
        try {
          await refreshErpProducts(queryClient, skus);
        } catch (error) {
          console.warn('ERP catalogue realtime reconciliation failed:', error);
        }
      });
    }

    const handleChange = (payload: {
      table?: string;
      eventType?: string;
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => {
      if (scope === 'seller'
        && payload.table
        && (SELLER_CATALOG_REALTIME_TABLES as readonly string[]).includes(payload.table)) {
        sellerCatalogSchedulerRef.current?.schedule(payload);
        return;
      }
      if (tryPatchRealtimeCache(queryClient, payload as any)) {
        return;
      }
      if (scope === 'erp'
        && payload.table
        && (ERP_CATALOG_REALTIME_TABLES as readonly string[]).includes(payload.table)) {
        erpCatalogSchedulerRef.current?.schedule(payload);
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
          if (scope === 'seller' && group.id === 'seller-catalog') return;
          const now = Date.now();
          const lastReadyRefresh = lastReadyRefreshRef.current.get(group.id) ?? 0;
          if (now - lastReadyRefresh >= READY_REFRESH_MIN_INTERVAL_MS) {
            lastReadyRefreshRef.current.set(group.id, now);
            void (async () => {
              if (scope === 'seller') {
                await refetchRealtimeDomains(queryClient, ['orders', 'contacts']);
                return;
              }
              const domains = getRealtimeDomainsForTables(group.tables);
              if (group.id === 'products' || domains.includes('products')) {
                const fullSyncedAt = await getErpCatalogFullSyncedAt();
                if (!shouldRefreshErpCatalog(fullSyncedAt, now)) {
                  const rest = domains.filter((domain) => domain !== 'products');
                  if (rest.length > 0) await refetchRealtimeDomains(queryClient, rest);
                  return;
                }
              }
              await refetchRealtimeDomains(queryClient, domains);
            })();
          }
        }
        if (shouldRetryRealtimeChannelOnStatus(status)) {
          if (shouldRemoveRealtimeChannelOnStatus(status)) {
            void supabase.removeChannel(channel);
          }
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
      sellerCatalogSchedulerRef.current?.dispose();
      sellerCatalogSchedulerRef.current = null;
      erpCatalogSchedulerRef.current?.dispose();
      erpCatalogSchedulerRef.current = null;
      retryTimerRefs.current.forEach((timer) => clearTimeout(timer));
      retryTimerRefs.current.clear();
      channelRefs.current.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
      channelRefs.current.clear();
    };
  }, [queryClient, scope]);
}
