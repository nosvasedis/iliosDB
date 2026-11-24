import { XMLParser, XMLValidator } from 'fast-xml-parser';

/**
 * Ψηφιακό Δελτίο Αποστολής — write calls of the myDATA ERP channel (DeliveryNote v2.0.2 §3.2),
 * built exactly per the official XSDs (no namespace, element order as in the schema).
 */
export type DeliveryAction = 'start' | 'deliver' | 'return' | 'receive' | 'reject';
export type DeliveryOutcome = 'FULL' | 'PARTIAL' | 'NONE';

/** Παράρτημα 7.4 — transportType. */
export const TRANSPORT_TYPES: Array<{ value: number; label: string }> = [
  { value: 2, label: 'Φορτηγό / όχημα ιδιωτικής χρήσης' },
  { value: 1, label: 'Φορτηγό δημόσιας χρήσης' },
  { value: 6, label: 'Λοιπά μέσα (π.χ. δίκυκλο)' },
  { value: 7, label: 'Χωρίς μεταφορικό μέσο (με το χέρι)' },
  { value: 3, label: 'Πλοίο' },
  { value: 4, label: 'Τρένο' },
  { value: 5, label: 'Αεροπλάνο' },
];

/** Παράρτημα 7.3 — PackagingType. */
export const PACKAGING_TYPES: Array<{ value: number; label: string }> = [
  { value: 2, label: 'Κούτα' },
  { value: 3, label: 'Κιβώτιο' },
  { value: 5, label: 'Σάκος' },
  { value: 1, label: 'Παλέτα' },
  { value: 4, label: 'Βαρέλι' },
  { value: 6, label: 'Λοιπά' },
];

const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const tag = (name: string, value: unknown) => `<${name}>${esc(value)}</${name}>`;
const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>${body}`;

export function buildRegisterTransferXml(params: { qrUrl: string; vehicleNumber: string; transportType: number; carrierVatNumber: string; timeStamp?: string }) {
  const vehicle = params.vehicleNumber.trim().slice(0, 50);
  return xml(`<Transport>${tag('qrUrl', params.qrUrl)}<transportDetail>${tag('vehicleNumber', vehicle)}${tag('transportType', params.transportType)}${params.timeStamp ? tag('timeStamp', params.timeStamp) : ''}${tag('carrierVatNumber', params.carrierVatNumber)}</transportDetail></Transport>`);
}

export function buildConfirmOutcomeXml(params: { qrUrl: string; outcome: DeliveryOutcome; deliveredWithoutRecipient?: boolean; packaging?: Array<{ type: number; quantity: number; title?: string }> }) {
  const packaging = (params.packaging || [])
    .filter((item) => Number(item.quantity) > 0)
    .map((item) => `<deliveredPackaging>${tag('packagingType', item.type)}${tag('quantity', Math.round(Number(item.quantity)))}${item.type === 6 && item.title ? tag('otherPackagingTypeTitle', item.title) : ''}</deliveredPackaging>`)
    .join('');
  return xml(`<ConfirmDeliveryOutcomeRequest>${tag('qrUrl', params.qrUrl)}${tag('outcome', params.outcome)}${params.deliveredWithoutRecipient ? tag('deliveredWithoutRecipient', 'true') : ''}${packaging}</ConfirmDeliveryOutcomeRequest>`);
}

export function buildConfirmReturnXml(qrUrl: string) {
  return xml(`<ConfirmDeliveryReturnRequest>${tag('qrUrl', qrUrl)}</ConfirmDeliveryReturnRequest>`);
}

export function buildRejectDeliveryXml(params: { qrUrl: string; reason?: string }) {
  const reason = String(params.reason || '').trim();
  return xml(`<RejectDeliveryNoteRequest>${tag('qrUrl', params.qrUrl)}${reason ? tag('rejectionReason', reason.slice(0, 500)) : ''}</RejectDeliveryNoteRequest>`);
}

/** Friendlier text for the business errors of §6.2 that a user can actually meet. */
const ERROR_TEXT: Record<string, string> = {
  '800': 'Η έναρξη δεν επιτρέπεται στην τρέχουσα κατάσταση του δελτίου.',
  '802': 'Το δελτίο δεν μπορεί να απορριφθεί στην τρέχουσα κατάστασή του.',
  '803': 'Μόνο ο παραλήπτης μπορεί να απορρίψει το δελτίο.',
  '805': 'Το παραστατικό δεν είναι δελτίο διακίνησης.',
  '806': 'Δεν βρέθηκε το QR.',
  '807': 'Μη έγκυρο QR.',
  '808': 'Δεν βρέθηκε παραστατικό για αυτό το QR.',
  '809': 'Το δελτίο έχει ακυρωθεί.',
  '810': 'Το δελτίο έχει απορριφθεί από τον παραλήπτη.',
  '811': 'Η παράδοση έχει ήδη ολοκληρωθεί.',
  '812': 'Έχει ήδη δηλωθεί αποτυχία παράδοσης.',
  '813': 'Η διακίνηση δεν έχει ξεκινήσει ακόμα. Κάντε πρώτα «Έναρξη διακίνησης».',
  '814': 'Στη μερική παράδοση δηλώστε τις συσκευασίες που παραδόθηκαν.',
  '817': 'Μόνο ο μεταφορέας δηλώνει αποτυχία παράδοσης.',
  '818': 'Ο παραλήπτης δεν μπορεί να δηλώσει αποτυχία παράδοσης σε B2B.',
  '819': 'Ο μεταφορέας έχει ήδη δηλώσει παράδοση· απομένει η επιβεβαίωση από τον παραλήπτη.',
  '821': 'Η έναρξη δεν επιτρέπεται: το δελτίο έχει ακυρωθεί.',
  '822': 'Μόνο δελτία σε κατάσταση «Καταχωρήθηκε», «Σε διακίνηση» ή «Παραδόθηκε» μπορούν να απορριφθούν.',
  '825': 'Η επιστροφή δεν επιτρέπεται: το δελτίο έχει ακυρωθεί.',
  '826': 'Η επιστροφή δεν επιτρέπεται: η διακίνηση έχει ολοκληρωθεί.',
  '827': 'Η επιστροφή δεν επιτρέπεται: η διακίνηση δεν έχει ξεκινήσει.',
  '828': 'Η επιστροφή δεν επιτρέπεται στην τρέχουσα κατάσταση.',
  '829': 'Μόνο ο εκδότης δηλώνει επιστροφή.',
  '830': 'Μόνο ο μεταφορέας δηλώνει μερική παράδοση.',
  '831': 'Ο μεταφορέας έχει ήδη δηλώσει μερική παράδοση.',
  '833': 'Μόνο ο παραλήπτης ή ο μεταφορέας μπορεί να δηλώσει παράδοση.',
  '834': 'Η δήλωση παράδοσης δεν επιτρέπεται στην τρέχουσα κατάσταση.',
};

export interface DeliveryActionResult {
  ok: boolean;
  statusCode: string | null;
  eventMark: string | null;
  errors: string[];
}

export function parseDeliveryActionResponse(body: string): DeliveryActionResult {
  const trimmed = String(body || '').trim();
  if (!trimmed || /<!DOCTYPE|<!ENTITY/i.test(trimmed) || XMLValidator.validate(trimmed) !== true) {
    return { ok: false, statusCode: null, eventMark: null, errors: ['Μη αναμενόμενη απάντηση από την ΑΑΔΕ.'] };
  }
  const parsed = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false }).parse(trimmed);
  const root = parsed.ResponseDoc || parsed;
  const response = Array.isArray(root.response) ? root.response[0] : root.response || root;
  const statusCode = response?.statusCode ? String(response.statusCode) : null;
  const rawErrors = response?.errors?.error;
  const errors = (Array.isArray(rawErrors) ? rawErrors : rawErrors ? [rawErrors] : []).map((error: any) => {
    const code = String(error?.code ?? '').trim();
    return ERROR_TEXT[code] || [String(error?.message ?? '').trim(), code ? `(κωδ. ${code})` : ''].filter(Boolean).join(' ');
  });
  const eventMark = [response?.transferMark, response?.deliveryOutcomeMark, response?.deliveryReturnMark, response?.rejectMark]
    .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
    .find(Boolean) || null;
  return { ok: statusCode === 'Success' && errors.length === 0, statusCode, eventMark, errors };
}

/** Which myDATA environment a scanned QR belongs to. */
export function environmentFromQrUrl(qrUrl: string): 'dev' | 'prod' {
  try { return /mydataapidev|dev\./i.test(new URL(qrUrl).host) ? 'dev' : 'prod'; } catch { return 'prod'; }
}
