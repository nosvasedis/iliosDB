import type { FinanceBilling, FinanceBillingMode, FinancePeriod } from './types';

export const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Local-calendar yyyy-mm-dd (never UTC-shifted). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Calendar date of a timestamp or ISO date string, in local time. */
export function dateOnly(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : toIsoDate(parsed);
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Adds months clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, months: number, preferredDay?: number): string {
  const date = parseIsoDate(iso);
  const day = preferredDay ?? date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return toIsoDate(target);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / 86_400_000);
}

export const inPeriod = (iso: string | null | undefined, period: FinancePeriod): boolean => {
  const day = dateOnly(iso);
  return !!day && day >= period.from && day <= period.to;
};

export type FinancePeriodPreset = 'month' | 'quarter' | 'year' | 'last12';

export function resolvePeriod(preset: FinancePeriodPreset, today = toIsoDate(new Date())): FinancePeriod {
  const date = parseIsoDate(today);
  const y = date.getFullYear();
  const m = date.getMonth();
  if (preset === 'month') return { from: toIsoDate(new Date(y, m, 1)), to: toIsoDate(new Date(y, m + 1, 0)) };
  if (preset === 'quarter') {
    const q = Math.floor(m / 3) * 3;
    return { from: toIsoDate(new Date(y, q, 1)), to: toIsoDate(new Date(y, q + 3, 0)) };
  }
  if (preset === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: toIsoDate(new Date(y, m - 11, 1)), to: toIsoDate(new Date(y, m + 1, 0)) };
}

/** Same-length window immediately before the given period (for "vs previous" comparisons). */
export function previousPeriod(period: FinancePeriod): FinancePeriod {
  const length = daysBetween(period.from, period.to) + 1;
  const from = parseIsoDate(period.from);
  const isWholeMonths = from.getDate() === 1 && addDays(period.to, 1).endsWith('-01');
  if (isWholeMonths) {
    const months = Math.round(length / 30.44);
    return { from: addMonths(period.from, -months, 1), to: addDays(period.from, -1) };
  }
  return { from: addDays(period.from, -length), to: addDays(period.from, -1) };
}

/** Month keys (yyyy-mm) covering a period, oldest first. */
export function monthKeys(period: FinancePeriod): string[] {
  const keys: string[] = [];
  let cursor = `${period.from.slice(0, 7)}-01`;
  while (cursor.slice(0, 7) <= period.to.slice(0, 7)) {
    keys.push(cursor.slice(0, 7));
    cursor = addMonths(cursor, 1, 1);
  }
  return keys;
}

const GREEK_MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
export const monthLabel = (key: string): string => `${GREEK_MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;

export interface BillingSplit {
  mode: FinanceBillingMode;
  /** Share of the net value collected with an invoice (0–100). */
  tPercent: number;
}

export function normalizeSplit(mode: FinanceBillingMode | null | undefined, tPercent?: number | null): BillingSplit {
  if (mode === 'X') return { mode: 'X', tPercent: 0 };
  if (mode === 'split') return { mode: 'split', tPercent: Math.min(100, Math.max(0, Number(tPercent ?? 50))) };
  return { mode: 'T', tPercent: 100 };
}

/**
 * Expected amounts for a net value. The Τ part is invoiced and carries ΦΠΑ;
 * the Χ part is collected without a document and therefore without ΦΠΑ.
 * An agreed total overrides the computed sum while keeping the Τ/Χ proportion.
 */
export function splitExpected(net: number, vatRate: number, split: BillingSplit, agreedTotal?: number | null): Record<FinanceBilling, number> {
  const share = split.tPercent / 100;
  let t = net * share * (1 + vatRate);
  let x = net * (1 - share);
  if (agreedTotal != null && agreedTotal >= 0 && t + x > 0) {
    const scale = agreedTotal / (t + x);
    t *= scale;
    x *= scale;
  }
  return { T: roundMoney(t), X: roundMoney(x) };
}

export const formatEuro = (value: number, fractionDigits = 2): string =>
  `${(Number.isFinite(value) ? value : 0).toLocaleString('el-GR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })} €`;

export const formatEuroCompact = (value: number): string =>
  Math.abs(value) >= 10_000 ? formatEuro(value, 0) : formatEuro(value);

export const BILLING_LABELS: Record<FinanceBilling, string> = { T: 'Τ · Με παραστατικό', X: 'Χ · Χωρίς παραστατικό' };
export const PAYMENT_METHOD_LABELS = { cash: 'Μετρητά', bank: 'Τράπεζα', card: 'Κάρτα', cheque: 'Επιταγή' } as const;
