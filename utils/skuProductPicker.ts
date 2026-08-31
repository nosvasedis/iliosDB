import { Product, ProductVariant } from '../types';
import { findProductByScannedCode, getVariantComponents, splitSkuComponents } from './pricingEngine';

/** Must sit above customer-service / legal modals (z-[190]) so suggestions stay visible. */
export const SKU_PICKER_DROPDOWN_Z_INDEX = 400;

const METAL_FINISH_CODES = ['P', 'X', 'D', 'H'] as const;

/** True when the variant uses a metal finish (Πατίνα / Επίχρυσο / Δίχρωμο / Πλατίνα). */
export function variantHasMetalFinish(suffix: string, gender?: Product['gender']): boolean {
  const { finish } = getVariantComponents(suffix, gender);
  return METAL_FINISH_CODES.includes(finish.code as typeof METAL_FINISH_CODES[number]);
}

/** Product has only λουστρέ-family variants (no P/X/D/H metal finishes), per Μητρώο Κωδικών. */
export function isLustreOnlyProduct(product: Product): boolean {
  const variants = product.variants || [];
  if (!variants.length) return true;
  return variants.every((variant) => !variantHasMetalFinish(variant.suffix, product.gender));
}

/**
 * Bare master SKU (empty suffix) may be resolved only for:
 * - products without variants,
 * - single λουστρέ variant,
 * - lustre-only catalogs that include an explicit empty-suffix row.
 */
export function allowsBareMasterSkuResolution(product: Product): boolean {
  const variants = product.variants || [];
  if (!variants.length) return true;
  if (variants.length === 1 && variants[0].suffix === '') return true;
  if (!isLustreOnlyProduct(product)) return false;
  return variants.some((variant) => variant.suffix === '');
}

function isBareMasterTerm(term: string, product: Product): boolean {
  return term === product.sku.toUpperCase();
}

function catalogMatchIsAllowed(term: string, product: Product, variant?: ProductVariant | null): boolean {
  const suffix = variant?.suffix ?? '';
  if (isBareMasterTerm(term, product) || suffix === '') {
    return allowsBareMasterSkuResolution(product);
  }
  return true;
}

export interface SkuProductSelection {
  sku: string;
  variant_suffix: string | null;
  displaySku: string;
}

export type SkuCatalogScope = 'products' | 'components' | 'all';

export interface SkuProductPickerOptions {
  scope?: SkuCatalogScope;
}

export interface SkuPickerOption {
  key: string;
  sku: string;
  variant_suffix: string | null;
  displaySku: string;
  hint?: string;
  price?: number;
  product?: Product;
  variant?: ProductVariant;
}

export function formatSkuDisplayValue(sku: string, variantSuffix?: string | null): string {
  const master = !sku || sku === 'MANUAL' ? '' : sku;
  return `${master}${variantSuffix || ''}`;
}

export interface TypedSkuColorParts {
  master: string;
  suffix: string;
  gender?: Product['gender'];
  product?: Product;
}

/**
 * Split the live typed value into master + suffix so the input overlay can
 * color-code finish/stone while the user is still typing.
 */
export function resolveTypedSkuColorParts(
  typed: string,
  products: Product[],
  pickerOptions: SkuProductPickerOptions = {},
): TypedSkuColorParts {
  const term = typed.trim().toUpperCase();
  if (!term) return { master: '', suffix: '' };

  const catalog = getSkuCatalogProducts(products, pickerOptions);
  const exact = findProductByScannedCode(term, catalog);
  if (exact?.product) {
    const master = exact.product.sku;
    const remainder = term.startsWith(master.toUpperCase()) ? term.slice(master.length) : (exact.variant?.suffix || '');
    return {
      master,
      suffix: exact.variant?.suffix || remainder,
      gender: exact.product.gender,
      product: exact.product,
    };
  }

  const prefixMaster = catalog
    .filter((product) => term.startsWith(product.sku.toUpperCase()))
    .sort((left, right) => right.sku.length - left.sku.length)[0];
  if (prefixMaster) {
    return {
      master: prefixMaster.sku,
      suffix: term.slice(prefixMaster.sku.length),
      gender: prefixMaster.gender,
      product: prefixMaster,
    };
  }

  const split = splitSkuComponents(term);
  return { master: split.master, suffix: split.suffix };
}

export function getCatalogUnitPrice(product: Product, variant?: ProductVariant | null): number {
  return Number(variant?.selling_price || product.selling_price || product.active_price || 0);
}

export function getCatalogUnitCost(product: Product, variant?: ProductVariant | null): number {
  const candidates = [variant?.active_price, product.active_price, product.supplier_cost, product.draft_price];
  const positive = candidates.find((value) => Number.isFinite(Number(value)) && Number(value) > 0);
  return Number(positive || 0);
}

export function getSkuCatalogProducts(
  products: Product[],
  options: SkuProductPickerOptions = {},
): Product[] {
  const scope = options.scope || 'products';
  if (scope === 'all') return products;
  if (scope === 'components') return products.filter((product) => product.is_component);
  return products.filter((product) => !product.is_component);
}

export function getCatalogSelectionPricing(
  products: Product[],
  selection: Pick<SkuProductSelection, 'sku' | 'variant_suffix'>,
): { product: Product | null; variant: ProductVariant | null; unitCost: number; unitPrice: number } {
  const product = products.find((entry) => entry.sku === selection.sku) || null;
  const variant = product?.variants?.find(
    (entry) => (entry.suffix || '') === (selection.variant_suffix || ''),
  ) || null;
  return {
    product,
    variant,
    unitCost: product ? getCatalogUnitCost(product, variant) : 0,
    unitPrice: product ? getCatalogUnitPrice(product, variant) : 0,
  };
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

export function searchSkuProductOptions(
  products: Product[],
  query: string,
  limit = 12,
  pickerOptions: SkuProductPickerOptions = {},
): SkuPickerOption[] {
  const term = query.trim().toUpperCase();
  const seen = new Set<string>();
  const options: SkuPickerOption[] = [];

  const push = (option: SkuPickerOption) => {
    if (seen.has(option.key)) return;
    seen.add(option.key);
    options.push(option);
  };

  const catalogProducts = getSkuCatalogProducts(products, pickerOptions);

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
  if (exact?.product && catalogMatchIsAllowed(term, exact.product, exact.variant)) {
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
        if (!full.startsWith(term) && !term.startsWith(product.sku.toUpperCase())) return;
        if (!catalogMatchIsAllowed(full, product, variant) && isBareMasterTerm(term, product)) return;
        if ((variant.suffix || '') === '' && !allowsBareMasterSkuResolution(product) && term === product.sku.toUpperCase()) return;
        push(makeCatalogOption(product, variant));
      });
    } else {
      push(makeCatalogOption(product, null));
    }
  }

  return rankOptions(term, options).slice(0, limit);
}

export function getSkuAutocompleteValue(
  term: string,
  options: SkuPickerOption[],
  products: Product[],
  pickerOptions: SkuProductPickerOptions = {},
): string | null {
  const normalized = term.trim().toUpperCase();
  if (!normalized) return null;

  const exact = findProductByScannedCode(normalized, getSkuCatalogProducts(products, pickerOptions));
  if (exact?.product && catalogMatchIsAllowed(normalized, exact.product, exact.variant)) {
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
  return {
    sku: option.sku,
    variant_suffix: option.variant_suffix,
    displaySku: option.displaySku,
  };
}

export function resolveTypedSkuSelection(
  typed: string,
  products: Product[],
  pickerOptions: SkuProductPickerOptions = {},
): SkuProductSelection | null {
  const normalized = typed.trim().toUpperCase();
  if (!normalized) return null;

  const catalogProducts = getSkuCatalogProducts(products, pickerOptions);
  const exact = findProductByScannedCode(normalized, catalogProducts);
  if (exact?.product && catalogMatchIsAllowed(normalized, exact.product, exact.variant)) {
    return {
      sku: exact.product.sku,
      variant_suffix: exact.variant?.suffix || null,
      displaySku: exact.product.sku + (exact.variant?.suffix || ''),
    };
  }

  const bareMasterProduct = catalogProducts.find((product) => product.sku.toUpperCase() === normalized);
  if (bareMasterProduct && !allowsBareMasterSkuResolution(bareMasterProduct)) {
    return null;
  }

  return {
    sku: normalized,
    variant_suffix: null,
    displaySku: normalized,
  };
}

export function getBareMasterSkuResolutionError(product: Product): string {
  if (isLustreOnlyProduct(product)) {
    return `Ο κωδικός ${product.sku} έχει λουστρέ παραλλαγές με πέτρα — επιλέξτε συγκεκριμένη παραλλαγή.`;
  }
  return `Ο κωδικός ${product.sku} έχει παραλλαγές μετάλλου — επιλέξτε συγκεκριμένη παραλλαγή (π.χ. ${product.sku}P…).`;
}
