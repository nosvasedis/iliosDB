import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Collection } from '../../types';

export const useCollections = () => {
    return useQuery<Collection[]>({
        queryKey: ['collections'],
        queryFn: api.getCollections
    });
};
