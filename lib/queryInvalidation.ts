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
    | 'offers'
    | 'legal';

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
    materials: ['resources'],
    molds: ['resources'],
    warehouses: ['resources'],
    global_settings: ['settings'],
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
    legal_settings: ['legal'],
    legal_numbering_sequences: ['legal'],
    legal_carriers: ['legal'],
    legal_documents: ['legal'],
    legal_document_lines: ['legal'],
    legal_transmissions: ['legal'],
    legal_delivery_events: ['legal'],
    legal_sync_runs: ['legal'],
    proforma_documents: ['legal'],
    proforma_document_lines: ['legal'],
    price_snapshots: ['pricing'],
    price_snapshot_items: ['pricing'],
};

export function getRealtimeInvalidationDomainsForTable(tableName: string): RealtimeInvalidationDomain[] {
    return [...(REALTIME_TABLE_DOMAINS[tableName] || [])];
}

export function getRealtimeDomainsForTables(tableNames: readonly string[]): RealtimeInvalidationDomain[] {
    const domains = new Set<RealtimeInvalidationDomain>();
    tableNames.forEach((tableName) => {
        getRealtimeInvalidationDomainsForTable(tableName).forEach((domain) => domains.add(domain));
    });
    return [...domains];
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
        queryClient.invalidateQueries({ queryKey: orderKeys.list() }),
        queryClient.invalidateQueries({ queryKey: orderKeys.productionBoard() }),
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

export function invalidateLegal(queryClient: QueryClient): Promise<void> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['legal_settings'] }),
        queryClient.invalidateQueries({ queryKey: ['legal_numbering_sequences'] }),
        queryClient.invalidateQueries({ queryKey: ['legal_carriers'] }),
        queryClient.invalidateQueries({ queryKey: ['legal_documents'] }),
        queryClient.invalidateQueries({ queryKey: ['legal_document_lines'] }),
        queryClient.invalidateQueries({ queryKey: ['legal_transmissions'] }),
        queryClient.invalidateQueries({ queryKey: ['legal_delivery_events'] }),
        queryClient.invalidateQueries({ queryKey: ['legal_sync_runs'] }),
        queryClient.invalidateQueries({ queryKey: ['proforma_documents'] }),
        queryClient.invalidateQueries({ queryKey: ['proforma_document_lines'] }),
        queryClient.invalidateQueries({ queryKey: ['legal_aade_credentials'] }),
    ]).then(() => undefined);
}

/** Refetch the production batch list only (no stage-history table). */
export function invalidateProductionBatchList(queryClient: QueryClient): Promise<void> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: productionKeys.batches() }),
        queryClient.invalidateQueries({ queryKey: productionKeys.boardBatches() }),
    ]).then(() => undefined);
}

/** Refetch batch stage history only. */
export function invalidateBatchStageHistory(queryClient: QueryClient): Promise<void> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: productionKeys.batchHistoryEntries() }),
        queryClient.invalidateQueries({ queryKey: productionKeys.boardBatchHistoryEntries() }),
    ]).then(() => undefined);
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
        invalidateOrders(queryClient),
        invalidateProductionBatches(queryClient),
    ]).then(() => undefined);
}

/**
 * Order edits can reconcile production_batches as a side effect. Refresh the
 * active order and production surfaces immediately so Παραγωγή search/readiness
 * does not wait for realtime or a page reload.
 */
export async function invalidateAndRefetchAfterOrderMutation(queryClient: QueryClient): Promise<void> {
    await invalidateOrdersAndBatches(queryClient);
    await Promise.all([
        queryClient.refetchQueries({ queryKey: orderKeys.all, type: 'active' }),
        queryClient.refetchQueries({ queryKey: orderKeys.list(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: orderKeys.productionBoard(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: productionKeys.batches(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: productionKeys.boardBatches(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: productionKeys.batchHistoryEntries(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: productionKeys.boardBatchHistoryEntries(), type: 'active' }),
    ]);
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
        queryClient.refetchQueries({ queryKey: orderKeys.list(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: orderKeys.productionBoard(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: productionKeys.batches(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: productionKeys.boardBatches(), type: 'active' }),
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

/**
 * Realtime does not replay database changes missed while the browser was asleep,
 * disconnected, or restoring persisted cache. On channel readiness, refetch only
 * active high-signal queries so visible order/production/catalog surfaces catch up
 * without polling or waking every cached query.
 */
export function refetchRealtimeActiveQueries(queryClient: QueryClient): Promise<void> {
    return refetchRealtimeDomains(queryClient, [
        'products',
        'collections',
        'orders',
        'production',
        'deliveries',
        'resources',
    ]);
}

function refetchActiveRealtimeDomain(
    queryClient: QueryClient,
    domain: RealtimeInvalidationDomain,
): Promise<void> {
    switch (domain) {
        case 'products':
            return Promise.all([
                queryClient.refetchQueries({ queryKey: ['products'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['productsCatalog'], type: 'active' }),
            ]).then(() => undefined);
        case 'collections':
            return queryClient.refetchQueries({ queryKey: ['collections'], type: 'active' }).then(() => undefined);
        case 'orders':
            return Promise.all([
                queryClient.refetchQueries({ queryKey: orderKeys.all, type: 'active' }),
                queryClient.refetchQueries({ queryKey: orderKeys.list(), type: 'active' }),
                queryClient.refetchQueries({ queryKey: orderKeys.productionBoard(), type: 'active' }),
                queryClient.refetchQueries({ queryKey: orderKeys.shipments(), type: 'active' }),
                queryClient.refetchQueries({ queryKey: orderKeys.shipmentItems(), type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['order-shipments'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['tag_color_overrides'], type: 'active' }),
            ]).then(() => undefined);
        case 'production':
            return Promise.all([
                queryClient.refetchQueries({ queryKey: productionKeys.batches(), type: 'active' }),
                queryClient.refetchQueries({ queryKey: productionKeys.boardBatches(), type: 'active' }),
                queryClient.refetchQueries({ queryKey: productionKeys.batchHistoryEntries(), type: 'active' }),
                queryClient.refetchQueries({ queryKey: productionKeys.boardBatchHistoryEntries(), type: 'active' }),
            ]).then(() => undefined);
        case 'deliveries':
            return Promise.all([
                queryClient.refetchQueries({ queryKey: deliveryKeys.plans(), type: 'active' }),
                queryClient.refetchQueries({ queryKey: deliveryKeys.reminders(), type: 'active' }),
                queryClient.refetchQueries({ queryKey: deliveryKeys.shipments(), type: 'active' }),
                queryClient.refetchQueries({ queryKey: deliveryKeys.shipmentItems(), type: 'active' }),
            ]).then(() => undefined);
        case 'resources':
            return Promise.all([
                queryClient.refetchQueries({ queryKey: ['materials'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['molds'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['warehouses'], type: 'active' }),
            ]).then(() => undefined);
        case 'contacts':
            return Promise.all([
                queryClient.refetchQueries({ queryKey: orderKeys.customers(), type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['suppliers'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['sellers'], type: 'active' }),
            ]).then(() => undefined);
        case 'settings':
            return queryClient.refetchQueries({ queryKey: ['settings'], type: 'active' }).then(() => undefined);
        case 'pricing':
            return queryClient.refetchQueries({ queryKey: ['price_snapshots'], type: 'active' }).then(() => undefined);
        case 'supplierOrders':
            return queryClient.refetchQueries({ queryKey: ['supplier_orders'], type: 'active' }).then(() => undefined);
        case 'offers':
            return queryClient.refetchQueries({ queryKey: ['offers'], type: 'active' }).then(() => undefined);
        case 'legal':
            return Promise.all([
                queryClient.refetchQueries({ queryKey: ['legal_settings'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['legal_numbering_sequences'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['legal_carriers'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['legal_documents'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['legal_document_lines'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['legal_transmissions'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['legal_delivery_events'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['legal_sync_runs'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['proforma_documents'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['proforma_document_lines'], type: 'active' }),
                queryClient.refetchQueries({ queryKey: ['legal_aade_credentials'], type: 'active' }),
            ]).then(() => undefined);
        default:
            return Promise.resolve();
    }
}

export function refetchRealtimeDomains(
    queryClient: QueryClient,
    domains: readonly RealtimeInvalidationDomain[],
): Promise<void> {
    const uniqueDomains = [...new Set(domains)];
    return Promise.all(uniqueDomains.map((domain) => refetchActiveRealtimeDomain(queryClient, domain))).then(() => undefined);
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
        case 'legal':
            return invalidateLegal(queryClient);
        default:
            return Promise.resolve();
    }
}
