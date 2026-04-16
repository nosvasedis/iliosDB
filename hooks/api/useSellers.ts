import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { UserProfile } from '../../types';

export const sellerKeys = {
  all: ['sellers'] as const,
};

export const useSellers = () => {
  return useQuery<UserProfile[]>({
    queryKey: sellerKeys.all,
    queryFn: api.getSellers,
  });
};
