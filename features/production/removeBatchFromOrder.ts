import { Order, OrderItem, ProductionBatch } from '../../types';
import { calculateOrderFinancials } from '../orders/orderFinancials';
import { resolveUniqueOrderLineId } from './orderBatchReconcile';

export type RemoveProductionBatchFromOrderReason =
  | 'line_not_found'
  | 'would_go_below_shipped'
  | 'would_empty_order'
  | 'repair_batch'
  | 'batch_qty_exceeds_line';

export type RemoveProductionBatchFromOrderFailure = {
  ok: false;
  reason: RemoveProductionBatchFromOrderReason;
};

export type RemoveProductionBatchFromOrderSuccess = {
  ok: true;
  items: OrderItem[];
  total_price: number;
  removedLine: boolean;
  previousQty: number;
  nextQty: number;
  lineId: string | null;
};

export type RemoveProductionBatchFromOrderPlan =
  | RemoveProductionBatchFromOrderSuccess
  | RemoveProductionBatchFromOrderFailure;

export function planRemoveProductionBatchFromOrder(
  order: Order,
  batch: ProductionBatch,
  shippedQtyByLineId: Record<string, number> = {},
): RemoveProductionBatchFromOrderPlan {
  if (batch.workflow_kind === 'repair' || batch.repair_item_id) {
    return { ok: false, reason: 'repair_batch' };
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const lineIndex = findMatchingOrderLineIndex(items, batch);
  if (lineIndex < 0) {
    return { ok: false, reason: 'line_not_found' };
  }

  const line = items[lineIndex];
  const previousQty = line.quantity || 0;
  const batchQty = Math.trunc(Number(batch.quantity) || 0);
  if (batchQty > previousQty) {
    return { ok: false, reason: 'batch_qty_exceeds_line' };
  }

  const nextQty = previousQty - batchQty;
  const shippedQty = Math.max(0, Number(shippedQtyByLineId[line.line_id || ''] || 0));
  if (nextQty < shippedQty) {
    return { ok: false, reason: 'would_go_below_shipped' };
  }

  const nextItems = nextQty === 0
    ? items.filter((_, index) => index !== lineIndex)
    : items.map((item, index) => (index === lineIndex ? { ...item, quantity: nextQty } : item));

  if (nextItems.length === 0) {
    return { ok: false, reason: 'would_empty_order' };
  }

  const vatRate = order.vat_rate ?? 0.24;
  const discountPercent = order.discount_percent ?? 0;

  return {
    ok: true,
    items: nextItems,
    total_price: calculateOrderFinancials(nextItems, discountPercent, vatRate).payableNow,
    removedLine: nextQty === 0,
    previousQty,
    nextQty,
    lineId: line.line_id ?? null,
  };
}

function findMatchingOrderLineIndex(items: OrderItem[], batch: ProductionBatch): number {
  if (batch.line_id) {
    return items.findIndex((item) => item.line_id === batch.line_id);
  }

  const resolvedLineId = resolveUniqueOrderLineId(batch, items);
  if (!resolvedLineId) return -1;
  return items.findIndex((item) => item.line_id === resolvedLineId);
}

export const REMOVE_BATCH_FROM_ORDER_ERROR_MESSAGES: Record<RemoveProductionBatchFromOrderReason, string> = {
  line_not_found: 'Η παρτίδα δεν αντιστοιχεί μοναδικά σε γραμμή της παραγγελίας. Δεν πραγματοποιήθηκε καμία μεταβολή.',
  would_go_below_shipped: 'Δεν μπορεί να διαγραφεί ποσότητα που έχει ήδη αποσταλεί στον πελάτη. Δεν πραγματοποιήθηκε καμία μεταβολή.',
  would_empty_order: 'Δεν μπορεί να μείνει η παραγγελία χωρίς είδη. Ακυρώστε ολόκληρη την παραγγελία αν αυτό είναι το ζητούμενο.',
  repair_batch: 'Οι επισκευές δεν διαγράφονται από την παραγγελία μέσω της διαχείρισης παραγωγής.',
  batch_qty_exceeds_line: 'Η ποσότητα της παρτίδας υπερβαίνει τη γραμμή της παραγγελίας. Δεν πραγματοποιήθηκε καμία μεταβολή.',
};
