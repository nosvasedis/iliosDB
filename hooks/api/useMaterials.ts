import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Material } from '../../types';

export const useMaterials = () => {
    return useQuery<Material[]>({
        queryKey: ['materials'],
        queryFn: api.getMaterials
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
