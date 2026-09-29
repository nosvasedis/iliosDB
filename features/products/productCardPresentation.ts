import { Product, ProductionType } from '../../types';
import type { InvoiceTotalWeightResult } from '../../utils/invoiceTotalWeight';

export const SKIP_CASTING_LABEL = 'Χωρίς χύτευση';

export const PRODUCTION_TYPE_LABELS: Record<ProductionType, string> = {
  [ProductionType.InHouse]: 'Ιδιοπαραγωγή',
  [ProductionType.Imported]: 'Εισαγωγή',
};

export function formatRegistryWeight(value: number): string {
  return value.toLocaleString('el-GR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function roundRegistryWeight(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatRecipeItemCountLabel(count: number): string {
  return count === 1 ? '1 υλικό' : `${count} υλικά`;
}

export function shouldShowCardInvoiceTotal(
  recipeItemCount: number,
  metalTotal: number,
  invoice: InvoiceTotalWeightResult,
): boolean {
  if (invoice.value === null) return recipeItemCount > 1;
  return roundRegistryWeight(invoice.value) !== roundRegistryWeight(metalTotal);
}

export function canConvertToImported(product: Pick<Product, 'production_type' | 'is_component'>): boolean {
  return product.production_type === ProductionType.InHouse && !product.is_component;
}

export function getRecipeStxWeight(
  product: Pick<Product, 'recipe'>,
  productsBySku: Map<string, Product>,
): number {
  return (product.recipe || []).reduce((acc, item) => {
    if (item.type !== 'component') return acc;
    const component = productsBySku.get(item.sku);
    if (!component) return acc;
    const componentWeight = component.weight_g + (component.secondary_weight_g || 0);
    return acc + componentWeight * item.quantity;
  }, 0);
}

export type ProductCardWeightPrimaryMode = 'skip_casting' | 'simple' | 'breakdown';

export interface ProductCardWeightPresentation {
  skipCasting: boolean;
  skipCastingLabel: string | null;
  showCastingWeight: boolean;
  hasWeightBreakdown: boolean;
  primaryMode: ProductCardWeightPrimaryMode;
  baseWeight: number;
  secondaryWeight: number;
  stxWeight: number;
  inHouseWeight: number;
  totalWeight: number;
  recipeItemCount: number;
  recipeItemCountLabel: string;
}

export function buildProductCardWeightPresentation(
  product: Product,
  productsBySku: Map<string, Product>,
): ProductCardWeightPresentation {
  const skipCasting = !!product.skip_casting;
  const secondaryWeight = product.secondary_weight_g || 0;
  const stxWeight = getRecipeStxWeight(product, productsBySku);
  const inHouseWeight = product.weight_g + secondaryWeight;
  const totalWeight = inHouseWeight + stxWeight;
  const hasWeightBreakdown = secondaryWeight > 0 || stxWeight > 0;
  const primaryMode: ProductCardWeightPrimaryMode = skipCasting
    ? 'skip_casting'
    : hasWeightBreakdown
      ? 'breakdown'
      : 'simple';
  const recipeItemCount = (product.recipe || []).length + 1;

  return {
    skipCasting,
    skipCastingLabel: skipCasting ? SKIP_CASTING_LABEL : null,
    showCastingWeight: !skipCasting,
    hasWeightBreakdown,
    primaryMode,
    baseWeight: product.weight_g,
    secondaryWeight,
    stxWeight,
    inHouseWeight,
    totalWeight,
    recipeItemCount,
    recipeItemCountLabel: formatRecipeItemCountLabel(recipeItemCount),
  };
}
