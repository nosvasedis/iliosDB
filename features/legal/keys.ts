export const legalKeys = {
  settings: () => ['legal_settings'] as const,
  sequences: () => ['legal_numbering_sequences'] as const,
  carriers: () => ['legal_carriers'] as const,
  documents: () => ['legal_documents'] as const,
  credentials: () => ['legal_aade_credentials'] as const,
  documentLines: (documentId: string) => ['legal_document_lines', documentId] as const,
  transmissions: (documentId: string) => ['legal_transmissions', documentId] as const,
  deliveryEvents: (documentId: string) => ['legal_delivery_events', documentId] as const,
  syncRuns: () => ['legal_sync_runs'] as const,
  proformas: () => ['proforma_documents'] as const,
  proformaLines: (proformaId: string) => ['proforma_document_lines', proformaId] as const,
};
