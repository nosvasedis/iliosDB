import type { ProductVariant, SupplierOrderItem } from '../../types';

type VariantIdentity = Pick<ProductVariant, 'suffix'>;

export function resolveSupplierOrderProductReceiptTarget(
  item: Pick<SupplierOrderItem, 'item_id' | 'item_name'> & Partial<Pick<SupplierOrderItem, 'variant_suffix'>>,
  variants: VariantIdentity[] = [],
): { sku: string; variantSuffix: string | null } {
  const sku = item.item_id.trim();
  const displayName = item.item_name.trim();

  if (item.variant_suffix && variants.some((variant) => variant.suffix === item.variant_suffix)) {
    return { sku, variantSuffix: item.variant_suffix };
  }

  if (!sku || !displayName.startsWith(sku)) {
    return { sku, variantSuffix: null };
  }

  const suffix = displayName.slice(sku.length).trim();
  if (!suffix) {
    return { sku, variantSuffix: null };
  }

  return variants.some((variant) => variant.suffix === suffix)
    ? { sku, variantSuffix: suffix }
    : { sku, variantSuffix: null };
}

export function addReceivedSizeQuantity(
  stockBySize: Record<string, number> | null | undefined,
  size: string | null | undefined,
  quantity: number,
): Record<string, number> | undefined {
  const normalizedSize = size?.trim();
  if (!normalizedSize) return undefined;

  return {
    ...(stockBySize || {}),
    [normalizedSize]: Number(stockBySize?.[normalizedSize] || 0) + quantity,
  };
}

/** Quantity that becomes free inventory; linked awaiting batches stay committed to their customers. */
export function supplierOrderInventoryReceiptQuantity(
  item: Pick<SupplierOrderItem, 'quantity' | 'source_allocations'>,
  transitionedToBatchQty = 0,
): number {
  const committedBatchQty = (item.source_allocations || [])
    .filter((allocation) => allocation.source_type === 'production_batch')
    .reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quantity || 0)), 0);
  return Math.max(0, Number(item.quantity || 0) - committedBatchQty - Math.max(0, transitionedToBatchQty));
}
