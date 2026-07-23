import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inventoryRepository, type InventoryAvailability } from '../../features/inventory';
import {
  applyInventoryPostingBalances,
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

  it('applies the RPC-confirmed KL201X balance without a full availability read', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(inventoryKeys.availability(), [{
      ...confirmedAvailability[0],
      onHand: 0,
      available: 0,
      projectedAvailable: -1,
    }]);
    const getAvailability = vi.spyOn(inventoryRepository, 'getAvailability');

    const patched = applyInventoryPostingBalances(queryClient, [{
      productSku: 'KL201',
      variantSuffix: 'X',
      sizeInfo: '',
      warehouseId: 'central',
      onHand: 2,
      reserved: 0,
      available: 2,
    }]);

    expect(patched[0]).toEqual(expect.objectContaining({
      productSku: 'KL201',
      variantSuffix: 'X',
      onHand: 2,
      reserved: 0,
      available: 2,
      projectedAvailable: 1,
    }));
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it('inserts a newly counted size row from the targeted RPC response', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(inventoryKeys.availability(), confirmedAvailability);

    const patched = applyInventoryPostingBalances(
      queryClient,
      [{
        productSku: 'DA012',
        variantSuffix: 'A',
        sizeInfo: '54',
        warehouseId: 'showroom',
        onHand: 1,
        reserved: 0,
        available: 1,
      }],
      [{ id: 'showroom', name: 'Δειγματολόγιο', type: 'Showroom', is_system: true } as any],
    );

    expect(patched).toContainEqual(expect.objectContaining({
      productSku: 'DA012',
      variantSuffix: 'A',
      sizeInfo: '54',
      warehouseId: 'showroom',
      warehouseName: 'Δειγματολόγιο',
      onHand: 1,
      available: 1,
    }));
  });
});
