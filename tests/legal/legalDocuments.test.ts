import { describe, expect, it } from 'vitest';
import { Customer, Order, Product, ProductionType } from '../../types';
import {
  buildAadeInvoiceXml,
  buildLegalDocumentFromOrder,
  canPrintLegalDocument,
  DEFAULT_LEGAL_SETTINGS,
  parseAadeResponseXml,
  validateLegalDocument,
  vatRateToAadeCategory,
} from '../../utils/legalDocuments';

const settings = {
  ...DEFAULT_LEGAL_SETTINGS,
  issuer: {
    ...DEFAULT_LEGAL_SETTINGS.issuer,
    business_name: 'ILIOS TEST',
    name: 'ILIOS TEST',
    vat_number: '123456789',
    address: { street: 'Test', number: '1', postal_code: '11111', city: 'Athens' },
  },
  loading_address: { street: 'Test', number: '1', postal_code: '11111', city: 'Athens' },
};

const customer: Customer = {
  id: 'customer-1',
  full_name: 'B2B Customer',
  vat_number: '987654321',
  address: 'Client Street 2 22222 Athens',
  phone: '2100000000',
  created_at: '2026-06-11T08:00:00.000Z',
};

const product: Product = {
  sku: 'RNG001',
  prefix: 'RNG',
  category: 'Ring',
  description: 'Silver ring',
  gender: 'Unisex' as any,
  image_url: null,
  weight_g: 2,
  plating_type: 'None' as any,
  production_type: ProductionType.InHouse,
  active_price: 100,
  draft_price: 100,
  selling_price: 100,
  stock_qty: 10,
  sample_qty: 0,
  molds: [],
  is_component: false,
  recipe: [],
  labor: {
    casting_cost: 0,
    setter_cost: 0,
    technician_cost: 0,
    stone_setting_cost: 0,
    plating_cost_x: 0,
    plating_cost_d: 0,
    subcontract_cost: 0,
  },
  collections: [],
};

const baseOrder: Order = {
  id: 'order-1',
  customer_id: customer.id,
  customer_name: customer.full_name,
  customer_phone: customer.phone,
  created_at: '2026-06-11T08:00:00.000Z',
  status: 'Pending' as any,
  total_price: 248,
  vat_rate: 0.24,
  discount_percent: 0,
  items: [
    {
      sku: product.sku,
      quantity: 2,
      price_at_order: 100,
      line_id: 'line-1',
    },
  ],
};

describe('legal document helpers', () => {
  it('maps Greek VAT rates to AADE VAT categories', () => {
    expect(vatRateToAadeCategory(0.24)).toBe(1);
    expect(vatRateToAadeCategory(0.17)).toBe(4);
    expect(vatRateToAadeCategory(0)).toBe(7);
  });

  it('builds an invoice draft with totals and revenue classification', () => {
    const document = buildLegalDocumentFromOrder({
      order: baseOrder,
      customer,
      products: [product],
      settings,
      kind: 'invoice',
      userName: 'Tester',
    });

    expect(document.totals.net).toBe(200);
    expect(document.totals.vat).toBe(48);
    expect(document.totals.gross).toBe(248);
    expect(document.revenue_classification[0].classification_type).toBe('E3_561_001');
    expect(validateLegalDocument(document, document.lines)).toEqual([]);
  });

  it('blocks zero-VAT documents without an exemption category', () => {
    const zeroVatDocument = buildLegalDocumentFromOrder({
      order: { ...baseOrder, vat_rate: 0 },
      customer,
      products: [product],
      settings: { ...settings, default_vat_exemption_category: null },
      kind: 'invoice',
    });

    expect(validateLegalDocument(zeroVatDocument, zeroVatDocument.lines).some((issue) =>
      issue.field.includes('vat_exemption')
    )).toBe(true);
  });

  it('builds AADE invoice XML with payment, VAT and classification payloads', () => {
    const document = buildLegalDocumentFromOrder({
      order: baseOrder,
      customer,
      products: [product],
      settings,
      kind: 'invoice',
    });
    const xml = buildAadeInvoiceXml({ ...document, series: 'TIM', aa: '1' }, document.lines);

    expect(xml).toContain('<invoiceType>1.1</invoiceType>');
    expect(xml).toContain('<paymentMethods>');
    expect(xml).toContain('<vatCategory>1</vatCategory>');
    expect(xml).toContain('<classificationType>E3_561_001</classificationType>');
  });

  it('marks combined invoice-delivery documents as delivery notes in XML', () => {
    const document = buildLegalDocumentFromOrder({
      order: baseOrder,
      customer,
      products: [product],
      settings,
      kind: 'invoice_delivery',
    });
    const xml = buildAadeInvoiceXml({ ...document, series: 'TDA', aa: '1' }, document.lines);

    expect(xml).toContain('<invoiceType>1.1</invoiceType>');
    expect(xml).toContain('<isDeliveryNote>true</isDeliveryNote>');
    expect(xml).toContain('<dispatchDate>');
  });

  it('parses AADE response XML and gates legal printing on MARK plus QR', () => {
    const parsed = parseAadeResponseXml(`
      <ResponseDoc>
        <response>
          <statusCode>Success</statusCode>
          <invoiceUid>UID-1</invoiceUid>
          <invoiceMark>400000001</invoiceMark>
          <authenticationCode>AUTH</authenticationCode>
          <qrUrl>https://example.test/qr</qrUrl>
        </response>
      </ResponseDoc>
    `);

    expect(parsed.statusCode).toBe('Success');
    expect(parsed.invoiceMark).toBe('400000001');

    const document = buildLegalDocumentFromOrder({
      order: baseOrder,
      customer,
      products: [product],
      settings,
      kind: 'invoice',
    });
    expect(canPrintLegalDocument(document)).toBe(false);
    expect(canPrintLegalDocument({
      ...document,
      status: 'issued',
      aade_mark: parsed.invoiceMark,
      qr_url: parsed.qrUrl,
    })).toBe(true);
  });
});
