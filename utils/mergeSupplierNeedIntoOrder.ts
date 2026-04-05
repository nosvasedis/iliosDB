import type { Product, SupplierOrderItem, SupplierOrderType } from '../types';

/** Grouped need row from production batches or pending orders — fields required to merge into cart. */
export type GroupedSupplierNeedForMerge = {
    variant: string;
    size?: string;
    totalQty: number;
    product?: Product;
};

export function mergeNeedIntoItems(
    prev: SupplierOrderItem[],
    need: GroupedSupplierNeedForMerge,
    itemType: SupplierOrderType = 'Product'
): SupplierOrderItem[] {
    if (!need.product) return prev;

    const name = `${need.product.sku}${need.variant}`;
    const finalSize = need.size || '';
    const existingIdx = prev.findIndex(
        i =>
            i.item_name === name &&
            i.item_type === itemType &&
            (i.size_info || '') === (finalSize || '')
    );

    if (existingIdx >= 0) {
        const updated = [...prev];
        const line = { ...updated[existingIdx] };
        line.quantity += need.totalQty;
        line.total_cost = 0;
        updated[existingIdx] = line;
        return updated;
    }

    return [
        ...prev,
        {
            id: Math.random().toString(36),
            item_type: itemType,
            item_id: need.product.sku,
            item_name: name,
            quantity: need.totalQty,
            unit_cost: 0,
            total_cost: 0,
            size_info: finalSize || undefined,
        },
    ];
}

export function mergeManyNeedsIntoItems(
    prev: SupplierOrderItem[],
    needs: GroupedSupplierNeedForMerge[]
): SupplierOrderItem[] {
    return needs.reduce((acc, n) => mergeNeedIntoItems(acc, n, 'Product'), prev);
}
