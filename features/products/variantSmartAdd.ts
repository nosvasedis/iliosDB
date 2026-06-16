import { Gender, Product, ProductVariant } from '../../types';
import { STONE_CODES_MEN, STONE_CODES_WOMEN } from '../../constants';
import { analyzeSuffix, estimateVariantCost, getIliosSuggestedPriceForProduct } from '../../utils/pricingEngine';

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

/** Registry/editor: suffix is always finish letter + stone code (X + AZM → XAZM). */
export function buildVariantSuffixFromFinishAndStone(
  finishCode: string,
  stoneSuffix: string,
): string {
  const upperStone = stoneSuffix.trim().toUpperCase();
  if (!finishCode) return upperStone;
  return `${finishCode}${upperStone}`;
}

export function sortFinishCodes(finishCodes: string[]): string[] {
  return [...finishCodes].sort(
    (a, b) => (FINISH_SORT_PRIORITY[a] ?? 9) - (FINISH_SORT_PRIORITY[b] ?? 9),
  );
}

export function buildSmartAddSuffixPlan(
  selectedFinishes: string[],
  stoneSuffix: string,
  existingSuffixes: Set<string>,
): { suffix: string; skippedDuplicate: boolean }[] {
  const sortedFinishes = sortFinishCodes(selectedFinishes);

  return sortedFinishes.map((finishCode) => {
    const suffix = buildVariantSuffixFromFinishAndStone(finishCode, stoneSuffix);
    if (suffix === '' && existingSuffixes.has('')) {
      return { suffix, skippedDuplicate: true };
    }
    if (existingSuffixes.has(suffix)) {
      return { suffix, skippedDuplicate: true };
    }

    return { suffix, skippedDuplicate: false };
  });
}

export function getSmartAddVariantSellingPrice(
  product: Product,
  suffix: string,
  settings: any,
  allMaterials: any[],
  allProducts: Product[],
): number {
  if (product.is_component) return 0;
  return getIliosSuggestedPriceForProduct(
    product,
    suffix,
    settings,
    allMaterials,
    allProducts,
  );
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
}): { variants: ProductVariant[]; addedCount: number; skippedDuplicate: number } {
  const existing = new Set(params.existingSuffixes);
  const plan = buildSmartAddSuffixPlan(
    params.selectedFinishes,
    params.stoneSuffix,
    existing,
  );

  const variants: ProductVariant[] = [];
  let skippedDuplicate = 0;
  const toAdd = plan.filter((entry) => !entry.skippedDuplicate);

  plan.forEach((entry) => {
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
      selling_price: getSmartAddVariantSellingPrice(
        params.product,
        entry.suffix,
        params.settings,
        params.allMaterials,
        params.allProducts,
      ),
      selling_price_manual_override: false,
    });
    existing.add(entry.suffix);
  });

  return { variants, addedCount: variants.length, skippedDuplicate };
}
