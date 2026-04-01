import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { Supplier } from '../../types';

export const useSuppliers = () => {
  return useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: api.getSuppliers,
  });
};
