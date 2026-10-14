import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Customer, Order } from '../../types';
import { RETAIL_CUSTOMER_ID } from '../../lib/supabase';
import { isInspectionModeActive } from '../../lib/inspectionMode';
import { ordersRepository } from '../../features/orders';
import { buildCustomerDirectory, countRegions, type CustomerDirectoryEntry } from '../../features/customers/customerLocation';
import type { LatLng } from '../../features/customers/greekRegions';

/** Shared customer directory (stats + derived Περιοχή) and pin persistence for desktop and mobile. */
export function useCustomerDirectory(customers: Customer[] | undefined, orders: Order[] | undefined) {
  const queryClient = useQueryClient();

  const directory = useMemo<CustomerDirectoryEntry[]>(
    () => buildCustomerDirectory(customers ?? [], orders, { systemCustomerId: RETAIL_CUSTOMER_ID }),
    [customers, orders],
  );
  const regionCounts = useMemo(() => countRegions(directory), [directory]);
  const canEditLocation = !isInspectionModeActive();

  const saveLocation = useCallback(async (customerId: string, coords: LatLng | null) => {
    const patch = (list: Customer[] | undefined) => list?.map(c => c.id === customerId
      ? { ...c, latitude: coords ? coords[0] : null, longitude: coords ? coords[1] : null }
      : c);
    const snapshot = queryClient.getQueriesData<Customer[]>({ queryKey: ['customers'] });
    queryClient.setQueriesData<Customer[]>({ queryKey: ['customers'] }, patch);
    try {
      await ordersRepository.updateCustomerLocation(customerId, coords);
    } catch (error) {
      snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
      throw error;
    } finally {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    }
  }, [queryClient]);

  return { directory, regionCounts, saveLocation, canEditLocation };
}
