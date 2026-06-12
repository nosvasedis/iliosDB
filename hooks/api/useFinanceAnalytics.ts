import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { legalKeys } from '../../features/legal/keys';
import { legalRepository } from '../../features/legal/repository';
import { useAllShipmentItems, useAllShipments, useOrdersWithItems } from './useOrders';
import { useCollections } from './useCollections';
import { useSellers } from './useSellers';
import { useSettings } from './useSettings';
import { buildFinanceAnalytics, FinanceAnalytics, FinancePeriodSelection } from '../../utils/financeAnalytics';
import { GlobalSettings, Product } from '../../types';

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

  const analytics = useMemo(() => {
    if (!effectiveSettings || !ordersQuery.data || !materialsQuery.data) return null;
    return buildFinanceAnalytics({
      orders: ordersQuery.data,
      shipments: shipmentsQuery.data || [],
      shipmentItems: shipmentItemsQuery.data || [],
      products: products || [],
      materials: materialsQuery.data || [],
      settings: effectiveSettings,
      collections: collectionsQuery.data || [],
      sellers: sellersQuery.data || [],
      legalDocuments: legalDocumentsQuery.data || [],
      period,
    });
  }, [
    collectionsQuery.data,
    legalDocumentsQuery.data,
    materialsQuery.data,
    ordersQuery.data,
    period,
    products,
    sellersQuery.data,
    effectiveSettings,
    shipmentItemsQuery.data,
    shipmentsQuery.data,
  ]);

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
