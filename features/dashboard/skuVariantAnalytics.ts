import { Product } from '../../types';
import { FinanceLineEvent } from '../../utils/financeAnalytics';
import { variantRankingKey } from '../../utils/financeLineSku';
import { financeEventMatchesSkuQuery, normalizeSkuQuery } from '../../utils/skuSearchMatch';
import { splitSkuComponents } from '../../utils/pricingEngine';

export type SkuVariantCustomerRow = {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  profit: number;
  orderCount: number;
  quantityShare: number;
};

export type SkuVariantSellerRow = {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  commission: number;
};

export type SkuVariantTimelinePoint = {
  monthKey: string;
  quantity: number;
  revenue: number;
  profit: number;
};

export type SkuVariantBreakdownRow = {
  variantSuffix: string;
  quantity: number;
  revenue: number;
  profit: number;
};

export type SkuVariantDetailSummary = {
  quantity: number;
  revenue: number;
  profit: number;
  margin: number;
  orderCount: number;
  customerCount: number;
  shipmentCount: number;
  silverWeightGrams: number;
  costBreakdown: { silver: number; labor: number; materials: number };
  priceOverrideCount: number;
  giftQuantity: number;
  belowCostQuantity: number;
};

export type SkuVariantDetail = {
  matchKey: string;
  sku: string;
  variantSuffix: string;
  isMasterAggregate: boolean;
  summary: SkuVariantDetailSummary;
  customers: SkuVariantCustomerRow[];
  sellers: SkuVariantSellerRow[];
  timeline: SkuVariantTimelinePoint[];
  lines: FinanceLineEvent[];
  backlog: { quantity: number; net: number; lines: FinanceLineEvent[] };
  variantBreakdown?: SkuVariantBreakdownRow[];
};

export type SkuInspectTarget =
  | { kind: 'none' }
  | { kind: 'master'; sku: string; query: string }
  | { kind: 'variant'; sku: string; variantSuffix: string; query: string };

function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatMonthLabel(monthKeyStr: string): string {
  const [y, m] = monthKeyStr.split('-');
  const months = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
  const idx = Number(m) - 1;
  return `${months[idx] ?? m} ${y}`;
}

export { formatMonthLabel };

function filterMatchingEvents(events: FinanceLineEvent[], query: string): FinanceLineEvent[] {
  const q = query.trim();
  if (q.length < 2) return [];
  return events.filter((event) => financeEventMatchesSkuQuery(event, q));
}

function aggregateSummary(lines: FinanceLineEvent[]): SkuVariantDetailSummary {
  const orderIds = new Set<string>();
  const customerKeys = new Set<string>();
  let shipmentCount = 0;
  let priceOverrideCount = 0;
  let giftQuantity = 0;
  let belowCostQuantity = 0;
  const costBreakdown = { silver: 0, labor: 0, materials: 0 };

  let quantity = 0;
  let revenue = 0;
  let profit = 0;
  let silverWeightGrams = 0;

  lines.forEach((line) => {
    quantity += line.quantity;
    revenue += line.net;
    profit += line.profit;
    silverWeightGrams += line.silverWeight;
    costBreakdown.silver += line.costBreakdown.silver;
    costBreakdown.labor += line.costBreakdown.labor;
    costBreakdown.materials += line.costBreakdown.materials;
    orderIds.add(line.orderId);
    customerKeys.add(line.customerId || line.customerName);
    if (line.source === 'shipment') shipmentCount += 1;
    if (line.priceOverride) priceOverrideCount += 1;
    if (line.net <= 0.001) giftQuantity += line.quantity;
    else if (line.profit < 0) belowCostQuantity += line.quantity;
  });

  return {
    quantity,
    revenue,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    orderCount: orderIds.size,
    customerCount: customerKeys.size,
    shipmentCount,
    silverWeightGrams,
    costBreakdown,
    priceOverrideCount,
    giftQuantity,
    belowCostQuantity,
  };
}

function aggregateCustomers(lines: FinanceLineEvent[], totalQty: number): SkuVariantCustomerRow[] {
  const map = new Map<string, { id: string; name: string; quantity: number; revenue: number; profit: number; orderIds: Set<string> }>();

  lines.forEach((line) => {
    const id = line.customerId || line.customerName;
    const row = map.get(id) || {
      id,
      name: line.customerName,
      quantity: 0,
      revenue: 0,
      profit: 0,
      orderIds: new Set<string>(),
    };
    row.quantity += line.quantity;
    row.revenue += line.net;
    row.profit += line.profit;
    row.orderIds.add(line.orderId);
    map.set(id, row);
  });

  return Array.from(map.values())
    .map((row) => ({
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      revenue: row.revenue,
      profit: row.profit,
      orderCount: row.orderIds.size,
      quantityShare: totalQty > 0 ? (row.quantity / totalQty) * 100 : 0,
    }))
    .sort((a, b) => b.quantity - a.quantity);
}

function aggregateSellers(lines: FinanceLineEvent[]): SkuVariantSellerRow[] {
  const map = new Map<string, { id: string; name: string; quantity: number; revenue: number; commission: number }>();

  lines.forEach((line) => {
    if (!line.sellerId) return;
    const row = map.get(line.sellerId) || {
      id: line.sellerId,
      name: line.sellerName || 'Πλασιέ',
      quantity: 0,
      revenue: 0,
      commission: 0,
    };
    row.quantity += line.quantity;
    row.revenue += line.net;
    row.commission += line.net * (line.sellerCommissionPercent / 100);
    map.set(line.sellerId, row);
  });

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

function aggregateTimeline(lines: FinanceLineEvent[]): SkuVariantTimelinePoint[] {
  const map = new Map<string, { quantity: number; revenue: number; profit: number }>();

  lines.forEach((line) => {
    const key = monthKey(line.date);
    const row = map.get(key) || { quantity: 0, revenue: 0, profit: 0 };
    row.quantity += line.quantity;
    row.revenue += line.net;
    row.profit += line.profit;
    map.set(key, row);
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKeyStr, data]) => ({ monthKey: monthKeyStr, ...data }));
}

function aggregateVariantBreakdown(lines: FinanceLineEvent[]): SkuVariantBreakdownRow[] {
  const map = new Map<string, { quantity: number; revenue: number; profit: number }>();

  lines.forEach((line) => {
    const suffix = (line.variantSuffix || '').toUpperCase();
    const row = map.get(suffix) || { quantity: 0, revenue: 0, profit: 0 };
    row.quantity += line.quantity;
    row.revenue += line.net;
    row.profit += line.profit;
    map.set(suffix, row);
  });

  return Array.from(map.entries())
    .map(([variantSuffix, data]) => ({ variantSuffix, ...data }))
    .sort((a, b) => b.quantity - a.quantity);
}

export function resolveSkuInspectTarget(query: string, realized: FinanceLineEvent[]): SkuInspectTarget {
  const q = query.trim();
  if (q.length < 2) return { kind: 'none' };

  const matched = filterMatchingEvents(realized, q);
  if (matched.length === 0) return { kind: 'none' };

  const { master, suffix } = splitSkuComponents(normalizeSkuQuery(q));

  if (suffix) {
    const variantSuffix = (matched[0].variantSuffix || '').toUpperCase();
    return { kind: 'variant', sku: master, variantSuffix, query: q };
  }

  const distinctKeys = new Set(matched.map((line) => variantRankingKey(line.sku, line.variantSuffix || '')));
  if (distinctKeys.size === 1) {
    const line = matched[0];
    return {
      kind: 'variant',
      sku: line.sku,
      variantSuffix: (line.variantSuffix || '').toUpperCase(),
      query: q,
    };
  }

  return { kind: 'master', sku: master, query: q };
}

export function buildSkuVariantDetailFromSelection(args: {
  realized: FinanceLineEvent[];
  backlog: FinanceLineEvent[];
  sku: string;
  variantSuffix?: string;
  isMasterAggregate?: boolean;
}): SkuVariantDetail | null {
  const { realized, backlog, sku, variantSuffix = '', isMasterAggregate = false } = args;

  const realizedLines = realized.filter((line) => {
    if (line.sku !== sku) return false;
    if (isMasterAggregate) return true;
    return (line.variantSuffix || '').toUpperCase() === variantSuffix.toUpperCase();
  });

  if (realizedLines.length === 0) return null;

  const backlogLines = backlog.filter((line) => {
    if (line.sku !== sku) return false;
    if (isMasterAggregate) return true;
    return (line.variantSuffix || '').toUpperCase() === variantSuffix.toUpperCase();
  });

  const sortedLines = [...realizedLines].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const summary = aggregateSummary(realizedLines);
  const backlogQty = backlogLines.reduce((s, l) => s + l.quantity, 0);
  const backlogNet = backlogLines.reduce((s, l) => s + l.net, 0);

  const matchKey = isMasterAggregate ? sku : variantRankingKey(sku, variantSuffix);

  return {
    matchKey,
    sku,
    variantSuffix: isMasterAggregate ? '' : variantSuffix.toUpperCase(),
    isMasterAggregate,
    summary,
    customers: aggregateCustomers(realizedLines, summary.quantity),
    sellers: aggregateSellers(realizedLines),
    timeline: aggregateTimeline(realizedLines),
    lines: sortedLines,
    backlog: { quantity: backlogQty, net: backlogNet, lines: backlogLines },
    variantBreakdown: isMasterAggregate ? aggregateVariantBreakdown(realizedLines) : undefined,
  };
}

export function buildSkuVariantDetail(args: {
  realized: FinanceLineEvent[];
  backlog: FinanceLineEvent[];
  query: string;
  products?: Product[];
}): SkuVariantDetail | null {
  const { realized, backlog, query } = args;
  const q = query.trim();
  if (q.length < 2) return null;

  const target = resolveSkuInspectTarget(q, realized);
  if (target.kind === 'none') return null;

  if (target.kind === 'master') {
    return buildSkuVariantDetailFromSelection({
      realized,
      backlog,
      sku: target.sku,
      isMasterAggregate: true,
    });
  }

  return buildSkuVariantDetailFromSelection({
    realized,
    backlog,
    sku: target.sku,
    variantSuffix: target.variantSuffix,
    isMasterAggregate: false,
  });
}
