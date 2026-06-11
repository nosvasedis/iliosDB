import {
  AadeDocumentType,
  Customer,
  LegalDeliveryDetails,
  LegalDocument,
  LegalDocumentKind,
  LegalDocumentLine,
  LegalIncomeClassification,
  LegalParty,
  LegalPartyAddress,
  LegalSettings,
  LegalTotals,
  LegalValidationIssue,
  Order,
  OrderItem,
  OrderShipment,
  OrderShipmentItem,
  Product,
  ProductionType,
} from '../types';

export const LEGAL_SETTINGS_ID = '00000000-0000-0000-0000-000000000091';

export const DEFAULT_LEGAL_SETTINGS: LegalSettings = {
  id: LEGAL_SETTINGS_ID,
  environment: 'dev',
  issuer: {
    country: 'GR',
    branch: 0,
    business_name: 'ILIOS KOSMIMA',
    vat_number: '',
    address: {
      street: '',
      number: '',
      postal_code: '',
      city: '',
    },
    phone: '2104905405',
    email: 'ilioskosmima@gmail.com',
  },
  default_payment_method: 5,
  default_vat_exemption_category: null,
  default_income_classification_category: 'category1_2',
  default_income_classification_type: 'E3_561_001',
  inhouse_income_classification_category: 'category1_2',
  inhouse_income_classification_type: 'E3_561_001',
  imported_income_classification_category: 'category1_1',
  imported_income_classification_type: 'E3_561_001',
  default_move_purpose: 1,
  loading_address: {
    street: '',
    number: '',
    postal_code: '',
    city: '',
  },
  require_aade_credentials: true,
};

export const LEGAL_DOCUMENT_KIND_LABELS: Record<LegalDocumentKind, string> = {
  invoice: 'Τιμολόγιο Πώλησης',
  delivery_note: 'Δελτίο Αποστολής',
  invoice_delivery: 'Τιμολόγιο - Δελτίο Αποστολής',
  credit: 'Πιστωτικό Τιμολόγιο',
};

export const PAYMENT_METHOD_LABELS: Record<number, string> = {
  1: 'Επαγγελματικός λογαριασμός',
  3: 'Μετρητά',
  5: 'Επί πιστώσει',
  6: 'Web banking',
};

export function getAadeDocumentTypeForKind(kind: LegalDocumentKind): AadeDocumentType {
  if (kind === 'delivery_note') return '9.3';
  if (kind === 'credit') return '5.1';
  return '1.1';
}

export function getDocumentKindFromAadeType(type: AadeDocumentType): LegalDocumentKind {
  if (type === '9.3') return 'delivery_note';
  if (type === '5.1' || type === '5.2') return 'credit';
  return 'invoice';
}

export function vatRateToAadeCategory(vatRate: number): number {
  if (Math.abs(vatRate - 0.24) < 0.001) return 1;
  if (Math.abs(vatRate - 0.17) < 0.001) return 4;
  if (Math.abs(vatRate - 0.13) < 0.001) return 2;
  if (Math.abs(vatRate - 0.06) < 0.001) return 3;
  if (Math.abs(vatRate) < 0.001) return 7;
  return 1;
}

export function roundMoney(value: number): number {
  return Number((Math.round((Number(value) || 0) * 100) / 100).toFixed(2));
}

export function toIsoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function toXmlDateTimeDate(value?: string | null): string {
  if (!value) return toIsoDate(new Date());
  return value.includes('T') ? value.slice(0, 10) : value;
}

function toXmlTime(value?: string | null): string {
  if (!value) return '10:00:00';
  if (value.includes('T')) return value.slice(11, 19);
  return value.length === 5 ? `${value}:00` : value;
}

export function normalizeVatNumber(value?: string | null): string {
  return (value || '').replace(/^EL/i, '').replace(/\D/g, '').slice(0, 9);
}

function parseAddress(address?: string | null): LegalPartyAddress | null {
  if (!address) return null;
  return { street: address, number: '', postal_code: '', city: '' };
}

function buildCounterpart(order: Order, customer?: Customer | null): LegalParty {
  return {
    vat_number: normalizeVatNumber(customer?.vat_number),
    country: 'GR',
    branch: 0,
    name: customer?.full_name || order.customer_name,
    address: customer?.address ? parseAddress(customer.address) : null,
    phone: customer?.phone || order.customer_phone || null,
    email: customer?.email || null,
  };
}

function getItemDescription(item: OrderItem | OrderShipmentItem, product?: Product): string {
  const variant = product?.variants?.find((v) => v.suffix === item.variant_suffix);
  return variant?.description || product?.description || product?.category || item.sku;
}

function getIncomeClassification(product: Product | undefined, settings: LegalSettings, amount: number): LegalIncomeClassification {
  const imported = product?.production_type === ProductionType.Imported;
  return {
    classification_category: imported
      ? settings.imported_income_classification_category
      : settings.inhouse_income_classification_category,
    classification_type: imported
      ? settings.imported_income_classification_type
      : settings.inhouse_income_classification_type,
    amount: roundMoney(amount),
  };
}

function computeTotals(lines: LegalDocumentLine[]): LegalTotals {
  return {
    net: roundMoney(lines.reduce((sum, line) => sum + line.net_value, 0)),
    vat: roundMoney(lines.reduce((sum, line) => sum + line.vat_amount, 0)),
    gross: roundMoney(lines.reduce((sum, line) => sum + line.gross_value, 0)),
    quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

function groupIncomeClassifications(lines: LegalDocumentLine[]): LegalIncomeClassification[] {
  const grouped = new Map<string, LegalIncomeClassification>();
  for (const line of lines) {
    const item = line.income_classification;
    const key = `${item.classification_category}::${item.classification_type || ''}`;
    const existing = grouped.get(key);
    if (existing) existing.amount = roundMoney(existing.amount + item.amount);
    else grouped.set(key, { ...item });
  }
  return Array.from(grouped.values());
}

function buildLineId(_documentId: string, _index: number): string {
  return crypto.randomUUID();
}

function buildOrderLineKey(item: Pick<OrderItem, 'sku' | 'variant_suffix' | 'size_info' | 'cord_color' | 'enamel_color' | 'line_id'>): string {
  return [
    item.sku,
    item.variant_suffix || '',
    item.size_info || '',
    item.cord_color || '',
    item.enamel_color || '',
    item.line_id || '',
  ].join('::');
}

function buildLinesFromOrderItems(params: {
  documentId: string;
  items: Array<OrderItem | OrderShipmentItem>;
  products: Product[];
  settings: LegalSettings;
  vatRate: number;
  discountPercent?: number;
}): LegalDocumentLine[] {
  const vatCategory = vatRateToAadeCategory(params.vatRate);
  const discountFactor = 1 - ((params.discountPercent || 0) / 100);

  return params.items.map((item, index) => {
    const product = params.products.find((p) => p.sku === item.sku);
    const unitPrice = Number((item as OrderItem).price_at_order ?? (item as OrderShipmentItem).price_at_order ?? 0);
    const netValue = roundMoney(unitPrice * item.quantity * discountFactor);
    const vatAmount = roundMoney(netValue * params.vatRate);
    const incomeClassification = getIncomeClassification(product, params.settings, netValue);
    return {
      id: buildLineId(params.documentId, index),
      document_id: params.documentId,
      line_number: index + 1,
      sku: item.sku,
      variant_suffix: item.variant_suffix || null,
      description: getItemDescription(item, product),
      quantity: item.quantity,
      unit_price: roundMoney(unitPrice * discountFactor),
      net_value: netValue,
      vat_category: vatCategory,
      vat_amount: vatAmount,
      gross_value: roundMoney(netValue + vatAmount),
      measurement_unit: 1,
      item_code: item.sku + (item.variant_suffix || ''),
      income_classification: incomeClassification,
      source_order_line_key: buildOrderLineKey(item as OrderItem),
      line_id: item.line_id || null,
      created_at: new Date().toISOString(),
    };
  });
}

export function buildLegalDocumentFromOrder(params: {
  order: Order;
  customer?: Customer | null;
  products: Product[];
  settings: LegalSettings;
  kind: LegalDocumentKind;
  userName?: string | null;
  delivery?: LegalDeliveryDetails | null;
}): LegalDocument {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const vatRate = params.order.vat_rate ?? params.customer?.vat_rate ?? 0.24;
  const lines = buildLinesFromOrderItems({
    documentId: id,
    items: params.order.items || [],
    products: params.products,
    settings: params.settings,
    vatRate,
    discountPercent: params.order.discount_percent || 0,
  });
  const totals = computeTotals(lines);
  return {
    id,
    order_id: params.order.id,
    shipment_id: null,
    source_kind: 'order',
    document_kind: params.kind,
    aade_document_type: getAadeDocumentTypeForKind(params.kind),
    status: 'draft',
    issue_date: toIsoDate(now),
    issuer: params.settings.issuer,
    counterpart: buildCounterpart(params.order, params.customer),
    delivery: params.kind === 'delivery_note' || params.kind === 'invoice_delivery' ? params.delivery || buildDefaultDeliveryDetails(params.settings, params.customer) : null,
    payment_method_code: params.settings.default_payment_method,
    currency: 'EUR',
    vat_rate: vatRate,
    vat_exemption_category: vatCategoryToExemption(vatRate, params.settings),
    revenue_classification: groupIncomeClassifications(lines),
    totals,
    created_by: params.userName || null,
    created_at: now,
    updated_at: now,
    lines,
  };
}

export function buildLegalDocumentFromShipment(params: {
  order: Order;
  shipment: OrderShipment;
  shipmentItems: OrderShipmentItem[];
  customer?: Customer | null;
  products: Product[];
  settings: LegalSettings;
  kind: LegalDocumentKind;
  userName?: string | null;
  delivery?: LegalDeliveryDetails | null;
}): LegalDocument {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const vatRate = params.order.vat_rate ?? params.customer?.vat_rate ?? 0.24;
  const lines = buildLinesFromOrderItems({
    documentId: id,
    items: params.shipmentItems || [],
    products: params.products,
    settings: params.settings,
    vatRate,
    discountPercent: params.order.discount_percent || 0,
  });
  const totals = computeTotals(lines);
  return {
    id,
    order_id: params.order.id,
    shipment_id: params.shipment.id,
    source_kind: 'shipment',
    document_kind: params.kind,
    aade_document_type: getAadeDocumentTypeForKind(params.kind),
    status: 'draft',
    issue_date: toIsoDate(now),
    issuer: params.settings.issuer,
    counterpart: buildCounterpart(params.order, params.customer),
    delivery: params.kind === 'delivery_note' || params.kind === 'invoice_delivery'
      ? params.delivery || buildDefaultDeliveryDetails(params.settings, params.customer, params.shipment)
      : null,
    payment_method_code: params.settings.default_payment_method,
    currency: 'EUR',
    vat_rate: vatRate,
    vat_exemption_category: vatCategoryToExemption(vatRate, params.settings),
    revenue_classification: groupIncomeClassifications(lines),
    totals,
    created_by: params.userName || null,
    created_at: now,
    updated_at: now,
    lines,
  };
}

export function buildDefaultDeliveryDetails(settings: LegalSettings, customer?: Customer | null, shipment?: OrderShipment): LegalDeliveryDetails {
  const dispatchAt = shipment?.shipped_at || new Date().toISOString();
  return {
    dispatch_date: toXmlDateTimeDate(dispatchAt),
    dispatch_time: toXmlTime(dispatchAt),
    move_purpose: settings.default_move_purpose,
    vehicle_number: '',
    loading_address: settings.loading_address || settings.issuer.address || null,
    delivery_address: customer?.address ? parseAddress(customer.address) : null,
    carrier_id: null,
    carrier_name: null,
    carrier_vat_number: null,
    carrier_vehicle_number: null,
    notes: shipment?.notes || null,
  };
}

function vatCategoryToExemption(vatRate: number, settings: LegalSettings): number | null {
  return Math.abs(vatRate) < 0.001 ? settings.default_vat_exemption_category || null : null;
}

export function validateLegalDocument(document: LegalDocument, lines: LegalDocumentLine[] = document.lines || []): LegalValidationIssue[] {
  const issues: LegalValidationIssue[] = [];
  const isDelivery = document.document_kind === 'delivery_note' || document.document_kind === 'invoice_delivery';

  if (!normalizeVatNumber(document.issuer.vat_number)) {
    issues.push({ field: 'issuer.vat_number', severity: 'error', message: 'Συμπληρώστε ΑΦΜ εκδότη στις ρυθμίσεις.' });
  }
  if (!normalizeVatNumber(document.counterpart.vat_number)) {
    issues.push({ field: 'counterpart.vat_number', severity: 'error', message: 'Ο πελάτης χρειάζεται έγκυρο ΑΦΜ για B2B παραστατικό.' });
  }
  if (!document.issue_date) {
    issues.push({ field: 'issue_date', severity: 'error', message: 'Λείπει ημερομηνία έκδοσης.' });
  }
  if (!lines.length) {
    issues.push({ field: 'lines', severity: 'error', message: 'Το παραστατικό δεν έχει γραμμές.' });
  }

  for (const line of lines) {
    if (line.quantity <= 0) issues.push({ field: `line.${line.line_number}.quantity`, severity: 'error', message: `Η γραμμή ${line.line_number} έχει μηδενική ποσότητα.` });
    if (line.net_value < 0) issues.push({ field: `line.${line.line_number}.net_value`, severity: 'error', message: `Η γραμμή ${line.line_number} έχει αρνητική αξία.` });
    if (line.vat_category === 7 && !document.vat_exemption_category) {
      issues.push({ field: `line.${line.line_number}.vat_exemption`, severity: 'error', message: 'Τα παραστατικά χωρίς ΦΠΑ χρειάζονται αιτία εξαίρεσης ΦΠΑ.' });
    }
    if (!line.income_classification?.classification_category) {
      issues.push({ field: `line.${line.line_number}.classification`, severity: 'error', message: `Η γραμμή ${line.line_number} δεν έχει χαρακτηρισμό εσόδου.` });
    }
  }

  const expectedTotals = computeTotals(lines);
  if (Math.abs(expectedTotals.gross - document.totals.gross) > 0.02) {
    issues.push({ field: 'totals', severity: 'error', message: 'Τα σύνολα δεν συμφωνούν με τις γραμμές.' });
  }

  if (isDelivery) {
    const delivery = document.delivery;
    if (!delivery?.dispatch_date || !delivery?.dispatch_time) {
      issues.push({ field: 'delivery.dispatch', severity: 'error', message: 'Συμπληρώστε ημερομηνία και ώρα διακίνησης.' });
    }
    if (!delivery?.move_purpose) {
      issues.push({ field: 'delivery.move_purpose', severity: 'error', message: 'Συμπληρώστε σκοπό διακίνησης.' });
    }
    if (!delivery?.loading_address?.street || !delivery?.delivery_address?.street) {
      issues.push({ field: 'delivery.addresses', severity: 'error', message: 'Συμπληρώστε διεύθυνση φόρτωσης και παράδοσης.' });
    }
    if (!delivery?.vehicle_number && !delivery?.carrier_vehicle_number) {
      issues.push({ field: 'delivery.vehicle', severity: 'warning', message: 'Δεν έχει δηλωθεί όχημα. Συμπληρώστε το πριν τη διακίνηση αν απαιτείται.' });
    }
  }

  return issues;
}

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlTag(name: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

function xmlMoney(value: number): string {
  return roundMoney(value).toFixed(2);
}

function buildAddressXml(tag: string, address?: LegalPartyAddress | null): string {
  if (!address?.street && !address?.city && !address?.postal_code) return '';
  return `<${tag}>${[
    xmlTag('street', address.street || '-'),
    xmlTag('number', address.number || '0'),
    xmlTag('postalCode', address.postal_code || '00000'),
    xmlTag('city', address.city || '-'),
  ].join('')}</${tag}>`;
}

function buildPartyXml(tag: string, party: LegalParty, includeAddress = true): string {
  const vat = normalizeVatNumber(party.vat_number);
  const children = [
    xmlTag('vatNumber', vat),
    xmlTag('country', party.country || 'GR'),
    xmlTag('branch', party.branch ?? 0),
    includeAddress ? buildAddressXml('address', party.address) : '',
  ].join('');
  return `<${tag}>${children}</${tag}>`;
}

function buildIncomeClassificationXml(item: LegalIncomeClassification): string {
  return `<incomeClassification>${[
    xmlTag('classificationType', item.classification_type),
    xmlTag('classificationCategory', item.classification_category),
    xmlTag('amount', xmlMoney(item.amount)),
  ].join('')}</incomeClassification>`;
}

function buildHeaderXml(document: LegalDocument): string {
  const isDelivery = document.document_kind === 'delivery_note' || document.document_kind === 'invoice_delivery';
  const delivery = document.delivery;
  const header = [
    xmlTag('series', document.series || ''),
    xmlTag('aa', document.aa || ''),
    xmlTag('issueDate', document.issue_date),
    xmlTag('invoiceType', document.aade_document_type),
    xmlTag('currency', document.currency || 'EUR'),
    isDelivery ? xmlTag('dispatchDate', toXmlDateTimeDate(delivery?.dispatch_date)) : '',
    isDelivery ? xmlTag('dispatchTime', toXmlTime(delivery?.dispatch_time)) : '',
    isDelivery ? xmlTag('vehicleNumber', delivery?.vehicle_number || delivery?.carrier_vehicle_number) : '',
    isDelivery ? xmlTag('movePurpose', delivery?.move_purpose) : '',
    isDelivery && delivery?.move_purpose === 19 ? xmlTag('otherMovePurposeTitle', delivery?.move_purpose_title || 'Λοιπή διακίνηση') : '',
    isDelivery ? xmlTag('isDeliveryNote', 'true') : '',
    isDelivery ? `<otherDeliveryNoteHeader>${[
      buildAddressXml('loadingAddress', delivery?.loading_address),
      buildAddressXml('deliveryAddress', delivery?.delivery_address),
    ].join('')}</otherDeliveryNoteHeader>` : '',
  ].join('');
  return `<invoiceHeader>${header}</invoiceHeader>`;
}

function buildPaymentXml(document: LegalDocument): string {
  if (document.document_kind === 'delivery_note') return '';
  return `<paymentMethods><paymentMethodDetails>${[
    xmlTag('type', document.payment_method_code),
    xmlTag('amount', xmlMoney(document.totals.gross)),
  ].join('')}</paymentMethodDetails></paymentMethods>`;
}

function buildLineXml(line: LegalDocumentLine, document: LegalDocument): string {
  return `<invoiceDetails>${[
    xmlTag('lineNumber', line.line_number),
    xmlTag('quantity', line.quantity),
    xmlTag('measurementUnit', line.measurement_unit),
    xmlTag('netValue', xmlMoney(line.net_value)),
    xmlTag('vatCategory', line.vat_category),
    xmlTag('vatAmount', xmlMoney(line.vat_amount)),
    line.vat_category === 7 ? xmlTag('vatExemptionCategory', document.vat_exemption_category) : '',
    xmlTag('itemCode', line.item_code),
    buildIncomeClassificationXml(line.income_classification),
  ].join('')}</invoiceDetails>`;
}

function buildSummaryXml(document: LegalDocument): string {
  return `<invoiceSummary>${[
    xmlTag('totalNetValue', xmlMoney(document.totals.net)),
    xmlTag('totalVatAmount', xmlMoney(document.totals.vat)),
    xmlTag('totalWithheldAmount', '0.00'),
    xmlTag('totalFeesAmount', '0.00'),
    xmlTag('totalStampDutyAmount', '0.00'),
    xmlTag('totalOtherTaxesAmount', '0.00'),
    xmlTag('totalDeductionsAmount', '0.00'),
    xmlTag('totalGrossValue', xmlMoney(document.totals.gross)),
    document.revenue_classification.map(buildIncomeClassificationXml).join(''),
  ].join('')}</invoiceSummary>`;
}

export function buildAadeInvoiceXml(document: LegalDocument, lines: LegalDocumentLine[] = document.lines || []): string {
  const invoice = [
    buildPartyXml('issuer', document.issuer, true),
    buildPartyXml('counterpart', document.counterpart, true),
    buildHeaderXml(document),
    buildPaymentXml(document),
    lines.map((line) => buildLineXml(line, document)).join(''),
    buildSummaryXml({ ...document, revenue_classification: groupIncomeClassifications(lines), totals: computeTotals(lines) }),
  ].join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    `<invoice>${invoice}</invoice>`,
    '</InvoicesDoc>',
  ].join('');
}

function findXmlValue(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i'));
  return match?.[1]?.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
}

export function parseAadeResponseXml(xml: string) {
  const errorMatches = Array.from(xml.matchAll(/<(?:\w+:)?message>([\s\S]*?)<\/(?:\w+:)?message>/gi));
  return {
    statusCode: findXmlValue(xml, 'statusCode'),
    invoiceUid: findXmlValue(xml, 'invoiceUid'),
    invoiceMark: findXmlValue(xml, 'invoiceMark'),
    classificationMark: findXmlValue(xml, 'classificationMark'),
    cancellationMark: findXmlValue(xml, 'cancellationMark'),
    authenticationCode: findXmlValue(xml, 'authenticationCode'),
    qrUrl: findXmlValue(xml, 'qrUrl'),
    errors: errorMatches.map((m) => m[1].trim()).filter(Boolean),
  };
}

export function canPrintLegalDocument(document: LegalDocument): boolean {
  return document.status === 'issued' && !!document.aade_mark && !!document.qr_url;
}

export function getLegalDocumentDisplayNumber(document: Pick<LegalDocument, 'series' | 'aa' | 'id'>): string {
  if (document.series && document.aa) return `${document.series}-${document.aa}`;
  return document.id.slice(0, 8);
}
