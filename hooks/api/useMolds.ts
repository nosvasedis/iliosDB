import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Mold } from '../../types';

type MoldsQueryOptions = {
    enabled?: boolean;
};

export const useMolds = (options: MoldsQueryOptions = {}) => {
    return useQuery<Mold[]>({
        queryKey: ['molds'],
        queryFn: api.getMolds,
        enabled: options.enabled ?? true,
    });
};
