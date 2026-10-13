import { inspectionQueryKey } from '../inspection/queryScope';
export const legalKeys = {
  settings: () => inspectionQueryKey(['legal_settings'] as const),
  sequences: () => inspectionQueryKey(['legal_numbering_sequences'] as const),
  carriers: () => inspectionQueryKey(['legal_carriers'] as const),
  documents: () => inspectionQueryKey(['legal_documents'] as const),
  archiveLines: () => inspectionQueryKey(['legal_document_lines', 'archive'] as const),
  archiveProformaLines: () => inspectionQueryKey(['proforma_document_lines', 'archive'] as const),
  itemAliases: () => inspectionQueryKey(['legal_external_item_aliases'] as const),
  credentials: () => inspectionQueryKey(['legal_aade_credentials'] as const),
  documentLines: (documentId: string) => inspectionQueryKey(['legal_document_lines', documentId] as const),
  transmissions: (documentId: string) => inspectionQueryKey(['legal_transmissions', documentId] as const),
  deliveryEvents: (documentId: string) => inspectionQueryKey(['legal_delivery_events', documentId] as const),
  syncRuns: () => inspectionQueryKey(['legal_sync_runs'] as const),
  proformas: () => inspectionQueryKey(['proforma_documents'] as const),
  proformaLines: (proformaId: string) => inspectionQueryKey(['proforma_document_lines', proformaId] as const),
  inspectionPin: () => inspectionQueryKey(['inspection_exit_pin_status'] as const),
};
