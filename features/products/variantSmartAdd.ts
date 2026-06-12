import { Gender, PlatingType, Product, ProductVariant } from '../../types';
import { STONE_CODES_MEN, STONE_CODES_WOMEN } from '../../constants';
import { analyzeSuffix, estimateVariantCost } from '../../utils/pricingEngine';

export interface StoneCatalogEntry {
  code: string;
  name: string;
}

const FINISH_SORT_PRIORITY: Record<string, number> = {
  '': 0,
  P: 1,
  D: 2,
  X: 3,
  H: 4,
};

export function getStoneCatalogForGender(gender?: Gender): StoneCatalogEntry[] {
  let codes: Record<string, string>;
  if (gender === Gender.Men) codes = STONE_CODES_MEN;
  else if (gender === Gender.Women) codes = STONE_CODES_WOMEN;
  else codes = { ...STONE_CODES_MEN, ...STONE_CODES_WOMEN };

  return Object.entries(codes)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'el'));
}

export function platingTypeToFinishCode(plating: PlatingType): string {
  const map: Record<string, string> = {
    [PlatingType.GoldPlated]: 'X',
    [PlatingType.Platinum]: 'H',
    [PlatingType.TwoTone]: 'D',
    [PlatingType.None]: '',
  };
  return map[plating] || '';
}

export function buildVariantSuffixFromFinishAndStone(
  finishCode: string,
  stoneSuffix: string,
  platingType: PlatingType,
): string {
  const masterPlatingCode = platingTypeToFinishCode(platingType);
  const upperStone = stoneSuffix.trim().toUpperCase();
  let fullSuffix = '';
  if (!masterPlatingCode && finishCode !== '') fullSuffix += finishCode;
  fullSuffix += upperStone;
  return fullSuffix;
}

export function sortFinishCodes(finishCodes: string[]): string[] {
  return [...finishCodes].sort(
    (a, b) => (FINISH_SORT_PRIORITY[a] ?? 9) - (FINISH_SORT_PRIORITY[b] ?? 9),
  );
}

export function buildSmartAddSuffixPlan(
  selectedFinishes: string[],
  stoneSuffix: string,
  platingType: PlatingType,
  existingSuffixes: Set<string>,
): { suffix: string; skippedIncompatible: boolean; skippedDuplicate: boolean }[] {
  const masterPlatingCode = platingTypeToFinishCode(platingType);
  const sortedFinishes = sortFinishCodes(selectedFinishes);

  return sortedFinishes.map((finishCode) => {
    if (masterPlatingCode && masterPlatingCode !== '' && finishCode !== masterPlatingCode) {
      return { suffix: '', skippedIncompatible: true, skippedDuplicate: false };
    }

    const suffix = buildVariantSuffixFromFinishAndStone(finishCode, stoneSuffix, platingType);
    if (suffix === '' && existingSuffixes.has('')) {
      return { suffix, skippedIncompatible: false, skippedDuplicate: true };
    }
    if (existingSuffixes.has(suffix)) {
      return { suffix, skippedIncompatible: false, skippedDuplicate: true };
    }

    return { suffix, skippedIncompatible: false, skippedDuplicate: false };
  });
}

export function createVariantsFromSmartAdd(params: {
  product: Product;
  selectedFinishes: string[];
  stoneSuffix: string;
  descriptionOverride?: string;
  settings: any;
  allMaterials: any[];
  allProducts: Product[];
  existingSuffixes: string[];
}): { variants: ProductVariant[]; addedCount: number; skippedIncompatible: number; skippedDuplicate: number } {
  const existing = new Set(params.existingSuffixes);
  const plan = buildSmartAddSuffixPlan(
    params.selectedFinishes,
    params.stoneSuffix,
    params.product.plating_type,
    existing,
  );

  const variants: ProductVariant[] = [];
  let skippedIncompatible = 0;
  let skippedDuplicate = 0;
  const toAdd = plan.filter((entry) => !entry.skippedIncompatible && !entry.skippedDuplicate);

  plan.forEach((entry) => {
    if (entry.skippedIncompatible) {
      skippedIncompatible++;
      return;
    }
    if (entry.skippedDuplicate) {
      skippedDuplicate++;
      return;
    }

    const { total: estimatedCost } = estimateVariantCost(
      params.product,
      entry.suffix,
      params.settings,
      params.allMaterials,
      params.allProducts,
    );

    const autoDescription =
      analyzeSuffix(entry.suffix, params.product.gender, params.product.plating_type) ||
      entry.suffix ||
      'Λουστρέ';

    variants.push({
      suffix: entry.suffix,
      description:
        toAdd.length === 1 && params.descriptionOverride?.trim()
          ? params.descriptionOverride.trim()
          : autoDescription,
      stock_qty: 0,
      active_price: estimatedCost,
      selling_price: params.product.is_component ? 0 : params.product.selling_price,
    });
    existing.add(entry.suffix);
  });

  return { variants, addedCount: variants.length, skippedIncompatible, skippedDuplicate };
}
