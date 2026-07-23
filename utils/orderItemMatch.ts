import { OrderItem } from '../types';
import { buildItemIdentityKey } from './itemIdentity';

/** Unique key for merging/editing lines. SP lines always use `line_id` so multiples never collapse. */
export function getOrderItemMatchKey(
  item: Pick<OrderItem, 'sku' | 'variant_suffix' | 'size_info' | 'cord_color' | 'enamel_color' | 'notes' | 'line_id'>
): string {
  if (item.line_id) return `lid:${item.line_id}`;
  return `${buildItemIdentityKey(item)}::${item.notes || ''}`;
}

type LineIdFactory = () => string;

function defaultLineIdFactory(): string {
  return crypto.randomUUID();
}

/**
 * Assign a stable identity to every order row.
 *
 * Inventory reservations and shipment reversals are line-level ERP operations;
 * relying on a derived SKU key would merge repeated rows and release or issue
 * the wrong quantity. The collision scan remains for backward-compatible match
 * keys, but every persisted row now receives a line id.
 */
export function assignMissingOrderLineIds(
  items: OrderItem[],
  createLineId: LineIdFactory = defaultLineIdFactory
): OrderItem[] {
  return items.map((row) => row.line_id ? row : { ...row, line_id: createLineId() });
}

/** Assign stable line_id to legacy rows that require per-line identity. */
export function assignMissingSpecialCreationLineIds(items: OrderItem[]): OrderItem[] {
  return assignMissingOrderLineIds(items);
}
