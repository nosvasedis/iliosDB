import type { QueryClient } from '@tanstack/react-query';
import { orderKeys } from '../features/orders/keys';
import { productionKeys } from '../features/production/keys';

const LEGACY_BATCHES_QUERY_KEY = ['batches'] as const;

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

export function invalidateProductionBatches(queryClient: QueryClient): Promise<void> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: LEGACY_BATCHES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: productionKeys.all }),
        queryClient.invalidateQueries({ queryKey: productionKeys.batchHistoryEntries() }),
    ]).then(() => undefined);
}

export function invalidateOrdersAndBatches(queryClient: QueryClient): Promise<void> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKeys.all }),
        invalidateProductionBatches(queryClient),
    ]).then(() => undefined);
}
