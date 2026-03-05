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
