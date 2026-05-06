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

type LineIdFactory = () => string;

function defaultLineIdFactory(): string {
  return crypto.randomUUID();
}

function needsPerLineIdentity(item: OrderItem, collisionKeys: Set<string>): boolean {
  return isSpecialCreationSku(item.sku) || collisionKeys.has(buildItemIdentityKey(item));
}

/** Assign stable line_id to rows that must never collapse into the same catalog identity. */
export function assignMissingOrderLineIds(
  items: OrderItem[],
  createLineId: LineIdFactory = defaultLineIdFactory
): OrderItem[] {
  const notesByNaturalKey = new Map<string, Set<string>>();

  for (const item of items) {
    if (isSpecialCreationSku(item.sku)) continue;
    const key = buildItemIdentityKey(item);
    const notes = notesByNaturalKey.get(key) || new Set<string>();
    notes.add(item.notes || '');
    notesByNaturalKey.set(key, notes);
  }

  const noteCollisionKeys = new Set(
    Array.from(notesByNaturalKey.entries())
      .filter(([, notes]) => notes.size > 1)
      .map(([key]) => key)
  );

  return items.map((row) => {
    if (!needsPerLineIdentity(row, noteCollisionKeys) || row.line_id) return row;
    return { ...row, line_id: createLineId() };
  });
}

/** Assign stable line_id to legacy rows that require per-line identity. */
export function assignMissingSpecialCreationLineIds(items: OrderItem[]): OrderItem[] {
  return assignMissingOrderLineIds(items);
}
