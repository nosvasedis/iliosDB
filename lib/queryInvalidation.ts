import type { QueryClient } from '@tanstack/react-query';
import { deliveryKeys } from '../features/deliveries/keys';
import { orderKeys } from '../features/orders/keys';
import { productionKeys } from '../features/production/keys';

export type RealtimeInvalidationDomain =
    | 'products'
    | 'collections'
    | 'orders'
    | 'production'
    | 'deliveries'
    | 'resources'
    | 'contacts'
    | 'settings'
    | 'pricing'
    | 'supplierOrders'
    | 'offers';

const PRODUCT_GRAPH_TABLES = new Set([
    'products',
    'product_variants',
    'product_stock',
    'recipes',
    'product_molds',
    'product_collections',
    'stock_movements',
]);

const REALTIME_TABLE_DOMAINS: Record<string, RealtimeInvalidationDomain[]> = {
    products: ['products'],
    product_variants: ['products'],
    product_stock: ['products'],
    recipes: ['products'],
    product_molds: ['products'],
    product_collections: ['products', 'collections'],
    stock_movements: ['products'],
    collections: ['collections', 'products'],
    materials: ['resources', 'products'],
    molds: ['resources', 'products'],
    warehouses: ['resources', 'products'],
    global_settings: ['settings', 'products'],
    orders: ['orders', 'deliveries'],
    order_shipments: ['orders', 'deliveries'],
    order_shipment_items: ['orders', 'deliveries'],
    order_delivery_plans: ['deliveries', 'orders'],
    order_delivery_reminders: ['deliveries', 'orders'],
    production_batches: ['production', 'orders', 'deliveries'],
    batch_stage_history: ['production'],
    tag_color_overrides: ['orders'],
    customers: ['contacts', 'orders', 'deliveries'],
    suppliers: ['contacts', 'products'],
    profiles: ['contacts'],
    supplier_orders: ['supplierOrders'],
    offers: ['offers'],
    price_snapshots: ['pricing'],
    price_snapshot_items: ['pricing'],
};

export function getRealtimeInvalidationDomainsForTable(tableName: string): RealtimeInvalidationDomain[] {
    return [...(REALTIME_TABLE_DOMAINS[tableName] || [])];
}

export function isProductGraphRealtimeTable(tableName: string): boolean {
    return PRODUCT_GRAPH_TABLES.has(tableName);
}

/**
 * Invalidates both products and productsCatalog caches so that the main
 * products list and the seller Catalog (Κατάλογος) stay in sync when
 * SKUs/products change.
 */
export function invalidateProductsAndCatalog(queryClient: QueryClient): Promise<void> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['productsCatalog'] }),
    ]).then(() => undefined);
}

export function invalidateCollections(queryClient: QueryClient): Promise<void> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['collections'] }),
    ]).then(() => undefined);
}

export function invalidateOrders(queryClient: QueryClient): Promise<void> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKeys.all }),
        queryClient.invalidateQueries({ queryKey: orderKeys.shipments() }),
        queryClient.invalidateQueries({ queryKey: orderKeys.shipmentItems() }),
        queryClient.invalidateQueries({ queryKey: ['order-shipments'] }),
        queryClient.invalidateQueries({ queryKey: ['tag_color_overrides'] }),
    ]).then(() => undefined);
}

export function invalidateDeliveries(queryClient: QueryClient): Promise<void> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: deliveryKeys.plans() }),
        queryClient.invalidateQueries({ queryKey: deliveryKeys.reminders() }),
        queryClient.invalidateQueries({ queryKey: deliveryKeys.shipments() }),
        queryClient.invalidateQueries({ queryKey: deliveryKeys.shipmentItems() }),
        queryClient.invalidateQueries({ queryKey: orderKeys.deliveryPlans() }),
        queryClient.invalidateQueries({ queryKey: orderKeys.deliveryReminders() }),
    ]).then(() => undefined);
}

export function invalidateResources(queryClient: QueryClient): Promise<void> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['materials'] }),
        queryClient.invalidateQueries({ queryKey: ['molds'] }),
        queryClient.invalidateQueries({ queryKey: ['warehouses'] }),
    ]).then(() => undefined);
}

export function invalidateContacts(queryClient: QueryClient): Promise<void> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKeys.customers() }),
        queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
        queryClient.invalidateQueries({ queryKey: ['sellers'] }),
    ]).then(() => undefined);
}

export function invalidateSettings(queryClient: QueryClient): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: ['settings'] }).then(() => undefined);
}

export function invalidatePricing(queryClient: QueryClient): Promise<void> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['price_snapshots'] }),
    ]).then(() => undefined);
}

export function invalidateSupplierOrders(queryClient: QueryClient): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: ['supplier_orders'] }).then(() => undefined);
}

export function invalidateOffers(queryClient: QueryClient): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: ['offers'] }).then(() => undefined);
}

/** Refetch the production batch list only (no stage-history table). */
export function invalidateProductionBatchList(queryClient: QueryClient): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: productionKeys.batches() }).then(() => undefined);
}

/** Refetch batch stage history only. */
export function invalidateBatchStageHistory(queryClient: QueryClient): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: productionKeys.batchHistoryEntries() }).then(() => undefined);
}

/** Full production invalidation for mutations that may affect batches and history together. */
export function invalidateProductionBatches(queryClient: QueryClient): Promise<void> {
    return Promise.all([
        invalidateProductionBatchList(queryClient),
        queryClient.invalidateQueries({ queryKey: productionKeys.all }),
        invalidateBatchStageHistory(queryClient),
    ]).then(() => undefined);
}

function invalidateProductionFromRealtime(
    queryClient: QueryClient,
    sourceTables?: string[],
): Promise<void> {
    const tables = new Set(sourceTables ?? []);
    const refreshAll = tables.size === 0;
    const refreshBatches =
        refreshAll || tables.has('production_batches') || tables.has('batch_stage_history');
    const refreshHistory = refreshAll || tables.has('batch_stage_history');

    const tasks: Promise<unknown>[] = [];
    if (refreshBatches) {
        tasks.push(invalidateProductionBatchList(queryClient));
    }
    if (refreshHistory) {
        tasks.push(invalidateBatchStageHistory(queryClient));
    }
    return Promise.all(tasks).then(() => undefined);
}

export function invalidateOrdersAndBatches(queryClient: QueryClient): Promise<void> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKeys.all }),
        invalidateProductionBatches(queryClient),
    ]).then(() => undefined);
}

export function invalidateShipmentUndoQueries(queryClient: QueryClient, orderId?: string): Promise<void> {
    return Promise.all([
        invalidateOrdersAndBatches(queryClient),
        queryClient.invalidateQueries({ queryKey: orderKeys.shipments() }),
        orderId ? queryClient.invalidateQueries({ queryKey: orderKeys.shipmentsForOrder(orderId) }) : Promise.resolve(),
        queryClient.invalidateQueries({ queryKey: orderKeys.shipmentItems() }),
        queryClient.invalidateQueries({ queryKey: ['order-shipments'] }),
        queryClient.invalidateQueries({ queryKey: deliveryKeys.plans() }),
        queryClient.invalidateQueries({ queryKey: deliveryKeys.reminders() }),
        queryClient.invalidateQueries({ queryKey: deliveryKeys.shipments() }),
        queryClient.invalidateQueries({ queryKey: deliveryKeys.shipmentItems() }),
    ]).then(() => undefined);
}

/**
 * After creating or reverting a partial shipment, invalidate every dependent cache
 * and await refetch of active queries so Παραγγελίες updates without a full reload.
 */
export async function invalidateAndRefetchAfterShipmentChange(
    queryClient: QueryClient,
    orderId?: string,
): Promise<void> {
    await invalidateShipmentUndoQueries(queryClient, orderId);
    await Promise.all([
        queryClient.refetchQueries({ queryKey: orderKeys.all, type: 'active' }),
        queryClient.refetchQueries({ queryKey: productionKeys.batches(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: orderKeys.shipments(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: orderKeys.shipmentItems(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: deliveryKeys.shipments(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: deliveryKeys.shipmentItems(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: deliveryKeys.plans(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: deliveryKeys.reminders(), type: 'active' }),
        ...(orderId
            ? [queryClient.refetchQueries({ queryKey: orderKeys.shipmentsForOrder(orderId), type: 'active' })]
            : []),
    ]);
}

export function invalidateRealtimeDomain(
    queryClient: QueryClient,
    domain: RealtimeInvalidationDomain,
    sourceTables?: string[],
): Promise<void> {
    switch (domain) {
        case 'products':
            return invalidateProductsAndCatalog(queryClient);
        case 'collections':
            return invalidateCollections(queryClient);
        case 'orders':
            return invalidateOrders(queryClient);
        case 'production':
            return invalidateProductionFromRealtime(queryClient, sourceTables);
        case 'deliveries':
            return invalidateDeliveries(queryClient);
        case 'resources':
            return invalidateResources(queryClient);
        case 'contacts':
            return invalidateContacts(queryClient);
        case 'settings':
            return invalidateSettings(queryClient);
        case 'pricing':
            return invalidatePricing(queryClient);
        case 'supplierOrders':
            return invalidateSupplierOrders(queryClient);
        case 'offers':
            return invalidateOffers(queryClient);
        default:
            return Promise.resolve();
    }
}
