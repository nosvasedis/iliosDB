import { useQuery, type QueryClient } from '@tanstack/react-query';
import {
  applyInventoryAvailabilityToProducts,
  inventoryRepository,
  mergeInventoryCountTargetedAvailability,
} from '../../features/inventory';
import type {
  InventoryAvailability,
  InventoryPostingBalance,
} from '../../features/inventory';
import type { Product, Warehouse } from '../../types';

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
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: options.refetchOnMount ?? true,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: false,
  });
}

function projectAvailabilityIntoSharedProductCaches(
  queryClient: QueryClient,
  availability: InventoryAvailability[],
): void {
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
}

/**
 * Applies the canonical balances returned by an atomic posting RPC. This keeps
 * every visible inventory/product surface current without downloading the full
 * 7,000+ row availability view after each count.
 */
export function applyInventoryPostingBalances(
  queryClient: QueryClient,
  balances: InventoryPostingBalance[],
  warehouses: Warehouse[] = [],
  updatedAt = new Date().toISOString(),
): InventoryAvailability[] {
  const current = queryClient.getQueryData<InventoryAvailability[]>(inventoryKeys.availability());
  if (!current) {
    throw new Error('Η καταχώριση ολοκληρώθηκε στη βάση, αλλά η τοπική προβολή αποθέματος δεν ήταν διαθέσιμη για ασφαλή ενημέρωση. Μην επαναλάβετε την καταχώριση. Πατήστε «Ανανέωση» για να εμφανιστούν τα επιβεβαιωμένα υπόλοιπα.');
  }
  const merged = mergeInventoryCountTargetedAvailability(
    current,
    balances,
    warehouses.map((warehouse) => ({
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      warehouseType: warehouse.type,
    })),
    updatedAt,
  ).rows;
  queryClient.setQueryData(inventoryKeys.availability(), merged);
  projectAvailabilityIntoSharedProductCaches(queryClient, merged);
  return merged;
}

/**
 * Reads the canonical availability view after an inventory mutation and writes
 * the confirmed result into the shared cache before the UI reports success.
 */
export async function refreshInventoryAvailability(queryClient: QueryClient) {
  const availability = await inventoryRepository.getAvailability();
  queryClient.setQueryData(inventoryKeys.availability(), availability);
  projectAvailabilityIntoSharedProductCaches(queryClient, availability);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: inventoryKeys.events() }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.reconciliation() }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.reconciliationIssues() }),
  ]);
  return availability;
}

export async function refreshInventoryAuditQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: inventoryKeys.events() }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.reconciliation() }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.reconciliationIssues() }),
  ]);
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
