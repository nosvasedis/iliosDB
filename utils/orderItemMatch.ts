import { OrderItem } from '../types';
import { buildItemIdentityKey } from './itemIdentity';
import { isSpecialCreationSku } from './specialCreationSku';

/** Unique key for merging/editing lines. SP lines always use `line_id` so multiples never collapse. */
export function getOrderItemMatchKey(
  item: Pick<OrderItem, 'sku' | 'variant_suffix' | 'size_info' | 'cord_color' | 'enamel_color' | 'notes' | 'line_id'>
): string {
  if (item.line_id) return `lid:${item.line_id}`;
  return `${buildItemIdentityKey(item)}::${item.notes || ''}`;
}

/** Assign stable line_id to legacy SP rows (before identity keys included line_id). */
export function assignMissingSpecialCreationLineIds(items: OrderItem[]): OrderItem[] {
  return items.map((row) => {
    if (!isSpecialCreationSku(row.sku)) return row;
    if (row.line_id) return row;
    return { ...row, line_id: crypto.randomUUID() };
  });
}
