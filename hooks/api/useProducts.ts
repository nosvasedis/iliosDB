import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateProductsAndCatalog } from '../../lib/queryInvalidation';
import { Product } from '../../types';
import { productKeys, productsRepository } from '../../features/products';

export const useProducts = () => {
    return useQuery<Product[]>({
        queryKey: productKeys.all,
        queryFn: productsRepository.getProducts
    });
};

export const useSaveProduct = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: productsRepository.saveProduct,
        onSuccess: () => {
            invalidateProductsAndCatalog(queryClient);
        }
    });
};

export const useRenameProduct = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ oldSku, newSku }: { oldSku: string, newSku: string }) => productsRepository.renameProduct(oldSku, newSku),
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
            productsRepository.deleteProduct(sku, imageUrl),
        onSuccess: () => {
            invalidateProductsAndCatalog(queryClient);
        }
    });
};
