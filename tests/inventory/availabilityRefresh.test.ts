import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inventoryRepository, type InventoryAvailability } from '../../features/inventory';
import {
  inventoryKeys,
  refreshInventoryAvailability,
} from '../../hooks/api/useInventory';

const confirmedAvailability: InventoryAvailability[] = [{
  productSku: 'KL201',
  variantSuffix: 'X',
  sizeInfo: '',
  warehouseId: 'central',
  warehouseName: 'Κεντρική Αποθήκη',
  warehouseType: 'Central',
  onHand: 2,
  reserved: 0,
  available: 2,
  incoming: 0,
  outstandingDemand: 1,
  productionDemand: 1,
  purchaseDemand: 0,
  projectedAvailable: 1,
  reorderPoint: 0,
  preferredSupplierId: null,
  updatedAt: '2026-07-23T08:27:06.000Z',
}];

describe('canonical inventory availability refresh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces a stale zero with the database-confirmed balance before success is reported', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(inventoryKeys.availability(), [{
      ...confirmedAvailability[0],
      onHand: 0,
      available: 0,
      projectedAvailable: -1,
    }]);
    vi.spyOn(inventoryRepository, 'getAvailability').mockResolvedValue(confirmedAvailability);

    const refreshed = await refreshInventoryAvailability(queryClient);

    expect(refreshed).toEqual(confirmedAvailability);
    expect(queryClient.getQueryData(inventoryKeys.availability())).toEqual(confirmedAvailability);
    expect(inventoryRepository.getAvailability).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite the visible balance when the canonical readback fails', async () => {
    const queryClient = new QueryClient();
    const staleAvailability = [{
      ...confirmedAvailability[0],
      onHand: 0,
      available: 0,
      projectedAvailable: -1,
    }];
    queryClient.setQueryData(inventoryKeys.availability(), staleAvailability);
    vi.spyOn(inventoryRepository, 'getAvailability').mockRejectedValue(new Error('readback failed'));

    await expect(refreshInventoryAvailability(queryClient)).rejects.toThrow('readback failed');
    expect(queryClient.getQueryData(inventoryKeys.availability())).toEqual(staleAvailability);
  });
});
