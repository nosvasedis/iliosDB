import type { LegalDocument, LegalDocumentLine, LegalSettings, Product } from '../../types';

export interface LegalCatalogItem {
  sku: string;
  prefix: string;
  category: string;
  description: string;
  image_url: string | null;
  gender: Product['gender'];
  plating_type: Product['plating_type'];
  production_type: Product['production_type'];
  is_component: boolean;
  skip_casting: boolean;
  weight_g: number;
  secondary_weight_g: number | null;
  active_price: number;
  selling_price: number;
  selling_price_manual_override: boolean;
  resolved_invoice_weight: NonNullable<Product['resolved_invoice_weight']>;
  variants: Array<{ suffix: string; description: string; active_price: number | null; selling_price: number | null; selling_price_manual_override: boolean }>;
}

export interface InspectionDataStatus {
  source: 'database' | 'saved';
  state: 'complete' | 'saved' | 'partial' | 'failed';
  fetchedAt: string;
  period: { from: string | null; to: string | null };
  error: string | null;
}

export interface InspectionEvidenceSource {
  id: string;
  category: string;
  title: string;
  periodFrom: string;
  periodTo: string;
  location: string;
  responsible: string;
  confirmed: boolean;
  verifiedAt: string | null;
}

export interface InspectionFilters { environment: 'prod' | 'dev'; dateFrom: string; dateTo: string }
export interface InspectionSnapshot {
  version: 1;
  fetchedAt: string;
  filters: InspectionFilters;
  tables: Record<string, Record<string, any>[]>;
  tableStatus: Record<string, 'complete' | 'unavailable'>;
  status: InspectionDataStatus;
}
export interface InspectionRegistryItem {
  sku: string;
  variant: string;
  itemCode: string;
  description: string;
  category: string;
  unit: number | null;
  kind: 'goods' | 'service';
  source: 'catalog' | 'document';
  documentId: string | null;
}
export interface InspectionIssue { code: string; message: string; documentId?: string }
export interface InspectionSettings extends LegalSettings { inspection_evidence_sources?: InspectionEvidenceSource[] }
export type InspectionDocument = LegalDocument;
export type InspectionLine = LegalDocumentLine;
