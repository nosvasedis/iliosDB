import { Product, ProductVariant } from '../types';
import { findProductByScannedCode } from './pricingEngine';

export interface SkuProductSelection {
  sku: string;
  variant_suffix: string | null;
  displaySku: string;
  manual?: boolean;
}

export interface SkuPickerOption {
  key: string;
  sku: string;
  variant_suffix: string | null;
  displaySku: string;
  hint?: string;
  price?: number;
  manual?: boolean;
  product?: Product;
  variant?: ProductVariant;
}

export function formatSkuDisplayValue(sku: string, variantSuffix?: string | null): string {
  if (sku === 'MANUAL') return 'MANUAL';
  return `${sku}${variantSuffix || ''}`;
}

export function getCatalogUnitPrice(product: Product, variant?: ProductVariant | null): number {
  return Number(variant?.selling_price || product.selling_price || product.active_price || 0);
}

function makeCatalogOption(product: Product, variant?: ProductVariant | null): SkuPickerOption {
  const suffix = variant?.suffix ?? null;
  const displaySku = product.sku + (suffix || '');
  return {
    key: `${product.sku}::${suffix ?? ''}`,
    sku: product.sku,
    variant_suffix: suffix,
    displaySku,
    product,
    variant: variant || undefined,
    hint: variant?.description || product.description || product.category || undefined,
    price: getCatalogUnitPrice(product, variant),
  };
}

function makeManualOption(): SkuPickerOption {
  return {
    key: 'manual',
    sku: 'MANUAL',
    variant_suffix: null,
    displaySku: 'MANUAL',
    hint: 'Χειροκίνητη γραμμή χωρίς προϊόν ERP',
    manual: true,
  };
}

function productMatchesTerm(product: Product, term: string): boolean {
  const master = product.sku.toUpperCase();
  const description = `${product.description || ''} ${product.category || ''}`.toUpperCase();
  if (master.startsWith(term) || term.startsWith(master) || master.includes(term) || description.includes(term)) {
    return true;
  }
  const numericMatch = term.match(/\d+/);
  const numberTerm = numericMatch && numericMatch[0].length >= 3 ? numericMatch[0] : null;
  if (numberTerm && master.includes(numberTerm)) return true;
  return false;
}

function variantMatchesTerm(product: Product, variant: ProductVariant, term: string): boolean {
  const full = `${product.sku}${variant.suffix || ''}`.toUpperCase();
  return full.startsWith(term) || term.startsWith(full) || full.includes(term);
}

function rankOptions(term: string, options: SkuPickerOption[]): SkuPickerOption[] {
  return [...options].sort((left, right) => {
    if (left.manual !== right.manual) return left.manual ? -1 : 1;
    const leftSku = left.displaySku.toUpperCase();
    const rightSku = right.displaySku.toUpperCase();
    if (leftSku === term) return -1;
    if (rightSku === term) return 1;
    const leftStarts = leftSku.startsWith(term) ? 0 : 1;
    const rightStarts = rightSku.startsWith(term) ? 0 : 1;
    if (leftStarts !== rightStarts) return leftStarts - rightStarts;
    if (leftSku.length !== rightSku.length) return leftSku.length - rightSku.length;
    return leftSku.localeCompare(rightSku);
  });
}

export function searchSkuProductOptions(products: Product[], query: string, allowManual = true, limit = 12): SkuPickerOption[] {
  const term = query.trim().toUpperCase();
  const seen = new Set<string>();
  const options: SkuPickerOption[] = [];

  const push = (option: SkuPickerOption) => {
    if (seen.has(option.key)) return;
    seen.add(option.key);
    options.push(option);
  };

  if (allowManual && (!term || 'MANUAL'.startsWith(term) || term.startsWith('MAN'))) {
    push(makeManualOption());
  }

  const catalogProducts = products.filter((product) => !product.is_component);

  if (!term) {
    for (const product of catalogProducts.slice(0, Math.max(limit, 1))) {
      if (product.variants?.length) {
        for (const variant of product.variants) push(makeCatalogOption(product, variant));
      } else {
        push(makeCatalogOption(product, null));
      }
      if (options.length >= limit) break;
    }
    return options.slice(0, limit);
  }

  const exact = findProductByScannedCode(term, catalogProducts);
  if (exact?.product) {
    push(makeCatalogOption(exact.product, exact.variant));
  }

  for (const product of catalogProducts) {
    const variants = product.variants || [];
    const masterMatches = productMatchesTerm(product, term);
    const matchingVariants = variants.filter((variant) => variantMatchesTerm(product, variant, term));

    if (matchingVariants.length) {
      matchingVariants.forEach((variant) => push(makeCatalogOption(product, variant)));
      continue;
    }

    if (!masterMatches) continue;

    if (variants.length) {
      variants.forEach((variant) => {
        const full = `${product.sku}${variant.suffix || ''}`.toUpperCase();
        if (full.startsWith(term) || term.startsWith(product.sku.toUpperCase())) {
          push(makeCatalogOption(product, variant));
        }
      });
    } else {
      push(makeCatalogOption(product, null));
    }
  }

  return rankOptions(term, options).slice(0, limit);
}

export function getSkuAutocompleteValue(term: string, options: SkuPickerOption[], products: Product[]): string | null {
  const normalized = term.trim().toUpperCase();
  if (!normalized) return null;

  const exact = findProductByScannedCode(normalized, products);
  if (exact?.product) {
    return exact.product.sku + (exact.variant?.suffix || '');
  }

  const highlighted = options.find((option) => {
    const display = option.displaySku.toUpperCase();
    return display.startsWith(normalized) && display.length > normalized.length;
  });
  if (highlighted) return highlighted.displaySku;

  return null;
}

export function selectionFromOption(option: SkuPickerOption): SkuProductSelection {
  if (option.manual) {
    return { sku: 'MANUAL', variant_suffix: null, displaySku: 'MANUAL', manual: true };
  }
  return {
    sku: option.sku,
    variant_suffix: option.variant_suffix,
    displaySku: option.displaySku,
  };
}

export function resolveTypedSkuSelection(
  typed: string,
  products: Product[],
): SkuProductSelection | null {
  const normalized = typed.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === 'MANUAL') {
    return { sku: 'MANUAL', variant_suffix: null, displaySku: 'MANUAL', manual: true };
  }

  const exact = findProductByScannedCode(normalized, products.filter((product) => !product.is_component));
  if (exact?.product) {
    return {
      sku: exact.product.sku,
      variant_suffix: exact.variant?.suffix || null,
      displaySku: exact.product.sku + (exact.variant?.suffix || ''),
    };
  }

  return {
    sku: normalized,
    variant_suffix: null,
    displaySku: normalized,
  };
}
