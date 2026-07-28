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
  AadeRegistryCredentialSavePayload,
  AadeVatRegistryResult,
  LegalSyncParams,
  LegalSyncRun,
  ProformaDocument,
  ProformaDocumentLine,
  LegalExternalItemAlias,
  LegalOrderLinkMode,
  LegalOrderLineAllocation,
} from '../../types';

export const legalRepository = {
  getSettings: (): Promise<LegalSettings> => api.getLegalSettings(),
  saveSettings: (settings: LegalSettings): Promise<void> => api.saveLegalSettings(settings),
  getCredentialStatus: (): Promise<AadeCredentialStatus> => api.getAadeCredentialStatus(),
  saveCredentials: (payload: AadeCredentialSavePayload): Promise<AadeCredentialStatus> => api.saveAadeCredentials(payload),
  saveRegistryCredentials: (payload: AadeRegistryCredentialSavePayload): Promise<AadeCredentialStatus> =>
    api.saveAadeRegistryCredentials(payload),
  lookupVatRegistry: (payload: {
    vatNumber: string;
    requestedByVat?: string | null;
    referenceDate?: string | null;
  }): Promise<AadeVatRegistryResult> => api.lookupAadeVatRegistry(payload),
  getSequences: (): Promise<LegalNumberingSequence[]> => api.getLegalNumberingSequences(),
  saveSequence: (sequence: LegalNumberingSequence): Promise<void> => api.saveLegalNumberingSequence(sequence),
  getCarriers: (): Promise<LegalCarrier[]> => api.getLegalCarriers(),
  saveCarrier: (carrier: LegalCarrier): Promise<void> => api.saveLegalCarrier(carrier),
  getDocuments: (): Promise<LegalDocument[]> => api.getLegalDocuments(),
  getDocumentLines: (documentId: string): Promise<LegalDocumentLine[]> => api.getLegalDocumentLines(documentId),
  getAllDocumentLines: (): Promise<LegalDocumentLine[]> => api.getAllLegalDocumentLines(),
  getItemAliases: (): Promise<LegalExternalItemAlias[]> => api.getLegalExternalItemAliases(),
  saveItemAlias: (alias: LegalExternalItemAlias, userName?: string | null): Promise<void> =>
    api.saveLegalExternalItemAlias(alias, userName),
  deleteItemAlias: (alias: LegalExternalItemAlias, userName?: string | null): Promise<void> =>
    api.deleteLegalExternalItemAlias(alias, userName),
  linkArchiveCustomer: (
    source: 'legal' | 'proforma',
    documentId: string,
    customerId: string | null,
    userName?: string | null,
  ): Promise<void> => api.linkLegalArchiveCustomer(source, documentId, customerId, userName),
  linkArchiveOrder: (
    source: 'legal' | 'proforma',
    documentId: string,
    orderId: string | null,
    userName?: string | null,
    method?: 'automatic' | 'manual',
    linkMode?: LegalOrderLinkMode,
    allocations?: LegalOrderLineAllocation[],
  ): Promise<void> => api.linkLegalArchiveOrder(
    source,
    documentId,
    orderId,
    userName,
    method,
    linkMode,
    allocations,
  ),
  linkArchiveSeller: (
    documentId: string,
    sellerId: string | null,
    userName?: string | null,
    method?: 'automatic' | 'manual',
  ): Promise<void> => api.linkLegalArchiveSeller(documentId, sellerId, userName, method),
  enrichArchive: (): Promise<number> => api.enrichLegalArchiveDocuments(),
  getTransmissions: (documentId: string): Promise<LegalTransmission[]> => api.getLegalTransmissions(documentId),
  getDeliveryEvents: (documentId: string): Promise<LegalDeliveryEvent[]> => api.getLegalDeliveryEvents(documentId),
  getSyncRuns: (): Promise<LegalSyncRun[]> => api.getLegalSyncRuns(),
  clearSyncRuns: (): Promise<void> => api.clearLegalSyncRuns(),
  syncTransmittedDocuments: (params: LegalSyncParams): Promise<LegalSyncRun> => api.syncTransmittedLegalDocuments(params),
  getProformas: (): Promise<ProformaDocument[]> => api.getProformaDocuments(),
  getProformaLines: (proformaId: string): Promise<ProformaDocumentLine[]> => api.getProformaDocumentLines(proformaId),
  getAllProformaLines: (): Promise<ProformaDocumentLine[]> => api.getAllProformaDocumentLines(),
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
  hasInspectionExitPin: (): Promise<boolean> => api.hasInspectionExitPin(),
  setInspectionExitPin: (pin: string): Promise<void> => api.setInspectionExitPin(pin),
};
