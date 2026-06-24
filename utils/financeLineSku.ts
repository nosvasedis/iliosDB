import { Product } from '../types';
import { findProductByScannedCode, splitSkuComponents } from './pricingEngine';

export interface ResolvedFinanceLineSku {
  masterSku: string;
  variantSuffix: string;
  product?: Product;
}

export function normalizeVariantSuffix(suffix?: string | null): string {
  return (suffix ?? '').trim().toUpperCase();
}

export function variantRankingKey(masterSku: string, variantSuffix: string): string {
  return `${masterSku}::${normalizeVariantSuffix(variantSuffix)}`;
}

/**
 * Resolves master SKU + normalized variant suffix for finance analytics.
 * Handles full codes in `sku`, missing suffixes, and case drift.
 */
export function resolveFinanceLineSku(
  item: { sku: string; variant_suffix?: string | null },
  products: Product[],
  productsMap: Map<string, Product>,
): ResolvedFinanceLineSku {
  const rawSku = (item.sku || '').trim();
  const explicitSuffix = normalizeVariantSuffix(item.variant_suffix);
  let product = productsMap.get(rawSku);
  let masterSku = rawSku;

  if (explicitSuffix) {
    if (!product) {
      const scanned = findProductByScannedCode(rawSku, products);
      if (scanned) {
        masterSku = scanned.product.sku;
        product = scanned.product;
      }
    }
    return { masterSku, variantSuffix: explicitSuffix, product };
  }

  const scanned = findProductByScannedCode(rawSku, products);
  if (scanned) {
    return {
      masterSku: scanned.product.sku,
      variantSuffix: normalizeVariantSuffix(scanned.variant?.suffix ?? ''),
      product: scanned.product,
    };
  }

  if (product) {
    return { masterSku, variantSuffix: '', product };
  }

  const { master, suffix } = splitSkuComponents(rawSku);
  if (master !== rawSku) {
    const masterProduct = productsMap.get(master);
    if (masterProduct) {
      return {
        masterSku: master,
        variantSuffix: normalizeVariantSuffix(suffix),
        product: masterProduct,
      };
    }
  }

  return { masterSku: rawSku, variantSuffix: '', product };
}
