import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildInspectionRegistry, inspectSnapshot } from '../../features/inspection/analysis';
import { buildInspectionExport, inspectionCsv } from '../../features/inspection/export';
import { buildLegalCatalog, legalCatalogProducts } from '../../features/inspection/catalog';
import { resolveInvoiceTotalWeight } from '../../utils/invoiceTotalWeight';
import { buildLegalDocumentFromOrder, DEFAULT_LEGAL_SETTINGS } from '../../utils/legalDocuments';
import { mapProductsWithRelations } from '../../features/products/mappers';
import type { InspectionSnapshot } from '../../features/inspection/types';

function snapshot(): InspectionSnapshot {
  return { version: 1, fetchedAt: '2026-10-13T10:00:00Z', filters: { environment: 'prod', dateFrom: '', dateTo: '' },
    status: { state: 'complete', source: 'database', fetchedAt: '2026-10-13T10:00:00Z', period: { from: null, to: null }, error: null },
    tableStatus: { legal_documents: 'complete', legal_document_lines: 'complete', products: 'complete', product_variants: 'complete' },
    tables: { legal_documents: [], legal_document_lines: [], products: [{ sku: 'R1', category: 'Δαχτυλίδι', description: 'Σημερινή περιγραφή' }], product_variants: [] } };
}
describe('inspection data and exports', () => {
  it('preserves historical descriptions, unknown codes and units and identifies services', () => {
    const s = snapshot();
    s.tables.legal_document_lines = [
      { document_id: 'd', sku: 'R1', item_code: 'R1', description: 'Αρχική περιγραφή', measurement_unit: 2 },
      { document_id: 'd', sku: 'OLD', item_code: 'OLD-X', variant_suffix: 'X', description: 'Παλαιός κωδικός', measurement_unit: 1 },
      { document_id: 'd', sku: '001', item_code: '001', description: 'Επισκευή', measurement_unit: 1 },
    ];
    const rows = buildInspectionRegistry(s);
    expect(rows.filter((row) => row.sku === 'R1')).toHaveLength(2);
    expect(rows).toContainEqual(expect.objectContaining({ itemCode: 'OLD-X', source: 'document' }));
    expect(rows.find((row) => row.sku === '001')?.kind).toBe('service');
    expect(rows.find((row) => row.description === 'Αρχική περιγραφή')?.unit).toBe(2);
  });
  it('detects gaps, uncertainty, duplicate identity and wrong totals without changing records', () => {
    const s = snapshot();
    s.tables.legal_documents = [
      { id: 'a', environment: 'prod', status: 'issued', series: 'A', aa: '1', aade_document_type: '1.1', aade_mark: '123', totals: { net: 5, vat: 1, gross: 6, quantity: 1 } },
      { id: 'b', environment: 'prod', status: 'submitted', provider_state: 'unknown', series: 'A', aa: '3', aade_document_type: '1.1', aade_mark: '123' },
      { id: 'c', environment: null, status: 'draft' },
    ];
    s.tables.legal_document_lines = [{ document_id: 'a', line_number: 1, sku: 'R1', description: 'Ring', measurement_unit: 1, quantity: 1, net_value: 9, vat_amount: 1, gross_value: 10 }];
    const before = JSON.stringify(s);
    expect(inspectSnapshot(s).map((row) => row.code)).toEqual(expect.arrayContaining(['number_gap','pending_issue','duplicate_mark','totals_mismatch','unknown_environment']));
    expect(JSON.stringify(s)).toBe(before);
  });
  it('exports more than 1000 records from exactly the supplied snapshot', async () => {
    const s = snapshot();
    s.tables.legal_documents = Array.from({ length: 1205 }, (_, index) => ({ id: `d${index}`, status: 'draft' }));
    const result = await buildInspectionExport(s);
    const files = unzipSync(result.bytes);
    const copy = JSON.parse(strFromU8(files['snapshot.json']));
    expect(copy.tables.legal_documents).toHaveLength(1205);
    expect(JSON.parse(strFromU8(files['manifest.json'])).counts.legal_documents).toBe(1205);
    expect(strFromU8(files['legal_documents.csv']).split('\r\n')).toHaveLength(1206);
    expect(copy.fetchedAt).toBe(s.fetchedAt);
  });
  it('marks saved and partial exports incomplete and protects spreadsheet cells', async () => {
    const s = snapshot(); s.status.state = 'saved'; s.status.source = 'saved';
    const result = await buildInspectionExport(s);
    expect(result.filename).toContain('INCOMPLETE');
    expect(JSON.parse(strFromU8(unzipSync(result.bytes)['manifest.json'])).retrievalComplete).toBe(false);
    expect(inspectionCsv([{ description: '=HYPERLINK("bad")', quantity: -2 }])).toContain("'=HYPERLINK");
    expect(inspectionCsv([{ quantity: -2 }])).toContain('"-2"');
  });
  it('computes weights on complete server data and emits no recipe/cost/stock fields', () => {
    const context = { products: [{ sku: 'R1', prefix: 'R', category: 'Δαχτυλίδι', weight_g: 2, secondary_weight_g: 1,
      gender: 'Unisex', plating_type: 'None', active_price: 20, selling_price: 20, supplier_cost: 999, labor_casting: 999, stock_qty: 999 }],
      variants: [], recipes: [{ parent_sku: 'R1', type: 'raw', material_id: 'm', quantity: 2 }], materials: [{ id: 'm', name: 'Πέτρα', unit_weight_g: 3 }] };
    const dto = buildLegalCatalog(context);
    expect(dto[0].resolved_invoice_weight.value).toBe(9);
    for (const field of ['recipe','supplier_cost','stock_qty','labor','labor_casting']) expect(dto[0]).not.toHaveProperty(field);
    const reduced = legalCatalogProducts(dto);
    expect(resolveInvoiceTotalWeight(reduced[0]).value).toBe(9);
    const full = mapProductsWithRelations(context.products as any, { recipes: context.recipes as any }, { publicImageBaseUrl: '', centralWarehouseId: 'central', showroomWarehouseId: 'showroom' });
    const order = { id: 'order', created_at: '2026-10-13', customer_name: 'Πελάτης', items: [{ sku: 'R1', quantity: 1, price_at_order: 20 }], status: 'Pending', total_price: 24.8 } as any;
    const params = { order, settings: DEFAULT_LEGAL_SETTINGS, kind: 'invoice' as const };
    const normal = buildLegalDocumentFromOrder({ ...params, products: full, materials: context.materials as any });
    const inspection = buildLegalDocumentFromOrder({ ...params, products: reduced, materials: [] });
    expect(inspection.lines[0].description).toBe(normal.lines[0].description);
    expect(inspection.lines[0].source_metadata.invoice_total_weight_g).toBe(normal.lines[0].source_metadata.invoice_total_weight_g);
    expect(inspection.totals).toEqual(normal.totals);
  });
});
