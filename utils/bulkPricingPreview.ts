import { GlobalSettings, Material, Product } from '../types';
import {
  calculateProductCost,
  estimateVariantCost,
  getIliosSuggestedPriceForProduct,
  roundPrice,
} from './pricingEngine';

export type PricingMode = 'cost' | 'selling';
export type MarkupMode = 'adjust' | 'target' | 'formula';
export type PricingListFilter = 'all' | 'changes' | 'manual' | 'unchanged';
export type PricingItemStatus = 'will_update' | 'manual_protected' | 'unchanged';
export type PricingSortBy = 'sku' | 'diff_desc' | 'margin_asc';

export interface BulkPricingItem {
  id: string;
  sku: string;
  masterSku: string;
  variantSuffix: string | null;
  name: string;
  category: string;
  currentPrice: number;
  newPrice: number;
  suggestedPrice?: number;
  costBasis: number;
  isVariant: boolean;
  hasChange: boolean;
  isManualPrice: boolean;
  status: PricingItemStatus;
}

const PRICE_TOLERANCE = 0.01;

export function pricesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= PRICE_TOLERANCE;
}

export function isSellingPriceManual(
  product: Product,
  variantSuffix: string | null,
  isVariantRow: boolean,
): boolean {
  if (isVariantRow && variantSuffix !== null) {
    const variant = product.variants?.find((v) => v.suffix === variantSuffix);
    return !!variant?.selling_price_manual_override;
  }
  return !!product.selling_price_manual_override;
}

export function resolveSellingPriceManualOverride(
  newPrice: number,
  suggestedPrice: number,
  usedFormulaFill: boolean,
): boolean {
  if (usedFormulaFill) return false;
  return !pricesMatch(newPrice, suggestedPrice);
}

export function buildBulkPricingPreview(
  products: Product[],
  settings: GlobalSettings,
  materials: Material[],
  options: {
    mode: PricingMode;
    markupMode: MarkupMode;
    markupPercent: number;
  },
): BulkPricingItem[] {
  const items = products.flatMap((product) => {
    const productItems: BulkPricingItem[] = [];

    const processItem = (
      variantSuffix: string | null,
      currentVal: number,
      name: string,
      isVariantRow: boolean,
    ): BulkPricingItem => {
      const costCalc =
        isVariantRow && variantSuffix !== null
          ? estimateVariantCost(product, variantSuffix, settings, materials, products)
          : calculateProductCost(product, settings, materials, products);

      const freshCost = costCalc.total;
      const suggestedPrice =
        options.mode === 'selling'
          ? getIliosSuggestedPriceForProduct(product, variantSuffix, settings, materials, products)
          : undefined;

      const isManualPrice =
        options.mode === 'selling' &&
        isSellingPriceManual(product, variantSuffix, isVariantRow);

      let newVal = 0;

      if (options.mode === 'cost') {
        newVal = freshCost;
      } else if (isManualPrice) {
        newVal = currentVal;
      } else {
        if (options.markupMode === 'adjust') {
          newVal = roundPrice(currentVal * (1 + options.markupPercent / 100));
        } else if (options.markupMode === 'target') {
          const margin = options.markupPercent / 100;
          newVal = margin >= 1 ? 0 : roundPrice(freshCost / (1 - margin));
        } else if (options.markupMode === 'formula') {
          newVal = suggestedPrice ?? currentVal;
        }
      }

      const hasChange = !isManualPrice && !pricesMatch(newVal, currentVal);
      const status: PricingItemStatus = isManualPrice
        ? 'manual_protected'
        : hasChange
          ? 'will_update'
          : 'unchanged';

      return {
        id: variantSuffix !== null ? `${product.sku}-${variantSuffix}` : product.sku,
        sku: variantSuffix !== null ? `${product.sku}${variantSuffix}` : product.sku,
        masterSku: product.sku,
        variantSuffix,
        name,
        category: product.category,
        currentPrice: currentVal,
        newPrice: newVal,
        suggestedPrice,
        costBasis: freshCost,
        isVariant: isVariantRow,
        hasChange,
        isManualPrice,
        status,
      };
    };

    if (product.variants && product.variants.length > 0) {
      product.variants.forEach((v) => {
        productItems.push(
          processItem(
            v.suffix,
            options.mode === 'cost' ? (v.active_price || 0) : (v.selling_price || 0),
            v.description || product.category,
            true,
          ),
        );
      });
    } else {
      productItems.push(
        processItem(
          null,
          options.mode === 'cost' ? (product.active_price || 0) : (product.selling_price || 0),
          product.category,
          false,
        ),
      );
    }

    return productItems;
  });

  return items.sort((a, b) => {
    if (a.hasChange !== b.hasChange) return a.hasChange ? -1 : 1;
    return a.sku.localeCompare(b.sku, undefined, { numeric: true });
  });
}

export function flattenInventoryForPricing(
  products: Product[],
  mode: PricingMode,
): BulkPricingItem[] {
  return products
    .flatMap((p) => {
      if (p.variants && p.variants.length > 0) {
        return p.variants.map((v) => ({
          id: `${p.sku}-${v.suffix}`,
          sku: `${p.sku}${v.suffix}`,
          masterSku: p.sku,
          variantSuffix: v.suffix,
          name: v.description || p.category,
          category: p.category,
          currentPrice: mode === 'cost' ? (v.active_price || 0) : (v.selling_price || 0),
          newPrice: mode === 'cost' ? (v.active_price || 0) : (v.selling_price || 0),
          suggestedPrice: undefined,
          costBasis: v.active_price || 0,
          isVariant: true,
          hasChange: false,
          isManualPrice: mode === 'selling' && !!v.selling_price_manual_override,
          status: 'unchanged' as PricingItemStatus,
        }));
      }

      return [
        {
          id: p.sku,
          sku: p.sku,
          masterSku: p.sku,
          variantSuffix: null,
          name: p.category,
          category: p.category,
          currentPrice: mode === 'cost' ? (p.active_price || 0) : (p.selling_price || 0),
          newPrice: mode === 'cost' ? (p.active_price || 0) : (p.selling_price || 0),
          suggestedPrice: undefined,
          costBasis: p.active_price || 0,
          isVariant: false,
          hasChange: false,
          isManualPrice: mode === 'selling' && !!p.selling_price_manual_override,
          status: 'unchanged' as PricingItemStatus,
        },
      ];
    })
    .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
}

export function countManualSellingPrices(products: Product[]): number {
  let count = 0;
  products.forEach((product) => {
    if (product.variants && product.variants.length > 0) {
      product.variants.forEach((variant) => {
        if (variant.selling_price_manual_override) count += 1;
      });
    } else if (product.selling_price_manual_override) {
      count += 1;
    }
  });
  return count;
}

export interface LegacyManualPriceCandidate {
  masterSku: string;
  variantSuffix: string | null;
  isVariant: boolean;
  currentPrice: number;
  suggestedPrice: number;
}

export function detectLegacyManualPriceCandidates(
  products: Product[],
  settings: GlobalSettings,
  materials: Material[],
): LegacyManualPriceCandidate[] {
  const candidates: LegacyManualPriceCandidate[] = [];

  products.forEach((product) => {
    const processRow = (
      variantSuffix: string | null,
      currentPrice: number,
      isVariant: boolean,
      manualOverride: boolean,
    ) => {
      if (manualOverride || currentPrice <= 0) return;
      const suggestedPrice = getIliosSuggestedPriceForProduct(
        product,
        variantSuffix,
        settings,
        materials,
        products,
      );
      if (!pricesMatch(currentPrice, suggestedPrice)) {
        candidates.push({
          masterSku: product.sku,
          variantSuffix,
          isVariant,
          currentPrice,
          suggestedPrice,
        });
      }
    };

    if (product.variants && product.variants.length > 0) {
      product.variants.forEach((variant) => {
        processRow(
          variant.suffix,
          variant.selling_price || 0,
          true,
          !!variant.selling_price_manual_override,
        );
      });
    } else {
      processRow(null, product.selling_price || 0, false, !!product.selling_price_manual_override);
    }
  });

  return candidates;
}

export function pricingItemMatchesSearch(item: BulkPricingItem, normalizedTerm: string): boolean {
  if (!normalizedTerm) return true;
  const haystack = [item.sku, item.name, item.category].join(' ').toLocaleLowerCase('el');
  return haystack.includes(normalizedTerm);
}

export function filterPricingList(
  items: BulkPricingItem[],
  filter: PricingListFilter,
  searchTerm: string,
): BulkPricingItem[] {
  const normalizedTerm = searchTerm.trim().toLocaleLowerCase('el');

  return items.filter((item) => {
    if (!pricingItemMatchesSearch(item, normalizedTerm)) return false;
    if (filter === 'all') return true;
    if (filter === 'changes') return item.status === 'will_update';
    if (filter === 'manual') return item.status === 'manual_protected';
    if (filter === 'unchanged') return item.status === 'unchanged';
    return true;
  });
}

export function getPricingItemMargin(item: BulkPricingItem): number {
  if (item.newPrice <= 0) return 0;
  return ((item.newPrice - item.costBasis) / item.newPrice) * 100;
}

export function sortPricingList(
  items: BulkPricingItem[],
  sortBy: PricingSortBy,
): BulkPricingItem[] {
  const sorted = [...items];

  if (sortBy === 'sku') {
    sorted.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
  } else if (sortBy === 'diff_desc') {
    sorted.sort((a, b) => {
      const diffA = Math.abs(a.newPrice - a.currentPrice);
      const diffB = Math.abs(b.newPrice - b.currentPrice);
      return diffB - diffA;
    });
  } else if (sortBy === 'margin_asc') {
    sorted.sort((a, b) => getPricingItemMargin(a) - getPricingItemMargin(b));
  }

  return sorted;
}

export function getCommitCandidates(
  items: BulkPricingItem[],
  options: {
    mode: PricingMode;
    markupMode: MarkupMode;
    forceApplyFormula: boolean;
    includeManualPrices: boolean;
  },
): BulkPricingItem[] {
  if (options.mode === 'cost') {
    return items.filter((item) => item.hasChange);
  }

  const forceApply =
    options.markupMode === 'formula' && options.forceApplyFormula;

  return items.filter((item) => {
    if (item.isManualPrice && !options.includeManualPrices) return false;
    if (forceApply) return true;
    return item.hasChange;
  });
}

export function summarizePricingPreview(items: BulkPricingItem[]) {
  return {
    total: items.length,
    willUpdate: items.filter((item) => item.status === 'will_update').length,
    manualProtected: items.filter((item) => item.status === 'manual_protected').length,
    unchanged: items.filter((item) => item.status === 'unchanged').length,
  };
}
