import type { QueryClient } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { orderKeys } from '../features/orders/keys';
import { productionKeys } from '../features/production/keys';
import { normalizeInventorySizeInfo } from '../features/inventory/posting';
import { applyInventoryAvailabilityToProducts } from '../features/inventory/productProjection';
import { mergeInventoryCountTargetedAvailability } from '../features/inventory/countSession';
import type { InventoryAvailability, InventoryEvent } from '../features/inventory/types';
import type { BatchStageHistoryEntry, Order, Product, ProductionBatch, Warehouse } from '../types';
import { isProductGraphRealtimeTable } from './queryInvalidation';

type RealtimeRowPayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

function upsertById<T extends { id: string }>(rows: T[] | undefined, row: T, eventType: string): T[] {
    const list = [...(rows ?? [])];
    const index = list.findIndex((entry) => entry.id === row.id);
    if (eventType === 'DELETE') {
        if (index >= 0) list.splice(index, 1);
        return list;
    }
    if (index >= 0) list[index] = row;
    else list.push(row);
    return list;
}

function patchProductArrayFromStockRow(
    products: Product[] | undefined,
    stockRow: {
        product_sku?: string;
        variant_suffix?: string | null;
        warehouse_id?: string;
        quantity?: number;
    },
): { products: Product[]; touched: boolean } {
    let touched = false;
    const nextProducts = (products ?? []).map((product) => {
        if (product.sku !== stockRow.product_sku) return product;

        if (stockRow.variant_suffix) {
            const variants = product.variants?.map((variant) => {
                if (variant.suffix !== stockRow.variant_suffix) return variant;
                touched = true;
                const locationStock = { ...(variant.location_stock || {}) };
                if (stockRow.warehouse_id) {
                    locationStock[stockRow.warehouse_id] = Number(stockRow.quantity ?? 0);
                }
                return {
                    ...variant,
                    location_stock: locationStock,
                    stock_qty: stockRow.warehouse_id ? variant.stock_qty : Number(stockRow.quantity ?? variant.stock_qty ?? 0),
                };
            });
            return { ...product, variants };
        }

        touched = true;
        const locationStock = { ...(product.location_stock || {}) };
        if (stockRow.warehouse_id) {
            locationStock[stockRow.warehouse_id] = Number(stockRow.quantity ?? 0);
        }
        return {
            ...product,
            location_stock: locationStock,
            stock_qty: stockRow.warehouse_id ? product.stock_qty : Number(stockRow.quantity ?? product.stock_qty ?? 0),
        };
    });

    return { products: nextProducts, touched };
}

function patchProductsFromStockRow(queryClient: QueryClient, payload: RealtimeRowPayload): boolean {
    if (payload.eventType === 'DELETE' || !payload.new) return false;
    const stockRow = payload.new as {
        product_sku?: string;
        variant_suffix?: string | null;
        warehouse_id?: string;
        quantity?: number;
    };
    if (!stockRow.product_sku) return false;

    let patched = false;

    const products = queryClient.getQueryData<Product[]>(['products']);
    if (products?.length) {
        const result = patchProductArrayFromStockRow(products, stockRow);
        if (result.touched) {
            queryClient.setQueryData(['products'], result.products);
            patched = true;
        }
    }

    const catalog = queryClient.getQueryData<{
        pages?: Array<{ products?: Product[]; hasMore?: boolean }>;
        pageParams?: unknown[];
    }>(['productsCatalog']);
    if (catalog?.pages?.length) {
        let touchedCatalog = false;
        const pages = catalog.pages.map((page) => {
            const result = patchProductArrayFromStockRow(page.products, stockRow);
            if (!result.touched) return page;
            touchedCatalog = true;
            return { ...page, products: result.products };
        });
        if (touchedCatalog) {
            queryClient.setQueryData(['productsCatalog'], { ...catalog, pages });
            patched = true;
        }
    }

    return patched;
}

function patchListById<T extends { id: string }>(
    queryClient: QueryClient,
    queryKey: readonly unknown[],
    payload: RealtimeRowPayload,
    mapRow?: (row: T) => T,
): boolean {
    const cached = queryClient.getQueryData<T[]>(queryKey);
    if (!cached) return false;
    const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as unknown as T | undefined;
    if (!row?.id) return false;
    queryClient.setQueryData(queryKey, upsertById(cached, mapRow && payload.eventType !== 'DELETE' ? mapRow(row) : row, payload.eventType));
    return true;
}

function toOrderListRow(row: Order): Order {
    const items = Array.isArray(row.items) ? row.items : [];
    return {
        ...row,
        items: [],
        item_count: Number(row.item_count ?? items.length ?? 0),
        item_total_qty: Number(row.item_total_qty ?? items.reduce((sum, item) => sum + (item.quantity || 0), 0)),
    };
}

function projectCanonicalAvailabilityIntoProductCaches(queryClient: QueryClient): boolean {
    const availability = queryClient.getQueryData<InventoryAvailability[]>(['inventory', 'availability']);
    if (!availability) return false;
    let patched = false;

    queryClient.setQueryData<Product[]>(['products'], (products) => {
        if (!products) return products;
        patched = true;
        return applyInventoryAvailabilityToProducts(products, availability);
    });

    queryClient.setQueryData<{
        pages?: Array<{ products?: Product[]; hasMore?: boolean }>;
        pageParams?: unknown[];
    }>(['productsCatalog'], (catalog) => {
        if (!catalog?.pages) return catalog;
        patched = true;
        return {
            ...catalog,
            pages: catalog.pages.map((page) => ({
                ...page,
                products: page.products
                    ? applyInventoryAvailabilityToProducts(page.products, availability)
                    : page.products,
            })),
        };
    });
    return patched;
}

function patchInventoryAvailabilityFromBalance(
    queryClient: QueryClient,
    payload: RealtimeRowPayload,
): boolean {
    const cached = queryClient.getQueryData<InventoryAvailability[]>(['inventory', 'availability']);
    if (!cached) return false;

    const rawRow = (payload.eventType === 'DELETE' ? payload.old : payload.new) as {
        product_sku?: string;
        variant_suffix?: string | null;
        size_info?: string | null;
        warehouse_id?: string;
        on_hand?: number | string;
        reserved?: number | string;
        updated_at?: string;
    } | undefined;
    if (!rawRow?.product_sku || !rawRow.warehouse_id) return false;

    const variantSuffix = rawRow.variant_suffix || '';
    const sizeInfo = normalizeInventorySizeInfo(rawRow.size_info || '');
    const matchesIdentity = (row: InventoryAvailability) => (
        row.productSku === rawRow.product_sku
        && row.variantSuffix === variantSuffix
        && row.sizeInfo === sizeInfo
        && row.warehouseId === rawRow.warehouse_id
    );
    const index = cached.findIndex(matchesIdentity);

    if (payload.eventType === 'DELETE') {
        if (index < 0) return false;
        queryClient.setQueryData(
            ['inventory', 'availability'],
            cached.filter((_, rowIndex) => rowIndex !== index),
        );
        return true;
    }

    const onHand = Number(rawRow.on_hand || 0);
    const reserved = Number(rawRow.reserved || 0);
    if (index < 0) {
        const warehouses = queryClient.getQueryData<Warehouse[]>(['warehouses']) || [];
        const merged = mergeInventoryCountTargetedAvailability(
            cached,
            [{
                productSku: rawRow.product_sku,
                variantSuffix,
                sizeInfo,
                warehouseId: rawRow.warehouse_id,
                onHand,
                reserved,
                available: onHand - reserved,
            }],
            warehouses.map((warehouse) => ({
                warehouseId: warehouse.id,
                warehouseName: warehouse.name,
                warehouseType: warehouse.type,
            })),
            rawRow.updated_at,
        );
        queryClient.setQueryData(['inventory', 'availability'], merged.rows);
        return true;
    }

    const current = cached[index];
    const next = [...cached];
    next[index] = {
        ...current,
        onHand,
        reserved,
        available: onHand - reserved,
        projectedAvailable: onHand - reserved + current.incoming - current.outstandingDemand,
        updatedAt: rawRow.updated_at || current.updatedAt,
    };
    queryClient.setQueryData(['inventory', 'availability'], next);
    return true;
}

function mapRealtimeInventoryEvent(rawRow: Record<string, unknown>): InventoryEvent | null {
    if (!rawRow.id || !rawRow.product_sku || !rawRow.warehouse_id) return null;
    return {
        id: String(rawRow.id),
        sequenceNo: Number(rawRow.sequence_no || 0),
        operationType: String(rawRow.operation_type || 'adjustment') as InventoryEvent['operationType'],
        productSku: String(rawRow.product_sku),
        variantSuffix: String(rawRow.variant_suffix || ''),
        sizeInfo: normalizeInventorySizeInfo(String(rawRow.size_info || '')),
        warehouseId: String(rawRow.warehouse_id),
        onHandDelta: Number(rawRow.on_hand_delta || 0),
        reservedDelta: Number(rawRow.reserved_delta || 0),
        onHandAfter: Number(rawRow.on_hand_after || 0),
        reservedAfter: Number(rawRow.reserved_after || 0),
        referenceType: rawRow.reference_type ? String(rawRow.reference_type) : null,
        referenceId: rawRow.reference_id ? String(rawRow.reference_id) : null,
        referenceLineId: rawRow.reference_line_id ? String(rawRow.reference_line_id) : null,
        transferGroupId: rawRow.transfer_group_id ? String(rawRow.transfer_group_id) : null,
        reversalOf: rawRow.reversal_of ? String(rawRow.reversal_of) : null,
        actorUserId: rawRow.actor_user_id ? String(rawRow.actor_user_id) : null,
        actorName: rawRow.actor_name ? String(rawRow.actor_name) : null,
        reason: String(rawRow.reason || ''),
        createdAt: String(rawRow.created_at || new Date().toISOString()),
    };
}

function patchInventoryEventCache(queryClient: QueryClient, payload: RealtimeRowPayload): boolean {
    const cached = queryClient.getQueryData<InventoryEvent[]>(['inventory', 'events']);
    if (!cached) return false;
    const rawRow = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown> | undefined;
    if (!rawRow?.id) return false;

    if (payload.eventType === 'DELETE') {
        queryClient.setQueryData(
            ['inventory', 'events'],
            cached.filter((event) => event.id !== String(rawRow.id)),
        );
        return true;
    }

    const event = mapRealtimeInventoryEvent(rawRow);
    if (!event) return false;
    const withoutCurrent = cached.filter((current) => current.id !== event.id);
    queryClient.setQueryData(
        ['inventory', 'events'],
        [event, ...withoutCurrent]
            .sort((left, right) => right.sequenceNo - left.sequenceNo)
            .slice(0, 250),
    );
    return true;
}

function mergeRealtimeOrderRow(existing: Order | undefined, row: Order): Order {
    if (!existing) return row;
    const merged = { ...existing, ...row };
    if (!Array.isArray(row.items) && Array.isArray(existing.items)) {
        merged.items = existing.items;
    }
    return merged;
}

function patchOrderArray(
    queryClient: QueryClient,
    queryKey: readonly unknown[],
    payload: RealtimeRowPayload,
    mapRow?: (row: Order) => Order,
): boolean {
    const cached = queryClient.getQueryData<Order[]>(queryKey);
    if (!cached) return false;
    const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as unknown as Order | undefined;
    if (!row?.id) return false;

    if (payload.eventType === 'DELETE') {
        queryClient.setQueryData(queryKey, upsertById(cached, row, payload.eventType));
        return true;
    }

    const list = [...cached];
    const index = list.findIndex((entry) => entry.id === row.id);
    const merged = mergeRealtimeOrderRow(index >= 0 ? list[index] : undefined, row);
    const nextRow = mapRow ? mapRow(merged) : merged;
    if (index >= 0) list[index] = nextRow;
    else list.push(nextRow);
    queryClient.setQueryData(queryKey, list);
    return true;
}

export function tryPatchRealtimeCache(queryClient: QueryClient, payload: RealtimeRowPayload): boolean {
    const table = payload.table;
    if (!table) return false;

    if (table === 'inventory_balances') {
        const availabilityPatched = patchInventoryAvailabilityFromBalance(queryClient, payload);
        if (availabilityPatched) projectCanonicalAvailabilityIntoProductCaches(queryClient);
        return availabilityPatched;
    }

    if (table === 'inventory_events') {
        const rawRow = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown> | undefined;
        const operationType = String(rawRow?.operation_type || '');
        const eventPatched = patchInventoryEventCache(queryClient, payload);
        // Physical counts and manual increases affect only the returned balance
        // and movement history. Both are patched directly, so a full 7,000+ row
        // availability refetch would be wasteful and can briefly reintroduce stale
        // values. Other operation types retain broad invalidation for their
        // reservation, demand, receipt or production projections.
        if (operationType === 'stock_count' || operationType === 'manual_stock_increase') {
            return true;
        }
        return eventPatched && payload.eventType === 'DELETE';
    }

    if (table === 'product_stock') {
        return patchProductsFromStockRow(queryClient, payload);
    }

    if (table === 'production_batches') {
        patchListById<ProductionBatch>(queryClient, productionKeys.batches(), payload);
        patchListById<ProductionBatch>(queryClient, productionKeys.boardBatches(), payload);
        return false;
    }

    if (table === 'batch_stage_history') {
        patchListById<BatchStageHistoryEntry>(queryClient, productionKeys.batchHistoryEntries(), payload);
        patchListById<BatchStageHistoryEntry>(queryClient, productionKeys.boardBatchHistoryEntries(), payload);
        return false;
    }

    if (table === 'orders') {
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as unknown as Order | undefined;
        let patched = false;
        if (row?.id) {
            if (payload.eventType === 'DELETE') {
                queryClient.setQueryData(orderKeys.detail(row.id), null);
            } else {
                const existing = queryClient.getQueryData<Order>(orderKeys.detail(row.id));
                queryClient.setQueryData(orderKeys.detail(row.id), mergeRealtimeOrderRow(existing, row));
            }
            patched = true;
        }
        patched = patchOrderArray(queryClient, orderKeys.all, payload) || patched;
        patched = patchOrderArray(queryClient, orderKeys.list(), payload, toOrderListRow) || patched;
        patched = patchOrderArray(queryClient, orderKeys.productionBoard(), payload) || patched;
        return patched;
    }

    if (isProductGraphRealtimeTable(table)) {
        return false;
    }

    return false;
}
