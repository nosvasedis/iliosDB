import type { Product, SupplierOrderItem, SupplierOrderType } from '../types';
import type { SupplierOrderNeedRequirement } from '../features/suppliers/purchaseNeedPlanner';
import { allocationFromRequirement, supplierOrderItemAllocationQty, supplierOrderItemManualQty } from '../features/suppliers/purchaseNeedPlanner';

/** Grouped need row from production batches or pending orders — fields required to merge into cart. */
export type GroupedSupplierNeedForMerge = {
    variant: string;
    size?: string;
    cordColor?: string | null;
    enamelColor?: string | null;
    totalQty: number;
    product?: Product;
    requirements?: Array<Partial<SupplierOrderNeedRequirement> & { customer: string; quantity?: number; orderNote?: string; itemNote?: string; productionNote?: string }>;
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

function normalizeNoteKey(note: string): string {
    return note.trim().replace(/\s+/g, ' ').toLocaleLowerCase('el-GR');
}

function uniqueNoteTexts(...notes: (string | undefined)[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];

    for (const raw of notes) {
        const note = normalizeNote(raw);
        if (!note) continue;
        const key = normalizeNoteKey(note);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(note);
    }

    return unique;
}

function combineUniqueNotes(...notes: (string | undefined)[]): string | undefined {
    const unique = uniqueNoteTexts(...notes);
    return unique.length ? unique.join(' · ') : undefined;
}

function splitNoteParts(text: string): string[] {
    return uniqueNoteTexts(...text.split(/\s*·\s*/));
}

const LEGACY_LINE_NOTE_RE = /^(.+?)\s+-\s+Σημείωση\s+(?:γραμμής|παραγωγής|εντολής):\s*(.+)$/;
const CUSTOMER_LINE_NOTE_RE = /^(.+?\sx\d+):\s*(.+)$/;

function parseSupplierNoteLine(line: string): { customerKey: string; noteTexts: string[] } | null {
    if (line.includes('Σημείωση εντολής:')) return null;

    const legacyMatch = line.match(LEGACY_LINE_NOTE_RE);
    if (legacyMatch) {
        return {
            customerKey: legacyMatch[1].trim(),
            noteTexts: splitNoteParts(legacyMatch[2]),
        };
    }

    const customerMatch = line.match(CUSTOMER_LINE_NOTE_RE);
    if (customerMatch) {
        return {
            customerKey: customerMatch[1].trim(),
            noteTexts: splitNoteParts(customerMatch[2]),
        };
    }

    return { customerKey: '', noteTexts: splitNoteParts(line) };
}

/** Normalize supplier line notes: drop order notes, dedupe identical line/production notes. */
export function normalizeSupplierItemNotesForDisplay(notes: string | undefined): string | undefined {
    if (!notes?.trim()) return undefined;

    const groups = new Map<string, { customerKey: string; order: number; noteOrder: string[]; seen: Set<string> }>();
    let orderCounter = 0;

    for (const rawLine of notes.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        const parsed = parseSupplierNoteLine(line);
        if (!parsed || parsed.noteTexts.length === 0) continue;

        const groupKey = parsed.customerKey.toLocaleLowerCase('el-GR');
        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                customerKey: parsed.customerKey,
                order: orderCounter++,
                noteOrder: [],
                seen: new Set(),
            });
        }

        const group = groups.get(groupKey)!;
        for (const note of parsed.noteTexts) {
            const noteKey = normalizeNoteKey(note);
            if (group.seen.has(noteKey)) continue;
            group.seen.add(noteKey);
            group.noteOrder.push(note);
        }
    }

    const lines = [...groups.values()]
        .sort((a, b) => a.order - b.order)
        .map(({ customerKey, noteOrder }) => {
            const combined = noteOrder.join(' · ');
            return customerKey ? `${customerKey}: ${combined}` : combined;
        })
        .filter(Boolean);

    return lines.length ? lines.join('\n') : undefined;
}

/** @deprecated Use normalizeSupplierItemNotesForDisplay */
export const filterOrderNotesFromItemNotes = normalizeSupplierItemNotesForDisplay;

function noteLinesFromRequirements(
    requirements?: { customer: string; quantity?: number; orderNote?: string; itemNote?: string; productionNote?: string }[]
): string[] {
    if (!requirements?.length) return [];

    const linesByKey = new Map<string, { customer?: string; note: string; quantity: number }>();

    for (const req of requirements) {
        const customer = req.customer?.trim();
        const combinedNote = combineUniqueNotes(req.itemNote, req.productionNote);
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
    return normalizeSupplierItemNotesForDisplay(lines.length ? lines.join('\n') : undefined);
}

/** Recompute all fields derived from structured source allocations after an allocation is removed. */
export function rebuildSupplierOrderItemFromAllocations(item: SupplierOrderItem): SupplierOrderItem {
    const allocations = item.source_allocations || [];
    const requirements = allocations.map((allocation) => ({
        customer: allocation.customer,
        quantity: allocation.quantity,
        orderNote: allocation.order_note,
        itemNote: allocation.item_note,
        productionNote: allocation.production_note,
    }));
    const manualQuantity = supplierOrderItemManualQty(item);
    return {
        ...item,
        source_allocations: allocations.length ? allocations : undefined,
        manual_quantity: manualQuantity,
        quantity: allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) + manualQuantity,
        customer_reference: customerRefsFromRequirements(requirements),
        notes: supplierOrderNotesFromRequirements(requirements),
        total_cost: 0,
    };
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
            (i.size_info || '') === (finalSize || '') &&
            (i.cord_color || '') === (need.cordColor || '') &&
            (i.enamel_color || '') === (need.enamelColor || '')
    );

    const refFromNeed = customerRefsFromRequirements(need.requirements);
    const notesFromNeed = supplierOrderNotesFromRequirements(need.requirements);

    const sourcedRequirements = (need.requirements || []).filter(
        (requirement): requirement is SupplierOrderNeedRequirement =>
            !!requirement.id && !!requirement.sourceType && !!requirement.sourceId && typeof requirement.quantity === 'number'
    );
    const incomingAllocations = sourcedRequirements.map(allocationFromRequirement);

    if (existingIdx >= 0) {
        const updated = [...prev];
        const line = { ...updated[existingIdx] };
        const priorManualQuantity = supplierOrderItemManualQty(line);
        const existingAllocations = [...(line.source_allocations || [])];
        const existingSourceIds = new Set(existingAllocations.map((allocation) => `${allocation.source_type}:${allocation.source_id}`));
        const newAllocations = incomingAllocations.filter(
            (allocation) => !existingSourceIds.has(`${allocation.source_type}:${allocation.source_id}`)
        );
        line.source_allocations = [...existingAllocations, ...newAllocations];
        if (incomingAllocations.length === 0) {
            line.manual_quantity = priorManualQuantity + need.totalQty;
        } else {
            line.manual_quantity = priorManualQuantity;
        }
        line.quantity = supplierOrderItemAllocationQty(line) + supplierOrderItemManualQty(line);
        line.total_cost = 0;
        line.customer_reference = mergeCustomerReferenceStrings(line.customer_reference, refFromNeed);
        line.notes = normalizeSupplierItemNotesForDisplay(mergeSupplierOrderNotes(line.notes, notesFromNeed));
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
            variant_suffix: need.variant || null,
            cord_color: need.cordColor as SupplierOrderItem['cord_color'],
            enamel_color: need.enamelColor as SupplierOrderItem['enamel_color'],
            manual_quantity: incomingAllocations.length > 0 ? 0 : need.totalQty,
            source_allocations: incomingAllocations.length > 0 ? incomingAllocations : undefined,
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
