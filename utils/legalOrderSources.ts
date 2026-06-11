import { Order, OrderItem, OrderShipment, OrderShipmentItem } from '../types';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../lib/supabase';
import { buildOrderItemIdentityKey } from '../features/orders/printHelpers';
import { computeShipmentValue, getRemainingOrderItems } from './shipmentUtils';
import { formatOrderId } from './orderUtils';

export function isRetailOrder(order: Pick<Order, 'customer_id' | 'customer_name'>): boolean {
  return order.customer_id === RETAIL_CUSTOMER_ID || order.customer_name === RETAIL_CUSTOMER_NAME;
}

/** Select value for invoicing only items not yet shipped. */
export const LEGAL_REMAINING_SOURCE_VALUE = '__remaining__';

const TRANSFER_OUT_RE = /\[ΜΕΤΑΦΟΡΑ[^\]]*\]\s*Υπόλοιπο[\s\S]*?→\s*παρ\.\s*#([a-f0-9]{6})/i;
const TRANSFER_IN_RE = /\[ΜΕΤΑΦΟΡΑ[^\]]*\]\s*Ελήφθησαν[\s\S]*?από\s*παρ\.\s*#([a-f0-9]{6})/i;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatLegalOrderMoney(value: number | null | undefined): string {
  return Number(value || 0).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
}

export function parseTransferOutShortId(notes?: string | null): string | null {
  const match = String(notes || '').match(TRANSFER_OUT_RE);
  return match?.[1]?.toLowerCase() || null;
}

export function parseTransferInShortId(notes?: string | null): string | null {
  const match = String(notes || '').match(TRANSFER_IN_RE);
  return match?.[1]?.toLowerCase() || null;
}

export function findOrderByShortId(orders: Order[], shortId: string): Order | undefined {
  const needle = shortId.toLowerCase();
  return orders.find((order) => order.id.toLowerCase().endsWith(needle));
}

export function computeOrderGrandTotal(
  order: Pick<Order, 'items' | 'vat_rate' | 'discount_percent'>,
): number {
  const vatRate = order.vat_rate ?? 0.24;
  const discountPercent = order.discount_percent ?? 0;
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = items.reduce((sum, item) => sum + (item.price_at_order || 0) * (item.quantity || 0), 0);
  const net = subtotal * (1 - discountPercent / 100);
  return roundMoney(net * (1 + vatRate));
}

export function getOrderItemQuantityTotal(order: Order): number {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((sum, item) => sum + (item.quantity || 0), 0);
}

export function getShipmentItemsForOrder(
  orderId: string,
  shipments: OrderShipment[],
  shipmentItems: OrderShipmentItem[],
): OrderShipmentItem[] {
  const shipmentIds = new Set(
    shipments.filter((shipment) => shipment.order_id === orderId).map((shipment) => shipment.id),
  );
  return shipmentItems.filter((item) => shipmentIds.has(item.shipment_id));
}

export interface LegalOrderPickerRow {
  order: Order;
  label: string;
  selectable: boolean;
  billableTotal: number;
  transferOutShortId: string | null;
  transferInShortId: string | null;
  redirectOrderId: string | null;
  hint: string | null;
}

export function buildLegalOrderPickerRows(orders: Order[]): LegalOrderPickerRow[] {
  const rows = orders.filter((order) => !isRetailOrder(order)).map((order) => {
    const transferOutShortId = parseTransferOutShortId(order.notes);
    const transferInShortId = parseTransferInShortId(order.notes);
    const qtyTotal = getOrderItemQuantityTotal(order);
    const billableTotal = computeOrderGrandTotal(order);
    const redirectOrder = transferOutShortId ? findOrderByShortId(orders, transferOutShortId) : undefined;
    const emptiedByTransfer = Boolean(transferOutShortId && qtyTotal === 0);
    const selectable = !emptiedByTransfer && qtyTotal > 0;
    const shortId = formatOrderId(order.id);

    const suffixParts: string[] = [];
    if (emptiedByTransfer) suffixParts.push('μεταφέρθηκε σε άλλη παραγγελία');
    else if (transferInShortId) suffixParts.push(`+μεταφορά από #${transferInShortId}`);
    else if (transferOutShortId) suffixParts.push(`μερική μεταφορά → #${transferOutShortId}`);

    const label = [
      order.customer_name,
      `#${shortId}`,
      formatLegalOrderMoney(billableTotal),
      suffixParts.length > 0 ? `· ${suffixParts.join(' ')}` : '',
    ].filter(Boolean).join(' | ');

    let hint: string | null = null;
    if (emptiedByTransfer) {
      hint = redirectOrder
        ? `Τα είδη μεταφέρθηκαν στη νεότερη παραγγελία #${formatOrderId(redirectOrder.id)}. Επιλέξτε εκείνη για τιμολόγηση.`
        : `Τα είδη μεταφέρθηκαν στη παραγγελία #${transferOutShortId}. Επιλέξτε εκείνη για τιμολόγηση.`;
    } else if (transferInShortId) {
      hint = `Η παραγγελία περιλαμβάνει είδη που μεταφέρθηκαν από την #${transferInShortId}.`;
    } else if (transferOutShortId) {
      hint = `Μέρος των ειδών μεταφέρθηκε στη #${transferOutShortId}. Εδώ εμφανίζονται μόνο όσα έμειναν στην παραγγελία.`;
    }

    return {
      order,
      label,
      selectable,
      billableTotal,
      transferOutShortId,
      transferInShortId,
      redirectOrderId: redirectOrder?.id || null,
      hint,
    };
  });

  return rows.sort((a, b) => {
    if (a.selectable !== b.selectable) return a.selectable ? -1 : 1;
    return new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime();
  });
}

export interface LegalLineSourceOption {
  value: string;
  label: string;
  description: string;
  group: 'base' | 'shipment';
}

function sortShipmentsNewestFirst(shipments: OrderShipment[]): OrderShipment[] {
  return [...shipments].sort((a, b) => {
    const timeDiff = new Date(b.shipped_at).getTime() - new Date(a.shipped_at).getTime();
    if (timeDiff !== 0) return timeDiff;
    return (b.shipment_number || 0) - (a.shipment_number || 0);
  });
}

type RemainingLine = ReturnType<typeof getRemainingOrderItems>[number];

function areRemainingItemsSameAsOrder(order: Order, remaining: RemainingLine[]): boolean {
  const orderItems = Array.isArray(order.items) ? order.items : [];
  if (remaining.length === 0 || remaining.length !== orderItems.length) return remaining.length === orderItems.length;

  const remainingByKey = new Map(
    remaining.map((item) => [buildOrderItemIdentityKey(item), item.quantity]),
  );

  return orderItems.every((item) => remainingByKey.get(buildOrderItemIdentityKey(item)) === item.quantity);
}

/** Υπόλειπα είδη όταν υπάρχουν πραγματικά μη αποσταλμένα είδη που διαφέρουν από «Όλη η παραγγελία». */
export function shouldOfferLegalRemainingSource(
  order: Order,
  shipments: OrderShipment[],
  shipmentItems: OrderShipmentItem[],
): boolean {
  if (shipments.length === 0) return false;
  const remaining = getRemainingOrderItems(order, shipmentItems);
  if (remaining.length === 0) return false;
  return !areRemainingItemsSameAsOrder(order, remaining);
}

export function buildLegalLineSourceOptions(params: {
  order: Order;
  shipments: OrderShipment[];
  shipmentItems: OrderShipmentItem[];
}): LegalLineSourceOption[] {
  const { order, shipments, shipmentItems } = params;
  const vatRate = order.vat_rate ?? 0.24;
  const discountPercent = order.discount_percent ?? 0;
  const options: LegalLineSourceOption[] = [];

  const fullQty = getOrderItemQuantityTotal(order);
  const fullTotal = computeOrderGrandTotal(order);
  options.push({
    value: '',
    group: 'base',
    label: `Όλη η παραγγελία — ${fullQty} τεμ. · ${formatLegalOrderMoney(fullTotal)}`,
    description: 'Όλα τα τρέχοντα είδη της παραγγελίας',
  });

  if (shouldOfferLegalRemainingSource(order, shipments, shipmentItems)) {
    const remaining = getRemainingOrderItems(order, shipmentItems);
    const remainingQty = remaining.reduce((sum, item) => sum + item.quantity, 0);
    const remainingTotal = computeShipmentValue(remaining, vatRate, discountPercent).grandTotal;
    options.push({
      value: LEGAL_REMAINING_SOURCE_VALUE,
      group: 'base',
      label: `Υπόλειπα είδη — ${remainingQty} τεμ. · ${formatLegalOrderMoney(remainingTotal)}`,
      description: 'Μόνο όσα δεν έχουν αποσταλεί ακόμα',
    });
  }

  for (const shipment of sortShipmentsNewestFirst(shipments)) {
    const items = shipmentItems.filter((item) => item.shipment_id === shipment.id);
    const qty = items.reduce((sum, item) => sum + item.quantity, 0);
    const total = computeShipmentValue(items, vatRate, discountPercent).grandTotal;
    const shippedAt = new Date(shipment.shipped_at).toLocaleDateString('el-GR');
    options.push({
      value: shipment.id,
      group: 'shipment',
      label: `ΔΑ #${shipment.shipment_number} — ${qty} τεμ. · ${formatLegalOrderMoney(total)} | ${shippedAt}`,
      description: shipment.shipped_by ? `Αποστολή από ${shipment.shipped_by}` : 'Καταχωρημένη μερική αποστολή',
    });
  }

  return options;
}

/** Build an order snapshot containing only unshipped line quantities. */
export function buildOrderWithRemainingItems(
  order: Order,
  shipmentItems: OrderShipmentItem[],
): Order | null {
  const remaining = getRemainingOrderItems(order, shipmentItems);
  if (remaining.length === 0) return null;

  const orderItems = Array.isArray(order.items) ? order.items : [];
  const remainingOrderItems = remaining
    .map((remainingItem) => {
      const existingItem = orderItems.find(
        (item) => buildOrderItemIdentityKey(item) === buildOrderItemIdentityKey(remainingItem),
      );
      if (!existingItem) return null;
      return {
        ...existingItem,
        quantity: remainingItem.quantity,
        price_at_order: remainingItem.price_at_order,
      };
    })
    .filter((item): item is OrderItem => item !== null);

  if (remainingOrderItems.length === 0) return null;

  return {
    ...order,
    items: remainingOrderItems,
    total_price: computeOrderGrandTotal({ ...order, items: remainingOrderItems }),
  };
}
