import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { LegalDocument, LegalDocumentLine, LegalParty } from '../../types';
import {
  buildAadeInvoiceXml,
  computeLegalTotals,
  formatSbzDispatchPlace,
  groupIncomeClassifications,
  LEGAL_DOCUMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  resolveSbzDispatchMethod,
  SBZ_DISPATCH_PLACE_FROM,
  validateLegalDocument,
} from '../../utils/legalDocuments';

// SBZ reference table, reviewed 2026-09-11; retired purposes are excluded.
export const SBZ_MOVE_PURPOSES: Record<number, string> = {1:'Πώληση',2:'Πώληση για λογαριασμό τρίτων',3:'Δειγματισμός',4:'Έκθεση',5:'Επιστροφή',7:'Επεξεργασία / συναρμολόγηση',8:'Μεταξύ εγκαταστάσεων',9:'Αγορά',10:'Εφοδιασμός πλοίων και αεροσκαφών',11:'Δωρεάν διάθεση',12:'Εγγύηση',13:'Χρησιδανεισμός',14:'Αποθήκευση σε τρίτους',19:'Λοιπές διακινήσεις',20:'Μεταφορές / ταχυμεταφορές'};
export const SBZ_BASE_URL = 'https://api.sbz.gr/sign/';
export const SBZ_UNKNOWN_MESSAGE = 'Ελέγχεται η έκδοση από τον πάροχο. Μην εκδώσετε δεύτερο παραστατικό για την ίδια συναλλαγή.';
export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const escape = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const asText = (value: unknown) => value == null ? '' : String(value).trim();
const tag = (name: string, value: unknown) => `<${name}>${escape(asText(value))}</${name}>`;
const amount = (n: number) => money(n).toFixed(2);
const rates: Record<number, number> = { 1: 24, 2: 13, 3: 6, 4: 17, 5: 9, 6: 4, 7: 0, 8: 0, 9: 3, 10: 4 };
const units: Record<number, string> = { 1: 'Τεμάχια', 2: 'Κιλά', 3: 'Λίτρα', 4: 'Μέτρα', 5: 'Τετραγωνικά μέτρα', 6: 'Κυβικά μέτρα', 7: 'Τεμάχια' };

export function validateSbzDocument(document: LegalDocument, lines: LegalDocumentLine[]) {
  const errors = validateLegalDocument(document, lines).filter(x => x.severity === 'error').map(x => x.message);
  if (!['1.1', '9.3', '5.1', '5.2'].includes(document.aade_document_type)) errors.push('Αυτό το είδος παραστατικού δεν υποστηρίζεται για έκδοση.');
  if (!document.issuer.business_name && !document.issuer.name) errors.push('Συμπληρώστε την επωνυμία της επιχείρησης.');
  if (!document.issuer.activity || !document.issuer.doy) errors.push('Συμπληρώστε δραστηριότητα και ΔΟΥ της επιχείρησης.');
  if (!document.counterpart.customer_code) errors.push('Ο πελάτης δεν έχει κωδικό ERP. Αποθηκεύστε ή επιλέξτε πελάτη πριν την έκδοση.');
  if (!document.counterpart.profession) errors.push('Συμπληρώστε το επάγγελμα του πελάτη ή εκτελέστε τον επίσημο έλεγχο Μητρώου ΑΦΜ.');
  if (!document.counterpart.tax_office) errors.push('Συμπληρώστε τη ΔΟΥ του πελάτη ή εκτελέστε τον επίσημο έλεγχο Μητρώου ΑΦΜ.');
  for (const party of [document.issuer, document.counterpart]) {
    if (!party.name && !('business_name' in party && party.business_name)) errors.push('Συμπληρώστε την επωνυμία.');
    if (!party.address?.street || !party.address?.city || !party.address?.postal_code) errors.push('Συμπληρώστε οδό, πόλη και ταχυδρομικό κώδικα εκδότη και πελάτη.');
  }
  if (['delivery_note','invoice_delivery'].includes(document.document_kind) && !SBZ_MOVE_PURPOSES[document.delivery?.move_purpose || 0]) errors.push('Επιλέξτε έγκυρο σκοπό διακίνησης.');
  if (document.currency !== 'EUR') errors.push('Η έκδοση υποστηρίζει προς το παρόν ποσά σε ευρώ.');
  if ([7, 8].includes(document.payment_method_code)) errors.push('Δεν έχει ενεργοποιηθεί διασύνδεση πληρωμών POS/IRIS. Επιλέξτε τον πραγματικό υποστηριζόμενο τρόπο εξόφλησης.');
  const totals = computeLegalTotals(lines);
  if (!['net', 'vat', 'gross', 'quantity'].every(key => Number.isFinite(document.totals[key as keyof typeof totals]) && Math.abs(document.totals[key as keyof typeof totals] - totals[key as keyof typeof totals]) < 0.011)) errors.push('Τα σύνολα δεν συμφωνούν με τις γραμμές. Ελέγξτε τα ποσά πριν την έκδοση.');
  for (const l of lines) {
    const originalPrice = l.source_metadata?.original_unit_price ?? l.unit_price;
    const discount = l.source_metadata?.discount_percent;
    if (discount !== undefined && discount !== null && (!Number.isFinite(discount) || discount < 0 || discount > 100 || Math.abs(money(originalPrice * l.quantity * (1-discount/100)) - l.net_value) > 0.011)) errors.push(`Ελέγξτε την έκπτωση στη γραμμή ${l.line_number}.`);
    if (!Number.isFinite(originalPrice) || originalPrice < 0 || l.unit_price < 0 || (discount === undefined || discount === null) && Math.abs(money(l.unit_price * l.quantity) - l.net_value) > 0.011) errors.push(`Ελέγξτε την τιμή και την καθαρή αξία στη γραμμή ${l.line_number}.`);
    if (![l.quantity, l.unit_price, l.net_value, l.vat_amount, l.gross_value].every(Number.isFinite)) errors.push('Μη έγκυρα ποσά ή ποσότητες.');
    if (!l.description?.trim() || !(l.item_code || l.sku)?.trim()) errors.push(`Συμπληρώστε είδος και περιγραφή στη γραμμή ${l.line_number}.`);
    if (!(l.measurement_unit in units) || !(l.vat_category in rates)) errors.push(`Ελέγξτε μονάδα μέτρησης και ΦΠΑ στη γραμμή ${l.line_number}.`);
    if (money(l.net_value + l.vat_amount) !== money(l.gross_value) || Math.abs(money(l.net_value * rates[l.vat_category] / 100) - l.vat_amount) > 0.011) errors.push(`Ελέγξτε τα ποσά ΦΠΑ στη γραμμή ${l.line_number}.`);
    if (document.aade_document_type !== '9.3' && (!Number.isFinite(l.income_classification?.amount) || Math.abs((l.income_classification?.amount ?? NaN) - l.net_value) > 0.011)) errors.push(`Ελέγξτε τον χαρακτηρισμό της γραμμής ${l.line_number}.`);
  }
  return [...new Set(errors)];
}

export function buildSbzInvoiceXml(document: LegalDocument, lines: LegalDocumentLine[], issuedAt: string) {
  const errors = validateSbzDocument(document, lines);
  if (errors.length) throw new Error(errors.join('\n'));
  let xml = buildAadeInvoiceXml(document, lines).replace(/xmlns:icls=/g, 'xmlns:N1=').replace(/icls:/g, 'N1:');
  let index = 0;
  xml = xml.replace(/<invoiceDetails>([\s\S]*?)<\/invoiceDetails>/g, (_block, content: string) => {
    const l = lines[index++];
    const original = l.source_metadata?.original_unit_price ?? l.unit_price;
    const before = money(original * l.quantity);
    if (before + 0.01 < l.net_value) throw new Error('Η αξία πριν την έκπτωση είναι μικρότερη από την καθαρή αξία.');
    const extra = tag('lineUnitPrice', amount(original)) + tag('measurementUnitLabel', units[l.measurement_unit])
      + tag('lineCode', l.item_code || l.sku) + tag('lineDescription', l.description)
      + tag('totalNetPriceBeforeDiscount', amount(before)) + tag('totalDiscountValue', amount(Math.max(0, before - l.net_value)))
      + tag('vatCategoryPercent', rates[l.vat_category]);
    return '<invoiceDetails>' + content.replace('</vatAmount>', '</vatAmount>' + extra) + '</invoiceDetails>';
  });
  const party = (prefix: string, p: LegalParty, name: string) => (prefix === 'Counterpart' ? tag('CounterpartCode', asText(p.customer_code)) : '')
    + tag(`${prefix}Name`, name)
    + tag(`${prefix}Profession`, prefix === 'Issuer' ? document.issuer.activity : p.profession)
    + tag(`${prefix}Taxoffice`, prefix === 'Issuer' ? document.issuer.doy : p.tax_office)
    + tag(`${prefix}AddressStreet`, p.address?.street) + tag(`${prefix}AddressNumber`, p.address?.number)
    + tag(`${prefix}AddressPostalCode`, p.address?.postal_code) + tag(`${prefix}AddressCity`, p.address?.city)
    + tag(`${prefix}AddressCountry`, p.country || 'GR') + tag(`${prefix}Phone`, p.phone) + tag(`${prefix}Email`, p.email);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(issuedAt));
  const purposeCode = SBZ_MOVE_PURPOSES[document.delivery?.move_purpose || 0] ? Number(document.delivery?.move_purpose) : 1;
  const purposeLabel = document.delivery?.move_purpose_title || SBZ_MOVE_PURPOSES[purposeCode];
  const destination = formatSbzDispatchPlace(document.delivery?.delivery_address || document.counterpart.address, document.counterpart.country);
  if (!xml.includes('<movePurposeLabel>')) {
    xml = xml.includes('</movePurpose>')
      ? xml.replace('</movePurpose>', `</movePurpose>${tag('movePurposeLabel', purposeLabel)}`)
      : xml.replace('</invoiceHeader>', `${tag('movePurpose', purposeCode)}${tag('movePurposeLabel', purposeLabel)}</invoiceHeader>`);
  }
  const extra = '<API_InvoiceDetails><API_Issuer>' + party('Issuer', document.issuer, document.issuer.business_name || document.issuer.name || '')
    + '</API_Issuer><API_Counterpart>' + party('Counterpart', document.counterpart, document.counterpart.name || '')
    + '</API_Counterpart><API_Additionals>' + tag('DocumentLabel', LEGAL_DOCUMENT_KIND_LABELS[document.document_kind])
    + tag('paymentMethodInvoiceLabel', PAYMENT_METHOD_LABELS[document.payment_method_code] || '')
    + tag('DispatchPlaceFrom', SBZ_DISPATCH_PLACE_FROM)
    + tag('DispatchPlaceTo', destination)
    + tag('DispatchMethod', resolveSbzDispatchMethod(document.delivery))
    + tag('docTime', time) + '</API_Additionals></API_InvoiceDetails>';
  return xml.replace('<invoiceSummary>', extra + '<invoiceSummary>');
}

export function parseSbzResponse(text: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Μη αναμενόμενη απάντηση παρόχου.');
  let body: any;
  if (text.trim().startsWith('{')) body = JSON.parse(text);
  else {
    if (XMLValidator.validate(text) !== true) throw new Error('Μη έγκυρη απάντηση παρόχου.');
    body = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, processEntities: true, transformTagName: (name: string) => name.toLowerCase() }).parse(text);
  }
  const root = body.sbzresponsedoc || body.responsedoc || body;
  const response = root.response || root;
  if (Array.isArray(response)) throw new Error('Ο πάροχος επέστρεψε πολλαπλά αποτελέσματα για ένα παραστατικό.');
  const get = (key: string) => String(response[Object.keys(response).find(k => k.toLowerCase() === key.toLowerCase()) || key] ?? '');
  const errorItems = response.errors?.error;
  const errors = (Array.isArray(errorItems) ? errorItems : errorItems ? [errorItems] : []).map((e: any) => ({ code: String(e.code || ''), message: String(e.message || '') }));
  return { statusCode: get('statusCode'), invoiceMark: get('invoiceMark'), invoiceUid: get('invoiceUid'), authenticationCode: get('authenticationCode'), invoiceUrl: safeSbzUrl(get('InvoiceUrl')), mydataUrl: safeSbzUrl(get('myDATAUrl')), cancellationMark: get('cancellationMark'), units: get('units') || get('remainingUnits'), errors, message: get('message') };
}

export function safeSbzUrl(value: string) {
  if (!value) return '';
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

export function sbzFailureMessage(code: string) {
  const messages: Record<string, string> = {
    '5006': 'Η σύνδεση με τον πάροχο χρειάζεται έλεγχο από τον διαχειριστή.',
    '7001': 'Το διαθέσιμο υπόλοιπο στον πάροχο εξαντλήθηκε. Επικοινωνήστε με τον διαχειριστή.',
    '6034': 'Η ημερομηνία έκδοσης είναι παλαιότερη από το επιτρεπόμενο όριο του παρόχου.',
    '233': SBZ_UNKNOWN_MESSAGE,
    '101': 'Ο πάροχος δεν δέχθηκε τη μορφή του παραστατικού. Χρειάζεται τεχνικός έλεγχος.',
    '202': 'Ελέγξτε τον ΑΦΜ του πελάτη.',
  };
  return messages[code] || 'Ο πάροχος δεν δέχθηκε το παραστατικό. Ελέγξτε τα στοιχεία του ή ζητήστε υποστήριξη.';
}

export function isReservingCreditDocument(document: Pick<LegalDocument, 'document_kind' | 'status' | 'credited_document_id'>) {
  return document.document_kind === 'credit' && Boolean(document.credited_document_id) && document.status !== 'cancelled';
}

export function reservedCreditLinesForOrigin(
  originId: string,
  documents: Array<Pick<LegalDocument, 'id' | 'document_kind' | 'status' | 'credited_document_id'>>,
  lines: LegalDocumentLine[],
) {
  const reservedIds = new Set(
    documents
      .filter((document) => document.credited_document_id === originId && isReservingCreditDocument(document))
      .map((document) => document.id),
  );
  return lines.filter((line) => reservedIds.has(line.document_id));
}

export function remainingCreditQuantityByLine(originalLines: LegalDocumentLine[], reservedLines: LegalDocumentLine[]) {
  return Object.fromEntries(originalLines.map((line) => {
    const used = reservedLines
      .filter((creditLine) => creditLine.credited_line_id === line.id)
      .reduce((sum, creditLine) => sum + Number(creditLine.quantity || 0), 0);
    return [line.id, Math.max(0, Number(line.quantity || 0) - used)];
  })) as Record<string, number>;
}

export function canIssueCreditForInvoice(
  original: Pick<LegalDocument, 'id' | 'status' | 'document_kind'>,
  originalLines: LegalDocumentLine[],
  documents: Array<Pick<LegalDocument, 'id' | 'document_kind' | 'status' | 'credited_document_id'>>,
  allLines: LegalDocumentLine[],
) {
  if (original.status !== 'issued' || !['invoice', 'invoice_delivery'].includes(original.document_kind)) return false;
  const reservingCredits = documents.filter((document) => document.credited_document_id === original.id && isReservingCreditDocument(document));
  if (!reservingCredits.length) return originalLines.some((line) => Number(line.quantity || 0) > 0);
  const reserved = reservedCreditLinesForOrigin(original.id, documents, allLines);
  if (reservingCredits.length && !reserved.some((line) => line.credited_line_id)) return false;
  return Object.values(remainingCreditQuantityByLine(originalLines, reserved)).some((quantity) => quantity > 0);
}

export function buildCreditDraft(original: LegalDocument, originalLines: LegalDocumentLine[], quantities: Record<string, number>, reservedLines: LegalDocumentLine[] = []) {
  if (original.status !== 'issued' || !['invoice', 'invoice_delivery'].includes(original.document_kind) || !original.aade_mark || !original.environment) throw new Error('Το αρχικό τιμολόγιο χρειάζεται έγκυρη έκδοση και επιβεβαιωμένο περιβάλλον.');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const lines = originalLines.filter(l => quantities[l.id] > 0).map((l, i) => {
    const quantity = quantities[l.id];
    if (!Number.isFinite(quantity) || quantity > l.quantity) throw new Error('Η ποσότητα πίστωσης υπερβαίνει την αρχική.');
    const used = reservedLines.filter(c => c.credited_line_id === l.id).reduce((v,c) => ({quantity:v.quantity+c.quantity,net:v.net+c.net_value,vat:v.vat+c.vat_amount}),{quantity:0,net:0,vat:0});
    if (used.quantity + quantity > l.quantity + 0.000001) throw new Error('Η ποσότητα έχει ήδη πιστωθεί ή δεσμευτεί.');
    const ratio = (used.quantity + quantity) / l.quantity;
    const net_value = money(money(l.net_value * ratio) - used.net), vat_amount = money(money(l.vat_amount * ratio) - used.vat);
    return { ...l, id: crypto.randomUUID(), document_id: id, credited_line_id: l.id, line_number: i + 1, quantity, net_value, vat_amount, gross_value: money(net_value + vat_amount), income_classification: { ...l.income_classification, amount: net_value } };
  });
  if (!lines.length) throw new Error('Επιλέξτε τουλάχιστον ένα είδος για πίστωση.');
  const document: LegalDocument = {
    ...original, id, document_kind: 'credit', aade_document_type: '5.1', source_kind: 'manual', status: 'draft', provider: 'sbz', provider_state: 'idle', provider_attachment_state: 'idle',
    credited_document_id: original.id, correlated_mark: original.aade_mark, issue_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
    series: null, aa: null, aade_mark: null, aade_uid: null, cancellation_mark: null, authentication_code: null, qr_url: null, provider_invoice_url: null, provider_mydata_url: null, provider_units: null,
    raw_xml: null, submitted_at: null, locked_at: null, cancelled_at: null, printed_at: null, last_error: null, external_source: 'ilios', synced_at: null, sync_run_id: null,
    delivery: {
      dispatch_method: resolveSbzDispatchMethod(original.delivery),
      move_purpose: original.delivery?.move_purpose || 1,
      delivery_address: original.delivery?.delivery_address || original.counterpart.address || null,
    }, related_delivery_document_id: null, shipment_id: null, created_at: now, updated_at: now, totals: computeLegalTotals(lines), revenue_classification: groupIncomeClassifications(lines),
  };
  return { document, lines };
}
