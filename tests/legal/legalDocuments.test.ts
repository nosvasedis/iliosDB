import { describe, expect, it } from 'vitest';
import { Customer, Order, Product, ProductionType } from '../../types';
import {
  AADE_REVENUE_CLASSIFICATION_COMBINATIONS,
  AADE_VAT_CATEGORY_LINE_OPTIONS,
  AADE_VAT_CATEGORY_OPTIONS,
  formatAadeIncomeCategoryLabel,
  formatAadeIncomeTypeLabel,
  getAllowedIncomeTypeOptions,
  applyLegalDocumentDeliveryToggle,
  buildAadeInvoiceXml,
  buildAadeTransmittedDocsQuery,
  documentIncludesDeliveryNote,
  isEmptyTransmittedDocsResponse,
  toAadeQueryDate,
  buildLegalDocumentFromOrder,
  buildManualLegalDocument,
  buildManualProforma,
  buildProformaFromOrder,
  canPrintLegalDocument,
  canPrintProforma,
  convertProformaToLegalDraft,
  serializeLegalDocumentLineForDb,
  createManualLegalDocumentLine,
  DEFAULT_LEGAL_SETTINGS,
  PAYMENT_METHOD_CODES,
  parseAadeResponseXml,
  parseTransmittedDocumentsXml,
  recalculateLegalDocument,
  recalculateProforma,
  isValidGreekVatNumber,
  validateLegalDocument,
  vatRateToAadeCategory,
} from '../../utils/legalDocuments';

const settings = {
  ...DEFAULT_LEGAL_SETTINGS,
  issuer: {
    ...DEFAULT_LEGAL_SETTINGS.issuer,
    business_name: 'ILIOS TEST',
    name: 'ILIOS TEST',
    vat_number: '094259216',
    address: { street: 'Test', number: '1', postal_code: '11111', city: 'Athens' },
  },
  loading_address: { street: 'Test', number: '1', postal_code: '11111', city: 'Athens' },
};

const customer: Customer = {
  id: 'customer-1',
  full_name: 'B2B Customer',
  vat_number: '987654324',
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
    expect(vatRateToAadeCategory(0.09)).toBe(5);
    expect(vatRateToAadeCategory(0.04)).toBe(6);
    expect(vatRateToAadeCategory(0.03)).toBe(9);
    expect(vatRateToAadeCategory(0)).toBe(7);
  });

  it('lists official AADE payment and VAT appendix codes used by the editor', () => {
    expect(PAYMENT_METHOD_CODES).toEqual([5, 1, 2, 3, 4, 6, 7, 8]);
    expect(AADE_VAT_CATEGORY_OPTIONS.map((option) => option.category)).toEqual([1, 4, 2, 5, 3, 6, 9, 7, 8, 10]);
    expect(AADE_VAT_CATEGORY_LINE_OPTIONS.map((option) => option.category)).toEqual([1, 4, 2, 5, 3, 6, 9, 7, 10]);
    expect(AADE_REVENUE_CLASSIFICATION_COMBINATIONS['1.1']).toContainEqual(['category1_2', 'E3_561_001']);
    expect(AADE_REVENUE_CLASSIFICATION_COMBINATIONS['9.3']).toEqual([['category3', '']]);
    expect(formatAadeIncomeTypeLabel('E3_561_001')).toBe('Χονδρικές πωλήσεις σε επαγγελματίες (E3_561_001)');
    expect(formatAadeIncomeCategoryLabel('category1_2')).toBe('Πώληση προϊόντων (category1_2)');
    expect(getAllowedIncomeTypeOptions('1.1', 'category1_2').map((option) => option.value)).toEqual([
      'E3_561_001',
      'E3_561_002',
      'E3_561_007',
    ]);
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
    expect(xml).toContain('xmlns:icls="https://www.aade.gr/myDATA/incomeClassificaton/v1.0"');
    expect(xml).toContain('<icls:classificationType>E3_561_001</icls:classificationType>');
    expect(xml).not.toContain('<itemCode>');
    expect(xml).not.toMatch(/<issuer>[\s\S]*<address>/);
    expect(xml).not.toMatch(/<counterpart>[\s\S]*<address>/);
    expect(xml.indexOf('<invoiceHeader>')).toBeLessThan(xml.indexOf('<paymentMethods>'));
    expect(xml).not.toContain('<isDeliveryNote>');
    expect(validateLegalDocument(document, document.lines).some((issue) => issue.field.startsWith('delivery'))).toBe(false);
  });

  it('toggles combined invoice-delivery mode without affecting plain invoices', () => {
    const invoice = buildManualLegalDocument({ settings, kind: 'invoice', customer });
    expect(documentIncludesDeliveryNote(invoice)).toBe(false);

    const withDelivery = applyLegalDocumentDeliveryToggle(invoice, true, settings, customer);
    expect(withDelivery.document_kind).toBe('invoice_delivery');
    expect(documentIncludesDeliveryNote(withDelivery)).toBe(true);
    expect(withDelivery.delivery?.dispatch_date).toBeTruthy();

    const backToInvoice = applyLegalDocumentDeliveryToggle(withDelivery, false, settings, customer);
    expect(backToInvoice.document_kind).toBe('invoice');
    expect(backToInvoice.delivery).toBeNull();
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
    expect(xml).toContain('<itemDescr>Silver ring</itemDescr>');
    expect(xml).toContain('<itemCode>RNG001</itemCode>');
    expect(xml.indexOf('<incomeClassification>')).toBeLessThan(xml.indexOf('<itemDescr>'));
    expect(xml.indexOf('<itemDescr>')).toBeLessThan(xml.indexOf('<itemCode>'));
  });

  it('uses the official non-E3 classification for delivery notes', () => {
    const document = buildLegalDocumentFromOrder({
      order: baseOrder,
      customer,
      products: [product],
      settings,
      kind: 'delivery_note',
    });
    const xml = buildAadeInvoiceXml({ ...document, series: 'DA', aa: '1' }, document.lines);
    const errors = validateLegalDocument(document, document.lines).filter((issue) => issue.severity === 'error');

    expect(document.aade_document_type).toBe('9.3');
    expect(document.lines![0].income_classification).toMatchObject({
      classification_category: 'category3',
      classification_type: '',
    });
    expect(xml).toContain('<icls:classificationCategory>category3</icls:classificationCategory>');
    expect(xml).not.toContain('<icls:classificationType>');
    expect(errors).toEqual([]);
  });

  it('rejects fake Greek VAT numbers before AADE submission', () => {
    expect(isValidGreekVatNumber('999999999')).toBe(false);
    expect(isValidGreekVatNumber('094259216')).toBe(true);

    const document = buildLegalDocumentFromOrder({
      order: baseOrder,
      customer: { ...customer, vat_number: '999999999' },
      products: [product],
      settings: {
        ...settings,
        issuer: { ...settings.issuer, vat_number: '999999999' },
      },
      kind: 'invoice',
    });
    const issues = validateLegalDocument(document, document.lines).filter((issue) => issue.severity === 'error');
    expect(issues.some((issue) => issue.field === 'issuer.vat_number')).toBe(true);
    expect(issues.some((issue) => issue.field === 'counterpart.vat_number')).toBe(true);
  });

  it('parses wrapped and encoded AADE error responses', () => {
    const parsed = parseAadeResponseXml(`<string xmlns="http://schemas.microsoft.com/2003/10/Serialization/">&lt;ResponseDoc&gt;&lt;response&gt;&lt;statusCode&gt;XMLSyntaxError&lt;/statusCode&gt;&lt;errors&gt;&lt;error&gt;&lt;message&gt;invalid child element itemCode&lt;/message&gt;&lt;/error&gt;&lt;/errors&gt;&lt;/response&gt;&lt;/ResponseDoc&gt;</string>`);
    expect(parsed.statusCode).toBe('XMLSyntaxError');
    expect(parsed.errors.join(' ')).toContain('invalid child element itemCode');
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

  it('recalculates manually edited document lines and document totals', () => {
    const document = buildLegalDocumentFromOrder({
      order: baseOrder,
      customer,
      products: [product],
      settings,
      kind: 'invoice',
    });
    const manualLine = createManualLegalDocumentLine({
      documentId: document.id,
      lineNumber: 2,
      settings,
      sku: 'CUSTOM',
      description: 'Manual service line',
      quantity: 3,
      unitPrice: 10,
      vatRate: 0.24,
    });

    const updated = recalculateLegalDocument(document, [
      { ...document.lines![0], quantity: 1, unit_price: 80 },
      manualLine,
    ], settings);

    expect(updated.lines.map((line) => line.line_number)).toEqual([1, 2]);
    expect(updated.lines[0].net_value).toBe(80);
    expect(updated.lines[0].vat_amount).toBe(19.2);
    expect(updated.lines[1].net_value).toBe(30);
    expect(updated.document.totals).toMatchObject({ net: 110, vat: 26.4, gross: 136.4, quantity: 4 });
    expect(updated.document.revenue_classification[0].amount).toBe(110);
  });

  it('preserves manually selected AADE VAT categories when recalculating lines', () => {
    const document = buildLegalDocumentFromOrder({
      order: baseOrder,
      customer,
      products: [product],
      settings,
      kind: 'invoice',
    });

    const updated = recalculateLegalDocument(document, [
      { ...document.lines![0], quantity: 1, unit_price: 100, vat_category: 10 },
    ], settings);

    expect(updated.lines[0].vat_category).toBe(10);
    expect(updated.lines[0].vat_amount).toBe(4);
    expect(updated.document.totals.gross).toBe(104);
  });

  it('rejects AADE-only line combinations the current legal editor cannot submit safely', () => {
    const document = buildLegalDocumentFromOrder({
      order: baseOrder,
      customer,
      products: [product],
      settings,
      kind: 'invoice',
    });

    const issues = validateLegalDocument(document, [
      { ...document.lines![0], vat_category: 8, measurement_unit: 7 },
    ]);

    expect(issues.some((issue) => issue.field.includes('vat_category'))).toBe(true);
    expect(issues.some((issue) => issue.field.includes('measurement_unit'))).toBe(true);
  });

  it('rejects manual E3 combinations that are not allowed for the AADE document type', () => {
    const document = buildLegalDocumentFromOrder({
      order: baseOrder,
      customer,
      products: [product],
      settings,
      kind: 'invoice',
    });

    const issues = validateLegalDocument(document, [
      {
        ...document.lines![0],
        income_classification: {
          ...document.lines![0].income_classification,
          classification_category: 'category1_1',
          classification_type: 'E3_561_005',
        },
      },
    ]);

    expect(issues.some((issue) => issue.field.includes('classification'))).toBe(true);
  });

  it('defaults credits to the non-correlated 5.2 type and blocks unsupported correlated 5.1 drafts', () => {
    const credit = buildLegalDocumentFromOrder({
      order: baseOrder,
      customer,
      products: [product],
      settings,
      kind: 'credit',
    });

    expect(credit.aade_document_type).toBe('5.2');
    expect(validateLegalDocument(credit, credit.lines).filter((issue) => issue.severity === 'error')).toEqual([]);

    const correlatedCredit = { ...credit, aade_document_type: '5.1' as const };
    expect(validateLegalDocument(correlatedCredit, correlatedCredit.lines).some((issue) =>
      issue.field === 'aade_document_type'
    )).toBe(true);
  });

  it('builds editable proformas that are printable but never AADE legal documents', () => {
    const proforma = buildProformaFromOrder({
      order: baseOrder,
      customer,
      products: [product],
      settings,
      userName: 'Tester',
    });
    const recalculated = recalculateProforma(proforma, [
      { ...proforma.lines![0], description: 'Editable proforma line', quantity: 1, unit_price: 50 },
    ], settings);

    expect(proforma.document_kind).toBe('proforma');
    expect(proforma.status).toBe('draft');
    expect(proforma.aade_mark).toBeNull();
    expect(canPrintProforma(recalculated.document)).toBe(true);
    expect(recalculated.lines[0].description).toBe('Editable proforma line');
    expect(recalculated.document.totals.gross).toBe(62);
  });

  it('builds manual legal documents and proformas without an order', () => {
    const document = buildManualLegalDocument({
      settings,
      kind: 'invoice',
      userName: 'Tester',
    });

    expect(document.source_kind).toBe('manual');
    expect(document.order_id).toBeNull();
    expect(document.status).toBe('draft');
    expect(document.lines).toHaveLength(1);
    expect(document.counterpart.name).toBe('');
    expect(document.totals.gross).toBe(0);

    const deliveryDocument = buildManualLegalDocument({
      settings,
      kind: 'delivery_note',
      userName: 'Tester',
      customer,
    });
    expect(deliveryDocument.aade_document_type).toBe('9.3');
    expect(deliveryDocument.delivery?.dispatch_date).toBeTruthy();
    expect(deliveryDocument.counterpart.vat_number).toBe('987654324');

    const proforma = buildManualProforma({
      settings,
      userName: 'Tester',
      customer,
    });
    expect(proforma.source_kind).toBe('manual');
    expect(proforma.order_id).toBeNull();
    expect(proforma.document_kind).toBe('proforma');
    expect(proforma.lines).toHaveLength(1);
    expect(proforma.aade_mark).toBeNull();
  });

  it('converts a proforma into a legal draft without copying AADE marks or numbering', () => {
    const proforma = buildProformaFromOrder({
      order: baseOrder,
      customer,
      products: [product],
      settings,
      userName: 'Tester',
    });

    const { document, lines } = convertProformaToLegalDraft({
      proforma: {
        ...proforma,
        series: 'PRO',
        aa: '12',
        aade_mark: 'SHOULD-NOT-COPY',
      },
      lines: proforma.lines!,
      settings,
      kind: 'invoice',
      userName: 'Tester',
    });

    expect(document.document_kind).toBe('invoice');
    expect(document.status).toBe('draft');
    expect(document.series).toBeNull();
    expect(document.aa).toBeNull();
    expect(document.aade_mark).toBeNull();
    expect(document.source_kind).toBe('proforma');
    expect(document.order_id).toBe(baseOrder.id);
    expect(lines).toHaveLength(1);
    expect(lines[0].document_id).toBe(document.id);
    expect(lines[0]).not.toHaveProperty('proforma_id');
    const row = serializeLegalDocumentLineForDb(lines[0], document.id);
    expect(row).not.toHaveProperty('proforma_id');
    expect(row.document_id).toBe(document.id);
  });

  it('serializeLegalDocumentLineForDb drops proforma-only fields from stale line payloads', () => {
    const row = serializeLegalDocumentLineForDb({
      id: 'line-1',
      document_id: 'doc-1',
      proforma_id: 'proforma-1',
      line_number: 1,
      sku: 'SKU-1',
      description: 'Item',
      quantity: 1,
      unit_price: 10,
      net_value: 10,
      vat_category: 1,
      vat_amount: 2.4,
      gross_value: 12.4,
      measurement_unit: 1,
      income_classification: { classification_category: 'category1_1', classification_type: 'E3_561_001', amount: 10 },
    } as any, 'doc-1');
    expect(row).not.toHaveProperty('proforma_id');
    expect(row.document_id).toBe('doc-1');
  });

  it('parses transmitted AADE documents, cancellation marks, and pagination keys', () => {
    const parsed = parseTransmittedDocumentsXml(`
      <RequestedDoc>
        <continuationToken>
          <nextPartitionKey>pk-1</nextPartitionKey>
          <nextRowKey>rk-1</nextRowKey>
        </continuationToken>
        <invoicesDoc>
          <invoice>
            <issuer><vatNumber>094259216</vatNumber><country>GR</country><branch>0</branch></issuer>
            <counterpart><vatNumber>987654324</vatNumber><country>GR</country><branch>0</branch></counterpart>
            <invoiceHeader>
              <series>TIM</series>
              <aa>44</aa>
              <issueDate>2026-06-10</issueDate>
              <invoiceType>1.1</invoiceType>
            </invoiceHeader>
            <invoiceDetails>
              <lineNumber>1</lineNumber>
              <netValue>100.00</netValue>
              <vatCategory>1</vatCategory>
              <vatAmount>24.00</vatAmount>
              <itemCode>RNG001</itemCode>
            </invoiceDetails>
            <invoiceSummary>
              <totalNetValue>100.00</totalNetValue>
              <totalVatAmount>24.00</totalVatAmount>
              <totalGrossValue>124.00</totalGrossValue>
            </invoiceSummary>
            <uid>UID-44</uid>
            <mark>400000044</mark>
            <qrUrl>https://example.test/qr/44</qrUrl>
          </invoice>
        </invoicesDoc>
        <cancelledInvoicesDoc>
          <cancelledInvoice>
            <invoiceMark>400000044</invoiceMark>
            <cancellationMark>500000044</cancellationMark>
            <cancellationDate>2026-06-11</cancellationDate>
          </cancelledInvoice>
        </cancelledInvoicesDoc>
      </RequestedDoc>
    `);

    expect(parsed.nextPartitionKey).toBe('pk-1');
    expect(parsed.nextRowKey).toBe('rk-1');
    expect(parsed.documents[0]).toMatchObject({
      mark: '400000044',
      uid: 'UID-44',
      series: 'TIM',
      aa: '44',
      invoiceType: '1.1',
      qrUrl: 'https://example.test/qr/44',
    });
    expect(parsed.documents[0].totals.gross).toBe(124);
    expect(parsed.cancellations[0]).toMatchObject({
      invoiceMark: '400000044',
      cancellationMark: '500000044',
    });
  });

  it('formats transmitted-doc sync dates for AADE query parameters', () => {
    expect(toAadeQueryDate('2026-06-11')).toBe('11/06/2026');
    expect(toAadeQueryDate('11/06/2026')).toBe('11/06/2026');
  });

  it('builds official RequestTransmittedDocs filters and pagination query keys', () => {
    const query = buildAadeTransmittedDocsQuery({
      environment: 'dev',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      markFrom: '100',
      entityVatNumber: 'EL094259216',
      receiverVatNumber: '987-654-324',
      invType: '1.1',
      maxMark: '999',
    }, {
      nextPartitionKey: 'pk',
      nextRowKey: 'rk',
    });

    expect(query).toEqual({
      mark: '100',
      dateFrom: '01/06/2026',
      dateTo: '30/06/2026',
      entityVatNumber: '094259216',
      receiverVatNumber: '987654324',
      invType: '1.1',
      maxMark: '999',
      nextPartitionKey: 'pk',
      nextRowKey: 'rk',
    });
  });

  it('treats empty transmitted-doc responses as a successful sync with zero imports', () => {
    expect(isEmptyTransmittedDocsResponse({
      ok: false,
      status: 404,
      responseText: '<RequestedDoc />',
      parsed: { statusCode: undefined, errors: [] },
    }, { documents: [], cancellations: [] })).toBe(true);

    expect(isEmptyTransmittedDocsResponse({
      ok: false,
      status: 400,
      responseText: '<ResponseDoc><response><statusCode>ValidationError</statusCode><errors><error><message>Requested Invoice was not found</message></error></errors></response></ResponseDoc>',
      parsed: { statusCode: 'ValidationError', errors: ['Requested Invoice was not found'] },
    }, { documents: [], cancellations: [] })).toBe(true);
  });
});
