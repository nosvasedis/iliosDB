import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Collection } from '../../types';

type CollectionsQueryOptions = {
    enabled?: boolean;
};

export const useCollections = (options: CollectionsQueryOptions = {}) => {
    return useQuery<Collection[]>({
        queryKey: ['collections'],
        queryFn: api.getCollections,
        enabled: options.enabled ?? true,
    });
};
