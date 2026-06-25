import { Gender, Order, Product, UserProfile } from '../../types';
import { FinanceLineEvent, FinanceVariantRanking } from '../../utils/financeAnalytics';
import { variantRankingKey } from '../../utils/financeLineSku';
import { getVariantComponents } from '../../utils/pricingEngine';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';
import { resolveOrderSeller } from '../../utils/orderSeller';
import {
  type EnrichedVariantAnalyticsRow,
  type VariantAnalyticsSort,
} from './dashboardAnalysisViewModels';

export type OrderMeta = {
  tags: string[];
  sellerId: string | null;
  sellerName: string | null;
  sellerCommissionPercent: number;
};

function getEventSellerId(event: FinanceLineEvent, orderMeta: Map<string, OrderMeta>): string | null {
  return orderMeta.get(event.orderId)?.sellerId ?? event.sellerId ?? null;
}

/** Overlay current order seller onto finance events (assignment can change after shipment). */
export function applyOrderMetaToFinanceEvents(
  events: FinanceLineEvent[],
  orderMeta: Map<string, OrderMeta>,
): FinanceLineEvent[] {
  return events.map((event) => {
    const meta = orderMeta.get(event.orderId);
    if (!meta?.sellerId) return event;
    if (
      meta.sellerId === event.sellerId
      && meta.sellerName === event.sellerName
      && meta.sellerCommissionPercent === event.sellerCommissionPercent
    ) {
      return event;
    }
    return {
      ...event,
      sellerId: meta.sellerId,
      sellerName: meta.sellerName ?? event.sellerName,
      sellerCommissionPercent: meta.sellerCommissionPercent,
    };
  });
}

export type SkuModalFilterFacets = {
  customers: Array<{ id: string; name: string }>;
  tags: string[];
  sellers: Array<{ id: string; name: string }>;
  categories: string[];
  collections: Array<{ id: number | null; name: string }>;
  finishes: string[];
  genders: Array<{ id: Gender; label: string }>;
};

export type SkuModalFilterSelection = {
  customers: Set<string>;
  tags: Set<string>;
  sellers: Set<string>;
  categories: Set<string>;
  collections: Set<string>;
  finishes: Set<string>;
  genders: Set<Gender>;
};

export function createEmptySkuModalFilters(): SkuModalFilterSelection {
  return {
    customers: new Set(),
    tags: new Set(),
    sellers: new Set(),
    categories: new Set(),
    collections: new Set(),
    finishes: new Set(),
    genders: new Set(),
  };
}

export function countActiveSkuModalFilters(filters: SkuModalFilterSelection): number {
  return (
    filters.customers.size
    + filters.tags.size
    + filters.sellers.size
    + filters.categories.size
    + filters.collections.size
    + filters.finishes.size
    + filters.genders.size
  );
}

export function buildOrderMetaIndex(orders: Order[], sellers?: UserProfile[]): Map<string, OrderMeta> {
  const map = new Map<string, OrderMeta>();
  orders.forEach((order) => {
    const resolved = resolveOrderSeller(order, sellers);
    map.set(order.id, {
      tags: order.tags || [],
      sellerId: resolved.sellerId,
      sellerName: resolved.sellerName,
      sellerCommissionPercent: resolved.sellerCommissionPercent,
    });
  });
  return map;
}

const GENDER_LABELS: Record<Gender, string> = {
  [Gender.Men]: 'Ανδρικά',
  [Gender.Women]: 'Γυναικεία',
  [Gender.Unisex]: 'Unisex',
};

type VariantAgg = FinanceVariantRanking & {
  giftQuantity: number;
  belowCostQuantity: number;
};

function addRankingTotals(target: VariantAgg, event: FinanceLineEvent) {
  target.revenue += event.net;
  target.estimatedCost += event.estimatedCost;
  target.profit += event.profit;
  target.quantity += event.quantity;
  target.margin = target.revenue > 0 ? (target.profit / target.revenue) * 100 : 0;
  if (event.net <= 0.001) target.giftQuantity += event.quantity;
  else if (event.profit < 0) target.belowCostQuantity += event.quantity;
}

export function aggregateVariantRankingsFromEvents(events: FinanceLineEvent[]): VariantAgg[] {
  const map = new Map<string, VariantAgg>();

  events.forEach((event) => {
    if (isSpecialCreationSku(event.sku)) return;

    const key = variantRankingKey(event.sku, event.variantSuffix || '');
    const row = map.get(key) || {
      sku: event.sku,
      variantSuffix: (event.variantSuffix || '').toUpperCase(),
      image: event.productImage,
      category: event.category,
      revenue: 0,
      estimatedCost: 0,
      profit: 0,
      margin: 0,
      quantity: 0,
      giftQuantity: 0,
      belowCostQuantity: 0,
    };
    addRankingTotals(row, event);
    map.set(key, row);
  });

  return Array.from(map.values());
}

export function buildFilterFacets(
  events: FinanceLineEvent[],
  orderMeta: Map<string, OrderMeta>,
  products: Product[],
): SkuModalFilterFacets {
  const productsBySku = new Map(products.map((p) => [p.sku, p]));
  const customers = new Map<string, string>();
  const tags = new Set<string>();
  const sellers = new Map<string, string>();
  const categories = new Set<string>();
  const collections = new Map<string, { id: number | null; name: string }>();
  const finishes = new Set<string>();
  const genders = new Set<Gender>();

  events.forEach((event) => {
    if (isSpecialCreationSku(event.sku)) return;

    const customerKey = event.customerId || event.customerName;
    customers.set(customerKey, event.customerName);

    categories.add(event.category.split(' ')[0]);

    const collectionKey = event.collectionId === null ? 'none' : String(event.collectionId);
    collections.set(collectionKey, { id: event.collectionId, name: event.collectionName });

    const product = productsBySku.get(event.sku);
    const { finish } = getVariantComponents(event.variantSuffix || '', product?.gender);
    finishes.add(finish.name || 'Λουστρέ');

    if (product?.gender) genders.add(product.gender);
  });

  const orderIds = new Set(events.map((e) => e.orderId));
  orderIds.forEach((orderId) => {
    const meta = orderMeta.get(orderId);
    if (meta?.sellerId) {
      sellers.set(meta.sellerId, meta.sellerName || sellers.get(meta.sellerId) || 'Πλασιέ');
    }
    meta?.tags.forEach((tag) => tags.add(tag));
  });

  return {
    customers: Array.from(customers.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'el')),
    tags: Array.from(tags).sort((a, b) => a.localeCompare(b, 'el')),
    sellers: Array.from(sellers.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'el')),
    categories: Array.from(categories).sort((a, b) => a.localeCompare(b, 'el')),
    collections: Array.from(collections.values()).sort((a, b) => a.name.localeCompare(b.name, 'el')),
    finishes: Array.from(finishes).sort((a, b) => a.localeCompare(b, 'el')),
    genders: Array.from(genders)
      .map((id) => ({ id, label: GENDER_LABELS[id] }))
      .sort((a, b) => a.label.localeCompare(b.label, 'el')),
  };
}

export function eventPassesSkuModalFilters(
  event: FinanceLineEvent,
  filters: SkuModalFilterSelection,
  orderMeta: Map<string, OrderMeta>,
  productsBySku: Map<string, Product>,
): boolean {
  if (filters.customers.size > 0) {
    const key = event.customerId || event.customerName;
    if (!filters.customers.has(key)) return false;
  }

  if (filters.tags.size > 0) {
    const tags = orderMeta.get(event.orderId)?.tags || [];
    if (!tags.some((tag) => filters.tags.has(tag))) return false;
  }

  if (filters.sellers.size > 0) {
    const sellerId = getEventSellerId(event, orderMeta);
    if (!sellerId || !filters.sellers.has(sellerId)) return false;
  }

  if (filters.categories.size > 0) {
    const cat = event.category.split(' ')[0];
    if (!filters.categories.has(cat)) return false;
  }

  if (filters.collections.size > 0) {
    const key = event.collectionId === null ? 'none' : String(event.collectionId);
    if (!filters.collections.has(key)) return false;
  }

  if (filters.finishes.size > 0) {
    const product = productsBySku.get(event.sku);
    const { finish } = getVariantComponents(event.variantSuffix || '', product?.gender);
    const finishName = finish.name || 'Λουστρέ';
    if (!filters.finishes.has(finishName)) return false;
  }

  if (filters.genders.size > 0) {
    const gender = productsBySku.get(event.sku)?.gender;
    if (!gender || !filters.genders.has(gender)) return false;
  }

  return true;
}

export function filterFinanceEventsForModal(
  events: FinanceLineEvent[],
  filters: SkuModalFilterSelection,
  orderMeta: Map<string, OrderMeta>,
  products: Product[],
): FinanceLineEvent[] {
  const productsBySku = new Map(products.map((p) => [p.sku, p]));
  const enriched = applyOrderMetaToFinanceEvents(events, orderMeta);
  return enriched.filter((event) => eventPassesSkuModalFilters(event, filters, orderMeta, productsBySku));
}

export function buildSlimEnrichedRowsFromEvents(
  events: FinanceLineEvent[],
  products: Product[],
  sort: VariantAnalyticsSort,
  query: string,
): EnrichedVariantAnalyticsRow[] {
  const rankings = aggregateVariantRankingsFromEvents(events);
  const productsBySku = new Map(products.map((p) => [p.sku, p]));
  const totalQty = rankings.reduce((sum, row) => sum + row.quantity, 0);

  let rows: EnrichedVariantAnalyticsRow[] = rankings.map((row) => {
    const suffix = row.variantSuffix;
    const gender = productsBySku.get(row.sku)?.gender;
    return {
      ...row,
      gender,
      rank: 0,
      finishCode: '',
      finishName: '',
      stoneCode: '',
      stoneName: '',
      collectionLabel: '',
      quantityShare: totalQty > 0 ? (row.quantity / totalQty) * 100 : 0,
      peakShare: 0,
      avgUnitRevenue: row.quantity > 0 ? row.revenue / row.quantity : 0,
      fullSku: row.sku + suffix,
      giftQuantity: row.giftQuantity,
      belowCostQuantity: row.belowCostQuantity,
    };
  });

  const q = query.trim().toLowerCase();
  if (q) {
    rows = rows.filter((row) => {
      const haystack = [row.sku, row.variantSuffix, row.fullSku, row.category].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  rows.sort((a, b) => {
    if (sort === 'revenue') return b.revenue - a.revenue;
    if (sort === 'profit') return b.profit - a.profit;
    if (sort === 'margin') return b.margin - a.margin;
    return b.quantity - a.quantity;
  });

  const topQty = rows[0]?.quantity ?? 1;
  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
    peakShare: topQty > 0 ? (row.quantity / topQty) * 100 : 0,
  }));
}

export function formatVariantMargin(row: Pick<EnrichedVariantAnalyticsRow, 'revenue' | 'margin' | 'giftQuantity' | 'quantity'>): string {
  if (row.revenue <= 0.001 && row.giftQuantity > 0) return '—';
  if (row.revenue <= 0.001) return '—';
  return `${row.margin.toFixed(1)}%`;
}

export function describeNegativeProfit(row: Pick<EnrichedVariantAnalyticsRow, 'profit' | 'giftQuantity' | 'belowCostQuantity' | 'quantity'>): string | null {
  if (row.profit >= 0) return null;
  const parts: string[] = [];
  if (row.giftQuantity > 0) {
    parts.push(`${row.giftQuantity} τεμ. δώρο (τιμή 0€, κόστος παραγωγής μετράει αρνητικό κέρδος)`);
  }
  if (row.belowCostQuantity > 0) {
    parts.push(`${row.belowCostQuantity} τεμ. κάτω από κόστος (έκπτωση ή χειροκίνητη τιμή)`);
  }
  if (parts.length === 0) {
    return 'Το εκτιμώμενο κόστος παραγωγής υπερβαίνει τα έσοδα για κάποιες γραμμές.';
  }
  return parts.join(' · ');
}
