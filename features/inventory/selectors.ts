import type { InventoryAvailability, InventoryReservation } from './types';
import type { Product, Warehouse } from '../../types';

export interface InventoryTotals {
  onHand: number;
  reserved: number;
  available: number;
  incoming: number;
  outstandingDemand: number;
  projectedAvailable: number;
  lowStockCount: number;
}

export interface InventoryVariantGroup {
  variantSuffix: string;
  rows: InventoryAvailability[];
  totals: InventoryTotals;
  sizeCount: number;
  warehouseCount: number;
}

export interface InventorySkuGroup {
  productSku: string;
  rows: InventoryAvailability[];
  variants: InventoryVariantGroup[];
  totals: InventoryTotals;
  sizeCount: number;
  warehouseCount: number;
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

function compareInventoryText(left: string, right: string): number {
  return left.localeCompare(right, 'el-GR', {
    numeric: true,
    sensitivity: 'base',
  });
}

export function matchesInventoryAvailabilitySearch(
  row: InventoryAvailability,
  searchTerm: string,
  metadata: Array<string | null | undefined> = [],
): boolean {
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('el-GR');
  if (!normalizedSearch) return true;
  return [
    row.productSku,
    `${row.productSku}${row.variantSuffix}`,
    row.variantSuffix,
    row.sizeInfo,
    row.warehouseName,
    ...metadata,
  ].some((value) => String(value || '').toLocaleLowerCase('el-GR').includes(normalizedSearch));
}

function compareAvailabilityRows(left: InventoryAvailability, right: InventoryAvailability): number {
  const variantOrder = compareInventoryText(left.variantSuffix, right.variantSuffix);
  if (variantOrder !== 0) return variantOrder;

  const leftSize = left.sizeInfo || '';
  const rightSize = right.sizeInfo || '';
  const sizeOrder = compareInventoryText(leftSize, rightSize);
  if (sizeOrder !== 0) return sizeOrder;

  const warehousePriority = (type: string): number => {
    if (type === 'Central') return 0;
    if (type === 'Showroom') return 1;
    return 2;
  };
  const priorityOrder = warehousePriority(left.warehouseType) - warehousePriority(right.warehouseType);
  if (priorityOrder !== 0) return priorityOrder;
  return compareInventoryText(left.warehouseName, right.warehouseName);
}

/**
 * Produces the canonical navigation hierarchy used by every inventory surface:
 * main SKU -> variant -> size/location balance.
 */
export function groupInventoryAvailability(rows: InventoryAvailability[]): InventorySkuGroup[] {
  const skuMap = new Map<string, InventoryAvailability[]>();

  rows.forEach((row) => {
    const current = skuMap.get(row.productSku);
    if (current) current.push(row);
    else skuMap.set(row.productSku, [row]);
  });

  return Array.from(skuMap.entries())
    .sort(([leftSku], [rightSku]) => compareInventoryText(leftSku, rightSku))
    .map(([productSku, skuRows]) => {
      const sortedRows = [...skuRows].sort(compareAvailabilityRows);
      const variantMap = new Map<string, InventoryAvailability[]>();

      sortedRows.forEach((row) => {
        const current = variantMap.get(row.variantSuffix);
        if (current) current.push(row);
        else variantMap.set(row.variantSuffix, [row]);
      });

      const variants = Array.from(variantMap.entries())
        .sort(([leftSuffix], [rightSuffix]) => compareInventoryText(leftSuffix, rightSuffix))
        .map(([variantSuffix, variantRows]) => ({
          variantSuffix,
          rows: variantRows,
          totals: calculateInventoryTotals(variantRows),
          sizeCount: new Set(variantRows.map((row) => row.sizeInfo).filter(Boolean)).size,
          warehouseCount: new Set(variantRows.map((row) => row.warehouseId)).size,
        }));

      return {
        productSku,
        rows: sortedRows,
        variants,
        totals: calculateInventoryTotals(sortedRows),
        sizeCount: new Set(sortedRows.map((row) => row.sizeInfo).filter(Boolean)).size,
        warehouseCount: new Set(sortedRows.map((row) => row.warehouseId)).size,
      };
    });
}

/**
 * Keeps newly-created catalog products and variants reachable before their first
 * physical count. Their first mutation will create the canonical balance row.
 */
export function ensureCatalogInventoryAvailability(
  rows: InventoryAvailability[],
  products: Product[],
  defaultWarehouse: Warehouse | undefined,
): InventoryAvailability[] {
  if (!defaultWarehouse) return rows;

  const representedVariants = new Set(
    rows.map((row) => `${row.productSku}::${row.variantSuffix}`),
  );
  const additions: InventoryAvailability[] = [];

  products.forEach((product) => {
    const variantSuffixes = product.variants?.length
      ? product.variants.map((variant) => variant.suffix)
      : [''];

    variantSuffixes.forEach((variantSuffix) => {
      const key = `${product.sku}::${variantSuffix}`;
      if (representedVariants.has(key)) return;
      representedVariants.add(key);
      additions.push({
        productSku: product.sku,
        variantSuffix,
        sizeInfo: '',
        warehouseId: defaultWarehouse.id,
        warehouseName: defaultWarehouse.name,
        warehouseType: defaultWarehouse.type,
        onHand: 0,
        reserved: 0,
        available: 0,
        incoming: 0,
        outstandingDemand: 0,
        productionDemand: 0,
        purchaseDemand: 0,
        projectedAvailable: 0,
        reorderPoint: 0,
        preferredSupplierId: null,
        updatedAt: '',
      });
    });
  });

  return additions.length > 0 ? [...rows, ...additions] : rows;
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
