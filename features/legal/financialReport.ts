import type {
  LegalArchiveRecord,
  LegalDocument,
  LegalDocumentLine,
  LegalIssuerSettings,
  ProformaDocument,
} from '../../types';
import { normalizeGreekForSearch } from '../../utils/greekSearch';
import {
  AADE_VAT_CATEGORY_OPTIONS,
  getLegalDocumentDisplayNumber,
} from '../../utils/legalDocuments';

export type LegalReportType =
  | 'invoice'
  | 'service_invoice'
  | 'invoice_delivery'
  | 'credit'
  | 'delivery_note'
  | 'proforma';

export type LegalReportStatus = 'issued' | 'pending' | 'cancelled' | 'other';
export type LegalReportSort = 'date' | 'customer' | 'type';

export type LegalReportPeriod =
  | { kind: 'all' }
  | { kind: 'month'; year: number; month: number }
  | { kind: 'quarter'; year: number; quarter: number }
  | { kind: 'year'; year: number }
  | { kind: 'custom'; from: string; to: string };

export const LEGAL_REPORT_TYPES: Array<{ id: LegalReportType; label: string; shortLabel: string }> = [
  { id: 'invoice', label: 'Τιμολόγια Πώλησης', shortLabel: 'Τιμολόγιο' },
  { id: 'service_invoice', label: 'Τιμολόγια Παροχής Υπηρεσιών', shortLabel: 'Παροχή Υπηρεσιών' },
  { id: 'invoice_delivery', label: 'Τιμολόγια - Δελτία Αποστολής', shortLabel: 'Τιμολόγιο-ΔΑ' },
  { id: 'credit', label: 'Πιστωτικά Τιμολόγια', shortLabel: 'Πιστωτικό' },
  { id: 'delivery_note', label: 'Δελτία Αποστολής', shortLabel: 'Δελτίο Αποστολής' },
  { id: 'proforma', label: 'Προτιμολόγια', shortLabel: 'Προτιμολόγιο' },
];

/** Revenue documents only: delivery notes and proformas are opt-in so totals stay fiscal by default. */
export const DEFAULT_LEGAL_REPORT_TYPES: LegalReportType[] = [
  'invoice',
  'service_invoice',
  'invoice_delivery',
  'credit',
];

export const LEGAL_REPORT_STATUSES: Array<{ id: Exclude<LegalReportStatus, 'other'>; label: string }> = [
  { id: 'issued', label: 'Εκδοθέντα' },
  { id: 'pending', label: 'Σε έλεγχο' },
  { id: 'cancelled', label: 'Ακυρωμένα' },
];

export const LEGAL_REPORT_MONTHS = [
  'Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος',
  'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος',
];
export const LEGAL_REPORT_MONTHS_SHORT = [
  'Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ',
];
export const LEGAL_REPORT_QUARTERS = ['Α΄', 'Β΄', 'Γ΄', 'Δ΄'];

const pad = (value: number) => String(value).padStart(2, '0');
const lastDayOfMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const displayDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export function resolveLegalReportPeriod(
  period: LegalReportPeriod,
): { from: string; to: string; label: string } | null {
  switch (period.kind) {
    case 'month':
      return {
        from: `${period.year}-${pad(period.month + 1)}-01`,
        to: `${period.year}-${pad(period.month + 1)}-${pad(lastDayOfMonth(period.year, period.month))}`,
        label: `${LEGAL_REPORT_MONTHS[period.month]} ${period.year}`,
      };
    case 'quarter': {
      const firstMonth = (period.quarter - 1) * 3;
      return {
        from: `${period.year}-${pad(firstMonth + 1)}-01`,
        to: `${period.year}-${pad(firstMonth + 3)}-${pad(lastDayOfMonth(period.year, firstMonth + 2))}`,
        label: `${LEGAL_REPORT_QUARTERS[period.quarter - 1]} τρίμηνο ${period.year} (${LEGAL_REPORT_MONTHS_SHORT[firstMonth]} – ${LEGAL_REPORT_MONTHS_SHORT[firstMonth + 2]})`,
      };
    }
    case 'year':
      return { from: `${period.year}-01-01`, to: `${period.year}-12-31`, label: `Έτος ${period.year}` };
    case 'custom': {
      if (!period.from && !period.to) return null;
      const from = period.from || '0000-01-01';
      const to = period.to || '9999-12-31';
      const label = period.from && period.to
        ? `${displayDate(period.from)} – ${displayDate(period.to)}`
        : period.from
          ? `Από ${displayDate(period.from)}`
          : `Έως ${displayDate(period.to)}`;
      return { from, to, label };
    }
    default:
      return null;
  }
}

export function isSameLegalReportPeriod(a: LegalReportPeriod, b: LegalReportPeriod): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function getLegalReportQuickPeriods(now = new Date()): Array<{ id: string; label: string; period: LegalReportPeriod }> {
  const year = now.getFullYear();
  const month = now.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return [
    { id: 'this_month', label: 'Αυτός ο μήνας', period: { kind: 'month', year, month } },
    {
      id: 'previous_month',
      label: 'Προηγούμενος μήνας',
      period: month === 0 ? { kind: 'month', year: year - 1, month: 11 } : { kind: 'month', year, month: month - 1 },
    },
    { id: 'this_quarter', label: 'Αυτό το τρίμηνο', period: { kind: 'quarter', year, quarter } },
    {
      id: 'previous_quarter',
      label: 'Προηγούμενο τρίμηνο',
      period: quarter === 1 ? { kind: 'quarter', year: year - 1, quarter: 4 } : { kind: 'quarter', year, quarter: quarter - 1 },
    },
    { id: 'this_year', label: 'Φέτος', period: { kind: 'year', year } },
    { id: 'previous_year', label: 'Πέρσι', period: { kind: 'year', year: year - 1 } },
  ];
}

export function getLegalReportType(record: LegalArchiveRecord): LegalReportType {
  if (record.source === 'proforma') return 'proforma';
  const document = record.document as LegalDocument;
  if (document.aade_document_type === '2.1') return 'service_invoice';
  return document.document_kind;
}

export function getLegalReportStatus(record: LegalArchiveRecord): LegalReportStatus {
  if (record.source === 'proforma') {
    return (record.document as ProformaDocument).status === 'void' ? 'cancelled' : 'issued';
  }
  const document = record.document as LegalDocument;
  if (document.status === 'cancelled') return 'cancelled';
  if (document.status === 'submitted' || ['sending', 'unknown'].includes(document.provider_state || '')) return 'pending';
  if (document.status === 'issued') return 'issued';
  return 'other';
}

/** Why a listed document adds nothing to the totals, or null when it counts. */
function getUncountedReason(record: LegalArchiveRecord): string | null {
  if (record.source === 'proforma') {
    const status = (record.document as ProformaDocument).status;
    if (status === 'void') return 'Ακυρωμένο';
    return status === 'converted' ? 'Μετατράπηκε σε τιμολόγιο' : null;
  }
  switch ((record.document as LegalDocument).status) {
    case 'cancelled':
      return 'Ακυρωμένο';
    case 'failed':
      return 'Αποτυχία έκδοσης';
    case 'draft':
      return 'Πρόχειρο';
    default:
      return null;
  }
}

export interface LegalReportCriteria {
  period: LegalReportPeriod;
  types: ReadonlySet<LegalReportType>;
  statuses: ReadonlySet<LegalReportStatus>;
  customerQuery: string;
}

function matchesCustomer(record: LegalArchiveRecord, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const text = normalizeGreekForSearch([
    record.customerMatch.customer?.full_name,
    record.customerMatch.customer?.vat_number,
    record.document.counterpart?.name,
    record.document.counterpart?.vat_number,
  ].filter(Boolean).join(' '));
  return tokens.every((token) => text.includes(token));
}

const customerTokens = (query: string) => normalizeGreekForSearch(query.trim()).split(/\s+/).filter(Boolean);

export function selectLegalReportRecords(
  records: LegalArchiveRecord[],
  criteria: LegalReportCriteria,
): LegalArchiveRecord[] {
  const range = resolveLegalReportPeriod(criteria.period);
  const tokens = customerTokens(criteria.customerQuery);
  return records.filter((record) => {
    if (!criteria.statuses.has(getLegalReportStatus(record))) return false;
    if (!criteria.types.has(getLegalReportType(record))) return false;
    if (range && (record.document.issue_date < range.from || record.document.issue_date > range.to)) return false;
    return matchesCustomer(record, tokens);
  });
}

/** Narrows a hand-picked list; the period and status were already decided by ticking the rows. */
export function narrowLegalReportRecords(
  records: LegalArchiveRecord[],
  types: ReadonlySet<LegalReportType>,
  customerQuery: string,
): LegalArchiveRecord[] {
  const tokens = customerTokens(customerQuery);
  return records.filter((record) => types.has(getLegalReportType(record)) && matchesCustomer(record, tokens));
}

interface VatBucket {
  ratePercent: number;
  net: number;
  vat: number;
  gross: number;
}

const toCents = (value: unknown) => Math.round((Number(value) || 0) * 100);
const fromCents = (value: number) => value / 100;

function lineRatePercent(line: LegalDocumentLine, fallbackRate: number | null | undefined): number {
  const option = AADE_VAT_CATEGORY_OPTIONS.find((candidate) => candidate.category === Number(line.vat_category));
  if (option) return Math.round(option.value * 100);
  const net = Number(line.net_value) || 0;
  if (net !== 0) return Math.round((Math.abs(Number(line.vat_amount) || 0) / Math.abs(net)) * 100);
  return Math.round((fallbackRate ?? 0) * 100);
}

function documentRatePercent(document: LegalDocument | ProformaDocument): number | null {
  const net = Math.abs(Number(document.totals.net) || 0);
  const vat = Math.abs(Number(document.totals.vat) || 0);
  if (net > 0) return Math.round((vat / net) * 100);
  return document.vat_rate === null || document.vat_rate === undefined ? null : Math.round(document.vat_rate * 100);
}

/**
 * Splits a document by VAT rate in cents. The buckets always add up to the
 * document's own totals: any rounding difference between the lines and the
 * header lands in the largest bucket, so the rate table reconciles to the
 * grand total.
 */
function buildVatBuckets(record: LegalArchiveRecord): VatBucket[] {
  const { document } = record;
  const total = {
    net: Math.abs(toCents(document.totals.net)),
    vat: Math.abs(toCents(document.totals.vat)),
    gross: Math.abs(toCents(document.totals.gross)),
  };
  const byRate = new Map<number, VatBucket>();
  (record.lines as LegalDocumentLine[]).forEach((line) => {
    const ratePercent = lineRatePercent(line, document.vat_rate);
    const bucket = byRate.get(ratePercent) || { ratePercent, net: 0, vat: 0, gross: 0 };
    bucket.net += Math.abs(toCents(line.net_value));
    bucket.vat += Math.abs(toCents(line.vat_amount));
    bucket.gross += Math.abs(toCents(line.gross_value));
    byRate.set(ratePercent, bucket);
  });

  if (byRate.size <= 1) {
    const ratePercent = byRate.size ? [...byRate.keys()][0] : documentRatePercent(document);
    return ratePercent === null ? [] : [{ ratePercent, ...total }];
  }

  const buckets = [...byRate.values()].sort((a, b) => b.net - a.net);
  const largest = buckets[0];
  largest.net += total.net - buckets.reduce((sum, bucket) => sum + bucket.net, 0);
  largest.vat += total.vat - buckets.reduce((sum, bucket) => sum + bucket.vat, 0);
  largest.gross += total.gross - buckets.reduce((sum, bucket) => sum + bucket.gross, 0);
  return buckets;
}

export interface LegalReportRow {
  key: string;
  number: string;
  issueDate: string;
  customerName: string;
  vatNumber: string | null;
  type: LegalReportType;
  typeLabel: string;
  /** Signed: credit notes are negative. */
  net: number;
  vat: number;
  gross: number;
  rateLabel: string;
  counted: boolean;
  note: string | null;
}

export interface LegalReportAmounts {
  count: number;
  net: number;
  vat: number;
  gross: number;
}

export interface LegalFinancialReportData {
  title: string;
  periodLabel: string;
  filterSummary: string;
  generatedAt: string;
  issuer: LegalIssuerSettings | null;
  fileName: string;
  rows: LegalReportRow[];
  totals: LegalReportAmounts;
  /** Rows listed for reference that add nothing to the totals. */
  uncountedCount: number;
  byRate: Array<LegalReportAmounts & { ratePercent: number }>;
  byType: Array<LegalReportAmounts & { type: LegalReportType; label: string }>;
  /** Delivery notes or proformas summed with invoices can repeat the same sale. */
  mixesNonRevenue: boolean;
}

const naturalCompare = (a: string, b: string) => a.localeCompare(b, 'el', { numeric: true, sensitivity: 'base' });

function compareRows(sort: LegalReportSort) {
  const typeOrder = new Map(LEGAL_REPORT_TYPES.map((type, index) => [type.id, index]));
  const byDate = (a: LegalReportRow, b: LegalReportRow) =>
    a.issueDate.localeCompare(b.issueDate) || naturalCompare(a.number, b.number);
  if (sort === 'customer') {
    return (a: LegalReportRow, b: LegalReportRow) => naturalCompare(a.customerName, b.customerName) || byDate(a, b);
  }
  if (sort === 'type') {
    return (a: LegalReportRow, b: LegalReportRow) =>
      (typeOrder.get(a.type) ?? 0) - (typeOrder.get(b.type) ?? 0) || byDate(a, b);
  }
  return byDate;
}

const emptyCents = () => ({ count: 0, net: 0, vat: 0, gross: 0 });
const amountsFromCents = (cents: LegalReportAmounts): LegalReportAmounts => ({
  count: cents.count,
  net: fromCents(cents.net),
  vat: fromCents(cents.vat),
  gross: fromCents(cents.gross),
});

export function buildLegalFinancialReport(params: {
  records: LegalArchiveRecord[];
  periodLabel: string;
  filterSummary?: string;
  sort?: LegalReportSort;
  now?: Date;
}): LegalFinancialReportData {
  const now = params.now || new Date();
  const typeMeta = new Map(LEGAL_REPORT_TYPES.map((type) => [type.id, type]));
  const totals = emptyCents();
  const byRate = new Map<number, LegalReportAmounts>();
  const byType = new Map<LegalReportType, LegalReportAmounts>();

  const rows = params.records.map((record): LegalReportRow => {
    const { document } = record;
    const type = getLegalReportType(record);
    const sign = document.document_kind === 'credit' ? -1 : 1;
    const signed = (value: unknown) => (sign < 0 ? -Math.abs(toCents(value)) : toCents(value));
    const net = signed(document.totals.net);
    const vat = signed(document.totals.vat);
    const gross = signed(document.totals.gross);
    const note = getUncountedReason(record);
    const counted = note === null;
    const buckets = buildVatBuckets(record);

    if (counted) {
      const typeTotals = byType.get(type) || emptyCents();
      [totals, typeTotals].forEach((target) => {
        target.count += 1;
        target.net += net;
        target.vat += vat;
        target.gross += gross;
      });
      byType.set(type, typeTotals);
      buckets.forEach((bucket) => {
        const rateTotals = byRate.get(bucket.ratePercent) || emptyCents();
        rateTotals.count += 1;
        rateTotals.net += sign * bucket.net;
        rateTotals.vat += sign * bucket.vat;
        rateTotals.gross += sign * bucket.gross;
        byRate.set(bucket.ratePercent, rateTotals);
      });
    }

    return {
      key: record.key,
      number: getLegalDocumentDisplayNumber(document),
      issueDate: document.issue_date,
      customerName: record.customerMatch.customer?.full_name || document.counterpart?.name || 'Άγνωστος αντισυμβαλλόμενος',
      vatNumber: document.counterpart?.vat_number || null,
      type,
      typeLabel: typeMeta.get(type)?.shortLabel || type,
      net: fromCents(net),
      vat: fromCents(vat),
      gross: fromCents(gross),
      rateLabel: buckets.length
        ? buckets.map((bucket) => bucket.ratePercent).sort((a, b) => b - a).map((rate) => `${rate}%`).join(' / ')
        : '—',
      counted,
      note,
    };
  }).sort(compareRows(params.sort || 'date'));

  const dates = rows.map((row) => row.issueDate).sort();
  const stamp = dates.length ? `${dates[0]}_${dates[dates.length - 1]}` : now.toISOString().slice(0, 10);
  const countedTypes = new Set(byType.keys());

  return {
    title: 'Οικονομική Αναφορά Παραστατικών',
    periodLabel: params.periodLabel,
    filterSummary: params.filterSummary || '',
    generatedAt: now.toISOString(),
    issuer: (params.records.find((record) => record.document.issuer)?.document.issuer) || null,
    fileName: `Anafora_Parastatikon_${stamp}`,
    rows,
    totals: amountsFromCents(totals),
    uncountedCount: rows.filter((row) => !row.counted).length,
    byRate: [...byRate.entries()]
      .sort(([a], [b]) => b - a)
      .map(([ratePercent, amounts]) => ({ ratePercent, ...amountsFromCents(amounts) })),
    byType: LEGAL_REPORT_TYPES
      .filter((type) => byType.has(type.id))
      .map((type) => ({ type: type.id, label: type.label, ...amountsFromCents(byType.get(type.id)!) })),
    mixesNonRevenue:
      (countedTypes.has('delivery_note') || countedTypes.has('proforma'))
      && DEFAULT_LEGAL_REPORT_TYPES.some((type) => countedTypes.has(type)),
  };
}
