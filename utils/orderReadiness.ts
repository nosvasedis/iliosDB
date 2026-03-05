import { Order, ProductionBatch, ProductionStage } from '../types';

export function getOrderBatches(orderId: string, batches: ProductionBatch[] | undefined | null): ProductionBatch[] {
  if (!batches) return [];
  return batches.filter((batch) => batch.order_id === orderId);
}

export function isOrderReady(order: Order, batches: ProductionBatch[] | undefined | null): boolean {
  const orderBatches = getOrderBatches(order.id, batches);
  if (orderBatches.length === 0) return false;
  return orderBatches.every((batch) => batch.current_stage === ProductionStage.Ready);
}

/** Batches for this order that are not yet Ready (for delivery info pane). */
export function getNotReadyBatches(orderId: string, batches: ProductionBatch[] | undefined | null): Array<{ sku: string; variant_suffix?: string; current_stage: ProductionStage; size_info?: string }> {
  if (!batches) return [];
  return getOrderBatches(orderId, batches)
    .filter((b) => b.current_stage !== ProductionStage.Ready)
    .map((b) => ({ sku: b.sku, variant_suffix: b.variant_suffix, current_stage: b.current_stage, size_info: b.size_info }));
}
