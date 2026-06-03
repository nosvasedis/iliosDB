import type { QueryClient } from '@tanstack/react-query';
import {
    getRealtimeInvalidationDomainsForTable,
    invalidateRealtimeDomain,
    type RealtimeInvalidationDomain,
} from './queryInvalidation';

const TABLE_DOMAIN_MAP: Record<string, RealtimeInvalidationDomain[]> = {
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
    price_snapshots: ['pricing'],
    price_snapshot_items: ['pricing'],
};

export async function invalidateAfterOfflineSync(
    queryClient: QueryClient,
    syncedTables: string[] | undefined,
): Promise<void> {
    if (!syncedTables?.length) {
        await queryClient.invalidateQueries();
        return;
    }

    const domains = new Set<RealtimeInvalidationDomain>();
    syncedTables.forEach((table) => {
        (TABLE_DOMAIN_MAP[table] ?? getRealtimeInvalidationDomainsForTable(table)).forEach((domain) => domains.add(domain));
    });

    await Promise.all([...domains].map((domain) => invalidateRealtimeDomain(queryClient, domain, syncedTables)));
}
