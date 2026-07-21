import { Customer, Order, OrderStatus, Product } from '../../types';
import { FinanceLineEvent } from '../../utils/financeAnalytics';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';

export type CustomerAnalyticsPeriod = '90d' | '12m' | 'all';
export type CustomerSuccessMetric = 'profit' | 'revenue' | 'quantity' | 'margin';
export type CustomerHealthState = 'none' | 'new' | 'active' | 'watch' | 'risk';

export interface CustomerAnalyticsMetricComparison {
  current: number;
  previous: number | null;
  changePercent: number | null;
}

export interface CustomerPerformanceRow {
  key: string;
  sku: string;
  variantSuffix: string;
  label: string;
  image: string | null;
  category: string;
  collection: string;
  revenue: number;
  estimatedCost: number;
  profit: number;
  margin: number;
  quantity: number;
  orderCount: number;
  lastPurchase: string | null;
}

export interface CustomerMixRow {
  key: string;
  name: string;
  revenue: number;
  profit: number;
  margin: number;
  quantity: number;
  share: number;
}

export interface CustomerTrendPoint {
  key: string;
  label: string;
  revenue: number;
  profit: number;
  quantity: number;
}

export interface CustomerDataQualityIssue {
  kind: 'uncategorized' | 'unmatched';
  label: string;
  skus: string[];
  quantity: number;
  revenue: number;
}

export interface CustomerOpportunity {
  id: string;
  type: 'reactivation' | 'backlog' | 'reorder' | 'margin' | 'cross_sell';
  severity: 'high' | 'medium' | 'positive';
  title: string;
  description: string;
  reason: string;
  sku?: string;
  action: 'orders' | 'copy' | null;
}

export interface CustomerAnalyticsViewModel {
  period: CustomerAnalyticsPeriod;
  hasAnyHistory: boolean;
  headline: string;
  subheadline: string;
  metrics: {
    revenue: CustomerAnalyticsMetricComparison;
    profit: CustomerAnalyticsMetricComparison;
    margin: number;
    realizedOrders: number;
    averageOrderValue: number;
    shippedPieces: number;
    backlogRevenue: number;
    backlogPieces: number;
    lastOrderDate: string | null;
    lastShipmentDate: string | null;
  };
  health: {
    state: CustomerHealthState;
    label: string;
    detail: string;
    daysSinceLastOrder: number | null;
    typicalCadenceDays: number | null;
  };
  trend: CustomerTrendPoint[];
  products: CustomerPerformanceRow[];
  variants: CustomerPerformanceRow[];
  categories: CustomerMixRow[];
  collections: CustomerMixRow[];
  dataQuality: CustomerDataQualityIssue[];
  behavior: {
    orderCount: number;
    averageBasketPieces: number;
    averageBasketProducts: number;
    weightedDiscountPercent: number;
    repeatProductRate: number;
    activeMonths: number;
    statusMix: Array<{ status: OrderStatus; label: string; count: number; share: number }>;
    seasonality: Array<{ month: string; orders: number; revenue: number }>;
    pairs: Array<{ skus: [string, string]; count: number }>;
  };
  dominantCategory: CustomerMixRow | null;
  diversificationCount: number;
  opportunities: CustomerOpportunity[];
}

export interface BuildCustomerAnalyticsInput {
  customer: Customer;
  allOrders: Order[];
  realizedEvents: FinanceLineEvent[];
  backlogEvents: FinanceLineEvent[];
  products: Product[];
  period: CustomerAnalyticsPeriod;
  now?: Date;
  isRetailSystemCustomer?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const RETAIL_CUSTOMER_ID = '00000000-0000-0000-0000-000000000003';
const RETAIL_CUSTOMER_NAME = 'Λιανική';
const MONTH_LABELS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const validTime = (value?: string | null) => {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : null;
};

const daysBetween = (older: number, newer: number) => Math.max(0, Math.round((newer - older) / DAY_MS));

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const changePercent = (current: number, previous: number | null) => {
  if (previous === null || Math.abs(previous) < 0.005) return null;
  return round(((current - previous) / Math.abs(previous)) * 100, 1);
};

const customerMatches = (customer: Customer, customerId?: string | null, customerName?: string | null) =>
  customerId ? customerId === customer.id : customerName === customer.full_name;

const orderMatches = (customer: Customer, order: Order) => customerMatches(customer, order.customer_id, order.customer_name);

function resolvePeriod(period: CustomerAnalyticsPeriod, now: Date) {
  const end = now.getTime();
  if (period === 'all') return { start: null, end, previousStart: null, previousEnd: null };
  const duration = period === '90d' ? 90 * DAY_MS : 365 * DAY_MS;
  return {
    start: end - duration,
    end,
    previousStart: end - duration * 2,
    previousEnd: end - duration,
  };
}

function within(time: number | null, start: number | null, end: number | null) {
  if (time === null) return false;
  if (start !== null && time < start) return false;
  if (end !== null && time >= end) return false;
  return true;
}

function categoryForEvent(event: FinanceLineEvent, productMap: Map<string, Product>) {
  if (isSpecialCreationSku(event.sku)) return 'Ειδική δημιουργία';
  const product = productMap.get(event.sku);
  if (!product) return 'Μη αντιστοιχισμένο προϊόν';
  return product.category?.trim() || 'Μη κατηγοριοποιημένο';
}

export function resolveCustomerAnalyticsCategory(sku: string, product?: Product | null) {
  if (isSpecialCreationSku(sku)) return 'Ειδική δημιουργία';
  if (!product) return 'Μη αντιστοιχισμένο προϊόν';
  return product.category?.trim() || 'Μη κατηγοριοποιημένο';
}

function buildComparison(events: FinanceLineEvent[], previousEvents: FinanceLineEvent[], selector: (event: FinanceLineEvent) => number) {
  const current = round(events.reduce((sum, event) => sum + selector(event), 0));
  const previous = previousEvents.length > 0 ? round(previousEvents.reduce((sum, event) => sum + selector(event), 0)) : 0;
  return { current, previous, changePercent: changePercent(current, previous) };
}

function buildPerformanceRows(events: FinanceLineEvent[], products: Product[], variantMode: boolean): CustomerPerformanceRow[] {
  const productMap = new Map(products.map(product => [product.sku, product]));
  const rows = new Map<string, CustomerPerformanceRow & { orderIds: Set<string> }>();

  events.forEach(event => {
    const variant = variantMode ? event.variantSuffix || '' : '';
    const key = variantMode ? `${event.sku}::${variant}` : event.sku;
    const product = productMap.get(event.sku);
    const category = categoryForEvent(event, productMap);
    const label = variantMode && variant
      ? `${event.sku} · ${product?.variants?.find(item => item.suffix === variant)?.description || variant}`
      : event.sku;
    const row = rows.get(key) || {
      key,
      sku: event.sku,
      variantSuffix: variant,
      label,
      image: event.productImage || product?.image_url || null,
      category,
      collection: event.collectionName || 'Χωρίς συλλογή',
      revenue: 0,
      estimatedCost: 0,
      profit: 0,
      margin: 0,
      quantity: 0,
      orderCount: 0,
      lastPurchase: null,
      orderIds: new Set<string>(),
    };
    row.revenue += event.net;
    row.estimatedCost += event.estimatedCost;
    row.profit += event.profit;
    row.quantity += event.quantity;
    row.orderIds.add(event.orderId);
    if (!row.lastPurchase || (validTime(event.date) || 0) > (validTime(row.lastPurchase) || 0)) row.lastPurchase = event.date;
    rows.set(key, row);
  });

  return Array.from(rows.values()).map(row => ({
    ...row,
    revenue: round(row.revenue),
    estimatedCost: round(row.estimatedCost),
    profit: round(row.profit),
    margin: row.revenue > 0 ? round((row.profit / row.revenue) * 100, 1) : 0,
    orderCount: row.orderIds.size,
    orderIds: undefined,
  } as CustomerPerformanceRow));
}

function buildMixRows(events: FinanceLineEvent[], keyFor: (event: FinanceLineEvent) => string): CustomerMixRow[] {
  const rows = new Map<string, CustomerMixRow>();
  const totalRevenue = events.reduce((sum, event) => sum + event.net, 0);
  events.forEach(event => {
    const key = keyFor(event);
    const row = rows.get(key) || { key, name: key, revenue: 0, profit: 0, margin: 0, quantity: 0, share: 0 };
    row.revenue += event.net;
    row.profit += event.profit;
    row.quantity += event.quantity;
    rows.set(key, row);
  });
  return Array.from(rows.values())
    .map(row => ({
      ...row,
      revenue: round(row.revenue),
      profit: round(row.profit),
      margin: row.revenue > 0 ? round((row.profit / row.revenue) * 100, 1) : 0,
      share: totalRevenue > 0 ? round((row.revenue / totalRevenue) * 100, 1) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function startOfWeek(time: number) {
  const date = new Date(time);
  const day = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}

function buildTrend(events: FinanceLineEvent[], period: CustomerAnalyticsPeriod): CustomerTrendPoint[] {
  if (events.length === 0) return [];
  const times = events.map(event => validTime(event.date)).filter((time): time is number => time !== null);
  const spanMonths = times.length > 0 ? (Math.max(...times) - Math.min(...times)) / (30 * DAY_MS) : 0;
  const yearly = period === 'all' && spanMonths > 24;
  const buckets = new Map<string, CustomerTrendPoint & { sort: number }>();

  events.forEach(event => {
    const time = validTime(event.date);
    if (time === null) return;
    const date = new Date(time);
    let key: string;
    let label: string;
    let sort: number;
    if (period === '90d') {
      const week = startOfWeek(time);
      key = week.toISOString().slice(0, 10);
      label = week.toLocaleDateString('el-GR', { day: '2-digit', month: 'short' }).replace('.', '');
      sort = week.getTime();
    } else if (yearly) {
      key = String(date.getFullYear());
      label = key;
      sort = new Date(date.getFullYear(), 0, 1).getTime();
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      label = `${MONTH_LABELS[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;
      sort = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    }
    const row = buckets.get(key) || { key, label, revenue: 0, profit: 0, quantity: 0, sort };
    row.revenue += event.net;
    row.profit += event.profit;
    row.quantity += event.quantity;
    buckets.set(key, row);
  });

  return Array.from(buckets.values())
    .sort((a, b) => a.sort - b.sort)
    .map(({ sort: _sort, ...row }) => ({ ...row, revenue: round(row.revenue), profit: round(row.profit) }));
}

function buildHealth(orders: Order[], nowTime: number) {
  const times = orders.map(order => validTime(order.created_at)).filter((time): time is number => time !== null).sort((a, b) => a - b);
  if (times.length === 0) {
    return { state: 'none' as const, label: 'Χωρίς ιστορικό', detail: 'Δεν υπάρχουν παραγγελίες για αξιολόγηση.', daysSinceLastOrder: null, typicalCadenceDays: null };
  }
  const daysSinceLastOrder = daysBetween(times[times.length - 1], nowTime);
  if (times.length === 1) {
    return daysSinceLastOrder <= 90
      ? { state: 'new' as const, label: 'Νέος', detail: `Πρώτη παραγγελία πριν από ${daysSinceLastOrder} ημέρες.`, daysSinceLastOrder, typicalCadenceDays: null }
      : { state: 'risk' as const, label: 'Σε κίνδυνο', detail: `Μία μόνο παραγγελία και ${daysSinceLastOrder} ημέρες χωρίς νέα κίνηση.`, daysSinceLastOrder, typicalCadenceDays: null };
  }
  const gaps = times.slice(1).map((time, index) => daysBetween(times[index], time));
  const cadence = Math.max(1, Math.round(median(gaps) || 0));
  const activeLimit = Math.max(45, cadence * 1.5);
  const watchLimit = Math.max(90, cadence * 2.5);
  if (daysSinceLastOrder <= activeLimit) {
    return { state: 'active' as const, label: 'Ενεργός', detail: `Κινείται μέσα στον συνήθη κύκλο των ${cadence} ημερών.`, daysSinceLastOrder, typicalCadenceDays: cadence };
  }
  if (daysSinceLastOrder <= watchLimit) {
    return { state: 'watch' as const, label: 'Παρακολούθηση', detail: `Έχει ξεπεράσει τον συνήθη κύκλο των ${cadence} ημερών.`, daysSinceLastOrder, typicalCadenceDays: cadence };
  }
  return { state: 'risk' as const, label: 'Σε κίνδυνο', detail: `${daysSinceLastOrder} ημέρες χωρίς παραγγελία, έναντι συνήθους κύκλου ${cadence}.`, daysSinceLastOrder, typicalCadenceDays: cadence };
}

function buildBehavior(orders: Order[], realizedEvents: FinanceLineEvent[]) {
  const orderValueBeforeDiscount = orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.price_at_order * item.quantity, 0), 0);
  const weightedDiscount = orderValueBeforeDiscount > 0
    ? orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.price_at_order * item.quantity, 0) * (order.discount_percent || 0), 0) / orderValueBeforeDiscount
    : 0;
  const productOrderCounts = new Map<string, Set<string>>();
  const pairCounts = new Map<string, number>();
  let totalPieces = 0;
  let totalProducts = 0;
  const statusCounts = new Map<OrderStatus, number>();
  const activeMonths = new Set<string>();

  orders.forEach(order => {
    const skus = Array.from(new Set(order.items.map(item => item.sku).filter(Boolean))).sort();
    totalPieces += order.items.reduce((sum, item) => sum + item.quantity, 0);
    totalProducts += skus.length;
    statusCounts.set(order.status, (statusCounts.get(order.status) || 0) + 1);
    const time = validTime(order.created_at);
    if (time !== null) {
      const date = new Date(time);
      activeMonths.add(`${date.getFullYear()}-${date.getMonth()}`);
    }
    skus.forEach(sku => {
      const ids = productOrderCounts.get(sku) || new Set<string>();
      ids.add(order.id);
      productOrderCounts.set(sku, ids);
    });
    for (let left = 0; left < skus.length; left += 1) {
      for (let right = left + 1; right < skus.length; right += 1) {
        const key = `${skus[left]}||${skus[right]}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  });

  const repeatProducts = Array.from(productOrderCounts.values()).filter(ids => ids.size >= 2).length;
  const monthRows = MONTH_LABELS.map((month, monthIndex) => {
    const eventRows = realizedEvents.filter(event => {
      const time = validTime(event.date);
      return time !== null && new Date(time).getMonth() === monthIndex;
    });
    return {
      month,
      orders: new Set(eventRows.map(event => event.orderId)).size,
      revenue: round(eventRows.reduce((sum, event) => sum + event.net, 0)),
    };
  });

  const statusLabels: Record<OrderStatus, string> = {
    [OrderStatus.Pending]: 'Εκκρεμείς',
    [OrderStatus.InProduction]: 'Παραγωγή',
    [OrderStatus.Ready]: 'Έτοιμες',
    [OrderStatus.PartiallyDelivered]: 'Μερικώς παραδομένες',
    [OrderStatus.Delivered]: 'Παραδομένες',
    [OrderStatus.Cancelled]: 'Ακυρωμένες',
  };

  return {
    orderCount: orders.length,
    averageBasketPieces: orders.length > 0 ? round(totalPieces / orders.length, 1) : 0,
    averageBasketProducts: orders.length > 0 ? round(totalProducts / orders.length, 1) : 0,
    weightedDiscountPercent: round(weightedDiscount, 1),
    repeatProductRate: productOrderCounts.size > 0 ? round((repeatProducts / productOrderCounts.size) * 100, 1) : 0,
    activeMonths: activeMonths.size,
    statusMix: Array.from(statusCounts.entries()).map(([status, count]) => ({
      status,
      label: statusLabels[status],
      count,
      share: orders.length > 0 ? round((count / orders.length) * 100, 1) : 0,
    })).sort((a, b) => b.count - a.count),
    seasonality: monthRows,
    pairs: Array.from(pairCounts.entries())
      .map(([key, count]) => ({ skus: key.split('||') as [string, string], count }))
      .filter(row => row.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

function buildDataQuality(events: FinanceLineEvent[], productMap: Map<string, Product>): CustomerDataQualityIssue[] {
  const groups = new Map<CustomerDataQualityIssue['kind'], CustomerDataQualityIssue & { skuSet: Set<string> }>();
  events.forEach(event => {
    if (isSpecialCreationSku(event.sku)) return;
    const product = productMap.get(event.sku);
    const kind = !product ? 'unmatched' : !product.category?.trim() ? 'uncategorized' : null;
    if (!kind) return;
    const row = groups.get(kind) || {
      kind,
      label: kind === 'unmatched' ? 'Μη αντιστοιχισμένα προϊόντα' : 'Μη κατηγοριοποιημένα προϊόντα',
      skus: [],
      quantity: 0,
      revenue: 0,
      skuSet: new Set<string>(),
    };
    row.skuSet.add(event.sku);
    row.quantity += event.quantity;
    row.revenue += event.net;
    groups.set(kind, row);
  });
  return Array.from(groups.values()).map(row => ({
    kind: row.kind,
    label: row.label,
    skus: Array.from(row.skuSet).sort(),
    quantity: row.quantity,
    revenue: round(row.revenue),
  }));
}

function buildReorderOpportunities(customerOrders: Order[], productMap: Map<string, Product>, nowTime: number): CustomerOpportunity[] {
  const datesBySku = new Map<string, Set<number>>();
  customerOrders.forEach(order => {
    const time = validTime(order.created_at);
    if (time === null) return;
    new Set(order.items.map(item => item.sku).filter(Boolean)).forEach(sku => {
      const dates = datesBySku.get(sku) || new Set<number>();
      dates.add(time);
      datesBySku.set(sku, dates);
    });
  });
  return Array.from(datesBySku.entries()).flatMap(([sku, dateSet]) => {
    const dates = Array.from(dateSet).sort((a, b) => a - b);
    if (dates.length < 2) return [];
    const gaps = dates.slice(1).map((time, index) => daysBetween(dates[index], time));
    const cadence = Math.max(30, Math.round(median(gaps) || 30));
    const overdueDays = daysBetween(dates[dates.length - 1], nowTime);
    if (overdueDays < cadence * 1.25) return [];
    const product = productMap.get(sku);
    return [{
      id: `reorder-${sku}`,
      type: 'reorder' as const,
      severity: overdueDays > cadence * 2 ? 'high' as const : 'medium' as const,
      title: `Πιθανή επανάληψη · ${sku}`,
      description: product?.description || product?.category || 'Προϊόν με επαναλαμβανόμενες αγορές',
      reason: `Αγοράστηκε σε ${dates.length} διαφορετικές παραγγελίες, συνήθως κάθε ${cadence} ημέρες. Έχουν περάσει ${overdueDays}.`,
      sku,
      action: 'orders' as const,
      score: overdueDays / cadence,
    }];
  }).sort((a, b) => b.score - a.score).slice(0, 2).map(({ score: _score, ...row }) => row);
}

function buildCrossSellOpportunities(
  customer: Customer,
  allOrders: Order[],
  productMap: Map<string, Product>,
  targetCategories: string[],
): CustomerOpportunity[] {
  if (targetCategories.length === 0) return [];
  const bought = new Set<string>();
  allOrders.filter(order => order.status !== OrderStatus.Cancelled && orderMatches(customer, order)).forEach(order => {
    order.items.forEach(item => bought.add(item.sku));
  });

  const peersBySku = new Map<string, Set<string>>();
  const qtyBySku = new Map<string, number>();
  allOrders.filter(order => order.status !== OrderStatus.Cancelled && !orderMatches(customer, order)).forEach(order => {
    if (order.customer_id === RETAIL_CUSTOMER_ID || order.customer_name === RETAIL_CUSTOMER_NAME) return;
    const peerKey = order.customer_id || order.customer_name;
    order.items.forEach(item => {
      const product = productMap.get(item.sku);
      if (!product || bought.has(item.sku) || !targetCategories.includes(product.category?.trim())) return;
      const peers = peersBySku.get(item.sku) || new Set<string>();
      peers.add(peerKey);
      peersBySku.set(item.sku, peers);
      qtyBySku.set(item.sku, (qtyBySku.get(item.sku) || 0) + item.quantity);
    });
  });

  return Array.from(peersBySku.entries())
    .filter(([, peers]) => peers.size >= 3)
    .sort((a, b) => b[1].size - a[1].size || (qtyBySku.get(b[0]) || 0) - (qtyBySku.get(a[0]) || 0))
    .slice(0, 2)
    .map(([sku, peers]) => {
      const product = productMap.get(sku)!;
      return {
        id: `cross-sell-${sku}`,
        type: 'cross_sell' as const,
        severity: 'positive' as const,
        title: `Πρόταση δοκιμής · ${sku}`,
        description: product.description || product.category,
        reason: `${peers.size} άλλοι πελάτες που αγοράζουν ${product.category} έχουν επιλέξει αυτό το προϊόν.`,
        sku,
        action: 'copy' as const,
      };
    });
}

export function sortCustomerPerformanceRows(rows: CustomerPerformanceRow[], metric: CustomerSuccessMetric) {
  return [...rows].sort((a, b) => b[metric] - a[metric] || b.revenue - a.revenue || a.sku.localeCompare(b.sku));
}

export function buildCustomerAnalytics(input: BuildCustomerAnalyticsInput): CustomerAnalyticsViewModel {
  const now = input.now || new Date();
  const nowTime = now.getTime();
  const productMap = new Map(input.products.map(product => [product.sku, product]));
  const bounds = resolvePeriod(input.period, now);
  const customerOrdersAll = input.allOrders
    .filter(order => order.status !== OrderStatus.Cancelled && orderMatches(input.customer, order))
    .sort((a, b) => (validTime(a.created_at) || 0) - (validTime(b.created_at) || 0));
  const customerEventsAll = input.realizedEvents.filter(event => customerMatches(input.customer, event.customerId, event.customerName));
  const customerBacklog = input.backlogEvents.filter(event => customerMatches(input.customer, event.customerId, event.customerName));
  const currentEvents = customerEventsAll.filter(event => within(validTime(event.date), bounds.start, bounds.end));
  const previousEvents = input.period === 'all'
    ? []
    : customerEventsAll.filter(event => within(validTime(event.date), bounds.previousStart, bounds.previousEnd));
  const currentOrders = customerOrdersAll.filter(order => within(validTime(order.created_at), bounds.start, bounds.end));

  const revenue = buildComparison(currentEvents, previousEvents, event => event.net);
  if (input.period === 'all') {
    revenue.previous = null;
    revenue.changePercent = null;
  }
  const profit = buildComparison(currentEvents, previousEvents, event => event.profit);
  if (input.period === 'all') {
    profit.previous = null;
    profit.changePercent = null;
  }
  const products = buildPerformanceRows(currentEvents, input.products, false);
  const variants = buildPerformanceRows(currentEvents, input.products, true);
  const categories = buildMixRows(currentEvents, event => categoryForEvent(event, productMap));
  const collections = buildMixRows(currentEvents, event => event.collectionName?.trim() || 'Χωρίς συλλογή');
  const realizedOrderIds = new Set(currentEvents.map(event => event.orderId));
  const backlogRevenue = round(customerBacklog.reduce((sum, event) => sum + event.net, 0));
  const backlogPieces = customerBacklog.reduce((sum, event) => sum + event.quantity, 0);
  const lastOrder = customerOrdersAll[customerOrdersAll.length - 1];
  const lastShipment = [...customerEventsAll].sort((a, b) => (validTime(b.date) || 0) - (validTime(a.date) || 0))[0];
  const health = buildHealth(customerOrdersAll, nowTime);
  const behavior = buildBehavior(currentOrders, currentEvents);
  const commercialCategories = categories.filter(row => row.name !== 'Μη αντιστοιχισμένο προϊόν' && row.name !== 'Μη κατηγοριοποιημένο');
  const dominantCategory = commercialCategories[0] || null;
  const bestProduct = sortCustomerPerformanceRows(products, 'profit')[0] || null;
  const margin = revenue.current > 0 ? round((profit.current / revenue.current) * 100, 1) : 0;

  const opportunities: CustomerOpportunity[] = [];
  if (!input.isRetailSystemCustomer && (health.state === 'watch' || health.state === 'risk')) {
    opportunities.push({
      id: 'reactivation',
      type: 'reactivation',
      severity: health.state === 'risk' ? 'high' : 'medium',
      title: 'Χρειάζεται επανενεργοποίηση',
      description: health.detail,
      reason: 'Η αξιολόγηση συγκρίνει την τελευταία παραγγελία με τον προσωπικό ρυθμό αγορών του πελάτη.',
      action: 'orders',
    });
  }
  if (backlogRevenue > 0) {
    opportunities.push({
      id: 'backlog',
      type: 'backlog',
      severity: 'medium',
      title: 'Ανοιχτή αξία προς ολοκλήρωση',
      description: `${backlogPieces} τεμάχια παραμένουν ανεκτέλεστα.`,
      reason: 'Υπάρχουν ενεργές γραμμές παραγγελιών που δεν έχουν ακόμη αποσταλεί.',
      action: 'orders',
    });
  }
  if (!input.isRetailSystemCustomer) opportunities.push(...buildReorderOpportunities(customerOrdersAll, productMap, nowTime));
  const weakMargin = products
    .filter(row => row.revenue > 0 && (row.margin < 0 || (row.quantity >= 2 && row.margin <= margin - 10)))
    .sort((a, b) => a.margin - b.margin)[0];
  if (weakMargin) {
    opportunities.push({
      id: `margin-${weakMargin.sku}`,
      type: 'margin',
      severity: weakMargin.margin < 0 ? 'high' : 'medium',
      title: `Έλεγχος περιθωρίου · ${weakMargin.sku}`,
      description: `Περιθώριο ${weakMargin.margin.toFixed(1)}% έναντι ${margin.toFixed(1)}% συνολικά για τον πελάτη.`,
      reason: 'Η εκτίμηση χρησιμοποιεί την ιστορική τιμή πώλησης και το καλύτερο διαθέσιμο κόστος προϊόντος.',
      sku: weakMargin.sku,
      action: 'orders',
    });
  }
  if (!input.isRetailSystemCustomer) {
    opportunities.push(...buildCrossSellOpportunities(input.customer, input.allOrders, productMap, commercialCategories.slice(0, 3).map(row => row.name)));
  }

  const healthRiskText = health.state === 'risk' ? 'Χρειάζεται άμεση επαναπροσέγγιση.' : health.state === 'watch' ? 'Ο ρυθμός αγορών έχει επιβραδυνθεί.' : '';
  const headline = bestProduct
    ? `Το ${bestProduct.sku} είναι το πιο κερδοφόρο προϊόν για τον πελάτη.`
    : customerOrdersAll.length > 0
      ? 'Υπάρχει ιστορικό παραγγελιών, αλλά όχι ακόμη πραγματοποιημένη πώληση.'
      : 'Δεν υπάρχει ακόμη εμπορικό ιστορικό για αυτόν τον πελάτη.';
  const subheadline = [
    dominantCategory ? `${dominantCategory.name}: ${dominantCategory.share.toFixed(1)}% του πραγματοποιημένου τζίρου.` : '',
    healthRiskText,
  ].filter(Boolean).join(' ');

  return {
    period: input.period,
    hasAnyHistory: customerOrdersAll.length > 0 || customerEventsAll.length > 0,
    headline,
    subheadline,
    metrics: {
      revenue,
      profit,
      margin,
      realizedOrders: realizedOrderIds.size,
      averageOrderValue: realizedOrderIds.size > 0 ? round(revenue.current / realizedOrderIds.size) : 0,
      shippedPieces: currentEvents.reduce((sum, event) => sum + event.quantity, 0),
      backlogRevenue,
      backlogPieces,
      lastOrderDate: lastOrder?.created_at || null,
      lastShipmentDate: lastShipment?.date || null,
    },
    health,
    trend: buildTrend(currentEvents, input.period),
    products,
    variants,
    categories,
    collections,
    dataQuality: buildDataQuality([...currentEvents, ...customerBacklog], productMap),
    behavior,
    dominantCategory,
    diversificationCount: commercialCategories.length,
    opportunities: opportunities.slice(0, 6),
  };
}
