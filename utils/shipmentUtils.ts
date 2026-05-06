
import { Order, OrderShipment, OrderShipmentItem, ProductionBatch, ProductionStage } from '../types';
import { buildItemIdentityKey } from './itemIdentity';

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

/** Build a map of total shipped quantities per (sku::variant::size) across all shipments. */
export function getShippedQuantities(shipmentItems: OrderShipmentItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of shipmentItems) {
    const key = itemKey(item.sku, item.variant_suffix, item.size_info, item.cord_color, item.enamel_color, item.line_id);
    map.set(key, (map.get(key) || 0) + item.quantity);
  }
  return map;
}

/** Returns order items with quantities reduced by already-shipped amounts. Items fully shipped are excluded. */
export function getRemainingOrderItems(
  order: Order,
  shipmentItems: OrderShipmentItem[]
): Array<{ sku: string; variant_suffix?: string; size_info?: string; cord_color?: string | null; enamel_color?: string | null; quantity: number; price_at_order: number; line_id?: string | null }> {
  const shipped = getShippedQuantities(shipmentItems);
  const remaining: Array<{ sku: string; variant_suffix?: string; size_info?: string; cord_color?: string | null; enamel_color?: string | null; quantity: number; price_at_order: number; line_id?: string | null }> = [];

  for (const item of order.items) {
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

/** Compute the financial value of a shipment (subtotal, discount, net, VAT, total). */
export function computeShipmentValue(
  items: OrderShipmentItem[],
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
