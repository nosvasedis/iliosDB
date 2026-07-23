import { useQuery } from '@tanstack/react-query';
import { inventoryRepository } from '../../features/inventory';

export const inventoryKeys = {
  all: ['inventory'] as const,
  availability: () => ['inventory', 'availability'] as const,
  events: () => ['inventory', 'events'] as const,
  reconciliation: () => ['inventory', 'reconciliation'] as const,
  reconciliationIssues: () => ['inventory', 'reconciliation', 'issues'] as const,
  reservations: (orderId: string) => ['inventory', 'reservations', orderId] as const,
};

export function useInventoryAvailability() {
  return useQuery({
    queryKey: inventoryKeys.availability(),
    queryFn: inventoryRepository.getAvailability,
  });
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
