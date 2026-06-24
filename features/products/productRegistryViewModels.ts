import { Material, MaterialType, PlatingType, Product, ProductVariant, Gender } from '../../types';
import {
  calculateProductCost,
  estimateVariantCost,
  getIliosSuggestedPriceForProduct,
  getVariantComponents,
} from '../../utils/pricingEngine';

export interface RegistrySearchableProduct {
  product: Product;
  skuUpper: string;
  categoryLower: string;
  platingTypes: Set<string>;
  variantStoneCodes: Array<{ code: string; name: string }>;
  variantStoneCodeSet: Set<string>;
  collectionIds: Set<number>;
  hasStoneInRecipe: boolean;
}

export type RegistrySortMode =
  | 'sku_asc'
  | 'sku_desc'
  | 'created_desc'
  | 'created_asc'
  | 'category_asc'
  | 'price_desc'
  | 'price_asc';

export const REGISTRY_SORT_OPTIONS: Array<{ id: RegistrySortMode; label: string; helper: string }> = [
  { id: 'sku_asc', label: 'Κωδικός', helper: 'Α→Ω' },
  { id: 'sku_desc', label: 'Κωδικός', helper: 'Ω→Α' },
  { id: 'created_desc', label: 'Νεότερα', helper: 'Πρώτα' },
  { id: 'created_asc', label: 'Παλαιότερα', helper: 'Πρώτα' },
  { id: 'category_asc', label: 'Κατηγορία', helper: 'Α→Ω' },
  { id: 'price_desc', label: 'Τιμή', helper: 'Υψηλ→Χαμηλ' },
  { id: 'price_asc', label: 'Τιμή', helper: 'Χαμηλ→Υψηλ' },
];

export interface ProductRegistryFilters {
  category: string;
  gender: 'All' | Gender;
  searchTerm: string;
  stone: string;
  plating: string;
  productionType: string;
  collection: string;
  sortBy: RegistrySortMode;
}

export interface ProductRegistryTableVariant {
  masterSku: string;
  variantSku: string;
  product: Product;
  variant: ProductVariant | null;
  label: string;
  image: string | null;
  price: number;
  cost: number;
  costBreakdown: any;
  suggestedPrice: number;
  weight: number;
}

export function buildSearchableProducts(
  products: Product[],
  stoneMaterialIds: Set<string>,
): RegistrySearchableProduct[] {
  return products.map((product) => {
    const platingTypes = new Set<string>();
    const { finish: masterFinish } = getVariantComponents(product.sku, product.gender);

    if (product.plating_type === PlatingType.GoldPlated) platingTypes.add('X');
    if (product.plating_type === PlatingType.Platinum) platingTypes.add('H');
    if (product.plating_type === PlatingType.None) platingTypes.add(masterFinish.code || '');

    const variantStoneCodes: Array<{ code: string; name: string }> = [];
    (product.variants || []).forEach((variant) => {
      const { finish, stone } = getVariantComponents(variant.suffix, product.gender);
      platingTypes.add(finish.code);
      if (stone.code && stone.name) {
        variantStoneCodes.push({ code: stone.code, name: stone.name });
      }
    });

    return {
      product,
      skuUpper: product.sku.toUpperCase(),
      categoryLower: product.category.toLowerCase(),
      platingTypes,
      variantStoneCodes,
      variantStoneCodeSet: new Set(variantStoneCodes.map(({ code }) => code)),
      collectionIds: new Set(product.collections || []),
      hasStoneInRecipe: product.recipe.some((item) => item.type === 'raw' && stoneMaterialIds.has(item.id)),
    };
  });
}

export function getGroupedProductCategories(products: Product[]) {
  const parents = new Set<string>();
  const children = new Map<string, Set<string>>();
  const allCategories = new Set(products.map((product) => product.category));
  const parentKeywords = ['Βραχιόλι', 'Δαχτυλίδι', 'Σκουλαρίκια', 'Μενταγιόν', 'Σταυρός', 'Κολιέ'];

  allCategories.forEach((category) => {
    const parent = parentKeywords.find((keyword) => category.startsWith(keyword));
    if (parent) {
      parents.add(parent);
      if (!children.has(parent)) children.set(parent, new Set());
      if (category !== parent) children.get(parent)!.add(category);
    } else {
      parents.add(category);
    }
  });

  return { parents: Array.from(parents).sort(), children };
}

export function getAvailableRegistryStones(
  searchableProducts: RegistrySearchableProduct[],
  gender: 'All' | Gender,
) {
  const stoneMap = new Map<string, { id: string; name: string; count: number }>();
  searchableProducts.forEach(({ product, variantStoneCodes }) => {
    if (gender !== 'All' && product.gender !== gender) return;
    variantStoneCodes.forEach(({ code, name }) => {
      if (stoneMap.has(code)) stoneMap.get(code)!.count++;
      else stoneMap.set(code, { id: code, name, count: 1 });
    });
  });

  return Array.from(stoneMap.values()).sort((a, b) => b.count - a.count);
}

function compareRegistrySku(a: Product, b: Product): number {
  return a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' });
}

/** Effective wholesale price for one variant (same rule as registry table rows). */
export function getVariantSellingPrice(product: Product, variant: ProductVariant): number {
  return variant.selling_price || product.selling_price || 0;
}

/** Mean selling price across all variants; master price when the SKU has no variants. */
export function getProductAverageSellingPrice(product: Product): number {
  const variants = product.variants || [];
  if (variants.length === 0) {
    return product.selling_price || 0;
  }
  const total = variants.reduce(
    (sum, variant) => sum + getVariantSellingPrice(product, variant),
    0,
  );
  return total / variants.length;
}

export function getProductCreatedAtMs(product: Product): number {
  if (!product.created_at) return 0;
  const ms = new Date(product.created_at).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function filterRegistryProducts(
  searchableProducts: RegistrySearchableProduct[],
  filters: ProductRegistryFilters,
) {
  const normalizedSearchTerm = filters.searchTerm.trim().toLowerCase();
  const normalizedSearchSku = filters.searchTerm.trim().toUpperCase();

  const filtered = searchableProducts.filter(({ product, skuUpper, categoryLower, platingTypes, variantStoneCodeSet, collectionIds, hasStoneInRecipe }) => {
    const matchesGender = filters.gender === 'All' || product.gender === filters.gender;
    const matchesSearch = !normalizedSearchTerm || skuUpper.includes(normalizedSearchSku) || categoryLower.includes(normalizedSearchTerm);
    const matchesCategory = filters.category === 'All' || product.category === filters.category || product.category.startsWith(filters.category);
    if (!matchesGender || !matchesSearch || !matchesCategory) return false;

    if (filters.stone === 'with') {
      if (!hasStoneInRecipe) return false;
    } else if (filters.stone === 'without') {
      if (hasStoneInRecipe) return false;
    } else if (filters.stone !== 'all' && !variantStoneCodeSet.has(filters.stone)) {
      return false;
    }

    if (filters.plating !== 'all') {
      if (filters.plating === 'lustre' && (!platingTypes.has('') || ['P', 'D', 'X', 'H'].some((code) => platingTypes.has(code)))) return false;
      if (filters.plating === 'patina' && !platingTypes.has('P')) return false;
      if (filters.plating === 'gold' && !platingTypes.has('X')) return false;
      if (filters.plating === 'platinum' && !platingTypes.has('H')) return false;
    }

    if (filters.productionType !== 'all') {
      if (filters.productionType === 'InHouse' && product.production_type !== 'InHouse') return false;
      if (filters.productionType === 'Imported' && product.production_type !== 'Imported') return false;
    }

    if (filters.collection !== 'all') {
      const colId = parseInt(filters.collection);
      if (!collectionIds.has(colId)) return false;
    }

    return true;
  }).map(({ product }) => product);

  return filtered.sort((a, b) => {
    switch (filters.sortBy) {
      case 'sku_desc':
        return compareRegistrySku(b, a);
      case 'created_desc':
        return getProductCreatedAtMs(b) - getProductCreatedAtMs(a);
      case 'created_asc':
        return getProductCreatedAtMs(a) - getProductCreatedAtMs(b);
      case 'category_asc': {
        const categoryCompare = a.category.localeCompare(b.category, undefined, { sensitivity: 'base' });
        return categoryCompare !== 0 ? categoryCompare : compareRegistrySku(a, b);
      }
      case 'price_desc': {
        const priceDiff = getProductAverageSellingPrice(b) - getProductAverageSellingPrice(a);
        return priceDiff !== 0 ? priceDiff : compareRegistrySku(a, b);
      }
      case 'price_asc': {
        const priceDiff = getProductAverageSellingPrice(a) - getProductAverageSellingPrice(b);
        return priceDiff !== 0 ? priceDiff : compareRegistrySku(a, b);
      }
      case 'sku_asc':
      default:
        return compareRegistrySku(a, b);
    }
  });
}

export function buildPrintableSkuMap(products?: Product[]) {
  const map = new Map<string, { product: Product; variant?: ProductVariant }>();
  products?.forEach((product) => {
    map.set(product.sku, { product });
    product.variants?.forEach((variant) => {
      map.set(`${product.sku}${variant.suffix}`, { product, variant });
    });
  });
  return map;
}

export function buildRegistryTableVariants(
  rows: Array<{
    masterSku: string;
    variantSku: string;
    product: Product;
    variant: ProductVariant | null;
    label: string;
    image: string | null;
  }>,
  settings: any,
  materials: Material[],
  products: Product[],
  productsMap?: Map<string, Product>,
  materialsMap?: Map<string, Material>,
): ProductRegistryTableVariant[] {
  return rows.map((row) => {
    if (row.variant) {
      const estCost = estimateVariantCost(row.product, row.variant.suffix, settings, materials, products, undefined, productsMap, materialsMap);
      const suggestedPrice = getIliosSuggestedPriceForProduct(row.product, row.variant.suffix, settings, materials, products, productsMap, materialsMap);
      const weight = estCost.breakdown.details?.total_weight || (row.product.weight_g + (row.product.secondary_weight_g || 0));

      return {
        ...row,
        price: row.variant.selling_price || row.product.selling_price,
        cost: estCost.total,
        costBreakdown: estCost.breakdown,
        suggestedPrice,
        weight,
      };
    }

    const costCalc = calculateProductCost(row.product, settings, materials, products, 0, new Set(), undefined, productsMap, materialsMap);
    const suggestedPrice = getIliosSuggestedPriceForProduct(row.product, null, settings, materials, products, productsMap, materialsMap);
    const weight = costCalc.breakdown.details?.total_weight || (row.product.weight_g + (row.product.secondary_weight_g || 0));

    return {
      ...row,
      price: row.product.selling_price,
      cost: costCalc.total,
      costBreakdown: costCalc.breakdown,
      suggestedPrice,
      weight,
    };
  });
}
