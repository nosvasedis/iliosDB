import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Warehouse } from '../../types';

export const warehouseKeys = {
    all: ['warehouses'] as const,
};

export const useWarehouses = () => {
    return useQuery<Warehouse[]>({
        queryKey: warehouseKeys.all,
        queryFn: api.getWarehouses,
    });
};
