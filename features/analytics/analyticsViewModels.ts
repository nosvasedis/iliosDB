import {
  dedupeIdenticalFinanceEvents,
  FinanceAnalytics,
  FinanceLineEvent,
  ResolvedFinancePeriod,
} from '../../utils/financeAnalytics';
import { getSpecialCreationDisplayNote, getSpecialCreationNoteKey, isSpecialCreationSku } from '../../utils/specialCreationSku';
import { formatDecimal } from '../../utils/numberFormat';
import type { PeriodWindow } from '../dashboard/dashboardCommandViewModels';

// ─── Window helpers ────────────────────────────────────────────────────────────

export function eventsInWindow(events: FinanceLineEvent[], window: PeriodWindow): FinanceLineEvent[] {
  const start = window.start.getTime();
  const end = window.end.getTime();
  return dedupeIdenticalFinanceEvents(
    events.filter((event) => {
      const time = new Date(event.date).getTime();
      return Number.isFinite(time) && time >= start && time < end;
    }),
  );
}

// ─── Profitability by dimension ────────────────────────────────────────────────

export type ProfitDimension = 'category' | 'collection' | 'product' | 'customer';

export const PROFIT_DIMENSIONS: Array<{ value: ProfitDimension; label: string; singular: string }> = [
  { value: 'category', label: 'Κατηγορίες', singular: 'Κατηγορία' },
  { value: 'collection', label: 'Συλλογές', singular: 'Συλλογή' },
  { value: 'product', label: 'Κωδικοί', singular: 'Κωδικός' },
  { value: 'customer', label: 'Πελάτες', singular: 'Πελάτης' },
];

export const SPECIAL_CREATIONS_LABEL = 'Ειδικές κατασκευές (SP)';

export type AbcClass = 'A' | 'B' | 'C';

export interface ProfitabilityRow {
  key: string;
  label: string;
  /** SKU for product rows (used for registry hand-off). */
  sku?: string;
  isSpecial: boolean;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  quantity: number;
  orders: number;
  /** Share of total revenue, 0–100. */
  share: number;
  /** Revenue in the comparison window, null when there is no comparison. */
  previousRevenue: number | null;
  /** % change of revenue vs comparison window, null when not comparable. */
  delta: number | null;
  abc: AbcClass;
  missingCost: boolean;
}

function dimensionKey(event: FinanceLineEvent, dimension: ProfitDimension): { key: string; label: string; sku?: string } {
  const special = isSpecialCreationSku(event.sku);
  switch (dimension) {
    case 'category':
      return special ? { key: '__sp__', label: SPECIAL_CREATIONS_LABEL } : { key: event.category || '—', label: event.category || 'Χωρίς κατηγορία' };
    case 'collection':
      if (special) return { key: '__sp__', label: SPECIAL_CREATIONS_LABEL };
      return event.collectionId === null
        ? { key: 'none', label: event.collectionName || 'Χωρίς συλλογή' }
        : { key: String(event.collectionId), label: event.collectionName };
    case 'product':
      return special
        ? { key: `SP::${getSpecialCreationNoteKey(event.itemNote)}`, label: getSpecialCreationDisplayNote(event.sku, event.itemNote) || 'SP', sku: event.sku }
        : { key: event.sku, label: event.sku, sku: event.sku };
    case 'customer':
      return { key: event.customerId || event.customerName, label: event.customerName || 'Χωρίς πελάτη' };
  }
}

interface Accumulator {
  key: string;
  label: string;
  sku?: string;
  isSpecial: boolean;
  revenue: number;
  cost: number;
  profit: number;
  quantity: number;
  orderIds: Set<string>;
  missingCost: boolean;
}

function accumulate(events: FinanceLineEvent[], dimension: ProfitDimension): Map<string, Accumulator> {
  const map = new Map<string, Accumulator>();
  events.forEach((event) => {
    const { key, label, sku } = dimensionKey(event, dimension);
    const row = map.get(key) ?? {
      key,
      label,
      sku,
      isSpecial: key === '__sp__' || key.startsWith('SP::'),
      revenue: 0,
      cost: 0,
      profit: 0,
      quantity: 0,
      orderIds: new Set<string>(),
      missingCost: false,
    };
    row.revenue += event.net;
    row.cost += event.estimatedCost;
    row.profit += event.profit;
    row.quantity += event.quantity;
    row.orderIds.add(event.orderId);
    if (event.costSource === 'missing' || (event.costWarning && !isSpecialCreationSku(event.sku))) row.missingCost = true;
    map.set(key, row);
  });
  return map;
}

/** Pareto classes on revenue: A = first 80%, B = next 15%, C = the tail. Rows must be sorted by revenue desc. */
function assignAbc(rows: ProfitabilityRow[], total: number): void {
  let running = 0;
  rows.forEach((row) => {
    const before = total > 0 ? running / total : 1;
    running += Math.max(0, row.revenue);
    row.abc = before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C';
  });
}

export function buildProfitabilityRows(
  current: FinanceLineEvent[],
  previous: FinanceLineEvent[] | null,
  dimension: ProfitDimension,
): ProfitabilityRow[] {
  const currentMap = accumulate(current, dimension);
  const previousMap = previous ? accumulate(previous, dimension) : null;
  const total = Array.from(currentMap.values()).reduce((sum, row) => sum + row.revenue, 0);

  const rows: ProfitabilityRow[] = Array.from(currentMap.values()).map((row) => {
    const previousRevenue = previousMap ? previousMap.get(row.key)?.revenue ?? 0 : null;
    return {
      key: row.key,
      label: row.label,
      sku: row.sku,
      isSpecial: row.isSpecial,
      revenue: row.revenue,
      cost: row.cost,
      profit: row.profit,
      margin: row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0,
      quantity: row.quantity,
      orders: row.orderIds.size,
      share: total > 0 ? (row.revenue / total) * 100 : 0,
      previousRevenue,
      delta: previousRevenue !== null && previousRevenue > 0.005 ? ((row.revenue - previousRevenue) / previousRevenue) * 100 : null,
      abc: 'C',
      missingCost: row.missingCost,
    };
  });

  rows.sort((a, b) => b.revenue - a.revenue);
  assignAbc(rows, total);
  return rows;
}

export interface ParetoSummary {
  count: number;
  aCount: number;
  bCount: number;
  cCount: number;
  /** Share (0–100) of rows that make up the A class. */
  aShareOfRows: number;
  top1Share: number;
  top5Share: number;
}

export function summarizePareto(rows: ProfitabilityRow[]): ParetoSummary {
  const count = rows.length;
  const aCount = rows.filter((row) => row.abc === 'A').length;
  const bCount = rows.filter((row) => row.abc === 'B').length;
  return {
    count,
    aCount,
    bCount,
    cCount: count - aCount - bCount,
    aShareOfRows: count > 0 ? (aCount / count) * 100 : 0,
    top1Share: rows[0]?.share ?? 0,
    top5Share: rows.slice(0, 5).reduce((sum, row) => sum + row.share, 0),
  };
}

// ─── Forecast ──────────────────────────────────────────────────────────────────

export interface PeriodForecast {
  /** 0–100 of the period that has elapsed. */
  elapsedPct: number;
  projectedRevenue: number;
  projectedProfit: number;
  daysLeft: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Linear run-rate projection to the end of a bounded period that is still running. */
export function forecastPeriod(period: ResolvedFinancePeriod, revenue: number, profit: number, now: Date = new Date()): PeriodForecast | null {
  if (!period.start || !period.end) return null;
  const total = period.end.getTime() - period.start.getTime();
  const elapsed = Math.min(total, Math.max(0, now.getTime() - period.start.getTime()));
  if (total <= 0 || elapsed >= total || elapsed < DAY_MS * 3) return null;
  const factor = total / elapsed;
  return {
    elapsedPct: (elapsed / total) * 100,
    projectedRevenue: revenue * factor,
    projectedProfit: profit * factor,
    daysLeft: Math.ceil((total - elapsed) / DAY_MS),
  };
}

// ─── Trend with last year overlay ──────────────────────────────────────────────

export interface TrendPoint {
  key: string;
  label: string;
  revenue: number;
  profit: number;
  margin: number;
  pieces: number;
  orders: number;
  lastYearRevenue: number;
  lastYearProfit: number;
}

export function buildTrendWithLastYear(events: FinanceLineEvent[], anchor: Date = new Date(), months = 12): TrendPoint[] {
  type Bucket = { revenue: number; profit: number; pieces: number; orderIds: Set<string> };
  const buckets = new Map<string, Bucket>();
  dedupeIdenticalFinanceEvents(events).forEach((event) => {
    const date = new Date(event.date);
    if (!Number.isFinite(date.getTime())) return;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const bucket = buckets.get(key) ?? { revenue: 0, profit: 0, pieces: 0, orderIds: new Set<string>() };
    bucket.revenue += event.net;
    bucket.profit += event.profit;
    bucket.pieces += event.quantity;
    bucket.orderIds.add(event.orderId);
    buckets.set(key, bucket);
  });

  const points: TrendPoint[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
    const current = buckets.get(`${date.getFullYear()}-${date.getMonth()}`);
    const lastYear = buckets.get(`${date.getFullYear() - 1}-${date.getMonth()}`);
    const month = date.toLocaleDateString('el-GR', { month: 'short' }).replace('.', '');
    const revenue = current?.revenue ?? 0;
    const profit = current?.profit ?? 0;
    points.push({
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: `${month.charAt(0).toUpperCase()}${month.slice(1)} ${String(date.getFullYear()).slice(-2)}`,
      revenue,
      profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      pieces: current?.pieces ?? 0,
      orders: current?.orderIds.size ?? 0,
      lastYearRevenue: lastYear?.revenue ?? 0,
      lastYearProfit: lastYear?.profit ?? 0,
    });
  }
  return points;
}

// ─── Insights ──────────────────────────────────────────────────────────────────

export type InsightTone = 'positive' | 'negative' | 'warning' | 'info';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  action?: 'missing-costs' | 'legal' | 'profitability-category' | 'profitability-customer' | 'profitability-product';
}

export interface InsightInput {
  finance: FinanceAnalytics;
  previous: { revenue: number; profit: number; margin: number } | null;
  comparisonLabel: string | null;
  forecast: PeriodForecast | null;
  categoryRows: ProfitabilityRow[];
  customerRows: ProfitabilityRow[];
  productRows: ProfitabilityRow[];
  missingCostCount: number;
  /** Average monthly net revenue over the last 12 months. */
  monthlyRunRate: number;
}

const pct = (value: number, digits = 1) => `${formatDecimal(value, digits)}%`;
const money = (value: number) => `${formatDecimal(value, 0)} €`;

/** Plain-language observations ranked by importance (warnings first). Pure; amounts are rounded for prose. */
export function buildInsights(input: InsightInput): Insight[] {
  const { finance, previous, comparisonLabel, forecast, categoryRows, customerRows, productRows, missingCostCount, monthlyRunRate } = input;
  const { totals, legal } = finance;
  const insights: Insight[] = [];

  if (missingCostCount > 0) {
    insights.push({
      id: 'missing-costs',
      tone: 'warning',
      title: `${missingCostCount} ${missingCostCount === 1 ? 'κωδικός χωρίς κόστος' : 'κωδικοί χωρίς κόστος'}`,
      detail: 'Το κέρδος εμφανίζεται μεγαλύτερο από το πραγματικό μέχρι να συμπληρωθούν στο Μητρώο.',
      action: 'missing-costs',
    });
  }

  if (legal.issuedCount > 0 && Math.abs(legal.netGap) >= 1) {
    const gapShare = totals.realizedNet > 0 ? Math.abs(legal.netGap) / totals.realizedNet : 1;
    insights.push({
      id: 'legal-gap',
      tone: gapShare > 0.05 ? 'warning' : 'info',
      title: `Απόκλιση ${money(Math.abs(legal.netGap))} από τα παραστατικά`,
      detail: legal.netGap > 0
        ? 'Έχουν αποσταλεί περισσότερα από όσα έχουν τιμολογηθεί στην περίοδο.'
        : 'Έχουν τιμολογηθεί περισσότερα από όσα καταγράφονται ως αποστολές.',
      action: 'legal',
    });
  }

  if (previous && comparisonLabel && previous.revenue > 0) {
    const change = ((totals.realizedNet - previous.revenue) / previous.revenue) * 100;
    if (Math.abs(change) >= 1) {
      insights.push({
        id: 'revenue-change',
        tone: change > 0 ? 'positive' : 'negative',
        title: `Έσοδα ${change > 0 ? '+' : ''}${pct(change)} ${comparisonLabel}`,
        detail: `${money(totals.realizedNet)} έναντι ${money(previous.revenue)}.`,
      });
    }
    const marginChange = totals.margin - previous.margin;
    if (previous.revenue > 0 && Math.abs(marginChange) >= 1) {
      insights.push({
        id: 'margin-change',
        tone: marginChange > 0 ? 'positive' : 'negative',
        title: `Περιθώριο ${marginChange > 0 ? '+' : ''}${formatDecimal(marginChange, 1)} μον.`,
        detail: `Από ${pct(previous.margin)} σε ${pct(totals.margin)} — ${marginChange > 0 ? 'καλύτερο μείγμα ή τιμές' : 'ελέγξτε εκπτώσεις και κόστη'}.`,
      });
    }
  }

  if (forecast && totals.realizedNet > 0) {
    insights.push({
      id: 'forecast',
      tone: 'info',
      title: `Πρόβλεψη περιόδου ≈ ${money(forecast.projectedRevenue)}`,
      detail: `Με τον τρέχοντα ρυθμό · ${pct(forecast.elapsedPct, 0)} της περιόδου έχει περάσει, ${forecast.daysLeft} ημέρες απομένουν.`,
    });
  }

  const topCustomer = customerRows[0];
  const top5 = customerRows.slice(0, 5).reduce((sum, row) => sum + row.share, 0);
  if (topCustomer && customerRows.length >= 3 && (topCustomer.share >= 25 || top5 >= 70)) {
    insights.push({
      id: 'customer-concentration',
      tone: 'warning',
      title: 'Υψηλή εξάρτηση από λίγους πελάτες',
      detail: `Ο/η ${topCustomer.label} φέρνει ${pct(topCustomer.share, 0)} και οι 5 πρώτοι ${pct(top5, 0)} των εσόδων.`,
      action: 'profitability-customer',
    });
  }

  const meaningful = categoryRows.filter((row) => row.share >= 5 && !row.isSpecial);
  if (meaningful.length >= 2) {
    const best = meaningful.reduce((a, b) => (b.margin > a.margin ? b : a));
    const worst = meaningful.reduce((a, b) => (b.margin < a.margin ? b : a));
    if (best.key !== worst.key && best.margin - worst.margin >= 5) {
      insights.push({
        id: 'category-margin',
        tone: 'info',
        title: `${best.label}: το πιο κερδοφόρο (${pct(best.margin, 0)})`,
        detail: `Το χαμηλότερο περιθώριο έχει «${worst.label}» με ${pct(worst.margin, 0)} σε ${pct(worst.share, 0)} των εσόδων.`,
        action: 'profitability-category',
      });
    }
  }

  const risers = productRows.filter((row) => row.delta !== null && row.share >= 1).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  const riser = risers[0];
  if (riser && (riser.delta ?? 0) >= 25) {
    insights.push({
      id: 'product-riser',
      tone: 'positive',
      title: `${riser.label} σε άνοδο (+${pct(riser.delta ?? 0, 0)})`,
      detail: `${money(riser.revenue)} στην περίοδο έναντι ${money(riser.previousRevenue ?? 0)}.`,
      action: 'profitability-product',
    });
  }
  const faller = risers[risers.length - 1];
  if (faller && faller !== riser && (faller.delta ?? 0) <= -25) {
    insights.push({
      id: 'product-faller',
      tone: 'negative',
      title: `${faller.label} σε πτώση (${pct(faller.delta ?? 0, 0)})`,
      detail: `${money(faller.revenue)} στην περίοδο έναντι ${money(faller.previousRevenue ?? 0)}.`,
      action: 'profitability-product',
    });
  }

  const listValue = totals.realizedNet + totals.discount;
  const discountRate = listValue > 0 ? (totals.discount / listValue) * 100 : 0;
  if (discountRate >= 8) {
    insights.push({
      id: 'discounts',
      tone: discountRate >= 15 ? 'warning' : 'info',
      title: `Εκπτώσεις ${pct(discountRate)} της αξίας`,
      detail: `${money(totals.discount)} δόθηκαν σε εκπτώσεις στην περίοδο.`,
    });
  }

  if (monthlyRunRate > 0 && totals.backlogNet > 0) {
    const months = totals.backlogNet / monthlyRunRate;
    insights.push({
      id: 'backlog-cover',
      tone: 'info',
      title: `Ανοιχτές παραγγελίες ≈ ${formatDecimal(months, 1)} μήνες πωλήσεων`,
      detail: `${money(totals.backlogNet)} σε ${totals.activeOrderCount} ανοιχτές παραγγελίες, με μέσο μηνιαίο τζίρο ${money(monthlyRunRate)}.`,
    });
  }

  const order: Record<InsightTone, number> = { warning: 0, negative: 1, positive: 2, info: 3 };
  return insights.sort((a, b) => order[a.tone] - order[b.tone]);
}
