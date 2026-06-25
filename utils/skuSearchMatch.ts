/**
 * Shared smart SKU prefix matching used by order search and finance analytics.
 *
 * Rules:
 * 1. Master-only query → any suffix variant qualifies.
 * 2. Query extending into suffix → filter to matching variants.
 * 3. Prefix-based so DA001D matches DA001DLE, DA001DPR, etc.
 */

export function normalizeSkuQuery(query: string): string {
  return query.toUpperCase().replace(/\s+/g, '');
}

export function buildFullSku(masterSku: string, variantSuffix?: string | null): string {
  const suffix = (variantSuffix ?? '').trim();
  return normalizeSkuQuery(masterSku + suffix);
}

/**
 * Determines whether a master SKU + suffix matches the typed query.
 */
export function skuPartsMatchQuery(
  masterSku: string,
  variantSuffix: string | null | undefined,
  query: string,
): boolean {
  if (!query) return false;
  const q = normalizeSkuQuery(query);
  if (q.length < 2) return false;

  const fullSku = buildFullSku(masterSku, variantSuffix);
  const master = normalizeSkuQuery(masterSku);

  if (fullSku.startsWith(q)) return true;
  if (q === master) return true;

  return false;
}

export interface SkuMatchableItem {
  sku: string;
  variant_suffix?: string | null;
}

export function itemMatchesSkuQuery(item: SkuMatchableItem, query: string): boolean {
  return skuPartsMatchQuery(item.sku, item.variant_suffix, query);
}

export interface SkuMatchableEvent {
  sku: string;
  variantSuffix?: string | null;
}

export function financeEventMatchesSkuQuery(event: SkuMatchableEvent, query: string): boolean {
  return skuPartsMatchQuery(event.sku, event.variantSuffix, query);
}
