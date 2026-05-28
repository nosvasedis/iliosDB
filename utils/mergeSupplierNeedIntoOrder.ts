import type { Product, SupplierOrderItem, SupplierOrderType } from '../types';

/** Grouped need row from production batches or pending orders — fields required to merge into cart. */
export type GroupedSupplierNeedForMerge = {
    variant: string;
    size?: string;
    totalQty: number;
    product?: Product;
    requirements?: { customer: string; quantity?: number; orderNote?: string; itemNote?: string; productionNote?: string }[];
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

function normalizeNote(note: string | undefined): string | undefined {
    const trimmed = note?.trim();
    return trimmed || undefined;
}

function noteLinesFromRequirements(
    requirements?: { customer: string; quantity?: number; orderNote?: string; itemNote?: string; productionNote?: string }[]
): string[] {
    if (!requirements?.length) return [];

    const linesByKey = new Map<string, { customer?: string; note: string; quantity: number }>();

    for (const req of requirements) {
        const customer = req.customer?.trim();
        const noteParts = [req.itemNote, req.productionNote]
            .map(normalizeNote)
            .filter((note): note is string => Boolean(note));
        const combinedNote = noteParts.join(' · ');
        if (!combinedNote) continue;

        const key = `${customer || ''}|${combinedNote}`.toLocaleLowerCase('el-GR');
        const existing = linesByKey.get(key);
        if (existing) {
            existing.quantity += req.quantity || 0;
        } else {
            linesByKey.set(key, { customer, note: combinedNote, quantity: req.quantity || 0 });
        }
    }

    return [...linesByKey.values()].map(({ customer, note, quantity }) => {
        const qty = quantity > 0 ? ` x${quantity}` : '';
        return customer ? `${customer}${qty}: ${note}` : note;
    });
}

/** Strip legacy order-level note lines from item notes (for print/display). */
export function filterOrderNotesFromItemNotes(notes: string | undefined): string | undefined {
    if (!notes?.trim()) return undefined;

    const filtered = notes
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.includes('Σημείωση εντολής:'));

    return filtered.length ? filtered.join('\n') : undefined;
}

export function mergeSupplierOrderNotes(a: string | undefined, b: string | undefined): string | undefined {
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const source of [a, b]) {
        if (!source) continue;
        for (const rawLine of source.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line) continue;
            const key = line.toLocaleLowerCase('el-GR');
            if (seen.has(key)) continue;
            seen.add(key);
            lines.push(line);
        }
    }

    return lines.length ? lines.join('\n') : undefined;
}

export function supplierOrderNotesFromRequirements(
    requirements?: { customer: string; quantity?: number; orderNote?: string; itemNote?: string; productionNote?: string }[]
): string | undefined {
    const lines = noteLinesFromRequirements(requirements);
    return lines.length ? lines.join('\n') : undefined;
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
    const notesFromNeed = supplierOrderNotesFromRequirements(need.requirements);

    if (existingIdx >= 0) {
        const updated = [...prev];
        const line = { ...updated[existingIdx] };
        line.quantity += need.totalQty;
        line.total_cost = 0;
        line.customer_reference = mergeCustomerReferenceStrings(line.customer_reference, refFromNeed);
        line.notes = mergeSupplierOrderNotes(line.notes, notesFromNeed);
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
            notes: notesFromNeed,
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
