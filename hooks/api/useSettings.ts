import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { GlobalSettings } from '../../types';

export const useSettings = () => {
    return useQuery<GlobalSettings>({
        queryKey: ['settings'],
        queryFn: api.getSettings
    });
};
