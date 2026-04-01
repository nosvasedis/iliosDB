import { EnhancedProductionBatch, ProductionStage } from '../../types';
import { ProductionStageColorKey, getProductionStageMeta } from '../../utils/productionStages';

export interface ProductionAlertItem {
    id: string;
    batchId: string;
    stageId: ProductionStage;
    stageLabel: string;
    stageShortLabel: string;
    stageColorKey: ProductionStageColorKey;
    sku: string;
    customerName: string;
    orderId?: string;
    quantity: number;
    sizeInfo?: string;
    timingLabel: string;
    productImage?: string | null;
    stageEnteredAt?: string;
    stageEnteredTimestamp: number;
}

export interface ProductionAlertGroup {
    stageId: ProductionStage;
    stageLabel: string;
    stageShortLabel: string;
    stageColorKey: ProductionStageColorKey;
    itemCount: number;
    totalQuantity: number;
    oldestTimestamp: number;
    items: ProductionAlertItem[];
}

export const PRODUCTION_ALERT_STAGE_STYLES: Record<ProductionStageColorKey, {
    section: string;
    header: string;
    badge: string;
    soft: string;
}> = {
    indigo: {
        section: 'border-indigo-100 bg-indigo-50/40',
        header: 'border-indigo-200 bg-indigo-100/80 text-indigo-800',
        badge: 'border-indigo-200 bg-white/80 text-indigo-700',
        soft: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    },
    slate: {
        section: 'border-slate-200 bg-slate-50/70',
        header: 'border-slate-200 bg-slate-100/90 text-slate-800',
        badge: 'border-slate-200 bg-white/80 text-slate-700',
        soft: 'bg-slate-100 text-slate-700 border-slate-200',
    },
    orange: {
        section: 'border-orange-100 bg-orange-50/40',
        header: 'border-orange-200 bg-orange-100/80 text-orange-800',
        badge: 'border-orange-200 bg-white/80 text-orange-700',
        soft: 'bg-orange-50 text-orange-700 border-orange-100',
    },
    purple: {
        section: 'border-purple-100 bg-purple-50/40',
        header: 'border-purple-200 bg-purple-100/80 text-purple-800',
        badge: 'border-purple-200 bg-white/80 text-purple-700',
        soft: 'bg-purple-50 text-purple-700 border-purple-100',
    },
    blue: {
        section: 'border-blue-100 bg-blue-50/40',
        header: 'border-blue-200 bg-blue-100/80 text-blue-800',
        badge: 'border-blue-200 bg-white/80 text-blue-700',
        soft: 'bg-blue-50 text-blue-700 border-blue-100',
    },
    pink: {
        section: 'border-pink-100 bg-pink-50/40',
        header: 'border-pink-200 bg-pink-100/80 text-pink-800',
        badge: 'border-pink-200 bg-white/80 text-pink-700',
        soft: 'bg-pink-50 text-pink-700 border-pink-100',
    },
    yellow: {
        section: 'border-yellow-100 bg-yellow-50/50',
        header: 'border-yellow-200 bg-yellow-100/90 text-yellow-800',
        badge: 'border-yellow-200 bg-white/80 text-yellow-700',
        soft: 'bg-yellow-50 text-yellow-700 border-yellow-100',
    },
    emerald: {
        section: 'border-emerald-100 bg-emerald-50/40',
        header: 'border-emerald-200 bg-emerald-100/80 text-emerald-800',
        badge: 'border-emerald-200 bg-white/80 text-emerald-700',
        soft: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    },
};

const getStageTimestamp = (batch: EnhancedProductionBatch) => {
    const timestamp = new Date(batch.stageEnteredAt || batch.created_at).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
};

export function buildProductionAlertGroups(batches: EnhancedProductionBatch[]): ProductionAlertGroup[] {
    const groups = new Map<ProductionStage, ProductionAlertItem[]>();

    batches.forEach((batch) => {
        if (batch.on_hold || batch.timingStatus !== 'critical') return;

        const stageMeta = getProductionStageMeta(batch.current_stage);
        if (!stageMeta) return;

        const alertItem: ProductionAlertItem = {
            id: batch.id,
            batchId: batch.id,
            stageId: batch.current_stage,
            stageLabel: stageMeta.label,
            stageShortLabel: stageMeta.shortLabel,
            stageColorKey: stageMeta.colorKey,
            sku: `${batch.sku}${batch.variant_suffix || ''}`,
            customerName: batch.customer_name || 'Χωρίς Πελάτη',
            orderId: batch.order_id,
            quantity: batch.quantity,
            sizeInfo: batch.size_info,
            timingLabel: batch.timingLabel || '0λ',
            productImage: batch.product_image,
            stageEnteredAt: batch.stageEnteredAt,
            stageEnteredTimestamp: getStageTimestamp(batch),
        };

        const existing = groups.get(batch.current_stage);
        if (existing) existing.push(alertItem);
        else groups.set(batch.current_stage, [alertItem]);
    });

    return Array.from(groups.entries())
        .map(([stageId, items]) => {
            const stageMeta = getProductionStageMeta(stageId);
            if (!stageMeta) return null;

            const sortedItems = [...items].sort((a, b) => {
                if (a.stageEnteredTimestamp !== b.stageEnteredTimestamp) {
                    return a.stageEnteredTimestamp - b.stageEnteredTimestamp;
                }

                const byCustomer = a.customerName.localeCompare(b.customerName, 'el', { sensitivity: 'base' });
                if (byCustomer !== 0) return byCustomer;

                return a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' });
            });

            return {
                stageId,
                stageLabel: stageMeta.label,
                stageShortLabel: stageMeta.shortLabel,
                stageColorKey: stageMeta.colorKey,
                itemCount: sortedItems.length,
                totalQuantity: sortedItems.reduce((sum, item) => sum + item.quantity, 0),
                oldestTimestamp: sortedItems[0]?.stageEnteredTimestamp || 0,
                items: sortedItems,
            } satisfies ProductionAlertGroup;
        })
        .filter((group): group is ProductionAlertGroup => group !== null)
        .sort((a, b) => {
            if (a.oldestTimestamp !== b.oldestTimestamp) {
                return a.oldestTimestamp - b.oldestTimestamp;
            }

            const aMeta = getProductionStageMeta(a.stageId);
            const bMeta = getProductionStageMeta(b.stageId);
            return (aMeta?.order || 0) - (bMeta?.order || 0);
        });
}
