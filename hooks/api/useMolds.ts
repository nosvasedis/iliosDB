import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Mold } from '../../types';

export const useMolds = () => {
    return useQuery<Mold[]>({
        queryKey: ['molds'],
        queryFn: api.getMolds
    });
};
