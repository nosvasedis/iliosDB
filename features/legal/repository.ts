import { api } from '../../lib/supabase';
import {
  LegalCarrier,
  LegalDeliveryEvent,
  LegalDocument,
  LegalDocumentLine,
  LegalNumberingSequence,
  LegalSettings,
  LegalTransmission,
  AadeCredentialSavePayload,
  AadeCredentialStatus,
  LegalSyncParams,
  LegalSyncRun,
  ProformaDocument,
  ProformaDocumentLine,
} from '../../types';

export const legalRepository = {
  getSettings: (): Promise<LegalSettings> => api.getLegalSettings(),
  saveSettings: (settings: LegalSettings): Promise<void> => api.saveLegalSettings(settings),
  getCredentialStatus: (): Promise<AadeCredentialStatus> => api.getAadeCredentialStatus(),
  saveCredentials: (payload: AadeCredentialSavePayload): Promise<AadeCredentialStatus> => api.saveAadeCredentials(payload),
  getSequences: (): Promise<LegalNumberingSequence[]> => api.getLegalNumberingSequences(),
  saveSequence: (sequence: LegalNumberingSequence): Promise<void> => api.saveLegalNumberingSequence(sequence),
  getCarriers: (): Promise<LegalCarrier[]> => api.getLegalCarriers(),
  saveCarrier: (carrier: LegalCarrier): Promise<void> => api.saveLegalCarrier(carrier),
  getDocuments: (): Promise<LegalDocument[]> => api.getLegalDocuments(),
  getDocumentLines: (documentId: string): Promise<LegalDocumentLine[]> => api.getLegalDocumentLines(documentId),
  getTransmissions: (documentId: string): Promise<LegalTransmission[]> => api.getLegalTransmissions(documentId),
  getDeliveryEvents: (documentId: string): Promise<LegalDeliveryEvent[]> => api.getLegalDeliveryEvents(documentId),
  getSyncRuns: (): Promise<LegalSyncRun[]> => api.getLegalSyncRuns(),
  clearSyncRuns: (): Promise<void> => api.clearLegalSyncRuns(),
  syncTransmittedDocuments: (params: LegalSyncParams): Promise<LegalSyncRun> => api.syncTransmittedLegalDocuments(params),
  getProformas: (): Promise<ProformaDocument[]> => api.getProformaDocuments(),
  getProformaLines: (proformaId: string): Promise<ProformaDocumentLine[]> => api.getProformaDocumentLines(proformaId),
  saveProforma: (document: ProformaDocument, lines: ProformaDocumentLine[]): Promise<void> =>
    api.saveProformaDraft(document, lines),
  voidProforma: (documentId: string): Promise<void> => api.voidProformaDocument(documentId),
  deleteProforma: (documentId: string, userName?: string | null): Promise<void> =>
    api.deleteProformaDocument(documentId, userName),
  deleteDocument: (documentId: string, userName?: string | null): Promise<void> =>
    api.deleteLegalDocument(documentId, userName),
  markProformaConverted: (proformaId: string, legalDocumentId: string): Promise<void> =>
    api.markProformaConverted(proformaId, legalDocumentId),
  saveDraft: (document: LegalDocument, lines: LegalDocumentLine[]): Promise<void> => api.saveLegalDraft(document, lines),
  submitDocument: (documentId: string, userName?: string | null): Promise<LegalDocument> =>
    api.submitLegalDocument(documentId, userName),
  cancelDocument: (documentId: string, userName?: string | null): Promise<LegalDocument> =>
    api.cancelLegalDocument(documentId, userName),
  markPrinted: (documentId: string): Promise<void> => api.markLegalDocumentPrinted(documentId),
  registerTransfer: (documentId: string, userName?: string | null): Promise<void> =>
    api.registerLegalTransfer(documentId, userName),
  confirmDelivery: (documentId: string, userName?: string | null, failed = false): Promise<void> =>
    api.confirmLegalDelivery(documentId, userName, failed),
  pollDeliveryStatus: (documentId: string, userName?: string | null): Promise<void> =>
    api.pollLegalDeliveryStatus(documentId, userName),
};
