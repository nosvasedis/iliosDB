import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Customer, Order } from '../../types';
import { SYSTEM_CUSTOMER_IDS } from '../../utils/retailConstants';
import { isInspectionModeActive } from '../../lib/inspectionMode';
import { ordersRepository } from '../../features/orders';
import { buildCustomerDirectory, countRegions, customerBranches, type CustomerDirectoryEntry } from '../../features/customers/customerLocation';
import type { LatLng } from '../../features/customers/greekRegions';

/** Shared customer directory (stats + derived Περιοχή) and pin persistence for desktop and mobile. */
export function useCustomerDirectory(customers: Customer[] | undefined, orders: Order[] | undefined) {
  const queryClient = useQueryClient();

  const directory = useMemo<CustomerDirectoryEntry[]>(
    () => buildCustomerDirectory(customers ?? [], orders, { systemCustomerIds: SYSTEM_CUSTOMER_IDS }),
    [customers, orders],
  );
  const regionCounts = useMemo(() => countRegions(directory), [directory]);
  const canEditLocation = !isInspectionModeActive();

  /**
   * Saves a manual pin. With `branchId` it moves that shop's pin, otherwise the fiscal-seat pin.
   * `null` coords go back to the automatic (address-based) position.
   */
  const saveLocation = useCallback(async (customerId: string, coords: LatLng | null, branchId?: string | null) => {
    const lat = coords ? coords[0] : null;
    const lng = coords ? coords[1] : null;
    const current = queryClient.getQueriesData<Customer[]>({ queryKey: ['customers'] })
      .flatMap(([, list]) => list ?? [])
      .find(c => c.id === customerId);

    const patchCustomer = (c: Customer): Customer => (branchId
      ? { ...c, branches: customerBranches(c).map(b => (b.id === branchId ? { ...b, latitude: lat, longitude: lng } : b)) }
      : { ...c, latitude: lat, longitude: lng });

    const snapshot = queryClient.getQueriesData<Customer[]>({ queryKey: ['customers'] });
    queryClient.setQueriesData<Customer[]>({ queryKey: ['customers'] }, list => list?.map(c => (c.id === customerId ? patchCustomer(c) : c)));
    try {
      if (branchId) {
        if (!current) throw new Error('Ο πελάτης δεν βρέθηκε.');
        await ordersRepository.updateCustomerBranches(customerId, patchCustomer(current).branches ?? []);
      } else {
        await ordersRepository.updateCustomerLocation(customerId, coords);
      }
    } catch (error) {
      snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
      throw error;
    } finally {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    }
  }, [queryClient]);

  return { directory, regionCounts, saveLocation, canEditLocation };
}
