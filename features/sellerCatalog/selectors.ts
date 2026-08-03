import { Gender, ProductionType } from '../../types';
import { getVariantComponents } from '../../utils/pricingEngine';
import { SellerCatalogCollection, SellerCatalogProduct, SellerCatalogVariant } from './types';

export const SELLER_FINISH_ORDER = ['', 'P', 'X', 'D', 'H'] as const;

export interface SellerCatalogIndexEntry {
  product: SellerCatalogProduct;
  normalizedSearch: string;
  categoryGroup: string;
  finishCodes: ReadonlySet<string>;
  stoneCodes: ReadonlySet<string>;
  hasStone: boolean;
  totalAvailability: number;
  createdAt: string;
}

export interface SellerCatalogIndex {
  entries: SellerCatalogIndexEntry[];
  categoryGroups: string[];
  availableFinishes: string[];
  availableStones: Array<{ code: string; name: string }>;
}

export interface SellerCatalogFilters {
  search: string;
  categoryGroup: string;
  gender: 'All' | Gender;
  collection: 'All' | number;
  finish: string | null;
  stone: string | null;
  stoneMode: 'All' | 'with' | 'without';
  productionType: 'All' | ProductionType;
  onlyInStock: boolean;
  sortBy: 'sku' | 'created_at';
}

const finishRank = (suffix: string, gender: Gender): [number, string] => {
  const components = getVariantComponents(suffix, gender);
  const rank = SELLER_FINISH_ORDER.indexOf(components.finish.code as any);
  return [rank >= 0 ? rank : 99, components.stone.code];
};

export function sortSellerCatalogVariants(
  variants: readonly SellerCatalogVariant[],
  gender: Gender,
): SellerCatalogVariant[] {
  return [...variants].sort((a, b) => {
    const [finishA, stoneA] = finishRank(a.suffix, gender);
    const [finishB, stoneB] = finishRank(b.suffix, gender);
    return finishA - finishB || stoneA.localeCompare(stoneB) || a.suffix.localeCompare(b.suffix);
  });
}

export function buildSellerCatalogIndex(
  products: readonly SellerCatalogProduct[],
  resolveCategoryGroup: (category: string) => string,
): SellerCatalogIndex {
  const categoryGroups = new Set<string>();
  const finishes = new Set<string>();
  const stones = new Map<string, { name: string; count: number }>();

  const entries = products.map((sourceProduct) => {
    const product = {
      ...sourceProduct,
      variants: sortSellerCatalogVariants(sourceProduct.variants, sourceProduct.gender),
    };
    const finishCodes = new Set<string>();
    const stoneCodes = new Set<string>();
    const variantSearch: string[] = [];
    let totalAvailability = product.available_qty;

    product.variants.forEach((variant) => {
      totalAvailability += variant.available_qty;
      const { finish, stone } = getVariantComponents(variant.suffix, product.gender);
      finishCodes.add(finish.code);
      finishes.add(finish.code);
      variantSearch.push(`${product.sku}${variant.suffix}`.toLowerCase());
      if (stone.code) {
        stoneCodes.add(stone.code);
        const existing = stones.get(stone.code);
        stones.set(stone.code, {
          name: existing?.name || stone.name || stone.code,
          count: (existing?.count || 0) + 1,
        });
      }
    });

    const categoryGroup = resolveCategoryGroup(product.category);
    categoryGroups.add(categoryGroup);
    return {
      product,
      normalizedSearch: `${product.sku} ${product.category} ${variantSearch.join(' ')}`.toLowerCase(),
      categoryGroup,
      finishCodes,
      stoneCodes,
      hasStone: stoneCodes.size > 0,
      totalAvailability,
      createdAt: product.created_at,
    };
  });

  return {
    entries,
    categoryGroups: [...categoryGroups].sort(),
    availableFinishes: SELLER_FINISH_ORDER.filter((finish) => finishes.has(finish)),
    availableStones: [...stones.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
      .map(([code, stone]) => ({ code, name: stone.name })),
  };
}

export function selectSellerCatalogProducts(
  index: SellerCatalogIndex,
  filters: SellerCatalogFilters,
): SellerCatalogProduct[] {
  const normalizedSearch = filters.search.trim().toLowerCase();
  const entries = index.entries.filter((entry) => {
    const product = entry.product;
    return (!normalizedSearch || entry.normalizedSearch.includes(normalizedSearch))
      && (filters.categoryGroup === 'All' || entry.categoryGroup === filters.categoryGroup)
      && (filters.gender === 'All' || product.gender === filters.gender)
      && (filters.collection === 'All' || product.collections.includes(filters.collection))
      && (!filters.finish || entry.finishCodes.has(filters.finish))
      && (!filters.stone || entry.stoneCodes.has(filters.stone))
      && (filters.stoneMode === 'All'
        || (filters.stoneMode === 'with' && entry.hasStone)
        || (filters.stoneMode === 'without' && !entry.hasStone))
      && (filters.productionType === 'All' || product.production_type === filters.productionType)
      && (!filters.onlyInStock || entry.totalAvailability > 0);
  });

  entries.sort((a, b) => filters.sortBy === 'created_at'
    ? b.createdAt.localeCompare(a.createdAt)
    : a.product.sku.localeCompare(b.product.sku, undefined, { numeric: true, sensitivity: 'base' }));
  return entries.map((entry) => entry.product);
}

export interface SellerCollectionSummary {
  collection: SellerCatalogCollection;
  products: SellerCatalogProduct[];
  previewProduct?: SellerCatalogProduct;
}

export function buildSellerCollectionSummaries(
  collections: readonly SellerCatalogCollection[],
  products: readonly SellerCatalogProduct[],
): SellerCollectionSummary[] {
  const summaries = new Map<number, SellerCollectionSummary>(
    collections.map((collection) => [collection.id, { collection, products: [] }]),
  );

  products.forEach((product) => {
    product.collections.forEach((collectionId) => {
      const summary = summaries.get(collectionId);
      if (!summary) return;
      summary.products.push(product);
      if (!summary.previewProduct && product.image_url) summary.previewProduct = product;
    });
  });

  summaries.forEach((summary) => {
    summary.products.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }));
  });
  return collections.map((collection) => summaries.get(collection.id)!);
}

export function filterSellerCollectionProducts(
  products: readonly SellerCatalogProduct[],
  search: string,
): SellerCatalogProduct[] {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return [...products];
  return products.filter((product) =>
    product.sku.toLowerCase().includes(normalized) || product.category.toLowerCase().includes(normalized));
}
