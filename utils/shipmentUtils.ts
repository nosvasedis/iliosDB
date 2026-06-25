
import { Order, OrderItem, OrderShipment, OrderShipmentItem, OrderStatus, ProductionBatch, ProductionStage } from '../types';
import { catalogIdentityMatches } from '../features/production/orderBatchReconcile';
import { buildItemIdentityKey } from './itemIdentity';

type OrderLineForShipment = Pick<
  OrderItem,
  'sku' | 'variant_suffix' | 'size_info' | 'cord_color' | 'enamel_color' | 'line_id' | 'quantity'
>;

/** Natural key for matching order items / batches / shipment items. */
export function itemKey(
  sku: string,
  variantSuffix?: string | null,
  sizeInfo?: string | null,
  cordColor?: string | null,
  enamelColor?: string | null,
  lineId?: string | null
): string {
  return buildItemIdentityKey({
    sku,
    variant_suffix: variantSuffix,
    size_info: sizeInfo,
    cord_color: cordColor as any,
    enamel_color: enamelColor as any,
    line_id: lineId || null
  });
}

/**
 * Allocate shipped quantities onto order line keys (includes line_id).
 * Legacy shipment rows often lack line_id — match FIFO by catalog identity.
 */
export function getShippedQuantitiesForOrderLines(
  orderItems: OrderLineForShipment[],
  shipmentItems: OrderShipmentItem[],
): Map<string, number> {
  const shipped = new Map<string, number>();
  const remainingCapacity = new Map<string, number>();

  for (const item of orderItems) {
    const key = itemKey(item.sku, item.variant_suffix, item.size_info, item.cord_color, item.enamel_color, item.line_id);
    remainingCapacity.set(key, (remainingCapacity.get(key) || 0) + (item.quantity || 0));
    if (!shipped.has(key)) shipped.set(key, 0);
  }

  const allocateToLine = (key: string, qty: number): number => {
    const available = remainingCapacity.get(key) || 0;
    if (available <= 0 || qty <= 0) return 0;
    const allocated = Math.min(qty, available);
    shipped.set(key, (shipped.get(key) || 0) + allocated);
    remainingCapacity.set(key, available - allocated);
    return allocated;
  };

  for (const shipmentItem of shipmentItems) {
    let remaining = shipmentItem.quantity || 0;

    if (shipmentItem.line_id) {
      const exactKey = itemKey(
        shipmentItem.sku,
        shipmentItem.variant_suffix,
        shipmentItem.size_info,
        shipmentItem.cord_color,
        shipmentItem.enamel_color,
        shipmentItem.line_id,
      );
      remaining -= allocateToLine(exactKey, remaining);
    }

    while (remaining > 0) {
      let allocatedThisPass = 0;
      for (const orderItem of orderItems) {
        if (remaining <= 0) break;
        if (!catalogIdentityMatches(shipmentItem, orderItem)) continue;
        const key = itemKey(
          orderItem.sku,
          orderItem.variant_suffix,
          orderItem.size_info,
          orderItem.cord_color,
          orderItem.enamel_color,
          orderItem.line_id,
        );
        const allocated = allocateToLine(key, remaining);
        allocatedThisPass += allocated;
        remaining -= allocated;
      }
      if (allocatedThisPass === 0) break;
    }
  }

  return shipped;
}

/** Build a map of total shipped quantities keyed like order lines (with line_id when present). */
export function getShippedQuantities(
  shipmentItems: OrderShipmentItem[],
  orderItems?: OrderLineForShipment[],
): Map<string, number> {
  if (orderItems && orderItems.length > 0) {
    return getShippedQuantitiesForOrderLines(orderItems, shipmentItems);
  }

  const map = new Map<string, number>();
  for (const item of shipmentItems) {
    const key = itemKey(item.sku, item.variant_suffix, item.size_info, item.cord_color, item.enamel_color, item.line_id);
    map.set(key, (map.get(key) || 0) + item.quantity);
  }
  return map;
}

/** Total shipped piece count per order — matches Παραγγελίες progress / readiness. */
export function buildShippedQtyByOrderId(
  shipments: OrderShipment[] | undefined | null,
  shipmentItems: OrderShipmentItem[] | undefined | null,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!shipments || !shipmentItems) return map;

  const shipmentToOrder = new Map(shipments.map((s) => [s.id, s.order_id]));
  for (const item of shipmentItems) {
    const orderId = shipmentToOrder.get(item.shipment_id);
    if (!orderId) continue;
    map.set(orderId, (map.get(orderId) || 0) + (item.quantity || 0));
  }
  return map;
}

/** Returns order items with quantities reduced by already-shipped amounts. Items fully shipped are excluded. */
export function getRemainingOrderItems(
  order: Order,
  shipmentItems: OrderShipmentItem[]
): Array<{ sku: string; variant_suffix?: string; size_info?: string; cord_color?: string | null; enamel_color?: string | null; quantity: number; price_at_order: number; line_id?: string | null }> {
  const orderItems = Array.isArray(order.items) ? order.items : [];
  const shipped = getShippedQuantitiesForOrderLines(orderItems, shipmentItems);
  const remaining: Array<{ sku: string; variant_suffix?: string; size_info?: string; cord_color?: string | null; enamel_color?: string | null; quantity: number; price_at_order: number; line_id?: string | null }> = [];

  for (const item of orderItems) {
    const key = itemKey(item.sku, item.variant_suffix, item.size_info, item.cord_color, item.enamel_color, item.line_id);
    const shippedQty = shipped.get(key) || 0;
    const remainingQty = item.quantity - shippedQty;
    if (remainingQty > 0) {
      remaining.push({
        sku: item.sku,
        variant_suffix: item.variant_suffix,
        size_info: item.size_info,
        cord_color: item.cord_color,
        enamel_color: item.enamel_color,
        quantity: remainingQty,
        price_at_order: item.price_at_order,
        line_id: item.line_id || null
      });
    }
  }
  return remaining;
}

/** Returns Ready batches that can be shipped (grouped by item key with aggregated quantities). */
export function getReadyToShipItems(
  orderId: string,
  batches: ProductionBatch[],
): Array<{ sku: string; variant_suffix?: string | null; size_info?: string | null; cord_color?: string | null; enamel_color?: string | null; quantity: number; batchIds: string[]; line_id?: string | null }> {
  const orderBatches = batches.filter(b => b.order_id === orderId && b.current_stage === ProductionStage.Ready);
  const groupMap = new Map<string, { sku: string; variant_suffix?: string | null; size_info?: string | null; cord_color?: string | null; enamel_color?: string | null; quantity: number; batchIds: string[]; line_id?: string | null }>();

  for (const batch of orderBatches) {
    const key = itemKey(batch.sku, batch.variant_suffix, batch.size_info, batch.cord_color, batch.enamel_color, batch.line_id);
    const existing = groupMap.get(key);
    if (existing) {
      existing.quantity += batch.quantity;
      existing.batchIds.push(batch.id);
    } else {
      groupMap.set(key, {
        sku: batch.sku,
        variant_suffix: batch.variant_suffix,
        size_info: batch.size_info,
        cord_color: batch.cord_color,
        enamel_color: batch.enamel_color,
        quantity: batch.quantity,
        batchIds: [batch.id],
        line_id: batch.line_id || null
      });
    }
  }
  return Array.from(groupMap.values());
}

/** Total quantity in production batches at stage «Έτοιμα» — what the shipment modal can ship. */
export function getReadyToShipQuantity(orderId: string, batches: ProductionBatch[] | undefined | null): number {
  if (!batches) return 0;
  return getReadyToShipItems(orderId, batches).reduce((sum, item) => sum + (item.quantity || 0), 0);
}

/**
 * True when every order line quantity has been recorded in shipments.
 * Used to detect stale «Μερική Παράδοση» rows that should become «Παραδόθηκε».
 */
export function isOrderFullyShipped(order: Order, shippedQty?: number): boolean {
  if (order.status === OrderStatus.Delivered) return true;
  const itemsTotal = Array.isArray(order.items)
    ? order.items.reduce((sum, item) => sum + (item.quantity || 0), 0)
    : order.item_total_qty ?? 0;
  if (itemsTotal <= 0) return false;
  return (shippedQty ?? 0) >= itemsTotal;
}

/** Compute the financial value of a shipment (subtotal, discount, net, VAT, total). */
export function computeShipmentValue(
  items: Array<Pick<OrderShipmentItem, 'price_at_order' | 'quantity'>>,
  vatRate: number,
  discountPercent: number
): { subtotal: number; discountAmount: number; netAmount: number; vatAmount: number; grandTotal: number } {
  const subtotal = items.reduce((acc, item) => acc + (item.price_at_order * item.quantity), 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const netAmount = subtotal - discountAmount;
  const vatAmount = netAmount * vatRate;
  const grandTotal = netAmount + vatAmount;
  return { subtotal, discountAmount, netAmount, vatAmount, grandTotal };
}

/** Compute the total shipped value across all shipments for an order. */
export function computeTotalShippedValue(
  shipmentItems: OrderShipmentItem[],
  vatRate: number,
  discountPercent: number
): number {
  return computeShipmentValue(shipmentItems, vatRate, discountPercent).grandTotal;
}

export interface ItemShipmentAllocation {
  shipmentId: string;
  shipmentNumber: number;
  quantity: number;
  shippedAt: string;
}

/** Per-shipment breakdown for a single order line (by item identity key). */
export function getItemShipmentAllocations(
  key: string,
  shipments: OrderShipment[],
  shipmentItems: OrderShipmentItem[]
): ItemShipmentAllocation[] {
  const shipmentById = new Map(shipments.map((shipment) => [shipment.id, shipment]));
  const allocations: ItemShipmentAllocation[] = [];

  for (const item of shipmentItems) {
    const itemIdentityKey = itemKey(
      item.sku,
      item.variant_suffix,
      item.size_info,
      item.cord_color,
      item.enamel_color,
      item.line_id
    );
    if (itemIdentityKey !== key) continue;

    const shipment = shipmentById.get(item.shipment_id);
    if (!shipment) continue;

    allocations.push({
      shipmentId: shipment.id,
      shipmentNumber: shipment.shipment_number,
      quantity: item.quantity,
      shippedAt: shipment.shipped_at,
    });
  }

  return allocations.sort((a, b) => a.shipmentNumber - b.shipmentNumber);
}

export type ItemFulfillmentKind = 'remaining' | 'in_production' | 'partially_delivered' | 'fully_delivered';

/** Classify how an order line is covered when nothing remains to send to production. */
export function getItemFulfillmentKind(input: {
  quantity: number;
  shippedQty: number;
  remainingQty: number;
}): ItemFulfillmentKind {
  if (input.remainingQty > 0) return 'remaining';
  if (input.shippedQty >= input.quantity) return 'fully_delivered';
  if (input.shippedQty > 0) return 'partially_delivered';
  return 'in_production';
}
