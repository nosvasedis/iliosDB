import type { Product } from '../../types';

export interface SkuPrefixMatches {
  /** Uppercased term the matches were computed for. */
  term: string;
  /** First `limit` sellable masters whose SKU starts with the term, in natural SKU order. */
  products: Product[];
  /** Total number of matches before the limit was applied. */
  total: number;
}

const skuCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * Literal autocomplete for the order builder: only SKUs that start with exactly what was typed.
 * No related-collection / similar-series guesses — typing SK23 never offers BR333.
 */
export function searchMastersByPrefix(products: Product[], term: string, limit = 24): SkuPrefixMatches | null {
  const t = term.trim().toUpperCase();
  if (t.length < 2) return null;
  const hits = products.filter((p) => !p.is_component && p.sku.toUpperCase().startsWith(t));
  hits.sort((a, b) => skuCollator.compare(a.sku, b.sku));
  return { term: t, products: hits.slice(0, limit), total: hits.length };
}

/** True when the product has a variant equal to, or starting with, the given suffix. */
export function productHasVariantPrefix(p: Product, suffixUpper: string | null): boolean {
  if (!suffixUpper) return true;
  const vars = p.variants;
  if (!vars || vars.length === 0) return suffixUpper === '';
  return vars.some((v) => (v.suffix || '').toUpperCase().startsWith(suffixUpper));
}
