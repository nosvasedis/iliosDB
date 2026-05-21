import { Product, ProductVariant } from '../../types';

export type DuplicateSkuKind = 'master' | 'variant';

export interface DuplicateSkuMatch {
  kind: DuplicateSkuKind;
  existingMasterSku: string;
  existingSuffix: string;
  existingFullSku: string;
}

export interface FindDuplicateSkuInput {
  rawSku: string;
  finalMasterSku: string;
  finalVariants: ProductVariant[];
  products: Product[];
}

const normalizeSku = (value: string | null | undefined): string =>
  (value || '').trim().toUpperCase().replace(/\s+/g, '');

const buildMatch = (product: Product, suffix = ''): DuplicateSkuMatch => ({
  kind: suffix ? 'variant' : 'master',
  existingMasterSku: product.sku,
  existingSuffix: suffix,
  existingFullSku: `${product.sku}${suffix}`,
});

export function findDuplicateSkuIdentity({
  rawSku,
  finalMasterSku,
  finalVariants,
  products,
}: FindDuplicateSkuInput): DuplicateSkuMatch | null {
  const typedSku = normalizeSku(rawSku);
  const normalizedMasterSku = normalizeSku(finalMasterSku);
  if (!typedSku || !normalizedMasterSku) return null;

  const normalizedMasterToProduct = new Map<string, Product>();
  const normalizedFullSkuToMatch = new Map<string, DuplicateSkuMatch>();

  products.forEach((product) => {
    const productMaster = normalizeSku(product.sku);
    if (!productMaster) return;

    normalizedMasterToProduct.set(productMaster, product);
    normalizedFullSkuToMatch.set(productMaster, buildMatch(product));

    (product.variants || []).forEach((variant) => {
      const suffix = normalizeSku(variant.suffix);
      if (!suffix) {
        normalizedFullSkuToMatch.set(productMaster, buildMatch(product));
        return;
      }

      normalizedFullSkuToMatch.set(`${productMaster}${suffix}`, buildMatch(product, variant.suffix));
    });
  });

  const exactTypedMatch = normalizedFullSkuToMatch.get(typedSku);
  if (exactTypedMatch) return exactTypedMatch;

  const existingMaster = normalizedMasterToProduct.get(normalizedMasterSku);
  if (!existingMaster) return null;

  const proposedSuffixes = Array.from(
    new Set(finalVariants.map((variant) => normalizeSku(variant.suffix)))
  ).filter(Boolean);

  const existingSuffixes = new Map<string, string>();
  (existingMaster.variants || []).forEach((variant) => {
    const suffix = normalizeSku(variant.suffix);
    if (suffix) existingSuffixes.set(suffix, variant.suffix);
  });

  for (const proposedSuffix of proposedSuffixes) {
    const existingSuffix = existingSuffixes.get(proposedSuffix);
    if (existingSuffix != null) {
      return buildMatch(existingMaster, existingSuffix);
    }
  }

  return buildMatch(existingMaster);
}
