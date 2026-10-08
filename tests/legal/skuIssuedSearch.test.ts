import { describe, expect, it } from 'vitest';
import { LegalArchiveRecord, LegalDocument, LegalDocumentLine } from '../../types';
import { buildLegalArchiveRecords } from '../../features/legal/archive';
import { issuedSkuPricing, searchIssuedSkus, IssuedSkuFilters } from '../../features/legal/skuIssuedSearch';

const filters: IssuedSkuFilters = { query: ' da001 ', customer: '', from: '', to: '', includeCancelled: false };
const line = (overrides: Partial<LegalDocumentLine> = {}): LegalDocumentLine => ({
  id: 'line-1', document_id: 'doc-1', line_number: 1, sku: 'DA001', variant_suffix: 'DLE',
  description: 'Δαχτυλίδι', quantity: 3, unit_price: 8, net_value: 24,
  vat_category: 1, vat_amount: 5.76, gross_value: 29.76, measurement_unit: 1,
  income_classification: { classification_category: 'category1_1', classification_type: 'E3_561_001', amount: 24 },
  source_metadata: { original_unit_price: 10, discount_percent: 20 }, ...overrides,
});
const document = (overrides: Partial<LegalDocument> = {}): LegalDocument => ({
  id: 'doc-1', source_kind: 'manual', document_kind: 'invoice', aade_document_type: '1.1',
  status: 'issued', issue_date: '2026-10-08', issuer: { vat_number: '111111111', country: 'GR', branch: 0 },
  counterpart: { name: 'Νίκη Αργυρίου', vat_number: '094259216' }, currency: 'EUR', payment_method_code: 5,
  revenue_classification: [], totals: { net: 24, vat: 5.76, gross: 29.76, quantity: 3 },
  created_at: '2026-10-08', updated_at: '2026-10-08', ...overrides,
});
const records = (documents = [document()], lines = [line()]): LegalArchiveRecord[] => buildLegalArchiveRecords({
  legalDocuments: documents, legalLines: lines, proformas: [], proformaLines: [], customers: [], products: [], orders: [], aliases: [],
});

describe('issued SKU lookup', () => {
  it('reuses case/space insensitive prefix matching for master and variant SKUs', () => {
    const data = records();
    expect(searchIssuedSkus(data, filters).map((row) => row.sku)).toEqual(['DA001DLE']);
    expect(searchIssuedSkus(data, { ...filters, query: 'da001d' })).toHaveLength(1);
    expect(searchIssuedSkus(data, { ...filters, query: 'DA001X' })).toHaveLength(0);
    expect(searchIssuedSkus(data, { ...filters, query: 'D' })).toHaveLength(0);
    expect(searchIssuedSkus(data, { ...filters, query: ' ' })).toHaveLength(0);
  });

  it('excludes unissued documents and optionally includes cancelled ones', () => {
    for (const status of ['draft', 'submitted', 'failed', 'cancelled'] as const) {
      const data = records([document({ status })]);
      expect(searchIssuedSkus(data, filters)).toHaveLength(0);
      expect(searchIssuedSkus(data, { ...filters, includeCancelled: true })).toHaveLength(status === 'cancelled' ? 1 : 0);
    }
    const proforma = { ...records()[0], source: 'proforma' } as LegalArchiveRecord;
    expect(searchIssuedSkus([proforma], filters)).toHaveLength(0);
  });

  it('filters by accent-insensitive customer, VAT and inclusive issue dates', () => {
    expect(searchIssuedSkus(records(), { ...filters, customer: 'νικη', from: '2026-10-08', to: '2026-10-08' })).toHaveLength(1);
    expect(searchIssuedSkus(records(), { ...filters, customer: '094259216' })).toHaveLength(1);
    expect(searchIssuedSkus(records(), { ...filters, customer: 'άλλος' })).toHaveLength(0);
    expect(searchIssuedSkus(records(), { ...filters, to: '2026-10-07' })).toHaveLength(0);
    expect(searchIssuedSkus(records(), { ...filters, from: '2026-10-09' })).toHaveLength(0);
  });

  it('retains separate lines and sorts newest first, including credits', () => {
    const data = records([document({ issue_date: '2026-10-01' }), document({ id: 'credit', document_kind: 'credit' })], [
      line(), line({ id: 'second', line_number: 2, unit_price: 7 }), line({ id: 'credit-line', document_id: 'credit' }),
    ]);
    const results = searchIssuedSkus(data, filters);
    expect(results).toHaveLength(3);
    expect(results[0].record.document.document_kind).toBe('credit');
    expect(results[2].match.line.unit_price).toBe(7);
  });

  it('finds external codes and mapped catalog SKUs', () => {
    const data = records();
    data[0].lineMatches[0] = { ...data[0].lineMatches[0], masterSku: 'RNG002', variantSuffix: 'X', rawItemCode: 'EXT123' };
    expect(searchIssuedSkus(data, { ...filters, query: 'RNG002' })[0].sku).toBe('RNG002X');
    expect(searchIssuedSkus(data, { ...filters, query: 'EXT123' })).toHaveLength(1);
  });

  it('does not attribute delivery-note prices to invoices', () => {
    const data = records([document()], [line({ sku: 'OTHER', variant_suffix: '' })]);
    data[0].linkedDeliveryNote = { document: document({ document_kind: 'delivery_note' }), lines: [line()], lineMatches: [{ line: line(), method: 'none' }], uniqueItemCount: 1, totalQuantity: 3 };
    const result = searchIssuedSkus(data, filters)[0];
    expect(result.fromDeliveryNote).toBe(true);
    expect(result.hasPrice).toBe(false);
    expect(searchIssuedSkus(records([document({ document_kind: 'delivery_note' })]), filters)[0].hasPrice).toBe(false);
    data[0].lineMatches = [{ line: line(), method: 'none' }];
    expect(searchIssuedSkus(data, filters)).toHaveLength(1);
  });

  it('uses stored discounts and distinguishes missing information from zero', () => {
    expect(issuedSkuPricing(line())).toEqual({ original: 10, discount: 20, discountAmount: 6 });
    expect(issuedSkuPricing(line({ source_metadata: null }))).toEqual({ original: null, discount: null, discountAmount: null });
    expect(issuedSkuPricing(line({ unit_price: 10, net_value: 30, source_metadata: { original_unit_price: 10, discount_percent: 0 } }))).toEqual({ original: 10, discount: 0, discountAmount: 0 });
    expect(issuedSkuPricing(line({ unit_price: 0, net_value: 0, source_metadata: { original_unit_price: 10, discount_percent: 100 } }))).toEqual({ original: 10, discount: 100, discountAmount: 30 });
  });
});
