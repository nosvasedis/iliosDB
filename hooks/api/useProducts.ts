import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
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
            queryClient.invalidateQueries({ queryKey: ['products'] });
        }
    });
};

export const useRenameProduct = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ oldSku, newSku }: { oldSku: string, newSku: string }) => api.renameProduct(oldSku, newSku),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['production_batches'] });
        }
    });
};

export const useDeleteProduct = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ sku, imageUrl }: { sku: string, imageUrl?: string | null }) =>
            import('../../lib/supabase').then(m => m.deleteProduct(sku, imageUrl)),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
        }
    });
};
