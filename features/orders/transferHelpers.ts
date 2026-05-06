/**
 * transferHelpers.ts
 *
 * Pure (no DB) helpers for the "Transfer Remaining Items to Another Order" wizard.
 *
 * Scenario:
 *   Order A is PartiallyDelivered — some items were shipped, the rest are done in
 *   production (Ready batches) but the client also has Order B. Instead of creating
 *   a second shipment record on Order A, the operator transfers Order A's remaining
 *   items + their Ready batches to Order B so that the next delivery PDF (Order B)
 *   naturally includes everything.
 *
 * Safety rules enforced here (pure checks, before any DB write):
 *   - All remaining items of Order A MUST have ALL their batches in Ready stage.
 *     Any non-Ready batch blocks the transfer (isValid = false).
 *   - Quantities must match exactly (remaining item qty = total Ready batch qty for that key).
 *   - No DB is touched here — only analysis/planning.
 */

import { Order, OrderItem, ProductionBatch, ProductionStage } from '../../types';
import { OrderShipmentSnapshot } from './printHelpers';
import { getRemainingOrderItems, getShippedQuantities } from '../../utils/shipmentUtils';
import { ShipmentSafetyIssue, validateReadyMatchesRemainingForTransfer } from '../../utils/shipmentSafety';
import { buildItemIdentityKey } from '../../utils/itemIdentity';

// ─── Types ───────────────────────────────────────────────────────────────────

/** One item that will be transferred from Order A to Order B. */
export interface TransferItem {
  sku: string;
  variant_suffix?: string;
  size_info?: string;
  cord_color?: string | null;
  enamel_color?: string | null;
  quantity: number;
  price_at_order: number;
  line_id?: string | null;
  notes?: string;
}

/**
 * A non-Ready batch that is blocking the transfer.
 * Shown in the UI so the operator knows which batches need to reach Ready stage first.
 */
export interface BlockedBatch {
  batchId: string;
  sku: string;
  variant_suffix?: string | null;
  size_info?: string | null;
  quantity: number;
  current_stage: ProductionStage;
}

/** Result of `buildTransferPlan`. */
export interface TransferPlan {
  /** Items that will move from Order A to Order B (only remaining, not already shipped). */
  transferItems: TransferItem[];
  /** Production batches (all Ready) that will be re-pointed to Order B. */
  batchesToRepoint: ProductionBatch[];
  /** Non-Ready batches for remaining items — blocks transfer when non-empty. */
  blockedBatches: BlockedBatch[];
  /** Quantity mismatches between remaining order lines and Ready batches — blocks transfer when non-empty. */
  quantityIssues: ShipmentSafetyIssue[];
  /** True only when every remaining line has exactly matching Ready batches and no blocked batches. */
  isValid: boolean;
  /** Order B's full items array after the transfer (existing items + transferred items). */
  newOrderBItems: OrderItem[];
  /**
   * Order A's items array trimmed to ONLY what was actually shipped.
   *
   * CRITICAL for financial correctness: Order A must have its items[] replaced with this
   * after the transfer. If the original items[] is kept, analytics (Dashboard, businessAnalytics)
   * that iterate order.items[] for completed orders would double-count the transferred items
   * (once in Order A, once in Order B).
   */
  shippedOnlyOrderAItems: OrderItem[];
  /**
   * Order A's total recalculated to reflect only the items that were actually shipped,
   * using Order A's own discount and VAT rates.
   */
  recalculatedOrderATotal: number;
  /**
   * Order B's new total after adding the transferred items,
   * using Order B's discount and VAT rates.
   */
  newOrderBTotal: number;
  /** True when Order A and Order B have different VAT rates. */
  vatMismatch: boolean;
  /** True when Order A and Order B have different discount percentages. */
  discountMismatch: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function itemIdentityKey(item: {
  sku: string;
  variant_suffix?: string | null;
  size_info?: string | null;
  cord_color?: string | null;
  enamel_color?: string | null;
  line_id?: string | null;
}): string {
  return buildItemIdentityKey({
    sku: item.sku,
    variant_suffix: item.variant_suffix,
    size_info: item.size_info,
    cord_color: item.cord_color as any,
    enamel_color: item.enamel_color as any,
    line_id: item.line_id,
  });
}

function computeOrderTotal(
  items: Array<{ price_at_order: number; quantity: number }>,
  discountPercent: number,
  vatRate: number,
): number {
  const subtotal = items.reduce((sum, i) => sum + i.price_at_order * i.quantity, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const net = subtotal - discountAmount;
  return net * (1 + vatRate);
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Builds a transfer plan by analysing:
 *   - which items on Order A still have not been shipped (remaining),
 *   - which production batches for Order A are Ready vs blocked,
 *   - what Order B's items array would look like after the transfer,
 *   - financial impact on both orders.
 *
 * No DB calls. Pure computation from the supplied data.
 *
 * @param orderA         The PartiallyDelivered order whose remaining items will be transferred.
 * @param orderB         The target order that will receive the transferred items.
 * @param snapshotA      Order A's shipment snapshot (all past shipments + items).
 * @param allBatches     All production batches currently in the system (caller supplies from cache).
 */
export function buildTransferPlan(
  orderA: Order,
  orderB: Order,
  snapshotA: OrderShipmentSnapshot,
  allBatches: ProductionBatch[],
): TransferPlan {
  // 1. Remaining items on Order A (quantity already shipped subtracted).
  const remaining = getRemainingOrderItems(orderA, snapshotA.items);

  // 2. Find Order A's batches in the supplied batch list.
  const orderABatches = allBatches.filter((b) => b.order_id === orderA.id);

  // 3. For each remaining item, classify its batches as Ready or blocked.
  const batchesToRepoint: ProductionBatch[] = [];
  const blockedBatches: BlockedBatch[] = [];

  for (const remaining_item of remaining) {
    const key = itemIdentityKey(remaining_item);

    const matchingBatches = orderABatches.filter(
      (b) => itemIdentityKey(b) === key,
    );

    for (const batch of matchingBatches) {
      if (batch.current_stage === ProductionStage.Ready) {
        batchesToRepoint.push(batch);
      } else {
        blockedBatches.push({
          batchId: batch.id,
          sku: batch.sku,
          variant_suffix: batch.variant_suffix ?? null,
          size_info: batch.size_info ?? null,
          quantity: batch.quantity,
          current_stage: batch.current_stage,
        });
      }
    }
  }

  const quantityIssues = validateReadyMatchesRemainingForTransfer(orderA, snapshotA.items, allBatches);
  const isValid = blockedBatches.length === 0 && quantityIssues.length === 0 && remaining.length > 0;

  // 4. Build the transfer items from the remaining item list (pull notes from the original order item).
  const transferItems: TransferItem[] = remaining.map((r) => {
    const originalItem = orderA.items.find(
      (i) => itemIdentityKey(i) === itemIdentityKey(r),
    );
    return {
      sku: r.sku,
      variant_suffix: r.variant_suffix,
      size_info: r.size_info,
      cord_color: r.cord_color ?? null,
      enamel_color: r.enamel_color ?? null,
      quantity: r.quantity,
      price_at_order: r.price_at_order,
      line_id: r.line_id ?? null,
      notes: originalItem?.notes,
    };
  });

  // 5. Build Order B's new items array.
  //    If a transferred item has the same identity key as an existing item in Order B
  //    (same SKU/variant/options AND same line_id), we add to its quantity rather than
  //    duplicating the row. For SP items with line_id this should be rare but safe.
  const newOrderBItems: OrderItem[] = [...orderB.items];
  for (const t of transferItems) {
    const tKey = itemIdentityKey(t);
    const existingIdx = newOrderBItems.findIndex((i) => itemIdentityKey(i) === tKey);
    if (existingIdx >= 0) {
      // Add quantity to existing row.
      newOrderBItems[existingIdx] = {
        ...newOrderBItems[existingIdx],
        quantity: newOrderBItems[existingIdx].quantity + t.quantity,
      };
    } else {
      // Add as new row, carrying price, notes, and all identity fields.
      const orderItemToAdd: OrderItem = {
        sku: t.sku,
        quantity: t.quantity,
        price_at_order: t.price_at_order,
      };
      if (t.variant_suffix) orderItemToAdd.variant_suffix = t.variant_suffix;
      if (t.size_info) orderItemToAdd.size_info = t.size_info;
      if (t.cord_color) orderItemToAdd.cord_color = t.cord_color as any;
      if (t.enamel_color) orderItemToAdd.enamel_color = t.enamel_color as any;
      if (t.line_id) orderItemToAdd.line_id = t.line_id;
      if (t.notes) orderItemToAdd.notes = t.notes;
      newOrderBItems.push(orderItemToAdd);
    }
  }

  // 6. Financial calculations.
  const discountA = orderA.discount_percent ?? 0;
  const vatA = orderA.vat_rate ?? 0.24;
  const discountB = orderB.discount_percent ?? 0;
  const vatB = orderB.vat_rate ?? 0.24;

  // 6a. Compute "shipped-only" items for Order A.
  //
  //     CRITICAL: After the transfer, Order A's items[] MUST be replaced with this
  //     trimmed array. The original items[] still contains the transferred items.
  //     Analytics code (businessAnalytics.ts, Dashboard.tsx) iterates order.items[]
  //     on Delivered orders for revenue/silver/items-sold stats. Keeping stale items[]
  //     causes double-counting: Order A (Delivered) + Order B would both claim
  //     the same transferred items. Replacing Order A's items[] with shipped-only
  //     items prevents this entirely.
  //
  //     We reconstruct from the original OrderItem objects (preserving notes,
  //     price_override, etc.) with quantities overridden to the actual shipped amount.
  const shippedQtyMap = getShippedQuantities(snapshotA.items);
  const shippedOnlyOrderAItems: OrderItem[] = [];
  for (const item of orderA.items) {
    const key = itemIdentityKey(item);
    const shippedQty = shippedQtyMap.get(key) ?? 0;
    if (shippedQty > 0) {
      shippedOnlyOrderAItems.push({ ...item, quantity: shippedQty });
    }
    // Items with shippedQty = 0 (i.e., only the transferred ones) are dropped.
  }

  // Order A recalculated total: only the items that were actually shipped.
  // We compute from shippedOnlyOrderAItems (same result as summing snapshotA.items
  // but uses the OrderItem objects which preserves price_at_order correctly).
  const recalculatedOrderATotal = computeOrderTotal(shippedOnlyOrderAItems, discountA, vatA);

  // Order B new total: all of B's original items plus the transferred items.
  const newOrderBTotal = computeOrderTotal(newOrderBItems, discountB, vatB);

  return {
    transferItems,
    batchesToRepoint,
    blockedBatches,
    quantityIssues,
    isValid,
    newOrderBItems,
    shippedOnlyOrderAItems,
    recalculatedOrderATotal,
    newOrderBTotal,
    vatMismatch: Math.abs(vatA - vatB) > 0.001,
    discountMismatch: Math.abs(discountA - discountB) > 0.001,
  };
}
