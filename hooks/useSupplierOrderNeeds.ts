import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Supplier, SupplierOrderItem } from '../types';
import { productionKeys, productionRepository } from '../features/production';
import {
  buildSupplierPurchaseNeedPlan,
  type SupplierOrderGroupedNeed,
  type SupplierOrderNeedRequirement,
} from '../features/suppliers/purchaseNeedPlanner';
import { api } from '../lib/supabase';
import { useAllShipmentItems, useAllShipments, useOrdersWithItems } from './api/useOrders';

export type { SupplierOrderGroupedNeed, SupplierOrderNeedRequirement };

/** Shared live net-shortage model for the desktop and mobile supplier-order builders. */
export function useSupplierOrderNeeds(
  supplier: Supplier,
  currentDraftItems: SupplierOrderItem[] = [],
  currentSupplierOrderId?: string | null,
) {
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
  const batchesQuery = useQuery({
    queryKey: productionKeys.batches(),
    queryFn: productionRepository.getProductionBatches,
  });
  const ordersQuery = useOrdersWithItems();
  const shipmentsQuery = useAllShipments();
  const shipmentItemsQuery = useAllShipmentItems();
  const supplierOrdersQuery = useQuery({ queryKey: ['supplier_orders'], queryFn: api.getSupplierOrders });

  const plan = useMemo(() => buildSupplierPurchaseNeedPlan({
    supplierId: supplier.id,
    products: productsQuery.data || [],
    orders: ordersQuery.data || [],
    productionBatches: batchesQuery.data || [],
    shipments: shipmentsQuery.data || [],
    shipmentItems: shipmentItemsQuery.data || [],
    supplierOrders: supplierOrdersQuery.data || [],
    currentDraftItems,
    currentSupplierOrderId,
  }), [
    supplier.id,
    productsQuery.data,
    ordersQuery.data,
    batchesQuery.data,
    shipmentsQuery.data,
    shipmentItemsQuery.data,
    supplierOrdersQuery.data,
    currentDraftItems,
    currentSupplierOrderId,
  ]);

  return {
    ...plan,
    isLoading: productsQuery.isLoading
      || ordersQuery.isLoading
      || batchesQuery.isLoading
      || shipmentsQuery.isLoading
      || shipmentItemsQuery.isLoading
      || supplierOrdersQuery.isLoading,
  };
}
