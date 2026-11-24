import { XMLParser, XMLValidator } from 'fast-xml-parser';

/**
 * Ψηφιακό Δελτίο Αποστολής — GetDeliveryNoteStatus (myDATA DeliveryNote v2.0.2 §3.2.4, §5.2, §7.1–7.2).
 * Read-only: current lifecycle state and history of a movement document, by MARK.
 */
export const DELIVERY_STATUS_LABELS: Record<string, { label: string; tone: 'slate' | 'sky' | 'emerald' | 'amber' | 'red' }> = {
  '1': { label: 'Καταχωρήθηκε · δεν έχει ξεκινήσει', tone: 'slate' },
  '2': { label: 'Ακυρώθηκε', tone: 'red' },
  '3': { label: 'Σε διακίνηση', tone: 'sky' },
  '4': { label: 'Απορρίφθηκε από τον παραλήπτη', tone: 'red' },
  '5': { label: 'Παραδόθηκε από τον μεταφορέα · αναμένει επιβεβαίωση παραλήπτη', tone: 'amber' },
  '7': { label: 'Αποτυχία παράδοσης', tone: 'red' },
  '8': { label: 'Ολοκληρώθηκε', tone: 'emerald' },
  '9': { label: 'Επιστρέφει στον αποστολέα', tone: 'amber' },
};

const NAME_TO_CODE: Record<string, string> = {
  registered: '1', cancelled: '2', canceled: '2', intransit: '3', rejected: '4', deliveredbycarrier: '5', faileddelivery: '7', completed: '8', intransitreturn: '9',
};

export const DELIVERY_EVENT_LABELS: Record<string, string> = {
  RegisterTransfer: 'Έναρξη διακίνησης / μεταφόρτωση',
  ConfirmOutcome: 'Αποτέλεσμα παράδοσης / επιβεβαίωση παραλαβής',
  Rejection: 'Απόρριψη από τον παραλήπτη',
  ConfirmReturn: 'Επιβεβαίωση επιστροφής από τον εκδότη',
  RegisterTransferReturn: 'Επιστροφή (μη πλήρης παράδοση)',
};

const OUTCOME_LABELS: Record<string, string> = { FULL: 'πλήρης', PARTIAL: 'μερική', NONE: 'καμία (αποτυχία)' };

export interface DeliveryStatusEvent {
  type: string;
  label: string;
  at: string | null;
  actorVat: string | null;
  mark: string | null;
  detail: string | null;
}

export interface DeliveryStatusResult {
  ok: boolean;
  statusCode: string | null;
  statusLabel: string;
  tone: 'slate' | 'sky' | 'emerald' | 'amber' | 'red';
  invoiceMark: string | null;
  dispatchTimestamp: string | null;
  events: DeliveryStatusEvent[];
  errors: string[];
}

const asArray = <T,>(value: T | T[] | undefined | null): T[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const text = (value: unknown) => (value === undefined || value === null || value === '' ? null : String(value).trim());

function resolveStatusCode(raw: unknown): string | null {
  const value = text(raw);
  if (!value) return null;
  if (/^\d+$/.test(value)) return value;
  // myDATA answers either the code (3) or the name in any style: InTransit, IN_TRANSIT, IN_TRANSIT_RETURN…
  const key = value.toLowerCase().replace(/[^a-z]/g, '');
  return NAME_TO_CODE[key] || value;
}

export function parseDeliveryNoteStatusXml(xml: string): DeliveryStatusResult {
  const empty = (errors: string[]): DeliveryStatusResult => ({ ok: false, statusCode: null, statusLabel: 'Δεν ανακτήθηκε η κατάσταση', tone: 'slate', invoiceMark: null, dispatchTimestamp: null, events: [], errors });
  const trimmed = String(xml || '').trim();
  if (!trimmed) return empty(['Κενή απάντηση από την ΑΑΔΕ.']);
  if (/<!DOCTYPE|<!ENTITY/i.test(trimmed) || XMLValidator.validate(trimmed) !== true) return empty(['Μη αναμενόμενη απάντηση από την ΑΑΔΕ.']);
  const parsed = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, processEntities: true }).parse(trimmed);
  const root = parsed.GetDeliveryNoteStatusResponse || parsed.DeliveryNoteStatusResponse || parsed.ResponseDoc || parsed;
  const response = root.response && !root.status ? asArray(root.response)[0] : root;
  const errors = asArray(response?.errors?.error).map((error: any) => [text(error?.code), text(error?.message)].filter(Boolean).join(' · ')).filter(Boolean);
  const statusCode = resolveStatusCode(response?.status);
  if (!statusCode) return empty(errors.length ? errors : [text(response?.statusCode) || 'Η ΑΑΔΕ δεν επέστρεψε κατάσταση.']);
  const meta = DELIVERY_STATUS_LABELS[statusCode] || { label: `Κατάσταση ${statusCode}`, tone: 'slate' as const };
  // XSD: <lifecycleHistory> repeats once per event (DeliveryEventType); tolerate a wrapped list too.
  const rawEvents = asArray<any>(response.lifecycleHistory).flatMap((entry: any) => (entry?.eventType
    ? [entry]
    : asArray(entry?.DeliveryEvent ?? entry?.deliveryEvent ?? entry?.event)));
  const events = rawEvents.map((event: any): DeliveryStatusEvent => {
    const type = text(event?.eventType) || '—';
    const transport = event?.transportDetails;
    const outcome = event?.outcomeDetails;
    const rejection = event?.rejectionDetails;
    const detail = transport
      ? [text(transport.vehicleNumber) ? `Όχημα ${text(transport.vehicleNumber)}` : null, text(transport.carrierVatNumber) ? `Μεταφορέας ΑΦΜ ${text(transport.carrierVatNumber)}` : null].filter(Boolean).join(' · ')
      : outcome
        ? `Παράδοση ${OUTCOME_LABELS[String(text(outcome.outcome) || '').toUpperCase()] || text(outcome.outcome) || ''}${String(text(outcome.deliveredWithoutRecipient)) === 'true' ? ' · χωρίς παρουσία παραλήπτη' : ''}`
        : rejection
          ? `Αιτία: ${text(rejection.reason) || '—'}`
          : null;
    return { type, label: DELIVERY_EVENT_LABELS[type] || type, at: text(event?.eventTimestamp), actorVat: text(event?.actorVat), mark: text(event?.mark), detail: detail || null };
  }).sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  return {
    ok: true,
    statusCode,
    statusLabel: meta.label,
    tone: meta.tone,
    invoiceMark: text(response.invoiceMark),
    dispatchTimestamp: text(response.dispatchTimestamp),
    events,
    errors,
  };
}
