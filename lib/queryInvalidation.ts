import type { QueryClient } from '@tanstack/react-query';
import { deliveryKeys } from '../features/deliveries/keys';
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

export function invalidateShipmentUndoQueries(queryClient: QueryClient, orderId?: string): Promise<void> {
    return Promise.all([
        invalidateOrdersAndBatches(queryClient),
        queryClient.invalidateQueries({ queryKey: orderKeys.shipments() }),
        orderId ? queryClient.invalidateQueries({ queryKey: orderKeys.shipmentsForOrder(orderId) }) : Promise.resolve(),
        queryClient.invalidateQueries({ queryKey: orderKeys.shipmentItems() }),
        queryClient.invalidateQueries({ queryKey: deliveryKeys.plans() }),
        queryClient.invalidateQueries({ queryKey: deliveryKeys.reminders() }),
        queryClient.invalidateQueries({ queryKey: deliveryKeys.shipments() }),
        queryClient.invalidateQueries({ queryKey: deliveryKeys.shipmentItems() }),
    ]).then(() => undefined);
}
