import {
  AadeDocumentType,
  AadeProxyResult,
  AadeTransmittedDocsParseResult,
  Customer,
  LegalDeliveryDetails,
  LegalDocument,
  LegalDocumentKind,
  LegalDocumentLine,
  LegalNumberingSequence,
  LegalIncomeClassification,
  LegalParty,
  LegalPartyAddress,
  LegalSettings,
  LegalSyncParams,
  LegalTotals,
  LegalValidationIssue,
  Order,
  OrderItem,
  OrderShipment,
  OrderShipmentItem,
  Product,
  ProformaDocument,
  ProformaDocumentLine,
  ProductionType,
} from '../types';

export const LEGAL_SETTINGS_ID = '00000000-0000-0000-0000-000000000091';

export function isLegalDocumentEditable(document: Pick<LegalDocument, 'status'>): boolean {
  return document.status === 'draft' || document.status === 'failed';
}

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
  1: 'Επαγ. λογαριασμός ημεδαπής',
  2: 'Επαγ. λογαριασμός αλλοδαπής',
  3: 'Μετρητά',
  4: 'Επιταγή',
  5: 'Επί πιστώσει',
  6: 'Web Banking',
  7: 'POS / e-POS',
  8: 'Άμεσες πληρωμές IRIS',
};

export const PAYMENT_METHOD_CODES = [5, 1, 2, 3, 4, 6, 7, 8];

/** Official myDATA vatCategory codes — each code is distinct even when the rate matches (e.g. 6 vs 10). */
export const AADE_VAT_CATEGORY_OPTIONS = [
  { value: 0.24, category: 1, label: '24%' },
  { value: 0.17, category: 4, label: '17%' },
  { value: 0.13, category: 2, label: '13%' },
  { value: 0.09, category: 5, label: '9%' },
  { value: 0.06, category: 3, label: '6%' },
  { value: 0.04, category: 6, label: '4%' },
  { value: 0.03, category: 9, label: '3%' },
  { value: 0, category: 7, label: '0% χωρίς ΦΠΑ' },
  { value: 0, category: 8, label: 'Χωρίς ΦΠΑ - λογιστική εγγραφή' },
  { value: 0.04, category: 10, label: '4% αρ.31 ν.5057/2023' },
];

/** Practical subset for invoice line rows (excludes category 8 — accounting entries, not sales invoices). */
export const AADE_VAT_CATEGORY_LINE_OPTIONS = AADE_VAT_CATEGORY_OPTIONS.filter((option) => option.category !== 8);

export const AADE_REVENUE_CLASSIFICATION_COMBINATIONS: Partial<Record<AadeDocumentType, Array<[string, string]>>> = {
  '1.1': [
    ['category1_1', 'E3_561_001'],
    ['category1_1', 'E3_561_002'],
    ['category1_1', 'E3_561_007'],
    ['category1_2', 'E3_561_001'],
    ['category1_2', 'E3_561_002'],
    ['category1_2', 'E3_561_007'],
    ['category1_3', 'E3_561_001'],
    ['category1_3', 'E3_561_002'],
    ['category1_3', 'E3_561_007'],
    ['category1_3', 'E3_563'],
    ['category1_4', 'E3_880_001'],
    ['category1_5', 'E3_561_007'],
    ['category1_5', 'E3_562'],
    ['category1_5', 'E3_563'],
    ['category1_5', 'E3_564'],
    ['category1_5', 'E3_565'],
    ['category1_5', 'E3_566'],
    ['category1_5', 'E3_567'],
    ['category1_5', 'E3_568'],
    ['category1_5', 'E3_570'],
    ['category1_5', 'E3_561_002'],
    ['category1_7', 'E3_881_001'],
    ['category1_7', 'E3_881_003'],
    ['category1_7', 'E3_881_004'],
    ['category1_95', 'E3_596'],
    ['category1_95', 'E3_597'],
  ],
  '5.2': [
    ['category1_1', 'E3_561_001'],
    ['category1_1', 'E3_561_002'],
    ['category1_1', 'E3_561_005'],
    ['category1_1', 'E3_561_006'],
    ['category1_1', 'E3_561_007'],
    ['category1_2', 'E3_561_001'],
    ['category1_2', 'E3_561_002'],
    ['category1_2', 'E3_561_005'],
    ['category1_2', 'E3_561_006'],
    ['category1_2', 'E3_561_007'],
    ['category1_3', 'E3_561_001'],
    ['category1_3', 'E3_561_002'],
    ['category1_3', 'E3_561_005'],
    ['category1_3', 'E3_561_006'],
    ['category1_3', 'E3_561_007'],
    ['category1_3', 'E3_563'],
    ['category1_4', 'E3_880_001'],
    ['category1_4', 'E3_880_003'],
    ['category1_4', 'E3_880_004'],
    ['category1_5', 'E3_561_005'],
    ['category1_5', 'E3_561_006'],
    ['category1_5', 'E3_561_007'],
    ['category1_5', 'E3_562'],
    ['category1_5', 'E3_563'],
    ['category1_5', 'E3_564'],
    ['category1_5', 'E3_565'],
    ['category1_5', 'E3_566'],
    ['category1_5', 'E3_567'],
    ['category1_5', 'E3_568'],
    ['category1_5', 'E3_570'],
    ['category1_5', 'E3_561_002'],
    ['category1_7', 'E3_881_001'],
    ['category1_7', 'E3_881_003'],
    ['category1_7', 'E3_881_004'],
    ['category1_95', ''],
  ],
  '9.3': [
    ['category3', ''],
  ],
};

export const AADE_INCOME_CATEGORY_LABELS: Record<string, string> = {
  category1_1: 'Πώληση εμπορευμάτων',
  category1_2: 'Πώληση προϊόντων',
  category1_3: 'Παροχή υπηρεσιών',
  category1_4: 'Πώληση παγίων',
  category1_5: 'Λοιπά έσοδα / κέρδη',
  category1_6: 'Αυτοπαραδόσεις / ιδιοχρησιμοποιήσεις',
  category1_7: 'Έσοδα για λογαριασμό τρίτων',
  category1_8: 'Έσοδα προηγούμενων χρήσεων',
  category1_9: 'Έσοδα επόμενων χρήσεων',
  category1_10: 'Λοιπές εγγραφές τακτοποίησης εσόδων',
  category1_95: 'Λοιπά πληροφοριακά στοιχεία εσόδων',
  category3: 'Διακίνηση χωρίς ενημέρωση Ε3',
};

export const AADE_INCOME_TYPE_LABELS: Record<string, string> = {
  E3_561_001: 'Χονδρικές πωλήσεις σε επαγγελματίες',
  E3_561_002: 'Χονδρικές πωλήσεις άρθρου 39α ΦΠΑ',
  E3_561_005: 'Πωλήσεις εξωτερικού - ενδοκοινοτικές',
  E3_561_006: 'Πωλήσεις εξωτερικού - τρίτες χώρες',
  E3_561_007: 'Λοιπές πωλήσεις αγαθών και υπηρεσιών',
  E3_562: 'Λοιπά συνήθη έσοδα',
  E3_563: 'Πιστωτικοί τόκοι και συναφή έσοδα',
  E3_564: 'Πιστωτικές συναλλαγματικές διαφορές',
  E3_565: 'Έσοδα συμμετοχών',
  E3_566: 'Κέρδη από διάθεση μη κυκλοφορούντων στοιχείων',
  E3_567: 'Κέρδη από αναστροφή προβλέψεων / απομειώσεων',
  E3_568: 'Κέρδη από επιμέτρηση στην εύλογη αξία',
  E3_570: 'Ασυνήθη έσοδα και κέρδη',
  E3_596: 'Επιδοτήσεις - επιχορηγήσεις',
  E3_597: 'Επιχορηγήσεις επενδύσεων / κάλυψη δαπανών',
  E3_880_001: 'Πωλήσεις παγίων χονδρικές',
  E3_880_003: 'Πωλήσεις παγίων ενδοκοινοτικές',
  E3_880_004: 'Πωλήσεις παγίων τρίτων χωρών',
  E3_881_001: 'Πωλήσεις για λογαριασμό τρίτων χονδρικές',
  E3_881_003: 'Πωλήσεις για λογαριασμό τρίτων ενδοκοινοτικές',
  E3_881_004: 'Πωλήσεις για λογαριασμό τρίτων τρίτων χωρών',
};

export const AADE_INCOME_CATEGORY_OPTIONS = Object.entries(AADE_INCOME_CATEGORY_LABELS)
  .map(([value, label]) => ({ value, label: `${label} (${value})` }));

export const AADE_INCOME_TYPE_OPTIONS = Object.entries(AADE_INCOME_TYPE_LABELS)
  .map(([value, label]) => ({ value, label: `${label} (${value})` }));

export function formatAadeIncomeCategoryLabel(code: string | null | undefined): string {
  const value = String(code || '').trim();
  if (!value) return '—';
  const label = AADE_INCOME_CATEGORY_LABELS[value];
  return label ? `${label} (${value})` : value;
}

export function formatAadeIncomeTypeLabel(code: string | null | undefined): string {
  const value = String(code || '').trim();
  if (!value) return '—';
  const label = AADE_INCOME_TYPE_LABELS[value];
  return label ? `${label} (${value})` : value;
}

export function getAllowedIncomeTypeOptions(
  documentType: AadeDocumentType,
  category?: string | null,
): Array<{ value: string; label: string }> {
  const combinations = AADE_REVENUE_CLASSIFICATION_COMBINATIONS[documentType];
  if (!combinations) return AADE_INCOME_TYPE_OPTIONS;
  const normalizedCategory = String(category || '').trim();
  const allowedTypes = new Set(
    combinations
      .filter(([cat, type]) => type && (!normalizedCategory || cat === normalizedCategory))
      .map(([, type]) => type),
  );
  if (!allowedTypes.size) {
    return AADE_INCOME_TYPE_OPTIONS.filter((option) =>
      combinations.some(([, type]) => type === option.value),
    );
  }
  return AADE_INCOME_TYPE_OPTIONS.filter((option) => allowedTypes.has(option.value));
}

export function getAadeDocumentTypeForKind(kind: LegalDocumentKind): AadeDocumentType {
  if (kind === 'delivery_note') return '9.3';
  if (kind === 'credit') return '5.2';
  return '1.1';
}

/** True when myDATA XML should carry dispatch / delivery-note header fields. */
export function documentIncludesDeliveryNote(document: Pick<LegalDocument, 'document_kind'>): boolean {
  return document.document_kind === 'delivery_note' || document.document_kind === 'invoice_delivery';
}

export function applyLegalDocumentDeliveryToggle(
  document: LegalDocument,
  includeDeliveryNote: boolean,
  settings: LegalSettings,
  customer?: Customer | null,
): LegalDocument {
  if (document.document_kind === 'delivery_note' || document.document_kind === 'credit') {
    return document;
  }
  if (!includeDeliveryNote) {
    return {
      ...document,
      document_kind: 'invoice',
      aade_document_type: '1.1',
      delivery: null,
    };
  }
  return {
    ...document,
    document_kind: 'invoice_delivery',
    aade_document_type: '1.1',
    delivery: document.delivery || buildDefaultDeliveryDetails(settings, customer),
  };
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
  if (Math.abs(vatRate - 0.09) < 0.001) return 5;
  if (Math.abs(vatRate - 0.06) < 0.001) return 3;
  if (Math.abs(vatRate - 0.04) < 0.001) return 6;
  if (Math.abs(vatRate - 0.03) < 0.001) return 9;
  if (Math.abs(vatRate) < 0.001) return 7;
  return 1;
}

export function roundMoney(value: number): number {
  return Number((Math.round((Number(value) || 0) * 100) / 100).toFixed(2));
}

export function toIsoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

/** AADE query endpoints (RequestDocs / RequestTransmittedDocs) expect dd/MM/yyyy. */
export function toAadeQueryDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  const greekMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (greekMatch) return trimmed;
  return trimmed;
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

export function isGreekParty(party: Pick<LegalParty, 'country'>): boolean {
  const country = String(party.country || 'GR').trim().toUpperCase();
  return country === 'GR' || country === 'EL';
}

export function isValidGreekVatNumber(value?: string | null): boolean {
  const digits = normalizeVatNumber(value);
  if (!/^\d{9}$/.test(digits) || digits === '000000000') return false;
  let sum = 0;
  for (let index = 0; index < 8; index += 1) {
    sum += Number(digits.charAt(index)) * (2 ** (8 - index));
  }
  const remainder = sum % 11;
  const expectedCheckDigit = remainder % 10;
  return expectedCheckDigit === Number(digits.charAt(8));
}

function collapseAddressWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parseStreetAndNumber(part: string): Pick<LegalPartyAddress, 'street' | 'number'> {
  const trimmed = collapseAddressWhitespace(part);
  if (!trimmed) return { street: '', number: '' };

  const match = trimmed.match(/^(.+?)\s+(\d+(?:[Α-ΩA-Zα-ωa-z])?(?:\s*-\s*\d+(?:[Α-ΩA-Zα-ωa-z])?)?)$/u);
  if (match) {
    return {
      street: match[1].trim(),
      number: match[2].replace(/\s*-\s*/g, '-'),
    };
  }
  return { street: trimmed, number: '' };
}

function parsePostalAndCity(part: string): Pick<LegalPartyAddress, 'postal_code' | 'city'> {
  const trimmed = collapseAddressWhitespace(part.replace(/,/g, ' '));
  if (!trimmed) return { postal_code: '', city: '' };

  const match = trimmed.match(/^(\d{5})\s*[-–—]?\s*(.+)$/);
  if (match) {
    return { postal_code: match[1], city: match[2].trim() };
  }
  return { postal_code: '', city: trimmed };
}

function parseGreekAddressString(raw: string): LegalPartyAddress {
  const cleaned = raw.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return { street: '', number: '', postal_code: '', city: '' };

  const lines = cleaned.split('\n').map((line) => collapseAddressWhitespace(line)).filter(Boolean);
  if (lines.length >= 2) {
    const streetPart = parseStreetAndNumber(lines[0]);
    const locationPart = parsePostalAndCity(lines.slice(1).join(' '));
    if (locationPart.postal_code || locationPart.city) {
      return { ...streetPart, ...locationPart };
    }
  }

  const singleLine = collapseAddressWhitespace(cleaned.replace(/\n/g, ' ')).replace(/,/g, ' ');
  const fullMatch = singleLine.match(/^(.+?)\s+(\d{5})\s*[-–—]?\s*(.+)$/);
  if (fullMatch) {
    const streetPart = parseStreetAndNumber(fullMatch[1]);
    return {
      ...streetPart,
      postal_code: fullMatch[2],
      city: fullMatch[3].trim(),
    };
  }

  const streetOnly = parseStreetAndNumber(singleLine);
  return { ...streetOnly, postal_code: '', city: '' };
}

/** Parses VIES/AFM-style Greek addresses into structured legal fields. */
export function parseLegalPartyAddress(address?: string | LegalPartyAddress | null): LegalPartyAddress | null {
  if (!address) return null;

  if (typeof address === 'string') {
    const parsed = parseGreekAddressString(address);
    return parsed.street || parsed.postal_code || parsed.city ? parsed : null;
  }

  const { street, number, postal_code, city } = address;
  const hasStructuredFields = Boolean(number || postal_code || city);
  if (street && !hasStructuredFields) {
    return parseGreekAddressString(street);
  }
  if (street && (!number || !postal_code || !city)) {
    const reparsed = parseGreekAddressString(street);
    if (reparsed.postal_code || reparsed.city) {
      return {
        street: reparsed.street || street,
        number: number || reparsed.number || '',
        postal_code: postal_code || reparsed.postal_code || '',
        city: city || reparsed.city || '',
      };
    }
  }
  return {
    street: street || '',
    number: number || '',
    postal_code: postal_code || '',
    city: city || '',
  };
}

function buildEmptyCounterpart(): LegalParty {
  return {
    vat_number: '',
    country: 'GR',
    branch: 0,
    name: '',
    address: null,
    phone: null,
    email: null,
  };
}

export function buildCounterpartFromCustomer(customer?: Customer | null): LegalParty {
  if (!customer) return buildEmptyCounterpart();
  return {
    vat_number: normalizeVatNumber(customer.vat_number),
    country: 'GR',
    branch: 0,
    name: customer.full_name,
    address: customer.address ? parseLegalPartyAddress(customer.address) : null,
    phone: customer.phone || null,
    email: customer.email || null,
  };
}

function buildCounterpart(order: Order, customer?: Customer | null): LegalParty {
  return {
    ...buildCounterpartFromCustomer(customer),
    name: customer?.full_name || order.customer_name,
    phone: customer?.phone || order.customer_phone || buildCounterpartFromCustomer(customer).phone,
  };
}

/** Invoice/proforma line description: product category from Μητρώο (e.g. Δαχτυλίδι), not STX description. */
export function getLegalProductLineDescription(
  product?: Pick<Product, 'category' | 'sku'> | null,
  fallbackSku?: string,
): string {
  const category = String(product?.category || '').trim();
  if (category) return category;
  return String(fallbackSku || product?.sku || '').trim() || '—';
}

function getItemDescription(item: OrderItem | OrderShipmentItem, product?: Product): string {
  return getLegalProductLineDescription(product, item.sku);
}

function normalizeIncomeClassificationForDocumentType(
  documentType: AadeDocumentType | undefined,
  item: LegalIncomeClassification,
): LegalIncomeClassification {
  if (documentType === '9.3') {
    return {
      classification_category: 'category3',
      classification_type: '',
      amount: item.amount,
    };
  }
  return item;
}

function isAllowedIncomeClassification(documentType: AadeDocumentType, item: LegalIncomeClassification): boolean {
  if (documentType === '5.1') return false;
  const combinations = AADE_REVENUE_CLASSIFICATION_COMBINATIONS[documentType];
  if (!combinations) return true;
  const category = String(item.classification_category || '').trim();
  const type = String(item.classification_type || '').trim();
  return combinations.some(([allowedCategory, allowedType]) => allowedCategory === category && allowedType === type);
}

function getIncomeClassification(product: Product | undefined, settings: LegalSettings, amount: number, documentType?: AadeDocumentType): LegalIncomeClassification {
  const imported = product?.production_type === ProductionType.Imported;
  return normalizeIncomeClassificationForDocumentType(documentType, {
    classification_category: imported
      ? settings.imported_income_classification_category
      : settings.inhouse_income_classification_category,
    classification_type: imported
      ? settings.imported_income_classification_type
      : settings.inhouse_income_classification_type,
    amount: roundMoney(amount),
  });
}

export function getLegalCatalogLineDetails(
  product: Product,
  settings: LegalSettings,
  variant_suffix?: string | null,
  aadeDocumentType?: AadeDocumentType,
) {
  const variant = variant_suffix
    ? product.variants?.find((item) => item.suffix === variant_suffix)
    : product.variants?.find((item) => item.suffix === '') || null;
  const suffix = variant?.suffix ?? variant_suffix ?? null;
  const unitPrice = Number(variant?.selling_price || product.selling_price || product.active_price || 0);
  return {
    sku: product.sku,
    variant_suffix: suffix,
    item_code: product.sku + (suffix || ''),
    description: getLegalProductLineDescription(product),
    unit_price: unitPrice,
    income_classification: getIncomeClassification(product, settings, unitPrice, aadeDocumentType),
  };
}

export function computeLegalTotals(lines: Array<Pick<LegalDocumentLine, 'net_value' | 'vat_amount' | 'gross_value' | 'quantity'>>): LegalTotals {
  return {
    net: roundMoney(lines.reduce((sum, line) => sum + line.net_value, 0)),
    vat: roundMoney(lines.reduce((sum, line) => sum + line.vat_amount, 0)),
    gross: roundMoney(lines.reduce((sum, line) => sum + line.gross_value, 0)),
    quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

export function groupIncomeClassifications(lines: Array<Pick<LegalDocumentLine, 'income_classification'>>): LegalIncomeClassification[] {
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
  aadeDocumentType?: AadeDocumentType;
}): LegalDocumentLine[] {
  const vatCategory = vatRateToAadeCategory(params.vatRate);
  const discountFactor = 1 - ((params.discountPercent || 0) / 100);

  return params.items.map((item, index) => {
    const product = params.products.find((p) => p.sku === item.sku);
    const unitPrice = Number((item as OrderItem).price_at_order ?? (item as OrderShipmentItem).price_at_order ?? 0);
    const netValue = roundMoney(unitPrice * item.quantity * discountFactor);
    const vatAmount = roundMoney(netValue * params.vatRate);
    const incomeClassification = getIncomeClassification(product, params.settings, netValue, params.aadeDocumentType);
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

function defaultIncomeClassification(settings: LegalSettings, amount: number): LegalIncomeClassification {
  return {
    classification_category: settings.default_income_classification_category,
    classification_type: settings.default_income_classification_type,
    amount: roundMoney(amount),
  };
}

function defaultIncomeClassificationForDocumentType(settings: LegalSettings, amount: number, documentType?: AadeDocumentType): LegalIncomeClassification {
  return normalizeIncomeClassificationForDocumentType(documentType, defaultIncomeClassification(settings, amount));
}

function vatCategoryToRate(category: number, fallbackRate: number): number {
  if (category === 1) return 0.24;
  if (category === 4) return 0.17;
  if (category === 2) return 0.13;
  if (category === 5) return 0.09;
  if (category === 3) return 0.06;
  if (category === 6 || category === 10) return 0.04;
  if (category === 9) return 0.03;
  if (category === 7 || category === 8) return 0;
  return fallbackRate;
}

export function recalculateLegalLine(
  line: LegalDocumentLine,
  settings: LegalSettings,
  vatRate?: number | null,
  aadeDocumentType?: AadeDocumentType,
): LegalDocumentLine {
  const preserveManualCategory = vatRate === undefined || vatRate === null;
  const manualCategory = Number(line.vat_category) || 1;
  const rate = preserveManualCategory ? vatCategoryToRate(manualCategory, 0.24) : vatRate;
  const quantity = Number(line.quantity) || 0;
  const unitPrice = roundMoney(Number(line.unit_price) || 0);
  const netValue = roundMoney(quantity * unitPrice);
  const vatAmount = roundMoney(netValue * rate);
  return {
    ...line,
    quantity,
    unit_price: unitPrice,
    net_value: netValue,
    vat_category: preserveManualCategory ? manualCategory : vatRateToAadeCategory(rate),
    vat_amount: vatAmount,
    gross_value: roundMoney(netValue + vatAmount),
    measurement_unit: Number(line.measurement_unit) || 1,
    item_code: line.item_code || line.sku,
    income_classification: normalizeIncomeClassificationForDocumentType(aadeDocumentType, {
      ...(line.income_classification || defaultIncomeClassificationForDocumentType(settings, netValue, aadeDocumentType)),
      amount: netValue,
    }),
  };
}

export function createManualLegalDocumentLine(params: {
  documentId: string;
  lineNumber: number;
  settings: LegalSettings;
  sku?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  vatRate?: number;
  itemCode?: string | null;
  aadeDocumentType?: AadeDocumentType;
}): LegalDocumentLine {
  const netValue = roundMoney((params.quantity || 1) * (params.unitPrice || 0));
  return recalculateLegalLine({
    id: crypto.randomUUID(),
    document_id: params.documentId,
    line_number: params.lineNumber,
    sku: params.sku || '',
    variant_suffix: null,
    description: params.description || '',
    quantity: params.quantity || 1,
    unit_price: roundMoney(params.unitPrice || 0),
    net_value: netValue,
    vat_category: vatRateToAadeCategory(params.vatRate ?? 0.24),
    vat_amount: roundMoney(netValue * (params.vatRate ?? 0.24)),
    gross_value: roundMoney(netValue * (1 + (params.vatRate ?? 0.24))),
    measurement_unit: 1,
    item_code: params.itemCode || params.sku || '',
    income_classification: defaultIncomeClassificationForDocumentType(params.settings, netValue, params.aadeDocumentType),
    source_order_line_key: null,
    line_id: null,
    created_at: new Date().toISOString(),
  }, params.settings, params.vatRate ?? 0.24, params.aadeDocumentType);
}

export function recalculateLegalDocument(
  document: LegalDocument,
  lines: LegalDocumentLine[] = document.lines || [],
  settings: LegalSettings,
): { document: LegalDocument; lines: LegalDocumentLine[] } {
  const recalculatedLines = lines.map((line, index) =>
    recalculateLegalLine({
      ...line,
      document_id: document.id,
      line_number: index + 1,
    }, settings, undefined, document.aade_document_type)
  );
  const totals = computeLegalTotals(recalculatedLines);
  return {
    lines: recalculatedLines,
    document: {
      ...document,
      totals,
      revenue_classification: groupIncomeClassifications(recalculatedLines),
      updated_at: new Date().toISOString(),
      lines: recalculatedLines,
    },
  };
}

function toProformaLine(line: LegalDocumentLine, proformaId: string): ProformaDocumentLine {
  return {
    ...line,
    id: crypto.randomUUID(),
    document_id: proformaId,
    proforma_id: proformaId,
  };
}

export function buildManualLegalDocument(params: {
  settings: LegalSettings;
  kind: LegalDocumentKind;
  userName?: string | null;
  customer?: Customer | null;
}): LegalDocument {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const vatRate = params.customer?.vat_rate ?? 0.24;
  const aadeDocumentType = getAadeDocumentTypeForKind(params.kind);
  const line = createManualLegalDocumentLine({
    documentId: id,
    lineNumber: 1,
    settings: params.settings,
    vatRate,
    aadeDocumentType,
  });
  const lines = [line];
  const totals = computeLegalTotals(lines);
  const isDelivery = params.kind === 'delivery_note' || params.kind === 'invoice_delivery';
  return {
    id,
    order_id: null,
    shipment_id: null,
    source_kind: 'manual',
    document_kind: params.kind,
    aade_document_type: aadeDocumentType,
    status: 'draft',
    issue_date: toIsoDate(now),
    issuer: params.settings.issuer,
    counterpart: buildCounterpartFromCustomer(params.customer),
    delivery: isDelivery ? buildDefaultDeliveryDetails(params.settings, params.customer) : null,
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

export function buildManualProforma(params: {
  settings: LegalSettings;
  userName?: string | null;
  customer?: Customer | null;
}): ProformaDocument {
  const legalLike = buildManualLegalDocument({
    settings: params.settings,
    kind: 'invoice',
    userName: params.userName,
    customer: params.customer,
  });
  const now = new Date().toISOString();
  const lines = (legalLike.lines || []).map((line) => toProformaLine(line, legalLike.id));
  return {
    id: legalLike.id,
    order_id: null,
    shipment_id: null,
    source_kind: 'manual',
    document_kind: 'proforma',
    status: 'draft',
    series: null,
    aa: null,
    issue_date: legalLike.issue_date,
    valid_until: null,
    issuer: legalLike.issuer,
    counterpart: legalLike.counterpart,
    payment_method_code: legalLike.payment_method_code,
    currency: legalLike.currency,
    vat_rate: legalLike.vat_rate,
    vat_exemption_category: legalLike.vat_exemption_category,
    revenue_classification: legalLike.revenue_classification,
    totals: legalLike.totals,
    notes: null,
    converted_legal_document_id: null,
    converted_at: null,
    voided_at: null,
    aade_mark: null,
    created_by: params.userName || null,
    created_at: now,
    updated_at: now,
    lines,
  };
}

export function buildProformaFromOrder(params: {
  order: Order;
  customer?: Customer | null;
  products: Product[];
  settings: LegalSettings;
  userName?: string | null;
}): ProformaDocument {
  const legalLike = buildLegalDocumentFromOrder({
    order: params.order,
    customer: params.customer,
    products: params.products,
    settings: params.settings,
    kind: 'invoice',
    userName: params.userName,
  });
  const now = new Date().toISOString();
  const lines = (legalLike.lines || []).map((line) => toProformaLine(line, legalLike.id));
  return {
    id: legalLike.id,
    order_id: params.order.id,
    shipment_id: null,
    source_kind: 'order',
    document_kind: 'proforma',
    status: 'draft',
    series: null,
    aa: null,
    issue_date: legalLike.issue_date,
    valid_until: null,
    issuer: legalLike.issuer,
    counterpart: legalLike.counterpart,
    payment_method_code: legalLike.payment_method_code,
    currency: legalLike.currency,
    vat_rate: legalLike.vat_rate,
    vat_exemption_category: legalLike.vat_exemption_category,
    revenue_classification: legalLike.revenue_classification,
    totals: legalLike.totals,
    notes: null,
    converted_legal_document_id: null,
    converted_at: null,
    voided_at: null,
    aade_mark: null,
    created_by: params.userName || null,
    created_at: now,
    updated_at: now,
    lines,
  };
}

export function recalculateProforma(
  proforma: ProformaDocument,
  lines: ProformaDocumentLine[] = proforma.lines || [],
  settings: LegalSettings,
): { document: ProformaDocument; lines: ProformaDocumentLine[] } {
  const recalculatedLines = lines.map((line, index) => ({
    ...recalculateLegalLine({
      ...line,
      document_id: proforma.id,
      line_number: index + 1,
    }, settings, undefined),
    proforma_id: proforma.id,
  }));
  const totals = computeLegalTotals(recalculatedLines);
  return {
    lines: recalculatedLines,
    document: {
      ...proforma,
      totals,
      revenue_classification: groupIncomeClassifications(recalculatedLines),
      updated_at: new Date().toISOString(),
      lines: recalculatedLines,
    },
  };
}

export function canPrintProforma(proforma: ProformaDocument): boolean {
  return proforma.status !== 'void';
}

function normalizeLegalDocumentParty(document: Pick<LegalDocument, 'counterpart' | 'delivery'>) {
  return {
    counterpart: document.counterpart
      ? {
          ...document.counterpart,
          address: parseLegalPartyAddress(document.counterpart.address ?? null),
        }
      : document.counterpart,
    delivery: document.delivery
      ? {
          ...document.delivery,
          loading_address: parseLegalPartyAddress(document.delivery.loading_address ?? null),
          delivery_address: parseLegalPartyAddress(document.delivery.delivery_address ?? null),
        }
      : document.delivery,
  };
}

export function normalizeLegalDocumentAddresses(document: LegalDocument): LegalDocument {
  return { ...document, ...normalizeLegalDocumentParty(document) };
}

export function normalizeProformaDocumentAddresses(document: ProformaDocument): ProformaDocument {
  return {
    ...document,
    counterpart: document.counterpart
      ? {
          ...document.counterpart,
          address: parseLegalPartyAddress(document.counterpart.address ?? null),
        }
      : document.counterpart,
  };
}

export function serializeLegalDocumentForDb(document: LegalDocument): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...document,
    ...normalizeLegalDocumentParty(document),
    updated_at: new Date().toISOString(),
  };
  delete normalized.lines;
  return normalized;
}

export function serializeProformaDocumentForDb(document: ProformaDocument): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...document,
    counterpart: document.counterpart
      ? {
          ...document.counterpart,
          address: parseLegalPartyAddress(document.counterpart.address ?? null),
        }
      : document.counterpart,
    updated_at: new Date().toISOString(),
  };
  delete normalized.lines;
  return normalized;
}

export function serializeLegalDocumentLineForDb(
  line: LegalDocumentLine | ProformaDocumentLine,
  documentId: string,
): Record<string, unknown> {
  const sku = String(line.sku || '').trim();
  const description = String(line.description || '').trim();
  return {
    id: line.id,
    document_id: documentId,
    line_number: line.line_number,
    sku: sku || '—',
    variant_suffix: line.variant_suffix ?? null,
    description: description || '—',
    quantity: line.quantity,
    unit_price: line.unit_price,
    net_value: line.net_value,
    vat_category: line.vat_category,
    vat_amount: line.vat_amount,
    gross_value: line.gross_value,
    measurement_unit: line.measurement_unit,
    item_code: line.item_code ?? null,
    income_classification: line.income_classification,
    source_order_line_key: line.source_order_line_key ?? null,
    line_id: line.line_id ?? null,
    created_at: line.created_at ?? new Date().toISOString(),
  };
}

export function convertProformaToLegalDraft(params: {
  proforma: ProformaDocument;
  lines: ProformaDocumentLine[];
  settings: LegalSettings;
  kind: LegalDocumentKind;
  userName?: string | null;
}): { document: LegalDocument; lines: LegalDocumentLine[] } {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const lines = params.lines.map((line, index) => {
    const { proforma_id: _proformaId, ...legalLine } = line;
    return recalculateLegalLine({
      ...legalLine,
      id: crypto.randomUUID(),
      document_id: id,
      line_number: index + 1,
      source_order_line_key: line.source_order_line_key || null,
    }, params.settings, undefined, getAadeDocumentTypeForKind(params.kind));
  });
  const totals = computeLegalTotals(lines);
  const document: LegalDocument = {
    id,
    order_id: params.proforma.order_id ?? null,
    shipment_id: params.proforma.shipment_id ?? null,
    source_kind: 'proforma',
    document_kind: params.kind,
    aade_document_type: getAadeDocumentTypeForKind(params.kind),
    status: 'draft',
    series: null,
    aa: null,
    issue_date: toIsoDate(now),
    issuer: params.proforma.issuer,
    counterpart: params.proforma.counterpart,
    delivery: null,
    payment_method_code: params.proforma.payment_method_code,
    currency: params.proforma.currency || 'EUR',
    vat_rate: params.proforma.vat_rate,
    vat_exemption_category: params.proforma.vat_exemption_category,
    revenue_classification: groupIncomeClassifications(lines),
    totals,
    aade_uid: null,
    aade_mark: null,
    cancellation_mark: null,
    authentication_code: null,
    qr_url: null,
    last_error: null,
    raw_xml: null,
    locked_at: null,
    submitted_at: null,
    cancelled_at: null,
    printed_at: null,
    external_source: 'ilios',
    synced_at: null,
    sync_run_id: null,
    local_notes: null,
    created_by: params.userName || params.proforma.created_by || null,
    created_at: now,
    updated_at: now,
    lines,
  };
  return { document, lines };
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
    aadeDocumentType: getAadeDocumentTypeForKind(params.kind),
  });
  const totals = computeLegalTotals(lines);
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
    aadeDocumentType: getAadeDocumentTypeForKind(params.kind),
  });
  const totals = computeLegalTotals(lines);
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
    delivery_address: customer?.address ? parseLegalPartyAddress(customer.address) : null,
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
  const isDelivery = documentIncludesDeliveryNote(document);

  if (!normalizeVatNumber(document.issuer.vat_number)) {
    issues.push({ field: 'issuer.vat_number', severity: 'error', message: 'Συμπληρώστε ΑΦΜ εκδότη στις ρυθμίσεις.' });
  } else if (isGreekParty(document.issuer) && !isValidGreekVatNumber(document.issuer.vat_number)) {
    issues.push({
      field: 'issuer.vat_number',
      severity: 'error',
      message: 'Ο ΑΦΜ εκδότη δεν είναι έγκυρος ελληνικός ΑΦΜ. Στο myDATA dev/prod χρειάζεται ο πραγματικός ΑΦΜ της εγγραφής REST API (ίδιος με το AADE User ID).',
    });
  }
  if (!normalizeVatNumber(document.counterpart.vat_number)) {
    issues.push({ field: 'counterpart.vat_number', severity: 'error', message: 'Ο πελάτης χρειάζεται έγκυρο ΑΦΜ για B2B παραστατικό.' });
  } else if (isGreekParty(document.counterpart) && !isValidGreekVatNumber(document.counterpart.vat_number)) {
    issues.push({
      field: 'counterpart.vat_number',
      severity: 'error',
      message: 'Ο ΑΦΜ πελάτη δεν είναι έγκυρος ελληνικός ΑΦΜ. Η ΑΑΔΕ δεν δέχεται πλαστικούς αριθμούς (π.χ. 999999999), ούτε στο dev.',
    });
  }
  if (!document.issue_date) {
    issues.push({ field: 'issue_date', severity: 'error', message: 'Λείπει ημερομηνία έκδοσης.' });
  }
  if (!lines.length) {
    issues.push({ field: 'lines', severity: 'error', message: 'Το παραστατικό δεν έχει γραμμές.' });
  }
  if (document.aade_document_type === '5.1') {
    issues.push({ field: 'aade_document_type', severity: 'error', message: 'Το 5.1 είναι συσχετιζόμενο πιστωτικό και απαιτεί σύνδεση με αρχικό παραστατικό/ΜΑΡΚ. Χρησιμοποιήστε 5.2 για μη συσχετιζόμενο πιστωτικό από αυτή την οθόνη.' });
  }

  for (const line of lines) {
    if (line.quantity <= 0) issues.push({ field: `line.${line.line_number}.quantity`, severity: 'error', message: `Η γραμμή ${line.line_number} έχει μηδενική ποσότητα.` });
    if (line.net_value < 0) issues.push({ field: `line.${line.line_number}.net_value`, severity: 'error', message: `Η γραμμή ${line.line_number} έχει αρνητική αξία.` });
    if (line.vat_category === 7 && !document.vat_exemption_category) {
      issues.push({ field: `line.${line.line_number}.vat_exemption`, severity: 'error', message: 'Τα παραστατικά χωρίς ΦΠΑ χρειάζονται αιτία εξαίρεσης ΦΠΑ.' });
    }
    if (line.vat_category === 8) {
      issues.push({ field: `line.${line.line_number}.vat_category`, severity: 'error', message: 'Η κατηγορία ΦΠΑ 8 αφορά λογιστικές εγγραφές χωρίς ΦΠΑ και όχι τα παραστατικά τιμολόγησης/διακίνησης που εκδίδει αυτή η οθόνη.' });
    }
    if (line.measurement_unit === 7) {
      issues.push({ field: `line.${line.line_number}.measurement_unit`, severity: 'error', message: 'Η μονάδα μέτρησης 7 απαιτεί ειδικό πλήθος και τίτλο μονάδας. Επιλέξτε άλλη μονάδα ή συμπληρώστε τα στοιχεία μέσω τεχνικής επέκτασης.' });
    }
    if (!line.income_classification?.classification_category) {
      issues.push({ field: `line.${line.line_number}.classification`, severity: 'error', message: `Η γραμμή ${line.line_number} δεν έχει χαρακτηρισμό εσόδου.` });
    }
    if (line.income_classification?.classification_category && !isAllowedIncomeClassification(document.aade_document_type, line.income_classification)) {
      issues.push({ field: `line.${line.line_number}.classification`, severity: 'error', message: `Ο χαρακτηρισμός της γραμμής ${line.line_number} δεν επιτρέπεται για τύπο ΑΑΔΕ ${document.aade_document_type} σύμφωνα με τους επίσημους συνδυασμούς χαρακτηρισμών.` });
    }
  }

  const expectedTotals = computeLegalTotals(lines);
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

const AADE_INCOME_CLASSIFICATION_NS = 'https://www.aade.gr/myDATA/incomeClassificaton/v1.0';

function xmlTag(name: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

function iclsTag(name: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  return `<icls:${name}>${xmlEscape(value)}</icls:${name}>`;
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
  const greekParty = isGreekParty(party);
  const children = [
    xmlTag('vatNumber', vat),
    xmlTag('country', party.country || 'GR'),
    xmlTag('branch', party.branch ?? 0),
    includeAddress && !greekParty ? buildAddressXml('address', party.address) : '',
  ].join('');
  return `<${tag}>${children}</${tag}>`;
}

function buildIncomeClassificationXml(item: LegalIncomeClassification): string {
  return `<incomeClassification>${[
    iclsTag('classificationType', item.classification_type),
    iclsTag('classificationCategory', item.classification_category),
    iclsTag('amount', xmlMoney(item.amount)),
  ].join('')}</incomeClassification>`;
}

function buildHeaderXml(document: LegalDocument): string {
  const isDelivery = documentIncludesDeliveryNote(document);
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
  const canSendDeliveryLineFields = document.document_kind === 'delivery_note' || document.document_kind === 'invoice_delivery';
  return `<invoiceDetails>${[
    xmlTag('lineNumber', line.line_number),
    xmlTag('quantity', line.quantity),
    xmlTag('measurementUnit', line.measurement_unit),
    xmlTag('netValue', xmlMoney(line.net_value)),
    xmlTag('vatCategory', line.vat_category),
    xmlTag('vatAmount', xmlMoney(line.vat_amount)),
    line.vat_category === 7 ? xmlTag('vatExemptionCategory', document.vat_exemption_category) : '',
    buildIncomeClassificationXml(line.income_classification),
    canSendDeliveryLineFields ? xmlTag('itemDescr', line.description.slice(0, 300)) : '',
    canSendDeliveryLineFields && line.item_code ? xmlTag('itemCode', line.item_code) : '',
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
    buildSummaryXml({ ...document, revenue_classification: groupIncomeClassifications(lines), totals: computeLegalTotals(lines) }),
  ].join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:icls="${AADE_INCOME_CLASSIFICATION_NS}">`,
    `<invoice>${invoice}</invoice>`,
    '</InvoicesDoc>',
  ].join('');
}

export function isEmptyTransmittedDocsResponse(
  result: Pick<AadeProxyResult, 'ok' | 'status' | 'responseText' | 'parsed'>,
  parsed: AadeTransmittedDocsParseResult,
): boolean {
  if (parsed.documents.length > 0 || parsed.cancellations.length > 0) return false;
  if (result.ok || result.status === 404 || result.status === 204) return true;
  const responseText = String(result.responseText || '').trim();
  if (!responseText || /<RequestedDoc\b[^>]*\/>/i.test(responseText) || /<RequestedDoc>\s*<\/RequestedDoc>/i.test(responseText)) {
    return true;
  }
  const parsedResponse = result.parsed?.statusCode
    ? result.parsed
    : parseAadeResponseXml(responseText);
  if (parsedResponse.statusCode === 'NoDocuments') return true;
  const errors = (parsedResponse.errors || []).map((message) => message.toLowerCase());
  return errors.some((message) =>
    message.includes('not found')
    || message.includes('δεν βρέθη')
    || message.includes('no documents')
    || message.includes('requested invoice was not found')
  );
}

export function getAadeProxyErrorMessage(result: Pick<AadeProxyResult, 'status' | 'responseText' | 'parsed'>, fallback: string): string {
  const responseText = String(result.responseText || '');
  const errors = [
    ...(result.parsed?.errors || []),
    ...parseAadeResponseXml(responseText).errors,
  ].map((message) => message.trim()).filter(Boolean);
  if (!errors.length && responseText.trim().startsWith('{')) {
    try {
      const json = JSON.parse(responseText) as { message?: string; statusCode?: number | string };
      if (json.message) errors.push(String(json.message));
      else if (json.statusCode) errors.push(`AADE HTTP ${json.statusCode}`);
    } catch {
      // ignore malformed JSON
    }
  }
  if (errors.length) return errors.join('\n');
  if (result.status === 400) {
    return 'Η ΑΑΔΕ απέρριψε το αίτημα συγχρονισμού. Ελέγξτε τις ημερομηνίες, το MARK και τα προαιρετικά φίλτρα.';
  }
  if (result.status === 401) return 'Τα AADE credentials δεν έγιναν αποδεκτά από την ΑΑΔΕ.';
  if (result.status === 404) return 'Η ΑΑΔΕ δεν απάντησε στο αίτημα (404). Συχνά σημαίνει συντήρηση ή προσωρινή μη διαθεσιμότητα.';
  return fallback;
}

export function buildAadeTransmittedDocsQuery(
  params: LegalSyncParams,
  continuation?: { nextPartitionKey?: string | null; nextRowKey?: string | null },
): Record<string, string> {
  const query: Record<string, string> = {
    mark: String(params.markFrom || '0'),
  };
  const dateFrom = toAadeQueryDate(params.dateFrom);
  const dateTo = toAadeQueryDate(params.dateTo);
  if (dateFrom) query.dateFrom = dateFrom;
  if (dateTo) query.dateTo = dateTo;
  const entityVatNumber = normalizeVatNumber(params.entityVatNumber);
  const receiverVatNumber = normalizeVatNumber(params.receiverVatNumber);
  if (entityVatNumber) query.entityVatNumber = entityVatNumber;
  if (receiverVatNumber) query.receiverVatNumber = receiverVatNumber;
  if (params.invType) query.invType = params.invType;
  if (params.maxMark) query.maxMark = params.maxMark;
  if (continuation?.nextPartitionKey) query.nextPartitionKey = continuation.nextPartitionKey;
  if (continuation?.nextRowKey) query.nextRowKey = continuation.nextRowKey;
  return query;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function findXmlValue(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i'));
  return match?.[1] ? decodeXmlEntities(match[1]).trim() : undefined;
}

export function normalizeAadeResponseXml(raw: string): string {
  let text = String(raw || '').trim();
  if (!text) return text;
  const stringMatch = text.match(/<string[^>]*>([\s\S]*)<\/string>/i);
  if (stringMatch) {
    text = decodeXmlEntities(stringMatch[1]);
  }
  return text;
}

export function parseAadeResponseXml(xml: string) {
  const text = normalizeAadeResponseXml(xml);
  const errorMatches = Array.from(text.matchAll(/<(?:\w+:)?message>([\s\S]*?)<\/(?:\w+:)?message>/gi));
  const errors = errorMatches.map((match) => decodeXmlEntities(match[1]).trim()).filter(Boolean);
  const statusCode = findXmlValue(text, 'statusCode');
  if (!errors.length && statusCode && statusCode !== 'Success') {
    errors.push(statusCode);
  }
  return {
    statusCode,
    invoiceUid: findXmlValue(text, 'invoiceUid'),
    invoiceMark: findXmlValue(text, 'invoiceMark'),
    classificationMark: findXmlValue(text, 'classificationMark'),
    cancellationMark: findXmlValue(text, 'cancellationMark'),
    authenticationCode: findXmlValue(text, 'authenticationCode'),
    qrUrl: findXmlValue(text, 'qrUrl'),
    errors,
  };
}

function findXmlValues(xml: string, tag: string): string[] {
  return Array.from(xml.matchAll(new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'gi')))
    .map((match) => match[1]?.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim())
    .filter((value): value is string => !!value);
}

function findXmlBlocks(xml: string, tag: string): string[] {
  return Array.from(xml.matchAll(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'gi')))
    .map((match) => match[0]);
}

function findFirstXmlValue(xml: string, tags: string[]): string | undefined {
  for (const tag of tags) {
    const value = findXmlValue(xml, tag);
    if (value) return value;
  }
  return undefined;
}

function xmlNumber(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseTransmittedDocumentsXml(xml: string): AadeTransmittedDocsParseResult {
  const text = normalizeAadeResponseXml(xml);
  const invoiceBlocks = findXmlBlocks(text, 'invoice');
  const documents = invoiceBlocks
    .map((invoice) => {
      const invoiceType = findFirstXmlValue(invoice, ['invoiceType']) || '';
      const mark = findFirstXmlValue(invoice, ['mark', 'invoiceMark']) || '';
      const lines = findXmlBlocks(invoice, 'invoiceDetails').map((line) => {
        const netValue = xmlNumber(findXmlValue(line, 'netValue'));
        const vatAmount = xmlNumber(findXmlValue(line, 'vatAmount'));
        return {
          lineNumber: Math.trunc(xmlNumber(findXmlValue(line, 'lineNumber'), 1)),
          netValue,
          vatCategory: Math.trunc(xmlNumber(findXmlValue(line, 'vatCategory'), 1)),
          vatAmount,
          itemCode: findXmlValue(line, 'itemCode') || null,
          quantity: xmlNumber(findXmlValue(line, 'quantity'), 0) || null,
        };
      });
      const totals: LegalTotals = {
        net: roundMoney(xmlNumber(findXmlValue(invoice, 'totalNetValue'), lines.reduce((sum, line) => sum + line.netValue, 0))),
        vat: roundMoney(xmlNumber(findXmlValue(invoice, 'totalVatAmount'), lines.reduce((sum, line) => sum + line.vatAmount, 0))),
        gross: roundMoney(xmlNumber(findXmlValue(invoice, 'totalGrossValue'), 0)),
        quantity: lines.reduce((sum, line) => sum + (line.quantity || 0), 0),
      };
      if (!totals.gross) totals.gross = roundMoney(totals.net + totals.vat);
      return {
        mark,
        uid: findFirstXmlValue(invoice, ['uid', 'invoiceUid']),
        qrUrl: findFirstXmlValue(invoice, ['qrUrl', 'qrCodeUrl']),
        series: findXmlValue(invoice, 'series'),
        aa: findXmlValue(invoice, 'aa'),
        issueDate: findXmlValue(invoice, 'issueDate'),
        invoiceType,
        issuerVat: findXmlValue(findXmlBlocks(invoice, 'issuer')[0] || '', 'vatNumber'),
        counterpartVat: findXmlValue(findXmlBlocks(invoice, 'counterpart')[0] || '', 'vatNumber'),
        cancelledByMark: findXmlValue(invoice, 'cancelledByMark') || null,
        totals,
        lines,
        rawXml: invoice,
      };
    })
    .filter((document) => !!document.mark && !!document.invoiceType);

  const cancellations = findXmlBlocks(text, 'cancelledInvoice')
    .map((block) => ({
      invoiceMark: findFirstXmlValue(block, ['invoiceMark', 'mark']) || '',
      cancellationMark: findXmlValue(block, 'cancellationMark'),
      cancellationDate: findXmlValue(block, 'cancellationDate'),
    }))
    .filter((item) => !!item.invoiceMark);

  return {
    documents,
    cancellations,
    nextPartitionKey: findFirstXmlValue(text, ['nextPartitionKey']),
    nextRowKey: findFirstXmlValue(text, ['nextRowKey']),
  };
}

export function isOfficialLegalDocumentPrint(document: LegalDocument): boolean {
  return document.status === 'issued' && !!document.aade_mark && !!document.qr_url;
}

export function canPrintLegalDocument(document: LegalDocument): boolean {
  if (document.status === 'submitted') return false;
  if (isOfficialLegalDocumentPrint(document)) return true;
  if (document.status === 'cancelled') return !!document.aade_mark;
  return document.status === 'draft' || document.status === 'failed';
}

export function getLegalDocumentDisplayNumber(document: Pick<LegalDocument, 'series' | 'aa' | 'id'>): string {
  if (document.series && document.aa) return `${document.series}-${document.aa}`;
  return document.id.slice(0, 8);
}

export interface LegalDocumentDeletePrompt {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  isDestructive: boolean;
}

export function getLegalDocumentDeletePrompt(document: LegalDocument): LegalDocumentDeletePrompt {
  const number = getLegalDocumentDisplayNumber(document);
  const base = {
    title: 'Διαγραφή παραστατικού',
    confirmText: 'Οριστική διαγραφή',
    cancelText: 'Πίσω',
    isDestructive: true,
  };

  if (document.status === 'draft' || document.status === 'failed') {
    return {
      ...base,
      message: [
        `Να διαγραφεί οριστικά το ${number} από το Ilios;`,
        '',
        document.status === 'failed'
          ? 'Πρόχειρο/αποτυχημένη υποβολή — δεν υπάρχει έγκυρο MARK στην ΑΑΔΕ ή η υποβολή απέτυχε.'
          : 'Πρόχειρο μόνο στο ERP — δεν έχει σταλεί στη myDATA.',
        'Η ενέργεια δεν αναιρείται.',
      ].join('\n'),
    };
  }

  if (document.status === 'submitted') {
    return {
      ...base,
      message: [
        `Να διαγραφεί οριστικά το ${number};`,
        '',
        'Το παραστατικό είναι σε κατάσταση «υποβλήθηκε» και μπορεί να έχει ήδη MARK στην ΑΑΔΕ.',
        'Η διαγραφή αφαιρεί μόνο την εγγραφή από το Ilios — όχι από την ΑΑΔΕ.',
        'Μπορεί να ξαναεμφανιστεί με συγχρονισμό.',
      ].join('\n'),
    };
  }

  if (document.status === 'issued') {
    return {
      ...base,
      title: 'Διαγραφή εκδοθέντος παραστατικού',
      message: [
        `Προσοχή: το ${number} είναι ΕΚΔΟΘΕΝ στη myDATA.`,
        document.aade_mark ? `MARK: ${document.aade_mark}` : '',
        '',
        'Η διαγραφή από το Ilios ΔΕΝ ακυρώνει το παραστατικό στην ΑΑΔΕ.',
        'Το νόμιμο παραστατικό παραμένει ισχύον εκτός αν το έχετε ήδη ακυρώσει στη myDATA.',
        'Μπορεί να ξαναεμφανιστεί στο Αρχείο μετά από συγχρονισμό.',
        '',
        'Προτείνεται πρώτα «Ακύρωση» στη myDATA και μετά διαγραφή για καθάρισμα αρχείου.',
      ].filter(Boolean).join('\n'),
    };
  }

  return {
    ...base,
    message: [
      `Να διαγραφεί οριστικά το ${number} από το Ilios;`,
      document.aade_mark ? `MARK: ${document.aade_mark}` : '',
      document.status === 'cancelled'
        ? 'Το παραστατικό είναι ακυρωμένο στην ΑΑΔΕ — η εγγραφή παραμένει στο ιστορικό της ΑΑΔΕ.'
        : 'Η εγγραφή θα αφαιρεθεί μόνο από το ERP.',
      'Μπορεί να ξαναεισαχθεί με συγχρονισμό από την ΑΑΔΕ.',
      'Η ενέργεια δεν αναιρείται στο Ilios.',
    ].filter(Boolean).join('\n'),
  };
}

export function getProformaDeletePrompt(document: ProformaDocument): LegalDocumentDeletePrompt {
  const number = getLegalDocumentDisplayNumber(document);
  const lines = [
    `Να διαγραφεί οριστικά το προτιμολόγιο ${number};`,
    '',
    'Το προτιμολόγιο δεν είναι νόμιμο παραστατικό και δεν επηρεάζει την ΑΑΔΕ.',
    'Η ενέργεια αφαιρεί την εγγραφή και τις γραμμές της από την εφαρμογή και τη βάση.',
  ];

  if (document.status === 'converted') {
    lines.push('', 'Σημείωση: έχει συνδεθεί με τιμολόγιο — το τιμολόγιο δεν διαγράφεται.');
  }

  return {
    title: 'Διαγραφή προτιμολογίου',
    message: lines.join('\n'),
    confirmText: 'Οριστική διαγραφή',
    cancelText: 'Πίσω',
    isDestructive: true,
  };
}

const GREEK_SERIES_CHAR_MAP: Record<string, string> = {
  Α: 'A',
  Β: 'B',
  Ε: 'E',
  Ζ: 'Z',
  Η: 'H',
  Ι: 'I',
  Κ: 'K',
  Μ: 'M',
  Ν: 'N',
  Ο: 'O',
  Ρ: 'P',
  Τ: 'T',
  Υ: 'Y',
  Χ: 'X',
};

/** Normalizes invoice series for comparison (e.g. ΤΙΜ vs TIM). */
export function normalizeLegalSeriesKey(series: string | null | undefined): string {
  return String(series || '')
    .trim()
    .toUpperCase()
    .split('')
    .map((char) => GREEK_SERIES_CHAR_MAP[char] || char)
    .join('');
}

export function parseLegalDocumentAa(aa: string | null | undefined): number | null {
  const digits = String(aa || '').trim().replace(/\D/g, '');
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const LEGAL_NUMBERING_RELEVANT_STATUSES = new Set<LegalDocument['status']>([
  'issued',
  'cancelled',
  'submitted',
  'failed',
]);

export function isLegalDocumentNumberingRelevant(document: Pick<LegalDocument, 'status' | 'series' | 'aa'>): boolean {
  if (!document.series || !document.aa) return false;
  if (LEGAL_NUMBERING_RELEVANT_STATUSES.has(document.status)) return true;
  return document.status === 'draft';
}

export interface LegalNumberingAlignmentProposal {
  sequenceId: string;
  documentKind: LegalDocumentKind;
  series: string;
  currentNextAa: number;
  maxIssuedAa: number;
  proposedNextAa: number;
  documentCount: number;
}

export interface LegalNumberingAlignmentPlan {
  proposals: LegalNumberingAlignmentProposal[];
  warnings: string[];
}

export function buildLegalNumberingAlignmentPlan(
  documents: LegalDocument[],
  sequences: LegalNumberingSequence[],
): LegalNumberingAlignmentPlan {
  const warnings: string[] = [];
  const proposals: LegalNumberingAlignmentProposal[] = [];
  const numberingDocuments = documents.filter(isLegalDocumentNumberingRelevant);

  for (const sequence of sequences.filter((item) => item.is_active)) {
    const sequenceKey = normalizeLegalSeriesKey(sequence.series);
    const matching = numberingDocuments.filter((document) =>
      document.document_kind === sequence.document_kind
      && normalizeLegalSeriesKey(document.series) === sequenceKey,
    );

    const otherSeries = new Map<string, number>();
    numberingDocuments
      .filter((document) =>
        document.document_kind === sequence.document_kind
        && normalizeLegalSeriesKey(document.series) !== sequenceKey,
      )
      .forEach((document) => {
        const label = document.series || '—';
        otherSeries.set(label, (otherSeries.get(label) || 0) + 1);
      });

    for (const [foreignSeries, count] of otherSeries.entries()) {
      if (normalizeLegalSeriesKey(foreignSeries) === sequenceKey) continue;
      warnings.push(
        `Στο αρχείο υπάρχουν ${count} παραστατικά σειράς «${foreignSeries}» (${LEGAL_DOCUMENT_KIND_LABELS[sequence.document_kind]}), ενώ η ενεργή σειρά ERP είναι «${sequence.series}».`,
      );
    }

    if (!matching.length) continue;

    const maxIssuedAa = matching.reduce((max, document) => {
      const parsed = parseLegalDocumentAa(document.aa);
      return parsed && parsed > max ? parsed : max;
    }, 0);

    if (!maxIssuedAa) continue;

    const proposedNextAa = maxIssuedAa + 1;
    if (proposedNextAa <= sequence.next_aa) continue;

    proposals.push({
      sequenceId: sequence.id,
      documentKind: sequence.document_kind,
      series: sequence.series,
      currentNextAa: sequence.next_aa,
      maxIssuedAa,
      proposedNextAa,
      documentCount: matching.length,
    });
  }

  return {
    proposals,
    warnings: Array.from(new Set(warnings)),
  };
}

export function formatLegalNumberingAlignmentMessage(plan: LegalNumberingAlignmentPlan): string {
  const lines: string[] = [
    'Βρέθηκαν παραστατικά στο Αρχείο με μεγαλύτερη αρίθμηση από το τρέχον «Επόμενο».',
    '',
  ];

  if (plan.warnings.length) {
    lines.push('Προσοχή:');
    plan.warnings.forEach((warning) => lines.push(`• ${warning}`));
    lines.push('');
  }

  plan.proposals.forEach((proposal) => {
    lines.push(
      `${LEGAL_DOCUMENT_KIND_LABELS[proposal.documentKind]} · σειρά ${proposal.series}`,
      `  Μέγιστος: ${proposal.series}-${proposal.maxIssuedAa} (${proposal.documentCount} εγγραφές)`,
      `  Τρέχον Επόμενο: ${proposal.currentNextAa} → προτεινόμενο: ${proposal.proposedNextAa}`,
      '',
    );
  });

  lines.push('Να ενημερωθεί η αρίθμηση; Το «Επόμενο» δεν θα μειωθεί ποτέ αυτόματα.');
  return lines.join('\n');
}
