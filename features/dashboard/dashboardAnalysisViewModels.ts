import { Gender, Product } from '../../types';
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
