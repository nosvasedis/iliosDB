import { useQuery, type QueryClient } from '@tanstack/react-query';
import {
  applyInventoryAvailabilityToProducts,
  inventoryRepository,
} from '../../features/inventory';
import type { Product } from '../../types';

export const inventoryKeys = {
  all: ['inventory'] as const,
  availability: () => ['inventory', 'availability'] as const,
  events: () => ['inventory', 'events'] as const,
  reconciliation: () => ['inventory', 'reconciliation'] as const,
  reconciliationIssues: () => ['inventory', 'reconciliation', 'issues'] as const,
  reservations: (orderId: string) => ['inventory', 'reservations', orderId] as const,
};

export function useInventoryAvailability(options: { refetchOnMount?: boolean | 'always' } = {}) {
  return useQuery({
    queryKey: inventoryKeys.availability(),
    queryFn: inventoryRepository.getAvailability,
    staleTime: 15_000,
    refetchOnMount: options.refetchOnMount ?? 'always',
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: true,
  });
}

/**
 * Reads the canonical availability view after an inventory mutation and writes
 * the confirmed result into the shared cache before the UI reports success.
 */
export async function refreshInventoryAvailability(queryClient: QueryClient) {
  const availability = await inventoryRepository.getAvailability();
  queryClient.setQueryData(inventoryKeys.availability(), availability);
  queryClient.setQueryData<Product[]>(['products'], (products) => (
    products ? applyInventoryAvailabilityToProducts(products, availability) : products
  ));
  queryClient.setQueryData<{
    pages?: Array<{ products?: Product[]; hasMore?: boolean }>;
    pageParams?: unknown[];
  }>(['productsCatalog'], (catalog) => {
    if (!catalog?.pages) return catalog;
    return {
      ...catalog,
      pages: catalog.pages.map((page) => ({
        ...page,
        products: page.products
          ? applyInventoryAvailabilityToProducts(page.products, availability)
          : page.products,
      })),
    };
  });
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: inventoryKeys.events() }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.reconciliation() }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.reconciliationIssues() }),
    queryClient.invalidateQueries({ queryKey: ['products'] }),
    queryClient.invalidateQueries({ queryKey: ['productsCatalog'] }),
  ]);
  return availability;
}

export function useInventoryEvents(enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.events(),
    queryFn: () => inventoryRepository.getMovementHistory(),
    enabled,
  });
}

export function useInventoryReconciliationStatus(enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.reconciliation(),
    queryFn: inventoryRepository.getReconciliationStatus,
    enabled,
  });
}

export function useInventoryReconciliationIssues(enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.reconciliationIssues(),
    queryFn: inventoryRepository.getReconciliationIssues,
    enabled,
  });
}

export function useOrderInventoryReservations(orderId: string, enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.reservations(orderId),
    queryFn: () => inventoryRepository.getOrderReservations(orderId),
    enabled: enabled && !!orderId,
  });
}
