import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { legalKeys } from '../../features/legal/keys';
import { legalRepository } from '../../features/legal/repository';
import { useAllShipmentItems, useAllShipments, useOrdersWithItems } from './useOrders';
import { useCollections } from './useCollections';
import { useSellers } from './useSellers';
import { useSettings } from './useSettings';
import {
  buildFinanceLineEvents,
  rankFinanceAnalyticsFromEvents,
  FinanceAnalytics,
  FinanceLineEventBundle,
  FinancePeriodSelection,
} from '../../utils/financeAnalytics';
import { GlobalSettings, Product } from '../../types';

// The event bundle and ranking computations below are pure, but can be fairly expensive
// (they walk every order/shipment line in the system). Multiple screens call this hook with
// the same underlying react-query data (which keeps stable object references between
// re-renders/re-mounts), so we cache results by reference-identity of the inputs. This avoids
// redoing the full-system computation every time e.g. a modal tab is opened/closed, while still
// recomputing correctly whenever the underlying data actually changes (new references).
const EVENT_BUNDLE_CACHE_SIZE = 6;
const eventBundleCache: Array<{
  orders: unknown;
  shipments: unknown;
  shipmentItems: unknown;
  products: unknown;
  materials: unknown;
  settings: unknown;
  collections: unknown;
  sellers: unknown;
  result: FinanceLineEventBundle;
}> = [];

function getCachedEventBundle(params: {
  orders: unknown;
  shipments: unknown;
  shipmentItems: unknown;
  products: unknown;
  materials: unknown;
  settings: unknown;
  collections: unknown;
  sellers: unknown;
}): FinanceLineEventBundle {
  const hit = eventBundleCache.find(entry =>
    entry.orders === params.orders &&
    entry.shipments === params.shipments &&
    entry.shipmentItems === params.shipmentItems &&
    entry.products === params.products &&
    entry.materials === params.materials &&
    entry.settings === params.settings &&
    entry.collections === params.collections &&
    entry.sellers === params.sellers
  );
  if (hit) return hit.result;

  const result = buildFinanceLineEvents({
    orders: params.orders as any,
    shipments: params.shipments as any,
    shipmentItems: params.shipmentItems as any,
    products: params.products as any,
    materials: params.materials as any,
    settings: params.settings as any,
    collections: params.collections as any,
    sellers: params.sellers as any,
  });
  eventBundleCache.unshift({ ...params, result });
  if (eventBundleCache.length > EVENT_BUNDLE_CACHE_SIZE) eventBundleCache.length = EVENT_BUNDLE_CACHE_SIZE;
  return result;
}

const RANKED_ANALYTICS_CACHE_SIZE = 8;
const rankedAnalyticsCache: Array<{
  eventBundle: FinanceLineEventBundle;
  orders: unknown;
  legalDocuments: unknown;
  periodKey: string;
  result: FinanceAnalytics;
}> = [];

function getCachedRankedAnalytics(params: {
  eventBundle: FinanceLineEventBundle;
  orders: unknown;
  legalDocuments: unknown;
  period: FinancePeriodSelection | undefined;
}): FinanceAnalytics {
  const periodKey = params.period?.mode || 'current_year';
  const hit = rankedAnalyticsCache.find(entry =>
    entry.eventBundle === params.eventBundle &&
    entry.orders === params.orders &&
    entry.legalDocuments === params.legalDocuments &&
    entry.periodKey === periodKey
  );
  if (hit) return hit.result;

  const result = rankFinanceAnalyticsFromEvents({
    orders: params.orders as any,
    legalDocuments: params.legalDocuments as any,
    period: params.period,
  }, params.eventBundle);
  rankedAnalyticsCache.unshift({ eventBundle: params.eventBundle, orders: params.orders, legalDocuments: params.legalDocuments, periodKey, result });
  if (rankedAnalyticsCache.length > RANKED_ANALYTICS_CACHE_SIZE) rankedAnalyticsCache.length = RANKED_ANALYTICS_CACHE_SIZE;
  return result;
}

interface UseFinanceAnalyticsParams {
  products: Product[];
  settings?: GlobalSettings | null;
  period?: FinancePeriodSelection;
}

export function useFinanceAnalytics({ products, settings, period }: UseFinanceAnalyticsParams): {
  analytics: FinanceAnalytics | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
} {
  const ordersQuery = useOrdersWithItems();
  const shipmentsQuery = useAllShipments();
  const shipmentItemsQuery = useAllShipmentItems();
  const materialsQuery = useQuery({ queryKey: ['materials'], queryFn: api.getMaterials });
  const collectionsQuery = useCollections();
  const sellersQuery = useSellers();
  const legalDocumentsQuery = useQuery({ queryKey: legalKeys.documents(), queryFn: legalRepository.getDocuments });
  const settingsQuery = useSettings();
  const effectiveSettings = settings || settingsQuery.data || null;

  const shipments = shipmentsQuery.data || [];
  const shipmentItems = shipmentItemsQuery.data || [];
  const collections = collectionsQuery.data || [];
  const sellers = sellersQuery.data || [];
  const legalDocuments = legalDocumentsQuery.data || [];

  const eventBundle = useMemo(() => {
    if (!effectiveSettings || !ordersQuery.data || !materialsQuery.data) return null;
    return getCachedEventBundle({
      orders: ordersQuery.data,
      shipments,
      shipmentItems,
      products: products || [],
      materials: materialsQuery.data,
      settings: effectiveSettings,
      collections,
      sellers,
    });
  }, [
    collections,
    materialsQuery.data,
    ordersQuery.data,
    products,
    sellers,
    effectiveSettings,
    shipmentItems,
    shipments,
  ]);

  const analytics = useMemo(() => {
    if (!eventBundle || !ordersQuery.data) return null;
    return getCachedRankedAnalytics({
      eventBundle,
      orders: ordersQuery.data,
      legalDocuments,
      period,
    });
  }, [eventBundle, legalDocuments, ordersQuery.data, period]);

  const isLoading = ordersQuery.isLoading
    || shipmentsQuery.isLoading
    || shipmentItemsQuery.isLoading
    || materialsQuery.isLoading
    || collectionsQuery.isLoading
    || sellersQuery.isLoading
    || legalDocumentsQuery.isLoading
    || (!settings && settingsQuery.isLoading);

  const error = ordersQuery.error
    || shipmentsQuery.error
    || shipmentItemsQuery.error
    || materialsQuery.error
    || collectionsQuery.error
    || sellersQuery.error
    || legalDocumentsQuery.error
    || (!settings ? settingsQuery.error : null);

  const isError = ordersQuery.isError
    || shipmentsQuery.isError
    || shipmentItemsQuery.isError
    || materialsQuery.isError
    || collectionsQuery.isError
    || sellersQuery.isError
    || legalDocumentsQuery.isError
    || (!settings && settingsQuery.isError);

  const refetch = () => {
    ordersQuery.refetch();
    shipmentsQuery.refetch();
    shipmentItemsQuery.refetch();
    materialsQuery.refetch();
    collectionsQuery.refetch();
    sellersQuery.refetch();
    legalDocumentsQuery.refetch();
    if (!settings) settingsQuery.refetch();
  };

  return { analytics, isLoading, isError, error, refetch };
}
