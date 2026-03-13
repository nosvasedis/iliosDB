import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, deleteProduct } from '../../lib/supabase';
import { invalidateProductsAndCatalog } from '../../lib/queryInvalidation';
import { Product } from '../../types';

export const useProducts = () => {
    return useQuery<Product[]>({
        queryKey: ['products'],
        queryFn: api.getProducts
    });
};

export const useSaveProduct = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: api.saveProduct,
        onSuccess: () => {
            invalidateProductsAndCatalog(queryClient);
        }
    });
};

export const useRenameProduct = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ oldSku, newSku }: { oldSku: string, newSku: string }) => api.renameProduct(oldSku, newSku),
        onSuccess: () => {
            invalidateProductsAndCatalog(queryClient);
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['production_batches'] });
        }
    });
};

export const useDeleteProduct = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ sku, imageUrl }: { sku: string, imageUrl?: string | null }) =>
            deleteProduct(sku, imageUrl),
        onSuccess: () => {
            invalidateProductsAndCatalog(queryClient);
        }
    });
};
