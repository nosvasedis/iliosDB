import type { Collection } from '../../types';
import { normalizeProductCategory, getProductCategoryRoot } from '../../utils/productCategories';

export type ProductTheme = 'religious' | 'unspecified';
export const PRODUCT_THEMES: Array<{ id: ProductTheme; label: string }> = [
  { id: 'religious', label: 'Θρησκευτικό' },
  { id: 'unspecified', label: 'Χωρίς θεματική σήμανση' },
];
const EMPTY_IDS: ReadonlySet<number> = new Set();
export const getReligiousCollectionIds = (collections: readonly Pick<Collection, 'id' | 'name'>[] = []): ReadonlySet<number> =>
  new Set(collections.filter(collection => normalizeProductCategory(collection.name) === normalizeProductCategory('Ψαλμός')).map(collection => collection.id));

/** Theme is independent of product type, construction, gender and collection membership. */
export function getProductTheme(product: { category?: string | null; collections?: readonly number[]; is_component?: boolean }, religiousCollectionIds = EMPTY_IDS): ProductTheme {
  if (product.is_component) return 'unspecified';
  const root = getProductCategoryRoot(product.category);
  return normalizeProductCategory(product.category).includes('θρησκευτικ') || root === 'Σταυρός' || root === 'Ροζάριο'
    || product.collections?.some(id => religiousCollectionIds.has(id)) ? 'religious' : 'unspecified';
}
export const productThemeLabel = (theme?: ProductTheme | null): string => PRODUCT_THEMES.find(item => item.id === theme)?.label || PRODUCT_THEMES[1].label;
