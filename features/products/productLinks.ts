import { useMemo } from 'react';
import type { ProductLinkMembership } from '../../types';

/**
 * Συνδεδεμένα Προϊόντα: curated sets of master SKUs (e.g. KL255 + BR344 + SK227).
 * Pure helpers shared by the admin catalogue (Product) and the seller snapshot
 * (SellerCatalogProduct): both carry `link_groups`.
 */
export interface LinkableProduct {
  sku: string;
  link_groups?: ProductLinkMembership[];
  variants?: Array<{ suffix: string }>;
}

export interface ProductLinkIndex {
  /** group id → member SKUs, ordered by position. Only sets with at least two known members. */
  groups: Map<string, string[]>;
  /** SKU → ids of the sets it belongs to. */
  bySku: Map<string, string[]>;
}

export interface LinkedSet {
  groupId: string;
  /** Every member, including the SKU the set was looked up for. */
  skus: string[];
}

export const EMPTY_PRODUCT_LINK_INDEX: ProductLinkIndex = { groups: new Map(), bySku: new Map() };

export function buildProductLinkIndex(products: readonly LinkableProduct[] | null | undefined): ProductLinkIndex {
  if (!products?.length) return EMPTY_PRODUCT_LINK_INDEX;
  const raw = new Map<string, Array<{ sku: string; position: number }>>();
  products.forEach((product) => {
    product.link_groups?.forEach((membership) => {
      if (!membership?.group_id) return;
      if (!raw.has(membership.group_id)) raw.set(membership.group_id, []);
      raw.get(membership.group_id)!.push({ sku: product.sku, position: membership.position || 0 });
    });
  });
  if (raw.size === 0) return EMPTY_PRODUCT_LINK_INDEX;

  const groups = new Map<string, string[]>();
  const bySku = new Map<string, string[]>();
  raw.forEach((members, groupId) => {
    const skus = Array.from(new Set(
      [...members]
        .sort((a, b) => a.position - b.position || a.sku.localeCompare(b.sku, undefined, { numeric: true }))
        .map((member) => member.sku),
    ));
    // A set left with a single member (e.g. after a product was deleted) is not a set.
    if (skus.length < 2) return;
    groups.set(groupId, skus);
    skus.forEach((sku) => {
      if (!bySku.has(sku)) bySku.set(sku, []);
      bySku.get(sku)!.push(groupId);
    });
  });
  return { groups, bySku };
}

export function getLinkedSets(sku: string, index: ProductLinkIndex): LinkedSet[] {
  return (index.bySku.get(sku) || [])
    .map((groupId) => ({ groupId, skus: index.groups.get(groupId) || [] }))
    .filter((set) => set.skus.length > 1);
}

/** Other members across all sets of `sku`, de-duplicated, in set order. */
export function getLinkedSkus(sku: string, index: ProductLinkIndex): string[] {
  const result: string[] = [];
  const seen = new Set<string>([sku]);
  getLinkedSets(sku, index).forEach((set) => {
    set.skus.forEach((member) => {
      if (seen.has(member)) return;
      seen.add(member);
      result.push(member);
    });
  });
  return result;
}

export function getLinkedCount(sku: string, index: ProductLinkIndex): number {
  return index.bySku.has(sku) ? getLinkedSkus(sku, index).length : 0;
}

/**
 * Links are between master SKUs; a variant of one member maps to the same suffix
 * on the others. Returns the suffix to use on `product`, or null when it has no such variant.
 */
export function resolveLinkedVariantSuffix(product: LinkableProduct, suffix: string | null | undefined): string | null {
  const wanted = suffix || '';
  const variants = product.variants || [];
  if (wanted === '') {
    // The base code exists when the product has no variants or declares an empty-suffix variant.
    return variants.length === 0 || variants.some((variant) => variant.suffix === '') ? '' : null;
  }
  return variants.some((variant) => variant.suffix === wanted) ? wanted : null;
}

export interface MissingSetMate<P extends LinkableProduct = LinkableProduct> {
  product: P;
  /** Matching suffix on the mate, or null when it lacks that variant (the user must choose). */
  suffix: string | null;
}

/**
 * Mates of `sku` that are not yet present. `presentSkus` holds master SKUs already on the
 * document (order, offer, collection); any line of a mate counts as present.
 */
export function findMissingSetMates<P extends LinkableProduct>(
  sku: string,
  suffix: string | null | undefined,
  presentSkus: ReadonlySet<string>,
  index: ProductLinkIndex,
  productsBySku: ReadonlyMap<string, P>,
): MissingSetMate<P>[] {
  return getLinkedSkus(sku, index)
    .filter((mate) => !presentSkus.has(mate))
    .map((mate) => productsBySku.get(mate))
    .filter((product): product is P => !!product)
    .map((product) => ({ product, suffix: resolveLinkedVariantSuffix(product, suffix) }));
}

export function formatLinkedSkusTitle(skus: readonly string[]): string {
  return skus.length ? `Σετ με: ${skus.join(', ')}` : '';
}

export function useProductLinkIndex(products: readonly LinkableProduct[] | null | undefined): ProductLinkIndex {
  return useMemo(() => buildProductLinkIndex(products), [products]);
}
