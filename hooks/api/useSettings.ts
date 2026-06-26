import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { GlobalSettings } from '../../types';

type SettingsQueryOptions = {
    enabled?: boolean;
};

export const useSettings = (options: SettingsQueryOptions = {}) => {
    return useQuery<GlobalSettings>({
        queryKey: ['settings'],
        queryFn: api.getSettings,
        enabled: options.enabled ?? true,
    });
};
