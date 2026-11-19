import { describe, expect, it, vi, afterEach } from 'vitest';
import { applyLegalSystemItemToLine, buildAadeInvoiceXml, DEFAULT_LEGAL_SETTINGS, getLegalDocumentCatalogProducts, recalculateLegalDocument } from '../../utils/legalDocuments';
import { applyLegalLineUnit, getLegalLineDisplayQuantity, getLegalLineDisplayUnitPrice, getLegalLineUnit, summarizeLegalQuantities, toStoredLegalQuantity, toStoredLegalUnitPrice } from '../../utils/legalUnits';
import { LEGAL_DEFAULT_SYSTEM_ITEMS, sanitizeLegalSystemItems, validateLegalSystemItem } from '../../utils/legalSystemItems';
import { buildSbzInvoiceXml, validateSbzDocument } from '../../features/legal/sbz';
import { sbzFixture } from './sbzFixture';
import type { LegalDocumentLine } from '../../types';

afterEach(() => { vi.useRealTimers(); });

describe('gram lines are kg in myDATA, grams for people', () => {
  it('converts typed grams and price per gram to stored kg values and back', () => {
    const { lines } = sbzFixture();
    const gramLine = applyLegalLineUnit({ ...lines[0], quantity: 1, unit_price: 0.95, source_metadata: null }, 'g');
    expect(getLegalLineUnit(gramLine)).toBe('g');
    expect(gramLine.measurement_unit).toBe(2);
    expect(gramLine.quantity).toBe(0.001);
    expect(gramLine.unit_price).toBe(950);
    const typed = { ...gramLine, quantity: toStoredLegalQuantity(gramLine, 125.5), unit_price: toStoredLegalUnitPrice(gramLine, 0.95) };
    expect(typed.quantity).toBe(0.1255);
    expect(getLegalLineDisplayQuantity(typed)).toBe(125.5);
    expect(getLegalLineDisplayUnitPrice(typed)).toBe(0.95);
    expect(summarizeLegalQuantities([typed, { ...lines[0], quantity: 3, measurement_unit: 1, source_metadata: null }])).toBe('3 τεμ. · 125,5 gr');
  });

  it('serializes a gram line as measurementUnit 2 in kg with consistent SBZ pricing', () => {
    const { document, lines } = sbzFixture();
    const base = { ...lines[0], quantity: 1, unit_price: 0.8, source_metadata: null } as LegalDocumentLine;
    const gram = applyLegalLineUnit(base, 'g');
    const line = { ...gram, quantity: toStoredLegalQuantity(gram, 250) };
    const recalculated = recalculateLegalDocument({ ...document, lines: undefined }, [line], DEFAULT_LEGAL_SETTINGS);
    const doc = { ...recalculated.document, issuer: document.issuer, counterpart: document.counterpart };
    const [only] = recalculated.lines;
    expect(only.net_value).toBe(200);
    const xml = buildAadeInvoiceXml(doc, recalculated.lines);
    expect(xml).toContain('<quantity>0.25</quantity>');
    expect(xml).toContain('<measurementUnit>2</measurementUnit>');
    expect(validateSbzDocument(doc, recalculated.lines)).toEqual([]);
    const sbzXml = buildSbzInvoiceXml(doc, recalculated.lines, doc.created_at!);
    expect(sbzXml).toContain('<measurementUnitLabel>Κιλά</measurementUnitLabel>');
    expect(sbzXml).toContain('<lineUnitPrice>800.00</lineUnitPrice>');
  });
});

describe('system codes', () => {
  it('ships the foundry codes and rejects reserved, duplicate or product codes', () => {
    expect(LEGAL_DEFAULT_SYSTEM_ITEMS.map((item) => `${item.code}:${item.unit}`)).toEqual(['ΑΦΟΣ:g', 'ΜΠΟΚ:g', 'ΚΕΡ:pcs', 'ΕΠΕΞ:g']);
    const item = { code: 'αφος', description: 'Ασήμι', unit: 'g' as const, default_price: null, is_active: true };
    expect(validateLegalSystemItem(item, LEGAL_DEFAULT_SYSTEM_ITEMS)).toContain('υπάρχει ήδη');
    expect(validateLegalSystemItem({ ...item, code: '001' }, [])).toContain('δεσμευμένος');
    expect(validateLegalSystemItem({ ...item, code: 'RNG1' }, [], ['RNG1'])).toContain('κωδικός προϊόντος');
    expect(validateLegalSystemItem({ ...item, code: 'ΝΕΟ-1' }, [])).toBeNull();
    expect(sanitizeLegalSystemItems([{ code: ' κερ ', description: 'x', unit: 'bad' }, { code: '000', description: 'x' }])).toEqual([
      { code: 'ΚΕΡ', description: 'x', unit: 'pcs', default_price: null, is_active: true },
    ]);
  });

  it('opens a picked gram code at 1 gr and returns to pieces for a normal product', () => {
    const { lines } = sbzFixture();
    const catalog = getLegalDocumentCatalogProducts([], LEGAL_DEFAULT_SYSTEM_ITEMS);
    expect(catalog.some((product) => product.sku === 'ΑΦΟΣ')).toBe(true);
    const picked = applyLegalSystemItemToLine({ ...lines[0], sku: 'ΑΦΟΣ', item_code: 'ΑΦΟΣ' }, LEGAL_DEFAULT_SYSTEM_ITEMS);
    expect(picked.description).toBe('Ασήμι 999°');
    expect(getLegalLineUnit(picked)).toBe('g');
    expect(getLegalLineDisplayQuantity(picked)).toBe(1);
    const back = applyLegalSystemItemToLine({ ...picked, sku: 'RNG1', item_code: 'RNG1' }, LEGAL_DEFAULT_SYSTEM_ITEMS);
    expect(getLegalLineUnit(back)).toBe('pcs');
    expect(back.quantity).toBe(1);
  });
});
