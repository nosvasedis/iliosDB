import type { Product } from '../../types';
import type { InventoryAvailability } from './types';

interface PositionTotals {
  onHand: number;
  reserved: number;
  available: number;
  bySize: Record<string, number>;
}

function emptyTotals(): PositionTotals {
  return { onHand: 0, reserved: 0, available: 0, bySize: {} };
}

/**
 * Projects the canonical inventory view onto legacy Product fields still used
 * by registry, seller and employee surfaces. It is a read projection only:
 * inventory_balances remains the sole stock source of truth.
 */
export function applyInventoryAvailabilityToProducts(
  products: Product[],
  availability: InventoryAvailability[],
): Product[] {
  const centralWarehouseId = availability.find((row) => row.warehouseType === 'Central')?.warehouseId;
  const showroomWarehouseId = availability.find((row) => row.warehouseType === 'Showroom')?.warehouseId;
  const positions = new Map<string, Map<string, PositionTotals>>();

  availability.forEach((row) => {
    const identityKey = `${row.productSku}::${row.variantSuffix}`;
    const byWarehouse = positions.get(identityKey) || new Map<string, PositionTotals>();
    const totals = byWarehouse.get(row.warehouseId) || emptyTotals();
    totals.onHand += row.onHand;
    totals.reserved += row.reserved;
    totals.available += row.available;
    if (row.sizeInfo) {
      totals.bySize[row.sizeInfo] = (totals.bySize[row.sizeInfo] || 0) + row.onHand;
    }
    byWarehouse.set(row.warehouseId, totals);
    positions.set(identityKey, byWarehouse);
  });

  const projectIdentity = (
    productSku: string,
    variantSuffix: string,
  ): {
    stockQty: number;
    sampleQty: number;
    stockBySize: Record<string, number>;
    sampleStockBySize: Record<string, number>;
    locationStock: Record<string, number>;
    reservedQty: number;
    availableQty: number;
    locationReserved: Record<string, number>;
    locationAvailable: Record<string, number>;
  } => {
    const byWarehouse = positions.get(`${productSku}::${variantSuffix}`) || new Map();
    const locationStock: Record<string, number> = {};
    const locationReserved: Record<string, number> = {};
    const locationAvailable: Record<string, number> = {};
    byWarehouse.forEach((totals, warehouseId) => {
      locationStock[warehouseId] = totals.onHand;
      locationReserved[warehouseId] = totals.reserved;
      locationAvailable[warehouseId] = totals.available;
    });
    const central = centralWarehouseId ? byWarehouse.get(centralWarehouseId) : undefined;
    const showroom = showroomWarehouseId ? byWarehouse.get(showroomWarehouseId) : undefined;
    return {
      stockQty: central?.onHand || 0,
      sampleQty: showroom?.onHand || 0,
      stockBySize: { ...(central?.bySize || {}) },
      sampleStockBySize: { ...(showroom?.bySize || {}) },
      locationStock,
      reservedQty: central?.reserved || 0,
      availableQty: central?.available || 0,
      locationReserved,
      locationAvailable,
    };
  };

  return products.map((product) => {
    const master = projectIdentity(product.sku, '');
    return {
      ...product,
      stock_qty: master.stockQty,
      sample_qty: master.sampleQty,
      stock_by_size: master.stockBySize,
      sample_stock_by_size: master.sampleStockBySize,
      location_stock: master.locationStock,
      reserved_qty: master.reservedQty,
      available_qty: master.availableQty,
      location_reserved: master.locationReserved,
      location_available: master.locationAvailable,
      variants: product.variants?.map((variant) => {
        const projected = projectIdentity(product.sku, variant.suffix);
        return {
          ...variant,
          stock_qty: projected.stockQty,
          stock_by_size: projected.stockBySize,
          location_stock: projected.locationStock,
          reserved_qty: projected.reservedQty,
          available_qty: projected.availableQty,
          location_reserved: projected.locationReserved,
          location_available: projected.locationAvailable,
        };
      }),
    };
  });
}
