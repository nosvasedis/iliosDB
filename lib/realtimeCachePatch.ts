import type { QueryClient } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { orderKeys } from '../features/orders/keys';
import { productionKeys } from '../features/production/keys';
import type { BatchStageHistoryEntry, Order, Product, ProductionBatch } from '../types';
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
