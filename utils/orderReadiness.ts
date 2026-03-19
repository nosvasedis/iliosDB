import { Order, ProductionBatch, ProductionStage, ShipmentReadinessSummary } from '../types';

export function getOrderBatches(orderId: string, batches: ProductionBatch[] | undefined | null): ProductionBatch[] {
  if (!batches) return [];
  return batches.filter((batch) => batch.order_id === orderId);
}

/** Group batches by their created_at timestamp (minute precision) to represent shipments/parts. */
export function groupBatchesByShipment(batches: ProductionBatch[]): [string, ProductionBatch[]][] {
  const groups: Record<string, ProductionBatch[]> = {};
  batches.forEach((b) => {
    const timeKey = new Date(b.created_at).toISOString().slice(0, 16);
    if (!groups[timeKey]) groups[timeKey] = [];
    groups[timeKey].push(b);
  });
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

export function isOrderReady(order: Order, batches: ProductionBatch[] | undefined | null): boolean {
  const orderBatches = getOrderBatches(order.id, batches);
  if (orderBatches.length === 0) return false;
  return orderBatches.every((batch) => batch.current_stage === ProductionStage.Ready);
}

/** Batches for this order that are not yet Ready (for delivery info pane). */
export function getNotReadyBatches(orderId: string, batches: ProductionBatch[] | undefined | null): Array<{ sku: string; variant_suffix?: string; current_stage: ProductionStage; size_info?: string; cord_color?: ProductionBatch['cord_color']; enamel_color?: ProductionBatch['enamel_color'] }> {
  if (!batches) return [];
  return getOrderBatches(orderId, batches)
    .filter((b) => b.current_stage !== ProductionStage.Ready)
    .map((b) => ({ sku: b.sku, variant_suffix: b.variant_suffix, current_stage: b.current_stage, size_info: b.size_info, cord_color: b.cord_color, enamel_color: b.enamel_color }));
}

/** Detailed per-shipment readiness breakdown for an order. */
export function getShipmentReadiness(orderId: string, batches: ProductionBatch[] | undefined | null): ShipmentReadinessSummary {
  const orderBatches = getOrderBatches(orderId, batches);
  if (orderBatches.length === 0) {
    return { total_batches: 0, ready_batches: 0, ready_fraction: 0, is_fully_ready: false, is_partially_ready: false, shipments: [] };
  }

  const grouped = groupBatchesByShipment(orderBatches);
  // Reverse to ascending (oldest first) for display with 1-based index
  const ascending = [...grouped].reverse();

  const shipments = ascending.map(([timeKey, shipmentBatches], idx) => {
    const total = shipmentBatches.length;
    const ready = shipmentBatches.filter((b) => b.current_stage === ProductionStage.Ready).length;
    return {
      time_key: timeKey,
      shipment_index: idx + 1,
      total,
      ready,
      is_ready: ready === total,
      not_ready_batches: shipmentBatches
        .filter((b) => b.current_stage !== ProductionStage.Ready)
        .map((b) => ({
          sku: b.sku,
          variant_suffix: b.variant_suffix,
          current_stage: b.current_stage,
          size_info: b.size_info,
          cord_color: b.cord_color,
          enamel_color: b.enamel_color,
          product_image: b.product_image ?? b.product_details?.image_url ?? null,
          gender: b.product_details?.gender
        }))
    };
  });

  const totalBatches = orderBatches.length;
  const readyBatches = orderBatches.filter((b) => b.current_stage === ProductionStage.Ready).length;
  const isFullyReady = readyBatches === totalBatches;

  return {
    total_batches: totalBatches,
    ready_batches: readyBatches,
    ready_fraction: totalBatches > 0 ? readyBatches / totalBatches : 0,
    is_fully_ready: isFullyReady,
    is_partially_ready: readyBatches > 0 && !isFullyReady,
    shipments
  };
}
