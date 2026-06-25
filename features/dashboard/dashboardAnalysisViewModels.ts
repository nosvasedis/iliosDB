import { Gender, Product, Collection } from '../../types';
import {
  FinanceCollectionRanking,
  FinanceCustomerRanking,
  FinanceLineEvent,
  FinanceVariantRanking,
} from '../../utils/financeAnalytics';
import { getVariantComponents } from '../../utils/pricingEngine';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';

export type DashboardPieSlice = { name: string; value: number };

const GENDER_LABELS: Record<Gender, string> = {
  [Gender.Men]: 'Ανδρικά',
  [Gender.Women]: 'Γυναικεία',
  [Gender.Unisex]: 'Unisex',
};

function productMap(products: Product[]): Map<string, Product> {
  return new Map(products.map((p) => [p.sku, p]));
}

export function buildCategoryChartData(
  events: FinanceLineEvent[],
  products: Product[],
  genderFilter: 'All' | Gender,
  limit = 8,
): DashboardPieSlice[] {
  const bySku = productMap(products);
  const counts: Record<string, number> = {};

  events.forEach((event) => {
    const product = bySku.get(event.sku);
    if (product?.is_component) return;
    if (genderFilter !== 'All' && product && product.gender !== genderFilter) return;
    const cat = (event.category || product?.category || 'Άλλο').split(' ')[0];
    counts[cat] = (counts[cat] || 0) + event.quantity;
  });

  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function buildCollectionChartData(
  topCollections: FinanceCollectionRanking[],
  limit = 8,
): DashboardPieSlice[] {
  return topCollections
    .filter((c) => c.quantity > 0)
    .slice(0, limit)
    .map((c) => ({ name: c.name, value: c.quantity }));
}

export function buildGenderChartData(
  events: FinanceLineEvent[],
  products: Product[],
): DashboardPieSlice[] {
  const bySku = productMap(products);
  const counts: Record<string, number> = {};

  events.forEach((event) => {
    if (isSpecialCreationSku(event.sku)) return;
    const product = bySku.get(event.sku);
    if (product?.is_component) return;
    const gender = product?.gender ?? Gender.Unisex;
    const label = GENDER_LABELS[gender];
    counts[label] = (counts[label] || 0) + event.quantity;
  });

  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function buildFinishChartData(
  events: FinanceLineEvent[],
  products: Product[],
): DashboardPieSlice[] {
  const bySku = productMap(products);
  const counts: Record<string, number> = {};

  events.forEach((event) => {
    if (isSpecialCreationSku(event.sku)) return;
    const product = bySku.get(event.sku);
    if (product?.is_component) return;
    const { finish } = getVariantComponents(event.variantSuffix || '', product?.gender);
    const name = finish.name || 'Λουστρέ';
    counts[name] = (counts[name] || 0) + event.quantity;
  });

  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export type DashboardVariantRow = FinanceVariantRanking & { gender?: Gender };

export function buildTopVariantRows(
  topVariants: FinanceVariantRanking[],
  products: Product[],
  limit = 8,
): DashboardVariantRow[] {
  const bySku = productMap(products);
  return [...topVariants]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit)
    .map((row) => ({
      ...row,
      gender: bySku.get(row.sku)?.gender,
    }));
}

export function buildTopCustomerRows(
  topCustomers: FinanceCustomerRanking[],
  limit = 8,
): FinanceCustomerRanking[] {
  return topCustomers.slice(0, limit);
}

export type EnrichedVariantAnalyticsRow = DashboardVariantRow & {
  rank: number;
  finishCode: string;
  finishName: string;
  stoneCode: string;
  stoneName: string;
  collectionLabel: string;
  quantityShare: number;
  peakShare: number;
  avgUnitRevenue: number;
  fullSku: string;
};

export type VariantAnalyticsSort = 'quantity' | 'revenue' | 'profit' | 'margin';

export function buildEnrichedVariantAnalyticsRows(
  topVariants: FinanceVariantRanking[],
  products: Product[],
  collections: Collection[],
  limit?: number,
): EnrichedVariantAnalyticsRow[] {
  const bySku = productMap(products);
  const collectionById = new Map(collections.map((c) => [c.id, c.name]));
  const sorted = [...topVariants]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit ?? undefined);
  const topQty = sorted[0]?.quantity ?? 1;
  const totalQty = sorted.reduce((sum, row) => sum + row.quantity, 0);

  return sorted.map((row, index) => {
    const product = bySku.get(row.sku);
    const gender = product?.gender;
    const suffix = (row.variantSuffix || '').toUpperCase();
    const { finish, stone } = getVariantComponents(suffix, gender);
    const collectionLabel =
      (product?.collections || [])
        .map((id) => collectionById.get(id))
        .filter(Boolean)
        .join(' · ') || '—';

    return {
      ...row,
      variantSuffix: suffix,
      gender,
      rank: index + 1,
      finishCode: finish.code,
      finishName: finish.name || 'Λουστρέ',
      stoneCode: stone.code,
      stoneName: stone.name || '—',
      collectionLabel,
      quantityShare: totalQty > 0 ? (row.quantity / totalQty) * 100 : 0,
      peakShare: topQty > 0 ? (row.quantity / topQty) * 100 : 0,
      avgUnitRevenue: row.quantity > 0 ? row.revenue / row.quantity : 0,
      fullSku: row.sku + suffix,
    };
  });
}

export function filterAndSortEnrichedVariants(
  rows: EnrichedVariantAnalyticsRow[],
  query: string,
  sort: VariantAnalyticsSort,
): EnrichedVariantAnalyticsRow[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((row) => {
        const haystack = [
          row.sku,
          row.variantSuffix,
          row.fullSku,
          row.category,
          row.finishName,
          row.stoneName,
          row.collectionLabel,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
    : rows;

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (sort === 'revenue') return b.revenue - a.revenue;
    if (sort === 'profit') return b.profit - a.profit;
    if (sort === 'margin') return b.margin - a.margin;
    return b.quantity - a.quantity;
  });

  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}
