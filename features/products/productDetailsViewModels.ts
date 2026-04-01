import { Gender, LaborCost, Mold, PlatingType, Product, ProductVariant, ProductionType } from '../../types';
import { calculateProductCost, estimateVariantCost, getIliosSuggestedPriceForProduct, getVariantComponents } from '../../utils/pricingEngine';
import { FINISH_CODES } from '../../constants';
import { createDefaultLaborCost, getSecondaryWeightLabel as getSharedSecondaryWeightLabel } from './newProductHelpers';

export function buildEditableProduct(product: Product): Product {
  const initialLabor: Partial<LaborCost> = product.labor || {};
  return {
    ...product,
    variants: product.variants || [],
    selling_price: product.selling_price || 0,
    molds: product.molds || [],
    collections: product.collections || [],
    secondary_weight_g: product.secondary_weight_g || 0,
    production_type: product.production_type || ProductionType.InHouse,
    supplier_id: product.supplier_id,
    supplier_sku: product.supplier_sku,
    supplier_cost: product.supplier_cost || 0,
    description: product.description || '',
    labor: {
      ...createDefaultLaborCost(),
      ...initialLabor,
    },
  };
}

export function getSortedProductVariants(product: Product, variants: ProductVariant[]) {
  return [...variants].sort((a, b) => {
    const getPriority = (suffix: string) => {
      const { finish } = getVariantComponents(suffix, product.gender);
      switch (finish.code) {
        case '':
          return 1;
        case 'P':
          return 2;
        case 'D':
          return 3;
        case 'X':
          return 4;
        case 'H':
          return 5;
        default:
          return 6;
      }
    };

    const priorityA = getPriority(a.suffix);
    const priorityB = getPriority(b.suffix);
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return a.suffix.localeCompare(b.suffix);
  });
}

export function getProductDisplaySummary(product: Product, variants: ProductVariant[]) {
  if (variants.length === 0) {
    return {
      displayPlating: PLATING_LABELS[product.plating_type] || product.plating_type,
      displayStones: '',
    };
  }

  const finishCodes = new Set<string>();
  const stones = new Set<string>();

  variants.forEach((variant) => {
    const { finish, stone } = getVariantComponents(variant.suffix, product.gender);
    if (finish.code) finishCodes.add(finish.code);
    else if (variant.suffix === '') finishCodes.add('');

    if (stone.name) stones.add(stone.name);
  });

  if (finishCodes.size === 0 && product.plating_type) {
    return {
      displayPlating: PLATING_LABELS[product.plating_type] || product.plating_type,
      displayStones: Array.from(stones).join(', '),
    };
  }

  const getPriority = (code: string) => {
    switch (code) {
      case '':
        return 0;
      case 'P':
        return 1;
      case 'D':
        return 2;
      case 'X':
        return 3;
      case 'H':
        return 4;
      default:
        return 5;
    }
  };

  const sortedFinishNames = Array.from(finishCodes)
    .sort((a, b) => getPriority(a) - getPriority(b))
    .map((code) => FINISH_CODES[code] || FINISH_CODES['']);

  return {
    displayPlating: sortedFinishNames.join(', '),
    displayStones: Array.from(stones).join(', '),
  };
}

export function buildVariantFinishGroups(product: Product, variants: ProductVariant[]) {
  const groups: Record<string, ProductVariant[]> = {};
  variants.forEach((variant) => {
    const { finish } = getVariantComponents(variant.suffix, product.gender);
    const code = finish.code || '';
    if (!groups[code]) groups[code] = [];
    groups[code].push(variant);
  });
  return groups;
}

export function getSortedFinishCodes(finishGroups: Record<string, ProductVariant[]>) {
  return Object.keys(finishGroups).sort((a, b) => {
    const order = { '': 1, P: 2, D: 3, X: 4, H: 5 } as const;
    return (order[a as keyof typeof order] || 9) - (order[b as keyof typeof order] || 9);
  });
}

export function getSmartVariantPreview(
  editedProduct: Product,
  smartAddSuffix: string,
  settings: any,
  allMaterials: any[],
  allProducts: Product[],
) {
  if (!smartAddSuffix) return null;
  const clean = smartAddSuffix.trim().toUpperCase();
  const { finish, stone } = getVariantComponents(clean, editedProduct.gender);

  let description = '';
  if (['X', 'H', 'D', 'P'].includes(finish.code)) description = finish.name;
  else description = 'Λουστρέ';

  if (stone.name) description += ` - ${stone.name}`;

  const est = estimateVariantCost(editedProduct, clean, settings, allMaterials, allProducts);
  const currentCostCalc = calculateProductCost(editedProduct, settings, allMaterials, allProducts);
  const masterCost = currentCostCalc.total;

  return {
    description,
    cost: est.total,
    diff: est.total - masterCost,
    breakdown: est.breakdown,
  };
}

export function getAvailableMolds(allMolds: Mold[], selectedMolds: Array<{ code: string }>, moldSearch: string) {
  const usedCodes = new Set(selectedMolds.map((mold) => mold.code));
  return allMolds
    .filter((mold) => !usedCodes.has(mold.code))
    .filter((mold) =>
      mold.code.includes(moldSearch.toUpperCase()) ||
      mold.description.toLowerCase().includes(moldSearch.toLowerCase())
    )
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

export function getSecondaryWeightLabel(gender: Gender, category: string) {
  return getSharedSecondaryWeightLabel(gender, category);
}

export function getAnalyticalCostingItems(
  hasVariants: boolean,
  sortedVariantsList: ProductVariant[],
  productSku: string,
  editedProduct: Product,
  settings: any,
  allMaterials: any[],
  allProducts: Product[],
  currentCostCalc: any,
) {
  if (hasVariants) {
    return sortedVariantsList.map((variant) => ({
      key: variant.suffix,
      title: `${productSku}${variant.suffix} (${variant.description})`,
      costResult: estimateVariantCost(editedProduct, variant.suffix, settings, allMaterials, allProducts),
    }));
  }

  return [{
    key: 'master-lustre',
    title: `${productSku} (Λουστρέ)`,
    costResult: currentCostCalc,
  }];
}

export const PLATING_LABELS: Record<string, string> = {
  [PlatingType.None]: 'Λουστρέ',
  [PlatingType.GoldPlated]: 'Επίχρυσο',
  [PlatingType.TwoTone]: 'Δίχρωμο',
  [PlatingType.Platinum]: 'Πλατίνα',
};
