import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Material } from '../../types';

type MaterialsQueryOptions = {
    enabled?: boolean;
};

export const useMaterials = (options: MaterialsQueryOptions = {}) => {
    return useQuery<Material[]>({
        queryKey: ['materials'],
        queryFn: api.getMaterials,
        enabled: options.enabled ?? true,
    });
};

export const useSaveMaterial = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: api.saveMaterial,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['materials'] });
        }
    });
};
