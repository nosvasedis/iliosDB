import type { SupplierOrderNeedRequirement } from '../hooks/useSupplierOrderNeeds';

export function sumRequirementQty(requirements: SupplierOrderNeedRequirement[]): number {
    return requirements.reduce((s, r) => s + r.quantity, 0);
}

/** Merge lines that share the same customer label (e.g. multiple batches for one client). */
export function aggregateRequirementsByCustomer(
    requirements: SupplierOrderNeedRequirement[]
): { customer: string; qty: number }[] {
    const m = new Map<string, number>();
    for (const r of requirements) {
        m.set(r.customer, (m.get(r.customer) || 0) + r.quantity);
    }
    return [...m.entries()]
        .map(([customer, qty]) => ({ customer, qty }))
        .sort((a, b) => a.customer.localeCompare(b.customer, 'el'));
}

export function unattributedQty(totalQty: number, requirements: SupplierOrderNeedRequirement[]): number {
    const attributed = sumRequirementQty(requirements);
    return Math.max(0, totalQty - attributed);
}

export function needBreakdownKey(section: 'prod' | 'pend', n: { sku: string; variant: string; size?: string }): string {
    return `${section}:${n.sku}:${n.variant}:${n.size ?? ''}`;
}
