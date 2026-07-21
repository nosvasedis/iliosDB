import { OrderItem, OrderStatus, ProductionBatch } from '../../types';
import { buildOrderItemIdentityKey } from '../orders/printHelpers';
import { getNaturalCatalogKey } from './orderBatchReconcile';

export type ProductionSendQuantityMap = Record<number, number>;

export type ProductionSendRowInput = Pick<
  OrderItem,
  | 'sku'
  | 'variant_suffix'
  | 'quantity'
  | 'price_at_order'
  | 'size_info'
  | 'cord_color'
  | 'enamel_color'
  | 'notes'
  | 'line_id'
> & {
  originalIndex: number;
  remainingQty: number;
};

export type PlannedProductionSendItem = {
  sku: string;
  variant: string | null;
  qty: number;
  size_info?: string | null;
  cord_color?: string | null;
  enamel_color?: string | null;
  notes?: string;
  line_id?: string | null;
};

export type ProductionSendSelectionSummary = {
  totalSelectedQty: number;
  selectedLineCount: number;
  visiblePendingQty: number;
  visibleSelectedQty: number;
  hiddenSelectedQty: number;
  hiddenSelectedLineCount: number;
  totalPendingQty: number;
};

/** Preserve partial-delivery semantics when another production part is started. */
export function getProductionSendOrderStatus(existingShipmentCount: number): OrderStatus {
  return existingShipmentCount > 0 ? OrderStatus.PartiallyDelivered : OrderStatus.InProduction;
}

function clampSendQuantity(row: ProductionSendRowInput, value: number): number {
  if (!Number.isFinite(value) || row.remainingQty <= 0) return 0;
  return Math.min(row.remainingQty, Math.max(0, Math.trunc(value)));
}

function normalizeSelection(rows: ProductionSendRowInput[], quantities: ProductionSendQuantityMap): ProductionSendQuantityMap {
  const rowsByIndex = new Map(rows.map((row) => [row.originalIndex, row]));
  const next: ProductionSendQuantityMap = {};

  for (const [indexText, quantity] of Object.entries(quantities)) {
    const originalIndex = Number(indexText);
    const row = rowsByIndex.get(originalIndex);
    if (!row) continue;
    const clamped = clampSendQuantity(row, quantity);
    if (clamped > 0) next[originalIndex] = clamped;
  }

  return next;
}

export function updateProductionSendQuantity(
  current: ProductionSendQuantityMap,
  row: ProductionSendRowInput,
  value: number,
): ProductionSendQuantityMap {
  const clamped = clampSendQuantity(row, value);
  const next = { ...current };
  if (clamped > 0) next[row.originalIndex] = clamped;
  else delete next[row.originalIndex];
  return next;
}

export function selectVisibleProductionSendRows(
  current: ProductionSendQuantityMap,
  visibleRows: ProductionSendRowInput[],
): ProductionSendQuantityMap {
  const next = { ...current };
  for (const row of visibleRows) {
    if (row.remainingQty > 0) next[row.originalIndex] = row.remainingQty;
  }
  return next;
}

export function unselectVisibleProductionSendRows(
  current: ProductionSendQuantityMap,
  visibleRows: ProductionSendRowInput[],
): ProductionSendQuantityMap {
  const next = { ...current };
  for (const row of visibleRows) {
    delete next[row.originalIndex];
  }
  return next;
}

export function clearProductionSendSelection(): ProductionSendQuantityMap {
  return {};
}

export function buildProductionSendItemsFromSelection(
  rows: ProductionSendRowInput[],
  quantities: ProductionSendQuantityMap,
): PlannedProductionSendItem[] {
  const normalized = normalizeSelection(rows, quantities);

  return rows.flatMap((row) => {
    const qty = normalized[row.originalIndex] || 0;
    if (qty <= 0) return [];
    return [{
      sku: row.sku,
      variant: row.variant_suffix || null,
      qty,
      size_info: row.size_info,
      cord_color: row.cord_color || null,
      enamel_color: row.enamel_color || null,
      notes: row.notes,
      line_id: row.line_id ?? null,
    }];
  });
}

export function getProductionSendSelectionSummary(
  allRows: ProductionSendRowInput[],
  visibleRows: ProductionSendRowInput[],
  quantities: ProductionSendQuantityMap,
): ProductionSendSelectionSummary {
  const normalized = normalizeSelection(allRows, quantities);
  const visibleIndexes = new Set(visibleRows.map((row) => row.originalIndex));

  let totalSelectedQty = 0;
  let selectedLineCount = 0;
  let visibleSelectedQty = 0;
  let hiddenSelectedQty = 0;
  let hiddenSelectedLineCount = 0;

  for (const [indexText, qty] of Object.entries(normalized)) {
    const originalIndex = Number(indexText);
    totalSelectedQty += qty;
    selectedLineCount += 1;
    if (visibleIndexes.has(originalIndex)) {
      visibleSelectedQty += qty;
    } else {
      hiddenSelectedQty += qty;
      hiddenSelectedLineCount += 1;
    }
  }

  return {
    totalSelectedQty,
    selectedLineCount,
    visiblePendingQty: visibleRows.reduce((sum, row) => sum + Math.max(0, row.remainingQty), 0),
    visibleSelectedQty,
    hiddenSelectedQty,
    hiddenSelectedLineCount,
    totalPendingQty: allRows.reduce((sum, row) => sum + Math.max(0, row.remainingQty), 0),
  };
}

type ProductionIdentityItem = Pick<
  OrderItem,
  'sku' | 'variant_suffix' | 'size_info' | 'cord_color' | 'enamel_color' | 'line_id'
>;

function getNaturalKey(item: ProductionIdentityItem): string {
  return getNaturalCatalogKey(
    item.sku,
    item.variant_suffix,
    item.size_info,
    item.cord_color,
    item.enamel_color,
  );
}

function hasUniqueNaturalIdentity(item: ProductionIdentityItem, orderItems: ProductionIdentityItem[]): boolean {
  const key = getNaturalKey(item);
  return orderItems.filter((candidate) => getNaturalKey(candidate) === key).length === 1;
}

export function productionBatchMatchesOrderItem(
  batch: ProductionBatch,
  item: ProductionIdentityItem,
  orderItems: ProductionIdentityItem[],
): boolean {
  if (buildOrderItemIdentityKey(batch) === buildOrderItemIdentityKey(item)) return true;

  const oneSideHasLineId = !!batch.line_id !== !!item.line_id;
  if (!oneSideHasLineId) return false;
  if (!hasUniqueNaturalIdentity(item, orderItems)) return false;

  return getNaturalKey(batch) === getNaturalKey(item);
}

export function getRelevantProductionBatchesForOrderItem(
  item: ProductionIdentityItem,
  orderItems: ProductionIdentityItem[],
  batches: ProductionBatch[],
): ProductionBatch[] {
  return batches.filter((batch) => productionBatchMatchesOrderItem(batch, item, orderItems));
}
