import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeKeys } from '../../features/finance/keys';
import { financeRepository } from '../../features/finance/repository';
import type { FinanceWorkspace } from '../../features/finance/types';

export function useFinanceWorkspace(enabled = true) {
  return useQuery<FinanceWorkspace>({
    queryKey: financeKeys.workspace(),
    queryFn: financeRepository.getWorkspace,
    enabled,
    staleTime: 60_000,
  });
}

/** Wraps any finance write so every screen sees the change immediately. */
export function useFinanceMutation<TArgs, TResult = unknown>(mutationFn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation<TResult, Error, TArgs>({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: financeKeys.all }),
  });
}
