import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AadeCredentialSavePayload, AadeRegistryCredentialSavePayload, LegalCarrier, LegalDocument, LegalDocumentLine, LegalExternalItemAlias, LegalNumberingSequence, LegalOrderLineAllocation, LegalOrderLinkMode, LegalSettings, LegalSyncParams, ProformaDocument, ProformaDocumentLine } from '../../types';
import { legalKeys, legalRepository } from '../../features/legal';

export const useLegalSettings = () =>
  useQuery({
    queryKey: legalKeys.settings(),
    queryFn: legalRepository.getSettings,
  });

export const useAadeCredentialStatus = () =>
  useQuery({
    queryKey: legalKeys.credentials(),
    queryFn: legalRepository.getCredentialStatus,
    retry: false,
  });

export const useLegalNumberingSequences = () =>
  useQuery({
    queryKey: legalKeys.sequences(),
    queryFn: legalRepository.getSequences,
  });

export const useLegalCarriers = () =>
  useQuery({
    queryKey: legalKeys.carriers(),
    queryFn: legalRepository.getCarriers,
  });

export const useLegalDocuments = () =>
  useQuery({
    queryKey: legalKeys.documents(),
    queryFn: legalRepository.getDocuments,
  });

export const useLegalDocumentLines = (documentId: string | null | undefined) =>
  useQuery({
    queryKey: legalKeys.documentLines(documentId || ''),
    queryFn: () => (documentId ? legalRepository.getDocumentLines(documentId) : Promise.resolve([])),
    enabled: !!documentId,
  });

export const useAllLegalDocumentLines = () =>
  useQuery({
    queryKey: legalKeys.archiveLines(),
    queryFn: legalRepository.getAllDocumentLines,
  });

export const useLegalExternalItemAliases = () =>
  useQuery({
    queryKey: legalKeys.itemAliases(),
    queryFn: legalRepository.getItemAliases,
  });

export const useLegalSyncRuns = () =>
  useQuery({
    queryKey: legalKeys.syncRuns(),
    queryFn: legalRepository.getSyncRuns,
  });

export const useProformaDocuments = () =>
  useQuery({
    queryKey: legalKeys.proformas(),
    queryFn: legalRepository.getProformas,
  });

export const useProformaDocumentLines = (proformaId: string | null | undefined) =>
  useQuery({
    queryKey: legalKeys.proformaLines(proformaId || ''),
    queryFn: () => (proformaId ? legalRepository.getProformaLines(proformaId) : Promise.resolve([])),
    enabled: !!proformaId,
  });

export const useAllProformaDocumentLines = () =>
  useQuery({
    queryKey: legalKeys.archiveProformaLines(),
    queryFn: legalRepository.getAllProformaLines,
  });

export const useEnrichLegalArchive = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: legalRepository.enrichArchive,
    onSuccess: (count) => {
      if (!count) return;
      queryClient.invalidateQueries({ queryKey: legalKeys.documents() });
      queryClient.invalidateQueries({ queryKey: legalKeys.archiveLines() });
    },
  });
};

export const useSaveLegalItemAlias = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alias, userName }: { alias: LegalExternalItemAlias; userName?: string | null }) =>
      legalRepository.saveItemAlias(alias, userName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: legalKeys.itemAliases() }),
  });
};

export const useDeleteLegalItemAlias = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alias, userName }: { alias: LegalExternalItemAlias; userName?: string | null }) =>
      legalRepository.deleteItemAlias(alias, userName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: legalKeys.itemAliases() }),
  });
};

export const useLinkLegalArchiveCustomer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      source,
      documentId,
      customerId,
      userName,
    }: {
      source: 'legal' | 'proforma';
      documentId: string;
      customerId: string | null;
      userName?: string | null;
    }) => legalRepository.linkArchiveCustomer(source, documentId, customerId, userName),
    onSuccess: (_, variables) => queryClient.invalidateQueries({
      queryKey: variables.source === 'legal' ? legalKeys.documents() : legalKeys.proformas(),
    }),
  });
};

export const useLinkLegalArchiveOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      source,
      documentId,
      orderId,
      userName,
      method,
      linkMode,
      allocations,
    }: {
      source: 'legal' | 'proforma';
      documentId: string;
      orderId: string | null;
      userName?: string | null;
      method?: 'automatic' | 'manual';
      linkMode?: LegalOrderLinkMode;
      allocations?: LegalOrderLineAllocation[];
    }) => legalRepository.linkArchiveOrder(
      source,
      documentId,
      orderId,
      userName,
      method,
      linkMode,
      allocations,
    ),
    onSuccess: (_, variables) => queryClient.invalidateQueries({
      queryKey: variables.source === 'legal' ? legalKeys.documents() : legalKeys.proformas(),
    }),
  });
};

export const useLinkLegalArchiveSeller = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentId,
      sellerId,
      userName,
      method,
    }: {
      documentId: string;
      sellerId: string | null;
      userName?: string | null;
      method?: 'automatic' | 'manual';
    }) => legalRepository.linkArchiveSeller(documentId, sellerId, userName, method),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: legalKeys.documents() }),
  });
};

export const useSaveLegalSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: LegalSettings) => legalRepository.saveSettings(settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: legalKeys.settings() }),
  });
};

export const useSaveAadeCredentials = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AadeCredentialSavePayload) => legalRepository.saveCredentials(payload),
    onSuccess: (status) => queryClient.setQueryData(legalKeys.credentials(), status),
  });
};

export const useSaveAadeRegistryCredentials = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AadeRegistryCredentialSavePayload) =>
      legalRepository.saveRegistryCredentials(payload),
    onSuccess: (status) => queryClient.setQueryData(legalKeys.credentials(), status),
  });
};

export const useSaveLegalSequence = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sequence: LegalNumberingSequence) => legalRepository.saveSequence(sequence),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: legalKeys.sequences() }),
  });
};

export const useSaveLegalCarrier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (carrier: LegalCarrier) => legalRepository.saveCarrier(carrier),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: legalKeys.carriers() }),
  });
};

export const useSaveLegalDraft = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ document, lines }: { document: LegalDocument; lines: LegalDocumentLine[] }) =>
      legalRepository.saveDraft(document, lines),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legalKeys.documents() });
      queryClient.invalidateQueries({ queryKey: legalKeys.archiveLines() });
    },
  });
};

export const useSaveProformaDraft = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ document, lines }: { document: ProformaDocument; lines: ProformaDocumentLine[] }) =>
      legalRepository.saveProforma(document, lines),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legalKeys.proformas() });
      queryClient.invalidateQueries({ queryKey: legalKeys.archiveProformaLines() });
    },
  });
};

export const useVoidProformaDocument = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => legalRepository.voidProforma(documentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: legalKeys.proformas() }),
  });
};

export const useDeleteProformaDocument = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, userName }: { documentId: string; userName?: string | null }) =>
      legalRepository.deleteProforma(documentId, userName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legalKeys.proformas() });
      queryClient.invalidateQueries({ queryKey: legalKeys.archiveProformaLines() });
    },
  });
};

export const useDeleteLegalDocument = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, userName }: { documentId: string; userName?: string | null }) =>
      legalRepository.deleteDocument(documentId, userName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legalKeys.documents() });
      queryClient.invalidateQueries({ queryKey: legalKeys.archiveLines() });
    },
  });
};

export const useMarkProformaConverted = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ proformaId, legalDocumentId }: { proformaId: string; legalDocumentId: string }) =>
      legalRepository.markProformaConverted(proformaId, legalDocumentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: legalKeys.proformas() }),
  });
};

export const useSyncTransmittedLegalDocuments = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: LegalSyncParams) => legalRepository.syncTransmittedDocuments(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legalKeys.documents() });
      queryClient.invalidateQueries({ queryKey: legalKeys.archiveLines() });
      queryClient.invalidateQueries({ queryKey: legalKeys.syncRuns() });
    },
  });
};

export const useClearLegalSyncRuns = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => legalRepository.clearSyncRuns(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legalKeys.syncRuns() });
    },
  });
};

export const useSubmitLegalDocument = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, userName }: { documentId: string; userName?: string | null }) =>
      legalRepository.submitDocument(documentId, userName),
    onSuccess: (document) => {
      queryClient.invalidateQueries({ queryKey: legalKeys.documents() });
      queryClient.invalidateQueries({ queryKey: legalKeys.documentLines(document.id) });
    },
  });
};

export const useCancelLegalDocument = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, userName }: { documentId: string; userName?: string | null }) =>
      legalRepository.cancelDocument(documentId, userName),
    onSuccess: (document) => {
      queryClient.invalidateQueries({ queryKey: legalKeys.documents() });
      queryClient.invalidateQueries({ queryKey: legalKeys.documentLines(document.id) });
    },
  });
};

export const useMarkLegalDocumentPrinted = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => legalRepository.markPrinted(documentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: legalKeys.documents() }),
  });
};

export const useRegisterLegalTransfer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, userName }: { documentId: string; userName?: string | null }) =>
      legalRepository.registerTransfer(documentId, userName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: legalKeys.documents() }),
  });
};

export const useConfirmLegalDelivery = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, userName, failed }: { documentId: string; userName?: string | null; failed?: boolean }) =>
      legalRepository.confirmDelivery(documentId, userName, failed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: legalKeys.documents() }),
  });
};

export const usePollLegalDeliveryStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, userName }: { documentId: string; userName?: string | null }) =>
      legalRepository.pollDeliveryStatus(documentId, userName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: legalKeys.documents() }),
  });
};

export const useInspectionExitPinStatus = () =>
  useQuery({
    queryKey: legalKeys.inspectionPin(),
    queryFn: legalRepository.hasInspectionExitPin,
    retry: false,
  });

export const useSetInspectionExitPin = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pin: string) => legalRepository.setInspectionExitPin(pin),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: legalKeys.inspectionPin() }),
  });
};
