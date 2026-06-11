import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AadeCredentialSavePayload, LegalCarrier, LegalDocument, LegalDocumentLine, LegalNumberingSequence, LegalSettings, LegalSyncParams, ProformaDocument, ProformaDocumentLine } from '../../types';
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: legalKeys.credentials() }),
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
