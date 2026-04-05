import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Product, Supplier } from '../types';
import { ProductionStage, ProductionType } from '../types';
import { api } from '../lib/supabase';

/** One contribution line (batch or order item) feeding a grouped SKU row. */
export type SupplierOrderNeedRequirement = {
    orderId: string;
    customer: string;
    quantity: number;
};

/** One grouped row for supplier PO intelligence panels (production or pending orders). */
export type SupplierOrderGroupedNeed = {
    sku: string;
    variant: string;
    size?: string;
    totalQty: number;
    product?: Product;
    requirements: SupplierOrderNeedRequirement[];
};

/**
 * Ανάγκες Παραγωγής (awaiting delivery): rows for this supplier if the product is linked to them,
 * OR non-imported (in-house) products with no supplier on file — so batches moved to Αναμονή Παραλαβής
 * for outsourced delivery stay addable from whichever supplier PO you are building.
 */
function filterProductionNeedBySupplier(product: Product | undefined, supplierId: string): boolean {
    if (!product) return false;
    if (product.supplier_id === supplierId) return true;
    if (product.production_type !== ProductionType.Imported && !product.supplier_id) return true;
    return false;
}

/** Pending orders: only imported goods tied to this supplier (normal resale pipeline). */
function filterPendingNeedBySupplier(product: Product | undefined, supplierId: string): boolean {
    return product?.supplier_id === supplierId && product?.production_type === ProductionType.Imported;
}

export function useSupplierOrderNeeds(supplier: Supplier) {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: productionBatches } = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
    const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });

    const productionNeeds = useMemo((): SupplierOrderGroupedNeed[] => {
        if (!productionBatches || !products || !orders) return [];

        const awaiting = productionBatches.filter(b => b.current_stage === ProductionStage.AwaitingDelivery);
        const groupedNeeds: Record<string, SupplierOrderGroupedNeed> = {};

        awaiting.forEach(b => {
            const key = `${b.sku}-${b.variant_suffix || ''}-${b.size_info || ''}`;
            if (!groupedNeeds[key]) {
                const product = products.find(p => p.sku === b.sku);
                groupedNeeds[key] = {
                    sku: b.sku,
                    variant: b.variant_suffix || '',
                    size: b.size_info || undefined,
                    totalQty: 0,
                    product,
                    requirements: [],
                };
            }
            groupedNeeds[key].totalQty += b.quantity;
            if (b.order_id) {
                const order = orders.find(o => o.id === b.order_id);
                groupedNeeds[key].requirements.push({
                    orderId: b.order_id,
                    customer: order?.customer_name || 'Άγνωστος',
                    quantity: b.quantity,
                });
            } else {
                groupedNeeds[key].requirements.push({
                    orderId: '',
                    customer: 'Χωρίς σύνδεση παραγγελίας',
                    quantity: b.quantity,
                });
            }
        });

        return Object.values(groupedNeeds).filter(n => filterProductionNeedBySupplier(n.product, supplier.id));
    }, [productionBatches, products, supplier.id, orders]);

    const pendingOrderNeeds = useMemo((): SupplierOrderGroupedNeed[] => {
        if (!orders || !products) return [];

        const groupedOrderNeeds: Record<string, SupplierOrderGroupedNeed> = {};
        const pendingOrders = orders.filter(o => o.status === 'Pending');

        pendingOrders.forEach(order => {
            order.items.forEach(item => {
                const product = products.find(p => p.sku === item.sku);
                if (!filterPendingNeedBySupplier(product, supplier.id)) return;

                const key = `${item.sku}-${item.variant_suffix || ''}-${item.size_info || ''}`;
                if (!groupedOrderNeeds[key]) {
                    groupedOrderNeeds[key] = {
                        sku: item.sku,
                        variant: item.variant_suffix || '',
                        size: item.size_info || undefined,
                        totalQty: 0,
                        product,
                        requirements: [],
                    };
                }
                groupedOrderNeeds[key].totalQty += item.quantity;
                groupedOrderNeeds[key].requirements.push({
                    orderId: order.id,
                    customer: order.customer_name,
                    quantity: item.quantity,
                });
            });
        });

        return Object.values(groupedOrderNeeds);
    }, [orders, products, supplier.id]);

    return { productionNeeds, pendingOrderNeeds };
}
