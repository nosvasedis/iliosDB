import { Order, OrderShipment, OrderShipmentItem, Product, ProductVariant, ProductionBatch, ProductionStage, PriceChangeRecord } from '../../types';
import { ItemIdentityLike, buildItemIdentityKey } from '../../utils/itemIdentity';
import { getRemainingOrderItems } from '../../utils/shipmentUtils';

export interface OrderShipmentSnapshot {
  shipments: OrderShipment[];
  items: OrderShipmentItem[];
}

export interface LatestShipmentPrintData {
  shipment: OrderShipment;
  shipmentItems: OrderShipmentItem[];
  remainingOrder: Order;
}

export interface OrderLabelPrintItem {
  product: Product;
  variant?: ProductVariant;
  quantity: number;
  size?: string;
  format: 'standard' | 'simple' | 'retail';
}

export function buildOrderItemIdentityKey(
  item: ItemIdentityLike
): string {
  return buildItemIdentityKey({
    sku: item.sku,
    variant_suffix: item.variant_suffix,
    size_info: item.size_info,
    cord_color: item.cord_color || null,
    enamel_color: item.enamel_color || null,
    line_id: item.line_id || null,
  });
}

export function buildLatestShipmentPrintData(
  order: Order,
  shipmentSnapshot: OrderShipmentSnapshot | undefined | null,
): LatestShipmentPrintData | null {
  const shipments = shipmentSnapshot?.shipments || [];
  const shipmentItems = shipmentSnapshot?.items || [];
  if (shipments.length === 0 || shipmentItems.length === 0) return null;

  const latestShipment = [...shipments].sort((a, b) => {
    const timeDiff = new Date(b.shipped_at).getTime() - new Date(a.shipped_at).getTime();
    if (timeDiff !== 0) return timeDiff;
    return (b.shipment_number || 0) - (a.shipment_number || 0);
  })[0];

  const latestShipmentItems = shipmentItems.filter((item) => item.shipment_id === latestShipment.id);
  if (latestShipmentItems.length === 0) return null;

  const remainingItems = getRemainingOrderItems(order, shipmentItems);
  if (remainingItems.length === 0) return null;

  const subtotal = remainingItems.reduce((sum, item) => sum + item.price_at_order * item.quantity, 0);
  const discountFactor = 1 - ((order.discount_percent || 0) / 100);
  const discountedSubtotal = subtotal * discountFactor;
  const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
  const grandTotal = discountedSubtotal * (1 + vatRate);

  const remainingOrderItems = remainingItems
    .map((remainingItem) => {
      const existingItem = order.items.find(
        (item) => buildOrderItemIdentityKey(item) === buildOrderItemIdentityKey(remainingItem)
      );
      if (!existingItem) return null;
      return {
        ...existingItem,
        quantity: remainingItem.quantity,
        price_at_order: remainingItem.price_at_order,
      };
    })
    .filter((item): item is Order['items'][number] => item !== null);

  return {
    shipment: latestShipment,
    shipmentItems: latestShipmentItems,
    remainingOrder: {
      ...order,
      items: remainingOrderItems,
      total_price: grandTotal,
    },
  };
}

export function buildOrderLabelPrintItems(
  order: Order,
  products: Product[],
): OrderLabelPrintItem[] {
  return order.items.flatMap((item) => {
    const product = products.find((p) => p.sku === item.sku);
    if (!product) return [];

    const labelItem: OrderLabelPrintItem = {
      product,
      quantity: item.quantity,
      size: item.size_info,
      format: 'standard',
    };

    const variant = product.variants?.find((v) => v.suffix === item.variant_suffix);
    if (variant) labelItem.variant = variant;

    return [labelItem];
  });
}

export function buildSyntheticAggregatedBatches(order: Order): ProductionBatch[] {
  const now = new Date().toISOString();
  return order.items.map((item, index) => ({
    id: `synthetic-${order.id}-${index}`,
    order_id: order.id,
    sku: item.sku,
    variant_suffix: item.variant_suffix,
    quantity: item.quantity,
    current_stage: ProductionStage.AwaitingDelivery,
    created_at: now,
    updated_at: now,
    priority: 'Normal',
    requires_setting: false,
    size_info: item.size_info,
  }));
}

/**
 * Describes an order revision that can be printed.
 * revisionNumber=1 is the original order (before any price sync).
 * revisionNumber=N+1 (where N = price_change_log.length) is the current version.
 */
export interface OrderRevision {
  revisionNumber: number;
  label: string;
  timestamp: string | null;
  totalDiff: number | null;
  order: Order;
}

/**
 * Builds all printable revisions of an order from its price_change_log.
 * Returns an array from oldest (revision 1 = original) to newest (current).
 * The log is stored newest-first internally.
 */
export function buildOrderRevisions(order: Order): OrderRevision[] {
  const log = order.price_change_log;
  if (!log || log.length === 0) return [];

  // log[0] = most recent, log[N-1] = oldest
  const totalRevisions = log.length + 1;
  const revisions: OrderRevision[] = [];

  for (let revNum = 1; revNum <= totalRevisions; revNum++) {
    // For revision K, revert changes from log[0] through log[totalRevisions - revNum - 1]
    // i.e., revert the (totalRevisions - revNum) most recent changes
    const numToRevert = totalRevisions - revNum;

    // Clone items
    const revertedItems = order.items.map(item => ({ ...item }));

    // Apply reverts from newest to oldest so older overwrites correctly
    for (let r = 0; r < numToRevert; r++) {
      const record = log[r];
      for (const delta of record.itemChanges) {
        const idx = revertedItems.findIndex(
          it => it.sku === delta.sku && (it.variant_suffix || undefined) === (delta.variantSuffix || undefined)
        );
        if (idx !== -1) {
          revertedItems[idx].price_at_order = delta.oldPrice;
        }
      }
    }

    // Recalculate totals
    const subtotal = revertedItems.reduce((acc, it) => acc + it.price_at_order * it.quantity, 0);
    const discountFactor = 1 - ((order.discount_percent || 0) / 100);
    const net = subtotal * discountFactor;
    const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
    const grandTotal = net * (1 + vatRate);

    const isOriginal = revNum === 1;
    const isCurrent = revNum === totalRevisions;
    const changeRecord = isOriginal ? null : log[totalRevisions - revNum]; // The change that produced this revision

    revisions.push({
      revisionNumber: revNum,
      label: isOriginal
        ? 'Αρχική Έκδοση'
        : isCurrent
          ? `Τρέχουσα Έκδοση (/${revNum})`
          : `Αναθεώρηση /${revNum}`,
      timestamp: changeRecord?.timestamp ?? order.created_at,
      totalDiff: isOriginal ? null : (grandTotal - revisions[revisions.length - 1].order.total_price),
      order: {
        ...order,
        items: revertedItems,
        total_price: grandTotal,
      },
    });
  }

  return revisions;
}
