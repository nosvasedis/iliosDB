import { describe, expect, it } from 'vitest';
import type {
  Customer,
  LegalArchiveFilterState,
  LegalDocument,
  LegalDocumentLine,
  LegalExternalItemAlias,
  LegalNumberingSequence,
  Order,
  Product,
  ProformaDocument,
  ProformaDocumentLine,
  UserProfile,
} from '../../types';
import {
  buildArchivedDocumentEnrichment,
  buildLegalCounterpartKnowledge,
  buildLegalArchiveRecords,
  createDefaultLegalArchiveFilters,
  filterLegalArchiveRecords,
  getLegalArchiveStats,
  normalizeExternalItemCode,
  resolveLegalCounterpartIdentity,
  resolveLegalArchiveDateRange,
} from '../../features/legal/archive';
import {
  buildLegalNumberingAlignmentPlan,
  formatLegalNumberingAlignmentMessage,
  parseTransmittedDocumentsXml,
} from '../../utils/legalDocuments';

const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: 'customer-1',
  full_name: 'Νίκη Αργυρίου',
  vat_number: 'EL094259216',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const product = (overrides: Partial<Product> = {}): Product => ({
  sku: 'RNG001',
  prefix: 'RNG',
  category: 'Δαχτυλίδια',
  description: 'Δαχτυλίδι Ήλιος',
  gender: 'Women' as Product['gender'],
  image_url: null,
  weight_g: 2,
  plating_type: 'None' as Product['plating_type'],
  production_type: 'Imported' as Product['production_type'],
  variants: [{ suffix: '', description: 'Βασικό', stock_qty: 0 }],
  ...overrides,
});

const legalLine = (overrides: Partial<LegalDocumentLine> = {}): LegalDocumentLine => ({
  id: 'line-1',
  document_id: 'legal-1',
  line_number: 1,
  sku: 'RNG001',
  description: 'Δαχτυλίδι',
  quantity: 2,
  unit_price: 50,
  net_value: 100,
  vat_category: 1,
  vat_amount: 24,
  gross_value: 124,
  measurement_unit: 1,
  item_code: 'RNG001',
  income_classification: {
    classification_category: 'category1_1',
    classification_type: 'E3_561_001',
    amount: 100,
  },
  ...overrides,
});

const legalDocument = (overrides: Partial<LegalDocument> = {}): LegalDocument => ({
  id: 'legal-1',
  order_id: null,
  counterpart_customer_id: null,
  source_kind: 'aade_sync',
  document_kind: 'invoice',
  aade_document_type: '1.1',
  status: 'issued',
  series: 'TIM',
  aa: '44',
  issue_date: '2026-06-10',
  issuer: { vat_number: '111111111', country: 'GR', branch: 0 },
  counterpart: { vat_number: '094259216', country: 'GR', branch: 0 },
  payment_method_code: 5,
  currency: 'EUR',
  revenue_classification: [],
  totals: { net: 100, vat: 24, gross: 124, quantity: 2 },
  aade_mark: '400000044',
  external_source: 'aade_sync',
  archive_parse_version: 1,
  created_at: '2026-06-10T10:00:00Z',
  updated_at: '2026-06-10T10:00:00Z',
  ...overrides,
});

const order = (overrides: Partial<Order> = {}): Order => ({
  id: '00000000-0000-0000-0000-000000000044',
  customer_id: 'customer-1',
  customer_name: 'Νίκη Αργυρίου',
  created_at: '2026-06-09T10:00:00Z',
  status: 'Delivered' as Order['status'],
  items: [{ sku: 'RNG001', quantity: 2, price_at_order: 50 }],
  total_price: 124,
  ...overrides,
});

function buildRecords(options: {
  documents?: LegalDocument[];
  lines?: LegalDocumentLine[];
  customers?: Customer[];
  products?: Product[];
  orders?: Order[];
  aliases?: LegalExternalItemAlias[];
  proformas?: ProformaDocument[];
  proformaLines?: ProformaDocumentLine[];
  sellers?: UserProfile[];
} = {}) {
  return buildLegalArchiveRecords({
    legalDocuments: options.documents ?? [legalDocument()],
    legalLines: options.lines ?? [legalLine()],
    proformas: options.proformas ?? [],
    proformaLines: options.proformaLines ?? [],
    customers: options.customers ?? [customer()],
    products: options.products ?? [product()],
    orders: options.orders ?? [order()],
    aliases: options.aliases ?? [],
    sellers: options.sellers ?? [],
  });
}

describe('legal archive intelligence', () => {
  it('normalizes external item codes without changing meaningful punctuation', () => {
    expect(normalizeExternalItemCode(' rng- 001 ')).toBe('RNG-001');
  });

  it('resolves all date presets with inclusive local-date boundaries', () => {
    const now = new Date(2026, 6, 27, 12, 0, 0);
    expect(resolveLegalArchiveDateRange({ datePreset: 'today', dateFrom: '', dateTo: '', month: '' }, now))
      .toEqual({ from: '2026-07-27', to: '2026-07-27' });
    expect(resolveLegalArchiveDateRange({ datePreset: 'previous_month', dateFrom: '', dateTo: '', month: '' }, now))
      .toEqual({ from: '2026-06-01', to: '2026-06-30' });
    expect(resolveLegalArchiveDateRange({ datePreset: 'specific_month', dateFrom: '', dateTo: '', month: '2026-02' }, now))
      .toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(resolveLegalArchiveDateRange({ datePreset: 'custom', dateFrom: '2026-06-10', dateTo: '2026-06-20', month: '' }, now))
      .toEqual({ from: '2026-06-10', to: '2026-06-20' });
  });

  it('matches a unique customer by normalized VAT and a product by exact catalog identity', () => {
    const [record] = buildRecords();
    expect(record.customerMatch).toMatchObject({
      state: 'matched',
      method: 'vat',
      customer: { id: 'customer-1' },
    });
    expect(record.lineMatches[0]).toMatchObject({
      method: 'catalog',
      masterSku: 'RNG001',
    });
    expect(record.matchState).toBe('matched');
  });

  it('uses a learned external-code alias before direct catalog resolution', () => {
    const alias: LegalExternalItemAlias = {
      id: 'alias-1',
      external_source: 'aade_sync',
      normalized_item_code: 'EXT-77',
      raw_item_code: 'EXT-77',
      product_sku: 'RNG001',
      variant_suffix: null,
    };
    const [record] = buildRecords({
      lines: [legalLine({ sku: 'EXT-77', item_code: 'EXT-77' })],
      aliases: [alias],
    });
    expect(record.lineMatches[0]).toMatchObject({
      method: 'alias',
      masterSku: 'RNG001',
      alias: { id: 'alias-1' },
    });
  });

  it('recognizes Prisma code 000 as a virtual legal service without a catalog product', () => {
    const [record] = buildRecords({
      lines: [legalLine({
        sku: '000',
        item_code: '000',
        description: 'ΜΕΤΑΦΟΡΙΚΑ',
      })],
      products: [product()],
    });
    expect(record.lineMatches[0]).toMatchObject({
      method: 'legal_service',
      masterSku: '000',
      virtualLabel: 'Μεταφορικά',
    });
    expect(record.lineMatches[0].product).toBeUndefined();
    expect(record.matchState).toBe('matched');
  });

  it('marks duplicate VAT matches as ambiguous instead of guessing', () => {
    const [record] = buildRecords({
      customers: [
        customer(),
        customer({ id: 'customer-2', full_name: 'Δεύτερη εγγραφή' }),
      ],
    });
    expect(record.customerMatch.state).toBe('ambiguous');
    expect(record.customerMatch.candidates).toHaveLength(2);
    expect(record.matchState).toBe('ambiguous');
  });

  it('resolves duplicate VAT rows when exactly one customer name also matches', () => {
    const [record] = buildRecords({
      documents: [legalDocument({
        counterpart: {
          vat_number: '094259216',
          country: 'GR',
          branch: 0,
          name: 'ΝΙΚΗ ΑΡΓΥΡΙΟΥ',
        },
      })],
      customers: [
        customer(),
        customer({ id: 'customer-retail', full_name: 'Λιανική' }),
      ],
    });

    expect(record.customerMatch).toMatchObject({
      state: 'matched',
      method: 'vat_name',
      customer: { id: 'customer-1' },
      recommendedCustomer: { id: 'customer-1' },
    });
    expect(record.matchState).toBe('matched');
  });

  it('reuses a reliable archived name for a new document whose name is only its VAT number', () => {
    const knownInvoice = legalDocument({
      id: 'invoice-1061',
      aa: '1061',
      issue_date: '2026-07-21',
      counterpart: {
        vat_number: '040823336',
        country: 'GR',
        branch: 0,
        name: 'ΚΟΥΛΙΓΚΑ ΑΡΙΣΤΟΥΛΑ ΝΙΚΟΛΑΟΣ',
      },
    });
    const newCredit = legalDocument({
      id: 'credit-30',
      document_kind: 'credit',
      aade_document_type: '5.2',
      aa: '30',
      issue_date: '2026-07-28',
      counterpart: {
        vat_number: '040823336',
        country: 'GR',
        branch: 0,
        name: '040823336',
      },
    });

    const records = buildRecords({
      documents: [newCredit, knownInvoice],
      lines: [
        legalLine({ id: 'credit-line', document_id: newCredit.id }),
        legalLine({ id: 'invoice-line', document_id: knownInvoice.id }),
      ],
      customers: [],
      orders: [],
    });

    expect(records.find((record) => record.id === newCredit.id)?.document.counterpart.name)
      .toBe('ΚΟΥΛΙΓΚΑ ΑΡΙΣΤΟΥΛΑ ΝΙΚΟΛΑΟΣ');
  });

  it('prefers a new official name but falls back to VAT knowledge for missing or placeholder names', () => {
    const archived = legalDocument({
      counterpart: {
        vat_number: '040823336',
        country: 'GR',
        branch: 0,
        name: 'ΚΟΥΛΙΓΚΑ ΑΡΙΣΤΟΥΛΑ ΝΙΚΟΛΑΟΣ',
      },
    });
    const knowledge = buildLegalCounterpartKnowledge([archived]);
    const known = knowledge.get('040823336');

    expect(resolveLegalCounterpartIdentity(
      { vat_number: 'EL040823336', country: 'GR', branch: 0, name: '040823336' },
      null,
      known,
    ).name).toBe('ΚΟΥΛΙΓΚΑ ΑΡΙΣΤΟΥΛΑ ΝΙΚΟΛΑΟΣ');

    expect(resolveLegalCounterpartIdentity(
      { vat_number: '040823336', country: 'GR', branch: 0, name: 'ΝΕΑ ΕΠΙΣΗΜΗ ΕΠΩΝΥΜΙΑ' },
      null,
      known,
    ).name).toBe('ΝΕΑ ΕΠΙΣΗΜΗ ΕΠΩΝΥΜΙΑ');
  });

  it('offers an automatic order link only for a unique exact customer, total, SKU, and quantity match', () => {
    const [record] = buildRecords();
    expect(record.autoOrderCandidate?.id).toBe(order().id);

    const [withoutSku] = buildRecords({
      lines: [legalLine({ sku: 'AADE', item_code: null })],
    });
    expect(withoutSku.autoOrderCandidate).toBeUndefined();
    expect(withoutSku.lineMatches[0].method).toBe('none');
  });

  it('filters across dates, customer, product, source, status, and accent-insensitive text', () => {
    const records = buildRecords();
    const filters: LegalArchiveFilterState = {
      ...createDefaultLegalArchiveFilters(),
      query: 'νικη ηλιος',
      datePreset: 'custom',
      dateFrom: '2026-06-10',
      dateTo: '2026-06-10',
      customerId: 'customer-1',
      productSku: 'RNG001',
      externalSource: 'aade_sync',
      status: 'issued',
    };
    expect(filterLegalArchiveRecords(records, filters)).toHaveLength(1);
    expect(filterLegalArchiveRecords(records, { ...filters, dateFrom: '2026-06-11' })).toHaveLength(0);
    expect(filterLegalArchiveRecords(records, { ...filters, query: 'ανύπαρκτο' })).toHaveLength(0);
    expect(filterLegalArchiveRecords(records, {
      ...createDefaultLegalArchiveFilters(),
      customerQuery: 'νικη 094259216',
    })).toHaveLength(1);
  });

  it('calculates summaries from the filtered record set', () => {
    expect(getLegalArchiveStats(buildRecords())).toEqual({
      count: 1,
      net: 100,
      vat: 24,
      gross: 124,
      matched: 1,
      reviewable: 1,
      needsReview: 0,
      operational: 0,
    });
  });

  it('treats pure delivery notes as operational records outside commercial matching quality', () => {
    const [record] = buildRecords({
      documents: [legalDocument({
        document_kind: 'delivery_note',
        aade_document_type: '9.3',
        counterpart: { vat_number: '999999999', country: 'GR', branch: 0 },
        totals: { net: 0, vat: 0, gross: 0, quantity: 200 },
      })],
      lines: [legalLine({
        sku: 'BRS',
        item_code: 'BRS',
        quantity: 200,
        net_value: 0,
        vat_amount: 0,
        gross_value: 0,
      })],
      customers: [],
      orders: [],
    });

    expect(record.matchState).toBe('operational');
    expect(record.autoOrderCandidate).toBeUndefined();
    expect(record.suggestedOrders).toEqual([]);
    expect(getLegalArchiveStats([record])).toEqual({
      count: 1,
      net: 0,
      vat: 0,
      gross: 0,
      matched: 0,
      reviewable: 0,
      needsReview: 0,
      operational: 1,
    });
    expect(filterLegalArchiveRecords([record], {
      ...createDefaultLegalArchiveFilters(),
      matchState: 'operational',
    })).toEqual([record]);
  });

  it('matches seller names in delivery notes regardless of surname-first order or patronymic', () => {
    const seller: UserProfile = {
      id: 'seller-1',
      email: 'seller@example.com',
      full_name: 'Αλέξανδρος Παπαϊωαννίδης',
      is_approved: true,
      role: 'seller',
    };
    const [record] = buildRecords({
      documents: [legalDocument({
        document_kind: 'delivery_note',
        aade_document_type: '9.3',
        counterpart: {
          vat_number: '034008024',
          country: 'GR',
          branch: 0,
          name: 'ΠΑΠΑΪΩΑΝΝΙΔΗΣ ΑΛΕΞΑΝΔΡΟΣ ΑΡΙΣΤΕΙΔΗΣ',
        },
      })],
      sellers: [seller],
      customers: [],
      orders: [],
    });

    expect(record.sellerMatch).toMatchObject({
      state: 'matched',
      method: 'name',
      seller: { id: 'seller-1' },
    });
    expect(record.autoSellerCandidate?.id).toBe('seller-1');
  });

  it('builds and filters a bulk archive index without per-document repository reads', () => {
    const documents = Array.from({ length: 2_500 }, (_, index) => legalDocument({
      id: `legal-${index}`,
      aa: String(index + 1),
      issue_date: index % 2 ? '2026-06-10' : '2026-07-10',
      aade_mark: `40000${String(index).padStart(5, '0')}`,
    }));
    const lines = documents.map((document, index) => legalLine({
      id: `line-${index}`,
      document_id: document.id,
    }));
    const records = buildRecords({ documents, lines });
    expect(records).toHaveLength(2_500);
    expect(filterLegalArchiveRecords(records, {
      ...createDefaultLegalArchiveFilters(),
      datePreset: 'specific_month',
      month: '2026-07',
      productSku: 'RNG001',
    })).toHaveLength(1_250);
  });

  it('parses and enriches all searchable AADE party and line fields from stored XML', () => {
    const rawXml = `
      <invoice xmlns="http://www.aade.gr/myDATA/invoice/v1.0">
        <issuer><vatNumber>111111111</vatNumber><country>GR</country><branch>0</branch></issuer>
        <counterpart>
          <vatNumber>094259216</vatNumber><country>GR</country><branch>0</branch>
          <name>ΝΙΚΗ ΑΡΓΥΡΙΟΥ</name>
          <address><street>Ερμού</street><number>10</number><postalCode>10563</postalCode><city>Αθήνα</city></address>
        </counterpart>
        <invoiceHeader><series>TIM</series><aa>44</aa><issueDate>2026-06-10</issueDate><invoiceType>9.3</invoiceType></invoiceHeader>
        <invoiceDetails>
          <lineNumber>1</lineNumber><itemCode>RNG001</itemCode><itemDescr>Δαχτυλίδι Ήλιος</itemDescr>
          <quantity>2</quantity><measurementUnit>1</measurementUnit>
          <netValue>100</netValue><vatCategory>1</vatCategory><vatAmount>24</vatAmount>
          <lineComments>Μέγεθος 54</lineComments>
          <incomeClassification><classificationType>E3_561_001</classificationType><classificationCategory>category1_1</classificationCategory><amount>100</amount></incomeClassification>
        </invoiceDetails>
        <invoiceSummary><totalNetValue>100</totalNetValue><totalVatAmount>24</totalVatAmount><totalGrossValue>124</totalGrossValue></invoiceSummary>
        <uid>UID-44</uid><mark>400000044</mark>
      </invoice>`;
    const parsed = parseTransmittedDocumentsXml(rawXml).documents[0];
    expect(parsed.counterpart).toMatchObject({
      vat_number: '094259216',
      name: 'ΝΙΚΗ ΑΡΓΥΡΙΟΥ',
      address: { street: 'Ερμού', number: '10', postal_code: '10563', city: 'Αθήνα' },
    });
    expect(parsed.lines[0]).toMatchObject({
      itemCode: 'RNG001',
      itemDescription: 'Δαχτυλίδι Ήλιος',
      lineComments: 'Μέγεθος 54',
      quantity: 2,
      measurementUnit: 1,
      incomeClassification: {
        classification_category: 'category1_1',
        classification_type: 'E3_561_001',
        amount: 100,
      },
    });

    const enriched = buildArchivedDocumentEnrichment(
      legalDocument({ raw_xml: rawXml, archive_parse_version: 0 }),
      [legalLine({ sku: 'AADE', item_code: null, description: 'AADE γραμμή 1' })],
    );
    expect(enriched?.document.archive_parse_version).toBe(3);
    expect(enriched?.document.counterpart.name).toBe('ΝΙΚΗ ΑΡΓΥΡΙΟΥ');
    expect(enriched?.lines[0]).toMatchObject({
      sku: 'RNG001',
      item_code: 'RNG001',
      description: 'Δαχτυλίδι Ήλιος',
      income_classification: {
        classification_category: 'category1_1',
        classification_type: 'E3_561_001',
        amount: 100,
      },
      source_metadata: {
        line_comments: 'Μέγεθος 54',
        income_classifications: [{
          classification_category: 'category1_1',
          classification_type: 'E3_561_001',
          amount: 100,
        }],
        parser_version: 3,
      },
    });
  });
});

describe('legal numbering alignment namespaces', () => {
  it('treats historical series 0 as an informational no-series namespace separate from ΠΙΣ', () => {
    const sequences: LegalNumberingSequence[] = [{
      id: 'credit-sequence',
      document_kind: 'credit',
      aade_document_type: '5.2',
      series: 'ΠΙΣ',
      next_aa: 1,
      is_active: true,
    }];
    const documents = [
      legalDocument({ id: 'credit-0', document_kind: 'credit', aade_document_type: '5.2', series: '0', aa: '1' }),
    ];
    const plan = buildLegalNumberingAlignmentPlan(documents, sequences);
    expect(plan.proposals).toHaveLength(0);
    expect(plan.warnings).toEqual([]);
    expect(plan.notices.join(' ')).toContain('χωρίς σειρά');
    expect(formatLegalNumberingAlignmentMessage(plan)).toContain('Δεν απαιτείται αλλαγή');
  });

  it('aligns historical series 0 when the explicitly active ERP series is also 0', () => {
    const sequences: LegalNumberingSequence[] = [{
      id: 'credit-sequence',
      document_kind: 'credit',
      aade_document_type: '5.2',
      series: '0',
      next_aa: 1,
      is_active: true,
    }];
    const documents = [
      legalDocument({ id: 'credit-0', document_kind: 'credit', aade_document_type: '5.2', series: '0', aa: '7' }),
    ];
    expect(buildLegalNumberingAlignmentPlan(documents, sequences).proposals[0]).toMatchObject({
      maxIssuedAa: 7,
      proposedNextAa: 8,
    });
  });

  it('aligns ΠΙΣ only from ΠΙΣ documents while reporting series 0 separately', () => {
    const sequences: LegalNumberingSequence[] = [{
      id: 'credit-sequence',
      document_kind: 'credit',
      aade_document_type: '5.2',
      series: 'ΠΙΣ',
      next_aa: 2,
      is_active: true,
    }];
    const documents = [
      legalDocument({ id: 'credit-pis', document_kind: 'credit', aade_document_type: '5.2', series: 'PIS', aa: '5' }),
      legalDocument({ id: 'credit-0', document_kind: 'credit', aade_document_type: '5.2', series: '0', aa: '99' }),
    ];
    const plan = buildLegalNumberingAlignmentPlan(documents, sequences);
    expect(plan.proposals[0]).toMatchObject({ maxIssuedAa: 5, proposedNextAa: 6 });
    expect(plan.notices.join(' ')).toContain('σειράς «0»');
  });

  it('ignores malformed AA values and never lowers an existing next number', () => {
    const sequences: LegalNumberingSequence[] = [{
      id: 'credit-sequence',
      document_kind: 'credit',
      aade_document_type: '5.2',
      series: 'ΠΙΣ',
      next_aa: 50,
      is_active: true,
    }];
    const documents = [
      legalDocument({ id: 'credit-valid', document_kind: 'credit', aade_document_type: '5.2', series: 'PIS', aa: '12' }),
      legalDocument({ id: 'credit-malformed', document_kind: 'credit', aade_document_type: '5.2', series: 'ΠΙΣ', aa: 'AA-999' }),
    ];
    const plan = buildLegalNumberingAlignmentPlan(documents, sequences);
    expect(plan.proposals).toEqual([]);
    expect(plan.alreadyAligned[0]).toMatchObject({ nextAa: 50, documentCount: 2 });
  });
});
