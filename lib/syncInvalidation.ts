import type { QueryClient } from '@tanstack/react-query';
import {
    getRealtimeInvalidationDomainsForTable,
    invalidateRealtimeDomain,
    type RealtimeInvalidationDomain,
} from './queryInvalidation';

const TABLE_DOMAIN_MAP: Record<string, RealtimeInvalidationDomain[]> = {
    products: ['products', 'inventory'],
    product_variants: ['products', 'inventory'],
    product_stock: ['products'],
    recipes: ['products'],
    product_molds: ['products'],
    product_collections: ['products', 'collections'],
    stock_movements: ['products'],
    inventory_balances: ['inventory', 'products'],
    inventory_reservations: ['inventory', 'orders'],
    inventory_events: ['inventory'],
    inventory_reorder_policies: ['inventory'],
    inventory_reconciliation_issues: ['inventory'],
    collections: ['collections', 'products'],
    materials: ['resources'],
    molds: ['resources'],
    warehouses: ['resources', 'inventory'],
    global_settings: ['settings'],
    orders: ['orders', 'deliveries', 'inventory'],
    order_shipments: ['orders', 'deliveries', 'inventory'],
    order_shipment_items: ['orders', 'deliveries', 'inventory'],
    order_delivery_plans: ['deliveries', 'orders'],
    order_delivery_reminders: ['deliveries', 'orders'],
    production_batches: ['production', 'orders', 'deliveries'],
    batch_stage_history: ['production'],
    tag_color_overrides: ['orders'],
    customers: ['contacts', 'orders', 'deliveries'],
    suppliers: ['contacts', 'products'],
    profiles: ['contacts'],
    supplier_orders: ['supplierOrders', 'inventory'],
    offers: ['offers'],
    legal_settings: ['legal'],
    legal_numbering_sequences: ['legal'],
    legal_carriers: ['legal'],
    legal_documents: ['legal', 'orders', 'deliveries'],
    legal_document_lines: ['legal'],
    legal_transmissions: ['legal'],
    legal_delivery_events: ['legal', 'deliveries'],
    legal_sync_runs: ['legal'],
    proforma_documents: ['legal', 'orders'],
    proforma_document_lines: ['legal'],
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
