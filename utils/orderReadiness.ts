import { Order, OrderShipment, OrderShipmentItem, ProductionBatch, ProductionStage, ShipmentReadinessSummary } from '../types';
import { getShipmentItemsForOrder, getShipmentsForOrder, summarizeOrderFulfillment } from './orderFulfillment';

export function getOrderBatches(orderId: string, batches: ProductionBatch[] | undefined | null): ProductionBatch[] {
  if (!batches) return [];
  return batches.filter((batch) => batch.order_id === orderId);
}

/** Group remaining production batches by their created_at timestamp (minute precision). */
export function groupBatchesByShipment(batches: ProductionBatch[]): [string, ProductionBatch[]][] {
  const groups: Record<string, ProductionBatch[]> = {};
  batches.forEach((batch) => {
    const timeKey = new Date(batch.created_at).toISOString().slice(0, 16);
    if (!groups[timeKey]) groups[timeKey] = [];
    groups[timeKey].push(batch);
  });
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

export function isOrderReady(
  order: Order,
  batches: ProductionBatch[] | undefined | null,
  shipments: OrderShipment[] | undefined | null = [],
  shipmentItems: OrderShipmentItem[] | undefined | null = []
): boolean {
  const fulfillment = summarizeOrderFulfillment(order, batches, shipments, shipmentItems);
  if (fulfillment.total_remaining_to_ship_qty === 0) return true;
  return fulfillment.total_ready_qty >= fulfillment.total_remaining_to_ship_qty && fulfillment.total_remaining_to_ship_qty > 0;
}

/** Remaining batches for this order that are not yet Ready. */
export function getNotReadyBatches(orderId: string, batches: ProductionBatch[] | undefined | null): Array<{ sku: string; variant_suffix?: string; current_stage: ProductionStage; size_info?: string }> {
  if (!batches) return [];
  return getOrderBatches(orderId, batches)
    .filter((batch) => batch.current_stage !== ProductionStage.Ready)
    .map((batch) => ({ sku: batch.sku, variant_suffix: batch.variant_suffix, current_stage: batch.current_stage, size_info: batch.size_info }));
}

/** Detailed readiness breakdown combining actual shipments with the remaining production pipeline. */
export function getShipmentReadiness(
  orderId: string,
  batches: ProductionBatch[] | undefined | null,
  shipments: OrderShipment[] | undefined | null = [],
  shipmentItems: OrderShipmentItem[] | undefined | null = [],
  order?: Order
): ShipmentReadinessSummary {
  const orderBatches = getOrderBatches(orderId, batches);
  const orderShipments = getShipmentsForOrder(orderId, shipments).sort((a, b) => a.shipment_no - b.shipment_no);
  const orderShipmentItems = getShipmentItemsForOrder(orderId, shipmentItems);

  const actualShipmentGroups = orderShipments.map((shipment, index) => {
    const items = orderShipmentItems.filter((item) => item.shipment_id === shipment.id);
    const total = items.reduce((sum, item) => sum + item.quantity, 0);
    return {
      time_key: shipment.dispatched_at || shipment.created_at,
      shipment_index: shipment.shipment_no || index + 1,
      total,
      ready: total,
      is_ready: true,
      actual_shipment_id: shipment.id,
      actual_shipment_no: shipment.shipment_no,
      actual_shipment_status: shipment.status,
      not_ready_batches: []
    };
  });

  const groupedRemainingBatches = groupBatchesByShipment(orderBatches);
  const remainingProductionGroups = [...groupedRemainingBatches].reverse().map(([timeKey, shipmentBatches], index) => {
    const total = shipmentBatches.reduce((sum, batch) => sum + batch.quantity, 0);
    const ready = shipmentBatches
      .filter((batch) => batch.current_stage === ProductionStage.Ready)
      .reduce((sum, batch) => sum + batch.quantity, 0);
    return {
      time_key: timeKey,
      shipment_index: actualShipmentGroups.length + index + 1,
      total,
      ready,
      is_ready: ready === total,
      not_ready_batches: shipmentBatches
        .filter((batch) => batch.current_stage !== ProductionStage.Ready)
        .map((batch) => ({
          sku: batch.sku,
          variant_suffix: batch.variant_suffix,
          current_stage: batch.current_stage,
          size_info: batch.size_info,
          product_image: batch.product_image ?? batch.product_details?.image_url ?? null,
          gender: batch.product_details?.gender
        }))
    };
  });

  const fulfillment = order ? summarizeOrderFulfillment(order, orderBatches, orderShipments, orderShipmentItems) : null;
  const totalUnits = fulfillment ? fulfillment.total_ordered_qty : actualShipmentGroups.reduce((sum, group) => sum + group.total, 0) + orderBatches.reduce((sum, batch) => sum + batch.quantity, 0);
  const readyUnits = fulfillment ? fulfillment.total_shipped_qty + fulfillment.total_ready_qty : actualShipmentGroups.reduce((sum, group) => sum + group.total, 0) + orderBatches.filter((batch) => batch.current_stage === ProductionStage.Ready).reduce((sum, batch) => sum + batch.quantity, 0);
  const remainingToShip = fulfillment ? fulfillment.total_remaining_to_ship_qty : Math.max(0, totalUnits - readyUnits);
  const isFullyReady = remainingToShip === 0 || (fulfillment ? fulfillment.total_ready_qty >= fulfillment.total_remaining_to_ship_qty && fulfillment.total_remaining_to_ship_qty > 0 : false);

  return {
    total_batches: totalUnits,
    ready_batches: readyUnits,
    ready_fraction: totalUnits > 0 ? readyUnits / totalUnits : 0,
    is_fully_ready: isFullyReady,
    is_partially_ready: readyUnits > 0 && !isFullyReady,
    shipments: [...actualShipmentGroups, ...remainingProductionGroups]
  };
}
