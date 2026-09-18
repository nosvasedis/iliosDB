import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  customerServiceKeys,
  customerServiceRepository,
  type BulkConsignmentGroupInput,
  type RepairIntakeInput,
  type UpdatePendingConsignmentInput,
} from '../../features/customerService';
import { invalidateInventory, invalidateLegal, invalidateProductionBatches } from '../../lib/queryInvalidation';

const FIVE_MINUTES = 5 * 60 * 1000;

export function useCustomerServiceWorkspace() {
  return useQuery({
    queryKey: customerServiceKeys.workspace(),
    queryFn: customerServiceRepository.getWorkspaceData,
    staleTime: FIVE_MINUTES,
  });
}

export function useCustomerServiceActions() {
  const queryClient = useQueryClient();
  const refresh = async (options?: { inventory?: boolean; production?: boolean; legal?: boolean }) => {
    await queryClient.invalidateQueries({ queryKey: customerServiceKeys.all });
    if (options?.inventory) await invalidateInventory(queryClient);
    if (options?.production) await invalidateProductionBatches(queryClient);
    if (options?.legal) await invalidateLegal(queryClient);
  };
  return {
    checkConsignmentInventory: useMutation({
      mutationFn: customerServiceRepository.getConsignmentInventoryReconciliation,
    }),
    createBulkConsignments: useMutation({
      mutationFn: (groups: BulkConsignmentGroupInput[]) => customerServiceRepository.createBulkConsignments(groups),
      onSuccess: () => refresh({ production: true }),
    }),
    handoffConsignment: useMutation({
      mutationFn: customerServiceRepository.handoffConsignment,
      onSuccess: () => refresh({ inventory: true }),
    }),
    overrideConsignmentPrice: useMutation({
      mutationFn: ({ lineId, unitPrice, reason }: { lineId: string; unitPrice: number; reason: string }) =>
        customerServiceRepository.overrideConsignmentPrice(lineId, unitPrice, reason),
      onSuccess: () => refresh(),
    }),
    recordConsignmentSale: useMutation({
      mutationFn: customerServiceRepository.recordConsignmentSale,
      onSuccess: () => refresh({ inventory: true }),
    }),
    recordConsignmentPayment: useMutation({
      mutationFn: customerServiceRepository.recordConsignmentPayment,
      onSuccess: () => refresh(),
    }),
    receiveConsignmentReturn: useMutation({
      mutationFn: customerServiceRepository.receiveConsignmentReturn,
      onSuccess: () => refresh({ inventory: true }),
    }),
    routeConsignmentReturn: useMutation({
      mutationFn: customerServiceRepository.routeConsignmentReturn,
      onSuccess: () => refresh({ inventory: true, production: true }),
    }),
    createConsignmentLegalDraft: useMutation({
      mutationFn: customerServiceRepository.createConsignmentLegalDraft,
      onSuccess: () => refresh({ legal: true }),
    }),
    reverseConsignmentSettlement: useMutation({
      mutationFn: ({ settlementId, reason }: { settlementId: string; reason: string }) => customerServiceRepository.reverseConsignmentSettlement(settlementId, reason),
      onSuccess: () => refresh({ inventory: true }),
    }),
    reverseConsignmentReturn: useMutation({
      mutationFn: ({ returnId, reason }: { returnId: string; reason: string }) => customerServiceRepository.reverseConsignmentReturn(returnId, reason),
      onSuccess: () => refresh({ inventory: true }),
    }),
    updatePendingConsignment: useMutation({
      mutationFn: (input: UpdatePendingConsignmentInput) => customerServiceRepository.updatePendingConsignment(input),
      onSuccess: () => refresh({ production: true }),
    }),
    cancelConsignment: useMutation({
      mutationFn: ({ consignmentId, reason }: { consignmentId: string; reason: string }) => customerServiceRepository.cancelConsignment(consignmentId, reason),
      onSuccess: () => refresh({ production: true }),
    }),
    createRepairIntake: useMutation({
      mutationFn: (input: RepairIntakeInput) => customerServiceRepository.createRepairIntake(input),
      onSuccess: () => refresh({ production: true }),
    }),
    completeRepairQualityCheck: useMutation({
      mutationFn: customerServiceRepository.completeRepairQualityCheck,
      onSuccess: () => refresh({ production: true }),
    }),
    markRepairDelivered: useMutation({
      mutationFn: customerServiceRepository.markRepairDelivered,
      onSuccess: () => refresh(),
    }),
    setRepairExceptionState: useMutation({
      mutationFn: ({ repairItemId, status, reason }: { repairItemId: string; status: 'on_hold' | 'irreparable' | 'cancelled' | 'in_production'; reason: string }) =>
        customerServiceRepository.setRepairExceptionState(repairItemId, status, reason),
      onSuccess: () => refresh({ production: true }),
    }),
    archiveRepairItem: useMutation({
      mutationFn: ({ repairItemId, archive, reason }: { repairItemId: string; archive: boolean; reason?: string }) =>
        customerServiceRepository.archiveRepairItem(repairItemId, archive, reason),
      onSuccess: () => refresh({ production: true }),
    }),
    deleteRepairItem: useMutation({
      mutationFn: ({ repairItemId, reason }: { repairItemId: string; reason: string }) =>
        customerServiceRepository.deleteRepairItem(repairItemId, reason),
      onSuccess: () => refresh({ production: true }),
    }),
    completeRepairProduction: useMutation({
      mutationFn: (repairItemId: string) => customerServiceRepository.completeRepairProduction(repairItemId),
      onSuccess: () => refresh({ production: true }),
    }),
    removeRepairFromProduction: useMutation({
      mutationFn: ({ repairItemId, reason }: { repairItemId: string; reason: string }) =>
        customerServiceRepository.removeRepairFromProduction(repairItemId, reason),
      onSuccess: () => refresh({ production: true }),
    }),
    returnRepairToProduction: useMutation({
      mutationFn: (repairItemId: string) => customerServiceRepository.returnRepairToProduction(repairItemId),
      onSuccess: () => refresh({ production: true }),
    }),
    recordRepairCost: useMutation({
      mutationFn: customerServiceRepository.recordRepairCost,
      onSuccess: () => refresh({ inventory: true }),
    }),
    setRepairCharge: useMutation({
      mutationFn: customerServiceRepository.setRepairCharge,
      onSuccess: () => refresh(),
    }),
    createRepairLegalDraft: useMutation({
      mutationFn: customerServiceRepository.createRepairLegalDraft,
      onSuccess: () => refresh({ legal: true }),
    }),
    uploadRepairAttachment: useMutation({
      mutationFn: ({ repairItemId, file, attachmentType }: { repairItemId: string; file: File; attachmentType?: 'intake' | 'quality' | 'other' }) =>
        customerServiceRepository.uploadRepairAttachment(repairItemId, file, attachmentType),
      onSuccess: () => refresh(),
    }),
  };
}
