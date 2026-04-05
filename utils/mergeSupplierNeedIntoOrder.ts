import type { Product, SupplierOrderItem, SupplierOrderType } from '../types';

/** Grouped need row from production batches or pending orders — fields required to merge into cart. */
export type GroupedSupplierNeedForMerge = {
    variant: string;
    size?: string;
    totalQty: number;
    product?: Product;
    requirements?: { customer: string; quantity?: number }[];
};

export function customerRefsFromRequirements(requirements?: { customer: string }[]): string | undefined {
    if (!requirements?.length) return undefined;
    const names = [...new Set(requirements.map(r => r.customer).filter(Boolean))];
    return names.length ? names.join(', ') : undefined;
}

export function mergeCustomerReferenceStrings(a: string | undefined, b: string | undefined): string | undefined {
    const set = new Set<string>();
    for (const part of [a, b]) {
        if (!part) continue;
        part.split(',').forEach(s => {
            const t = s.trim();
            if (t) set.add(t);
        });
    }
    if (set.size === 0) return undefined;
    return [...set].join(', ');
}

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

    const refFromNeed = customerRefsFromRequirements(need.requirements);

    if (existingIdx >= 0) {
        const updated = [...prev];
        const line = { ...updated[existingIdx] };
        line.quantity += need.totalQty;
        line.total_cost = 0;
        line.customer_reference = mergeCustomerReferenceStrings(line.customer_reference, refFromNeed);
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
            customer_reference: refFromNeed,
        },
    ];
}

export function mergeManyNeedsIntoItems(
    prev: SupplierOrderItem[],
    needs: GroupedSupplierNeedForMerge[]
): SupplierOrderItem[] {
    return needs.reduce((acc, n) => mergeNeedIntoItems(acc, n, 'Product'), prev);
}
