import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateProductsAndCatalog } from '../../lib/queryInvalidation';
import { Product } from '../../types';
import { productKeys, productsRepository } from '../../features/products';
import { refreshErpProducts, removeProductsFromCache } from '../../features/erpCatalog';

type ProductsQueryOptions = {
    enabled?: boolean;
    staleTime?: number;
    refetchOnMount?: boolean | 'always';
};

export const useProducts = (options: ProductsQueryOptions = {}) => {
    return useQuery<Product[]>({
        queryKey: productKeys.all,
        queryFn: productsRepository.getProducts,
        enabled: options.enabled ?? true,
        // Inherit global staleTime (30m) unless overridden — avoids full-catalog remount storms.
        ...(options.staleTime !== undefined ? { staleTime: options.staleTime } : {}),
        // Default: refetch only when stale (not 'always'). Callers may still pass 'always'.
        refetchOnMount: options.refetchOnMount ?? true,
    });
};

export const useSaveProduct = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: productsRepository.saveProduct,
        onSuccess: async (_data, product) => {
            const sku = typeof product?.sku === 'string' ? product.sku : null;
            try {
                if (sku) {
                    await refreshErpProducts(queryClient, [sku]);
                    return;
                }
            } catch (error) {
                console.warn('SKU catalogue refresh after save failed:', error);
            }
            await invalidateProductsAndCatalog(queryClient);
        }
    });
};

export const useRenameProduct = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ oldSku, newSku }: { oldSku: string, newSku: string }) => productsRepository.renameProduct(oldSku, newSku),
        onSuccess: async (_data, { oldSku, newSku }) => {
            try {
                removeProductsFromCache(queryClient, [oldSku]);
                await refreshErpProducts(queryClient, [newSku]);
            } catch (error) {
                console.warn('SKU catalogue refresh after rename failed:', error);
                await invalidateProductsAndCatalog(queryClient);
            }
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['production_batches'] });
        }
    });
};

export const useDeleteProduct = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ sku, imageUrl }: { sku: string, imageUrl?: string | null }) =>
            productsRepository.deleteProduct(sku, imageUrl),
        onSuccess: async (_data, { sku }) => {
            removeProductsFromCache(queryClient, [sku]);
        }
    });
};
