import { OrderItem, ProductionBatch } from '../../types';
import { buildOrderItemIdentityKey } from '../orders/printHelpers';
import { getNaturalCatalogKey } from './orderBatchReconcile';

type ProductionIdentityItem = Pick<
  OrderItem,
  'sku' | 'variant_suffix' | 'size_info' | 'cord_color' | 'enamel_color' | 'line_id'
>;

function getNaturalKey(item: ProductionIdentityItem): string {
  return getNaturalCatalogKey(
    item.sku,
    item.variant_suffix,
    item.size_info,
    item.cord_color,
    item.enamel_color,
  );
}

function hasUniqueNaturalIdentity(item: ProductionIdentityItem, orderItems: ProductionIdentityItem[]): boolean {
  const key = getNaturalKey(item);
  return orderItems.filter((candidate) => getNaturalKey(candidate) === key).length === 1;
}

export function productionBatchMatchesOrderItem(
  batch: ProductionBatch,
  item: ProductionIdentityItem,
  orderItems: ProductionIdentityItem[],
): boolean {
  if (buildOrderItemIdentityKey(batch) === buildOrderItemIdentityKey(item)) return true;

  const oneSideHasLineId = !!batch.line_id !== !!item.line_id;
  if (!oneSideHasLineId) return false;
  if (!hasUniqueNaturalIdentity(item, orderItems)) return false;

  return getNaturalKey(batch) === getNaturalKey(item);
}

export function getRelevantProductionBatchesForOrderItem(
  item: ProductionIdentityItem,
  orderItems: ProductionIdentityItem[],
  batches: ProductionBatch[],
): ProductionBatch[] {
  return batches.filter((batch) => productionBatchMatchesOrderItem(batch, item, orderItems));
}
