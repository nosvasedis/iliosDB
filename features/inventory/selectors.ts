import type { InventoryAvailability, InventoryReservation } from './types';

export interface InventoryTotals {
  onHand: number;
  reserved: number;
  available: number;
  incoming: number;
  outstandingDemand: number;
  projectedAvailable: number;
  lowStockCount: number;
}

export function calculateInventoryTotals(rows: InventoryAvailability[]): InventoryTotals {
  return rows.reduce<InventoryTotals>((totals, row) => {
    totals.onHand += row.onHand;
    totals.reserved += row.reserved;
    totals.available += row.available;
    totals.incoming += row.incoming;
    totals.outstandingDemand += row.outstandingDemand;
    totals.projectedAvailable += row.projectedAvailable;
    if (row.reorderPoint > 0 && row.available <= row.reorderPoint) totals.lowStockCount += 1;
    return totals;
  }, {
    onHand: 0,
    reserved: 0,
    available: 0,
    incoming: 0,
    outstandingDemand: 0,
    projectedAvailable: 0,
    lowStockCount: 0,
  });
}

export function reservationQuantityForLine(
  reservations: InventoryReservation[],
  lineId: string | null | undefined,
  productSku: string,
  variantSuffix?: string | null,
  sizeInfo?: string | null,
): number {
  return reservations
    .filter((reservation) => reservation.state === 'active')
    .filter((reservation) => reservation.productSku === productSku)
    .filter((reservation) => reservation.variantSuffix === (variantSuffix || ''))
    .filter((reservation) => lineId
      ? reservation.orderLineId === lineId
      : reservation.sizeInfo === (sizeInfo || ''))
    .reduce((sum, reservation) => sum + reservation.quantity, 0);
}

export function inventoryIdentityKey(
  identity: Pick<InventoryAvailability, 'productSku' | 'variantSuffix' | 'sizeInfo' | 'warehouseId'>,
): string {
  return [identity.productSku, identity.variantSuffix, identity.sizeInfo, identity.warehouseId].join('::');
}
