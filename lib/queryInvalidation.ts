import type { QueryClient } from '@tanstack/react-query';

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
