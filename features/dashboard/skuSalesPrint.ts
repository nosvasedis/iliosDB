export type SkuSalesPrintView = 'skus' | 'designs';

export interface SkuSalesPrintRow {
  rank: number;
  sku: string;
  variantSuffix: string;
  name: string;
  quantity: number;
  revenue: number;
  profit: number;
}

export interface SkuSalesPrintKpis {
  quantity: number;
  revenue: number;
  profit: number;
  skuCount: number;
}

export interface SkuSalesPrintInput {
  periodLabel: string;
  sortLabel: string;
  filterSummary: string;
  view: SkuSalesPrintView;
  kpis: SkuSalesPrintKpis;
  skuRows: SkuSalesPrintRow[];
  designRows: SkuSalesPrintRow[];
}

export interface SkuSalesPrintData extends SkuSalesPrintInput {
  title: string;
  rows: SkuSalesPrintRow[];
}

export function buildSkuSalesPrintData(input: SkuSalesPrintInput): SkuSalesPrintData {
  const rows = input.view === 'designs' ? input.designRows : input.skuRows;
  return {
    ...input,
    title: `Αναφορά πωλήσεων SKU - ${input.periodLabel}`,
    rows,
  };
}

export function describeSkuModalFilters(parts: string[]): string {
  const cleaned = parts.map((part) => part.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(' · ') : 'Χωρίς επιπλέον φίλτρα';
}
