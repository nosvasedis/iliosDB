import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AadeCredentialSavePayload, LegalCarrier, LegalDocument, LegalDocumentLine, LegalNumberingSequence, LegalSettings } from '../../types';
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
