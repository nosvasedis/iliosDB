import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { UserProfile } from '../../types';
import { inspectionQueryKey } from '../../features/inspection/queryScope';

export const sellerKeys = {
  all: ['sellers'] as const,
};

export const useSellers = () => {
  return useQuery<UserProfile[]>({
    queryKey: inspectionQueryKey(sellerKeys.all),
    queryFn: api.getSellers,
  });
};
