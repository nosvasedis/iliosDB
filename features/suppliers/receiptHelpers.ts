import type { ProductVariant, SupplierOrderItem } from '../../types';

type VariantIdentity = Pick<ProductVariant, 'suffix'>;

export function resolveSupplierOrderProductReceiptTarget(
  item: Pick<SupplierOrderItem, 'item_id' | 'item_name'>,
  variants: VariantIdentity[] = [],
): { sku: string; variantSuffix: string | null } {
  const sku = item.item_id.trim();
  const displayName = item.item_name.trim();

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
