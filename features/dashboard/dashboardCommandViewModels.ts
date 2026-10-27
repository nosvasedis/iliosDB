import { Offer, Order, OrderStatus, Product, ProductionBatch, ProductionStage, ProductionType } from '../../types';
import {
  dedupeIdenticalFinanceEvents,
  FinanceAnalytics,
  FinanceLineEvent,
  ResolvedFinancePeriod,
} from '../../utils/financeAnalytics';
import { PRODUCTION_STAGES } from '../../utils/productionStages';
import { isInternalOrder } from '../../utils/orderCustomer';
import type { DeliveryAttentionEntry } from '../../utils/deliveryScheduling';
import type { InventoryAvailability } from '../inventory';
import type { ReadyOrdersSummary } from './dashboardMosaicViewModels';
import type { AdminPage } from '../../surfaces/pageIds';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const DELAYED_BATCH_HOURS = 48;

// ─── Period comparison ─────────────────────────────────────────────────────────

export interface PeriodWindow {
  start: Date;
  end: Date;
}

export interface PeriodComparison {
  current: PeriodWindow;
  previous: PeriodWindow;
  /** e.g. «έναντι ίδιου διαστήματος πέρσι» */
  label: string;
}

/**
 * Compares the elapsed part of the selected period with the same span of the previous one,
 * so a half-finished month is never judged against a full month.
 */
export function resolvePeriodComparison(period: ResolvedFinancePeriod, now: Date = new Date()): PeriodComparison | null {
  if (!period.start || !period.end) return null;
  const start = period.start;
  const cutoff = new Date(Math.min(now.getTime(), period.end.getTime()));
  const elapsed = Math.max(0, cutoff.getTime() - start.getTime());

  let previousStart: Date;
  let label: string;
  if (period.mode === 'current_month') {
    previousStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    label = 'έναντι ίδιου διαστήματος προηγ. μήνα';
  } else if (period.mode === 'current_quarter') {
    previousStart = new Date(start.getFullYear(), start.getMonth() - 3, 1);
    label = 'έναντι ίδιου διαστήματος προηγ. τριμήνου';
  } else {
    previousStart = new Date(start.getFullYear() - 1, start.getMonth(), 1);
    label = 'έναντι ίδιου διαστήματος πέρσι';
  }
  const previousEnd = new Date(Math.min(previousStart.getTime() + elapsed, start.getTime()));

  return { current: { start, end: cutoff }, previous: { start: previousStart, end: previousEnd }, label };
}

export interface EventWindowSummary {
  revenue: number;
  profit: number;
  pieces: number;
  orders: number;
  margin: number;
}

function isWithinWindow(dateValue: string, window: PeriodWindow): boolean {
  const time = new Date(dateValue).getTime();
  return Number.isFinite(time) && time >= window.start.getTime() && time < window.end.getTime();
}

export function summarizeEventsInWindow(events: FinanceLineEvent[], window: PeriodWindow): EventWindowSummary {
  const scoped = dedupeIdenticalFinanceEvents(events.filter((event) => isWithinWindow(event.date, window)));
  const orderIds = new Set<string>();
  let revenue = 0;
  let profit = 0;
  let pieces = 0;
  scoped.forEach((event) => {
    revenue += event.net;
    profit += event.profit;
    pieces += event.quantity;
    orderIds.add(event.orderId);
  });
  return { revenue, profit, pieces, orders: orderIds.size, margin: revenue > 0 ? (profit / revenue) * 100 : 0 };
}

/** Percentage change, or null when there is no meaningful base to compare with. */
export function percentDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || Math.abs(previous) < 0.005) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ─── Monthly trend ─────────────────────────────────────────────────────────────

export interface MonthlyTrendPoint {
  key: string;
  label: string;
  revenue: number;
  profit: number;
  pieces: number;
  orders: number;
  margin: number;
}

function monthLabel(date: Date): string {
  const month = date.toLocaleDateString('el-GR', { month: 'short' }).replace('.', '');
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${String(date.getFullYear()).slice(-2)}`;
}

/** Last `months` calendar months (inclusive of the month containing `anchor`). */
export function buildMonthlyTrend(events: FinanceLineEvent[], anchor: Date = new Date(), months = 12): MonthlyTrendPoint[] {
  const buckets: Array<MonthlyTrendPoint & { orderIds: Set<string> }> = [];
  const index = new Map<string, number>();
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    index.set(key, buckets.length);
    buckets.push({ key, label: monthLabel(date), revenue: 0, profit: 0, pieces: 0, orders: 0, margin: 0, orderIds: new Set() });
  }

  dedupeIdenticalFinanceEvents(events).forEach((event) => {
    const date = new Date(event.date);
    if (!Number.isFinite(date.getTime())) return;
    const bucketIndex = index.get(`${date.getFullYear()}-${date.getMonth()}`);
    if (bucketIndex === undefined) return;
    const bucket = buckets[bucketIndex];
    bucket.revenue += event.net;
    bucket.profit += event.profit;
    bucket.pieces += event.quantity;
    bucket.orderIds.add(event.orderId);
  });

  return buckets.map(({ orderIds, ...bucket }) => ({
    ...bucket,
    orders: orderIds.size,
    margin: bucket.revenue > 0 ? (bucket.profit / bucket.revenue) * 100 : 0,
  }));
}

// ─── Production ────────────────────────────────────────────────────────────────

export interface StageLoadRow {
  stage: ProductionStage;
  label: string;
  shortLabel: string;
  pieces: number;
  batches: number;
  delayed: number;
  onHold: number;
}

function hoursSince(dateValue: string | undefined, now: number): number {
  const time = dateValue ? new Date(dateValue).getTime() : NaN;
  return Number.isFinite(time) ? (now - time) / HOUR_MS : 0;
}

export function buildStageLoad(batches: ProductionBatch[] | undefined, now: Date = new Date()): StageLoadRow[] {
  const nowMs = now.getTime();
  const rows = new Map<string, StageLoadRow>(
    PRODUCTION_STAGES.map((meta) => [
      meta.id,
      { stage: meta.id, label: meta.label, shortLabel: meta.shortLabel, pieces: 0, batches: 0, delayed: 0, onHold: 0 },
    ]),
  );
  (batches ?? []).forEach((batch) => {
    const row = rows.get(batch.current_stage);
    if (!row) return;
    row.pieces += batch.quantity || 0;
    row.batches += 1;
    if (batch.current_stage === ProductionStage.Ready) return;
    if (batch.on_hold) row.onHold += 1;
    else if (hoursSince(batch.updated_at, nowMs) > DELAYED_BATCH_HOURS) row.delayed += 1;
  });
  return Array.from(rows.values());
}

export interface StuckBatchRow {
  id: string;
  label: string;
  stage: ProductionStage;
  quantity: number;
  idleDays: number;
  onHold: boolean;
  holdReason?: string;
  customerName?: string;
  priority: boolean;
}

/** Active batches that have not moved for the longest time (on-hold first). */
export function buildStuckBatches(batches: ProductionBatch[] | undefined, limit = 6, now: Date = new Date()): {
  total: number;
  rows: StuckBatchRow[];
} {
  const nowMs = now.getTime();
  const candidates = (batches ?? [])
    .filter((batch) => batch.current_stage !== ProductionStage.Ready)
    .map((batch) => ({ batch, idleHours: hoursSince(batch.updated_at, nowMs) }))
    .filter(({ batch, idleHours }) => batch.on_hold || idleHours > DELAYED_BATCH_HOURS)
    .sort((a, b) => Number(Boolean(b.batch.on_hold)) - Number(Boolean(a.batch.on_hold)) || b.idleHours - a.idleHours);

  return {
    total: candidates.length,
    rows: candidates.slice(0, limit).map(({ batch, idleHours }) => ({
      id: batch.id,
      label: `${batch.sku}${batch.variant_suffix || ''}${batch.size_info ? ` · ${batch.size_info}` : ''}`,
      stage: batch.current_stage,
      quantity: batch.quantity,
      idleDays: Math.floor((idleHours * HOUR_MS) / DAY_MS),
      onHold: Boolean(batch.on_hold),
      holdReason: batch.on_hold_reason,
      customerName: batch.customer_name,
      priority: batch.priority === 'High',
    })),
  };
}

// ─── Order pipeline ────────────────────────────────────────────────────────────

export interface PipelineStep {
  id: 'offers' | 'pending' | 'production' | 'ready' | 'partial' | 'shipped';
  label: string;
  count: number;
  value: number | null;
  caption: string;
  page: AdminPage;
}

export function buildOrderPipeline(params: {
  orders: Order[] | undefined;
  offers: Offer[] | undefined;
  backlogEvents: FinanceLineEvent[];
  readyOrders: ReadyOrdersSummary;
  realizedOrderCount: number;
  realizedRevenue: number;
}): PipelineStep[] {
  const customerOrders = (params.orders ?? []).filter((order) => !isInternalOrder(order));
  const statusById = new Map(customerOrders.map((order) => [order.id, order.status]));
  const backlogByStatus = new Map<OrderStatus, number>();
  params.backlogEvents.forEach((event) => {
    const status = statusById.get(event.orderId);
    if (!status) return;
    backlogByStatus.set(status, (backlogByStatus.get(status) ?? 0) + event.net);
  });
  const countStatus = (status: OrderStatus) => customerOrders.filter((order) => order.status === status).length;
  const pendingOffers = (params.offers ?? []).filter((offer) => offer.status === 'Pending');

  return [
    {
      id: 'offers',
      label: 'Προσφορές',
      count: pendingOffers.length,
      value: pendingOffers.reduce((sum, offer) => sum + (offer.total_price || 0), 0),
      caption: 'σε αναμονή απάντησης',
      page: 'offers',
    },
    {
      id: 'pending',
      label: 'Νέες παραγγελίες',
      count: countStatus(OrderStatus.Pending),
      value: backlogByStatus.get(OrderStatus.Pending) ?? 0,
      caption: 'δεν έχουν μπει σε παραγωγή',
      page: 'orders',
    },
    {
      id: 'production',
      label: 'Σε παραγωγή',
      count: countStatus(OrderStatus.InProduction),
      value: backlogByStatus.get(OrderStatus.InProduction) ?? 0,
      caption: 'στο εργαστήριο',
      page: 'production',
    },
    {
      id: 'ready',
      label: 'Έτοιμες',
      count: params.readyOrders.total,
      value: null,
      caption: 'έτοιμες 100% για αποστολή',
      page: 'orders',
    },
    {
      id: 'partial',
      label: 'Μερικώς σταλμένες',
      count: countStatus(OrderStatus.PartiallyDelivered),
      value: backlogByStatus.get(OrderStatus.PartiallyDelivered) ?? 0,
      caption: 'υπόλοιπο προς αποστολή',
      page: 'deliveries',
    },
    {
      id: 'shipped',
      label: 'Αποστολές περιόδου',
      count: params.realizedOrderCount,
      value: params.realizedRevenue,
      caption: 'παραγγελίες με αποστολή',
      page: 'orders',
    },
  ];
}

// ─── Attention center ──────────────────────────────────────────────────────────

export type AttentionSeverity = 'critical' | 'warning' | 'action' | 'info';

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  count: number;
  title: string;
  detail: string;
  page: AdminPage;
  /** When set, the card opens an in-dashboard drill-down instead of navigating. */
  opens?: 'missing-costs';
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { critical: 0, warning: 1, action: 2, info: 3 };

export function buildAttentionItems(params: {
  deliveryAttention: DeliveryAttentionEntry[];
  stageLoad: StageLoadRow[];
  readyOrders: ReadyOrdersSummary;
  lowStockCount: number;
  demandPressureCount: number;
  pendingOffers: number;
  legalGap: number | null;
  costWarningCount: number;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const overdue = params.deliveryAttention.filter((entry) => entry.urgency === 'overdue').length;
  const today = params.deliveryAttention.length - overdue;
  const delayed = params.stageLoad.reduce((sum, row) => sum + row.delayed, 0);
  const onHold = params.stageLoad.reduce((sum, row) => sum + row.onHold, 0);

  if (overdue > 0) {
    items.push({ id: 'overdue', severity: 'critical', count: overdue, title: 'Εκπρόθεσμες υπενθυμίσεις', detail: 'Παραδόσεις που έπρεπε να έχουν γίνει', page: 'deliveries' });
  }
  if (today > 0) {
    items.push({ id: 'today', severity: 'warning', count: today, title: 'Παραδόσεις σήμερα', detail: 'Υπενθυμίσεις με λήξη σήμερα', page: 'deliveries' });
  }
  if (params.readyOrders.total > 0) {
    items.push({ id: 'ready', severity: 'action', count: params.readyOrders.total, title: 'Έτοιμες για αποστολή', detail: 'Παραγγελίες 100% έτοιμες', page: 'orders' });
  }
  if (delayed > 0) {
    items.push({ id: 'delayed', severity: 'warning', count: delayed, title: 'Καθυστερημένες παρτίδες', detail: `Ακίνητες πάνω από ${DELAYED_BATCH_HOURS} ώρες`, page: 'production' });
  }
  if (onHold > 0) {
    items.push({ id: 'hold', severity: 'warning', count: onHold, title: 'Παρτίδες σε αναμονή', detail: 'Παγωμένες στην παραγωγή', page: 'production' });
  }
  if (params.lowStockCount > 0) {
    items.push({ id: 'low-stock', severity: 'warning', count: params.lowStockCount, title: 'Χαμηλό απόθεμα', detail: 'Κάτω από το σημείο αναπαραγγελίας', page: 'inventory' });
  }
  if (params.costWarningCount > 0) {
    items.push({ id: 'cost', severity: 'warning', count: params.costWarningCount, title: 'Ελλιπή κόστη', detail: 'Πωληθέντες κωδικοί χωρίς κόστος', page: 'registry', opens: 'missing-costs' });
  }
  if (params.legalGap !== null && Math.abs(params.legalGap) >= 1) {
    items.push({ id: 'legal', severity: 'info', count: 1, title: 'Απόκλιση παραστατικών', detail: 'Έσοδα ≠ εκδοθέντα παραστατικά', page: 'legal' });
  }
  if (params.pendingOffers > 0) {
    items.push({ id: 'offers', severity: 'info', count: params.pendingOffers, title: 'Ανοιχτές προσφορές', detail: 'Περιμένουν απάντηση πελάτη', page: 'offers' });
  }
  if (params.demandPressureCount > 0) {
    items.push({ id: 'demand', severity: 'info', count: params.demandPressureCount, title: 'Ζήτηση > διαθέσιμο', detail: 'Θα καλυφθούν από παραγωγή', page: 'inventory' });
  }

  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// ─── Inventory ─────────────────────────────────────────────────────────────────

export interface StockValueRow {
  sku: string;
  category: string;
  value: number;
  qty: number;
}

export interface InventoryValuation {
  pieces: number;
  skuCount: number;
  costValue: number;
  wholesaleValue: number;
  potentialMargin: number;
  marginPercent: number;
  silverGrams: number;
  reserved: number;
  incoming: number;
  topValue: StockValueRow[];
}

export function buildInventoryValuation(
  availability: InventoryAvailability[],
  productBySku: Map<string, Product>,
  topLimit = 6,
): InventoryValuation {
  let pieces = 0;
  let costValue = 0;
  let wholesaleValue = 0;
  let silverGrams = 0;
  let reserved = 0;
  let incoming = 0;
  const skus = new Set<string>();
  const valueBySku = new Map<string, StockValueRow>();

  availability.forEach((row) => {
    reserved += row.reserved || 0;
    incoming += row.incoming || 0;
    if (row.onHand <= 0) return;
    const product = productBySku.get(row.productSku);
    pieces += row.onHand;
    if (!product) return;
    const variant = product.variants?.find((candidate) => candidate.suffix === row.variantSuffix);
    const unitCost = variant?.active_price ?? product.active_price ?? 0;
    const unitPrice = variant?.selling_price ?? product.selling_price ?? 0;
    costValue += unitCost * row.onHand;
    silverGrams += (product.weight_g || 0) * row.onHand;
    if (product.is_component) return;
    wholesaleValue += unitPrice * row.onHand;
    const sku = `${row.productSku}${row.variantSuffix}`;
    skus.add(sku);
    const current = valueBySku.get(sku) || { sku, category: product.category, value: 0, qty: 0 };
    current.value += unitCost * row.onHand;
    current.qty += row.onHand;
    valueBySku.set(sku, current);
  });

  const potentialMargin = wholesaleValue - costValue;
  return {
    pieces,
    skuCount: skus.size,
    costValue,
    wholesaleValue,
    potentialMargin,
    marginPercent: wholesaleValue > 0 ? (potentialMargin / wholesaleValue) * 100 : 0,
    silverGrams,
    reserved,
    incoming,
    topValue: Array.from(valueBySku.values())
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, topLimit),
  };
}

// ─── Materials ─────────────────────────────────────────────────────────────────

/** Stones/raw materials consumed by the realized sales of the period. */
export function countStonesSold(events: FinanceLineEvent[], productBySku: Map<string, Product>): number {
  let stones = 0;
  events.forEach((event) => {
    const product = productBySku.get(event.sku);
    product?.recipe.forEach((recipeItem) => {
      if (recipeItem.type === 'raw') stones += recipeItem.quantity * event.quantity;
    });
  });
  return stones;
}

/** In-house silver (grams) needed for a set of orders — imported & component items excluded. */
export function inHouseSilverGrams(orders: Order[], productBySku: Map<string, Product>): number {
  return orders.reduce(
    (orderSum, order) =>
      orderSum +
      order.items.reduce((itemSum, item) => {
        const product = productBySku.get(item.sku);
        if (!product || product.production_type === ProductionType.Imported || product.is_component) return itemSum;
        return itemSum + ((product.weight_g || 0) + (product.secondary_weight_g || 0)) * item.quantity;
      }, 0),
    0,
  );
}

// ─── Missing costs ─────────────────────────────────────────────────────────────

export interface MissingCostOrderRef {
  orderId: string;
  customerName: string;
  quantity: number;
  net: number;
  stage: 'realized' | 'backlog';
}

export interface MissingCostRow {
  sku: string;
  reason: string;
  realizedQuantity: number;
  realizedNet: number;
  backlogQuantity: number;
  backlogNet: number;
  orders: MissingCostOrderRef[];
}

/**
 * Sales lines whose cost could not be estimated (cost counted as 0 → profit overstated),
 * grouped per SKU with the orders they come from.
 */
export function buildMissingCostRows(realized: FinanceLineEvent[], backlog: FinanceLineEvent[]): MissingCostRow[] {
  const bySku = new Map<string, MissingCostRow & { orderIndex: Map<string, MissingCostOrderRef> }>();
  const add = (event: FinanceLineEvent, stage: MissingCostOrderRef['stage']) => {
    if (!event.costWarning) return;
    const separator = event.costWarning.indexOf(': ');
    const reason = separator >= 0 ? event.costWarning.slice(separator + 2) : event.costWarning;
    const row = bySku.get(event.sku) ?? {
      sku: event.sku,
      reason,
      realizedQuantity: 0,
      realizedNet: 0,
      backlogQuantity: 0,
      backlogNet: 0,
      orders: [],
      orderIndex: new Map<string, MissingCostOrderRef>(),
    };
    if (stage === 'realized') {
      row.realizedQuantity += event.quantity;
      row.realizedNet += event.net;
    } else {
      row.backlogQuantity += event.quantity;
      row.backlogNet += event.net;
    }
    const orderKey = `${event.orderId}::${stage}`;
    const ref = row.orderIndex.get(orderKey) ?? { orderId: event.orderId, customerName: event.customerName, quantity: 0, net: 0, stage };
    ref.quantity += event.quantity;
    ref.net += event.net;
    row.orderIndex.set(orderKey, ref);
    bySku.set(event.sku, row);
  };
  dedupeIdenticalFinanceEvents(realized).forEach((event) => add(event, 'realized'));
  backlog.forEach((event) => add(event, 'backlog'));

  return Array.from(bySku.values())
    .map(({ orderIndex, ...row }) => ({
      ...row,
      orders: Array.from(orderIndex.values()).sort((a, b) => b.net - a.net),
    }))
    .sort((a, b) => b.realizedNet + b.backlogNet - (a.realizedNet + a.backlogNet));
}

// ─── Profit & loss ─────────────────────────────────────────────────────────────

export interface ProfitLossLine {
  id: string;
  label: string;
  value: number;
  kind: 'base' | 'minus' | 'subtotal' | 'result';
}

export function buildProfitLoss(finance: FinanceAnalytics): ProfitLossLine[] {
  const { totals, costBreakdown } = finance;
  const breakdownSum = costBreakdown.silver + costBreakdown.labor + costBreakdown.materials;
  const otherCost = totals.estimatedCost - breakdownSum;
  const lines: ProfitLossLine[] = [
    { id: 'list', label: 'Αξία προ έκπτωσης', value: totals.realizedNet + totals.discount, kind: 'base' },
    { id: 'discount', label: 'Εκπτώσεις', value: totals.discount, kind: 'minus' },
    { id: 'net', label: 'Καθαρά έσοδα', value: totals.realizedNet, kind: 'subtotal' },
    { id: 'silver', label: 'Κόστος ασημιού', value: costBreakdown.silver, kind: 'minus' },
    { id: 'labor', label: 'Εργατικά', value: costBreakdown.labor, kind: 'minus' },
    { id: 'materials', label: 'Πέτρες & υλικά', value: costBreakdown.materials, kind: 'minus' },
  ];
  if (Math.abs(otherCost) >= 0.5) lines.push({ id: 'other', label: 'Λοιπά κόστη', value: otherCost, kind: 'minus' });
  lines.push({ id: 'profit', label: 'Μικτό κέρδος', value: totals.estimatedProfit, kind: 'result' });
  return lines;
}
