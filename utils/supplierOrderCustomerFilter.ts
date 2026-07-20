import type { SupplierOrderGroupedNeed, SupplierOrderNeedRequirement } from '../hooks/useSupplierOrderNeeds';
import type { SupplierOrderItem } from '../types';
import { unattributedQty } from './supplierOrderNeedBreakdown';
import { mergeNeedIntoItems } from './mergeSupplierNeedIntoOrder';

export function normCustomerKey(name: string): string {
    return name.trim().toLocaleLowerCase('el-GR');
}

export type PurchaseOrderCustomerFilter = {
    excludeKeys: Set<string>;
    /** When non-empty, only these customers' requirement lines count (overrides exclude). */
    includeOnlyKeys: Set<string>;
};

export type PurchaseOrderFilterTab = 'all' | 'exclude' | 'include_only';

export function purchaseOrderFilterFromTab(tab: PurchaseOrderFilterTab, pickedKeys: Set<string>): PurchaseOrderCustomerFilter {
    if (tab === 'all') return { excludeKeys: new Set(), includeOnlyKeys: new Set() };
    if (tab === 'include_only') return { excludeKeys: new Set(), includeOnlyKeys: new Set(pickedKeys) };
    return { excludeKeys: new Set(pickedKeys), includeOnlyKeys: new Set() };
}

export function hasActivePurchaseOrderCustomerFilter(f: PurchaseOrderCustomerFilter): boolean {
    return f.includeOnlyKeys.size > 0 || f.excludeKeys.size > 0;
}

export function customerMatchesPurchaseFilter(customerDisplay: string, f: PurchaseOrderCustomerFilter): boolean {
    const k = normCustomerKey(customerDisplay);
    if (f.includeOnlyKeys.size > 0) {
        return f.includeOnlyKeys.has(k);
    }
    return !f.excludeKeys.has(k);
}

export function defaultRequirementSelectionIds(
    need: SupplierOrderGroupedNeed,
    f: PurchaseOrderCustomerFilter,
): Set<string> {
    return new Set(
        need.requirements
            .filter((requirement) => customerMatchesPurchaseFilter(requirement.customer, f))
            .map((requirement) => requirement.id)
    );
}

export function quantitiesFromRequirementSelection(
    need: SupplierOrderGroupedNeed,
    selectedIds: Set<string>,
): { totalQty: number; requirements: SupplierOrderNeedRequirement[] } {
    const requirements = need.requirements.filter((requirement) => selectedIds.has(requirement.id));
    return {
        totalQty: requirements.reduce((sum, requirement) => sum + requirement.quantity, 0),
        requirements,
    };
}

export function defaultMaskForNeed(need: SupplierOrderGroupedNeed, extraQty: number, f: PurchaseOrderCustomerFilter): boolean[] {
    const mask = need.requirements.map(r => customerMatchesPurchaseFilter(r.customer, f));
    if (extraQty > 0) {
        mask.push(!hasActivePurchaseOrderCustomerFilter(f));
    }
    return mask;
}

export function quantitiesFromSelection(
    need: SupplierOrderGroupedNeed,
    mask: boolean[],
    extraQty: number,
    unattributedLabel = 'Λοιπά (αναντίστοιχα)'
): { totalQty: number; requirements: SupplierOrderNeedRequirement[] } {
    const reqs = need.requirements;
    const outReqs: SupplierOrderNeedRequirement[] = [];
    let sum = 0;
    for (let i = 0; i < reqs.length; i++) {
        if (mask[i]) {
            sum += reqs[i].quantity;
            outReqs.push(reqs[i]);
        }
    }
    if (extraQty > 0 && mask[reqs.length]) {
        sum += extraQty;
        outReqs.push({
            id: `unattributed:${need.sku}:${need.variant}:${need.size || ''}`,
            sourceType: 'customer_order',
            sourceId: '',
            orderId: '',
            customer: unattributedLabel,
            quantity: extraQty,
        });
    }
    return { totalQty: sum, requirements: outReqs };
}

export function selectedQtyFromMask(need: SupplierOrderGroupedNeed, mask: boolean[], extraQty: number): number {
    return quantitiesFromSelection(need, mask, extraQty).totalQty;
}

export function mergeManyNeedsWithCustomerFilter(
    prev: SupplierOrderItem[],
    needs: SupplierOrderGroupedNeed[],
    f: PurchaseOrderCustomerFilter,
    selectedIdsByNeedKey?: Record<string, string[]>,
    keyForNeed?: (need: SupplierOrderGroupedNeed) => string,
): SupplierOrderItem[] {
    return needs.reduce((acc, n) => {
        if (!n.product) return acc;
        const storedIds = keyForNeed ? selectedIdsByNeedKey?.[keyForNeed(n)] : undefined;
        const selectedIds = storedIds ? new Set(storedIds) : defaultRequirementSelectionIds(n, f);
        const { totalQty, requirements } = quantitiesFromRequirementSelection(n, selectedIds);
        if (totalQty <= 0) return acc;
        return mergeNeedIntoItems(
            acc,
            {
                variant: n.variant,
                size: n.size,
                cordColor: n.cordColor,
                enamelColor: n.enamelColor,
                totalQty,
                product: n.product,
                requirements,
            },
            'Product'
        );
    }, prev);
}
