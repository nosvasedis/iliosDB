import { Order, OrderFulfillmentLineSummary, OrderFulfillmentSummary, OrderItem, OrderShipment, OrderShipmentItem, OrderStatus, ProductionBatch, ProductionStage } from '../types';

function sanitizeKeyPart(value?: string | null): string {
  return (value || '').trim();
}

export function buildOrderItemKey(item: Pick<OrderItem, 'id' | 'sku' | 'variant_suffix' | 'size_info'>): string {
  if (item.id && item.id.trim() !== '') return item.id;
  return [item.sku, sanitizeKeyPart(item.variant_suffix), sanitizeKeyPart(item.size_info)].join('::');
}

export function createOrderItemId(orderId: string, index: number, item: Pick<OrderItem, 'sku' | 'variant_suffix' | 'size_info'>): string {
  const suffix = sanitizeKeyPart(item.variant_suffix) || 'base';
  const size = sanitizeKeyPart(item.size_info) || 'std';
  return [orderId || 'order', item.sku, suffix, size, String(index + 1)].join('__');
}

export function normalizeOrderItems(order: Order): OrderItem[] {
  return (order.items || []).map((item, index) => ({
    ...item,
    id: item.id || createOrderItemId(order.id, index, item)
  }));
}

export function normalizeOrder(order: Order): Order {
  return {
    ...order,
    items: normalizeOrderItems(order)
  };
}

export function getShipmentItemsForOrder(orderId: string, shipmentItems: OrderShipmentItem[] | undefined | null): OrderShipmentItem[] {
  return (shipmentItems || []).filter((item) => item.order_id === orderId);
}

export function getShipmentsForOrder(orderId: string, shipments: OrderShipment[] | undefined | null): OrderShipment[] {
  return (shipments || []).filter((shipment) => shipment.order_id === orderId);
}

export function summarizeOrderFulfillment(
  order: Order,
  batches: ProductionBatch[] | undefined | null,
  shipments: OrderShipment[] | undefined | null,
  shipmentItems: OrderShipmentItem[] | undefined | null
): OrderFulfillmentSummary {
  const normalizedOrder = normalizeOrder(order);
  const orderBatches = (batches || []).filter((batch) => batch.order_id === normalizedOrder.id);
  const orderShipments = getShipmentsForOrder(normalizedOrder.id, shipments);
  const deliveredShipmentIds = new Set(
    orderShipments
      .filter((shipment) => shipment.status === 'dispatched' || shipment.status === 'delivered')
      .map((shipment) => shipment.id)
  );
  const orderShipmentItems = getShipmentItemsForOrder(normalizedOrder.id, shipmentItems)
    .filter((item) => deliveredShipmentIds.has(item.shipment_id));

  const lineSummaries: OrderFulfillmentLineSummary[] = normalizedOrder.items.map((item) => {
    const key = buildOrderItemKey(item);
    const matchingBatches = orderBatches.filter((batch) => buildOrderItemKey(batch as any) === key);
    const qtyInBatches = matchingBatches.reduce((sum, batch) => sum + batch.quantity, 0);
    const qtyReady = matchingBatches
      .filter((batch) => batch.current_stage === ProductionStage.Ready)
      .reduce((sum, batch) => sum + batch.quantity, 0);
    const qtyShipped = orderShipmentItems
      .filter((shipmentItem) => shipmentItem.order_item_key === key)
      .reduce((sum, shipmentItem) => sum + shipmentItem.quantity, 0);
    return {
      order_item_key: key,
      sku: item.sku,
      variant_suffix: item.variant_suffix,
      size_info: item.size_info,
      qty_ordered: item.quantity,
      qty_in_batches: qtyInBatches,
      qty_ready: Math.max(0, qtyReady - qtyShipped),
      qty_shipped: qtyShipped,
      qty_remaining_to_ship: Math.max(0, item.quantity - qtyShipped),
      qty_remaining_to_produce: Math.max(0, item.quantity - qtyShipped - qtyReady)
    };
  });

  return {
    order_id: normalizedOrder.id,
    total_ordered_qty: lineSummaries.reduce((sum, line) => sum + line.qty_ordered, 0),
    total_in_batches_qty: lineSummaries.reduce((sum, line) => sum + line.qty_in_batches, 0),
    total_ready_qty: lineSummaries.reduce((sum, line) => sum + line.qty_ready, 0),
    total_shipped_qty: lineSummaries.reduce((sum, line) => sum + line.qty_shipped, 0),
    total_remaining_to_ship_qty: lineSummaries.reduce((sum, line) => sum + line.qty_remaining_to_ship, 0),
    total_remaining_to_produce_qty: lineSummaries.reduce((sum, line) => sum + line.qty_remaining_to_produce, 0),
    lines: lineSummaries,
    shipment_count: orderShipments.length,
    delivered_shipment_count: orderShipments.filter((shipment) => shipment.status === 'delivered' || shipment.status === 'dispatched').length,
    open_shipment_count: orderShipments.filter((shipment) => shipment.status === 'draft').length
  };
}

export function deriveOrderStatus(order: Order, fulfillment: OrderFulfillmentSummary): OrderStatus {
  if (order.status === OrderStatus.Cancelled) return OrderStatus.Cancelled;
  if (fulfillment.total_remaining_to_ship_qty === 0 && fulfillment.total_shipped_qty > 0) return OrderStatus.Delivered;
  if (fulfillment.total_shipped_qty > 0) return OrderStatus.PartiallyShipped;
  if (fulfillment.total_ready_qty > 0 && fulfillment.total_remaining_to_produce_qty === 0) return OrderStatus.Ready;
  if (fulfillment.total_ready_qty > 0) return OrderStatus.PartiallyReady;
  if (fulfillment.total_in_batches_qty > 0 || order.status === OrderStatus.InProduction) return OrderStatus.InProduction;
  return OrderStatus.Pending;
}

export function getShippableReadyQuantity(item: OrderItem, fulfillment: OrderFulfillmentSummary): number {
  const key = buildOrderItemKey(item);
  return fulfillment.lines.find((line) => line.order_item_key === key)?.qty_ready || 0;
}
