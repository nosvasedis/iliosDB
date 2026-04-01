import {
  Gender,
  LaborCost,
  Material,
  Mold,
  PlatingType,
  Product,
  ProductMold,
  ProductVariant,
  ProductionType,
  RecipeItem,
} from '../../types';
import {
  analyzeSuffix,
  calculateProductCost,
  calculateSuggestedWholesalePrice,
  estimateVariantCost,
  getVariantComponents,
} from '../../utils/pricingEngine';
import { FINISH_CODES } from '../../constants';

export interface BuildCurrentTempProductInput {
  sku: string;
  detectedMasterSku: string;
  category: string;
  gender: Gender | '';
  imagePreview: string;
  weight: number;
  secondaryWeight: number;
  plating: PlatingType;
  productionType: ProductionType;
  supplierId: string;
  supplierSku: string;
  supplierCost: number;
  sellingPrice: number;
  selectedMolds: ProductMold[];
  isSTX: boolean;
  stxDescription: string;
  recipe: RecipeItem[];
  labor: LaborCost;
}

export function createDefaultLaborCost(): LaborCost {
  return {
    casting_cost: 0,
    setter_cost: 0,
    technician_cost: 0,
    stone_setting_cost: 0,
    plating_cost_x: 0,
    plating_cost_d: 0,
    subcontract_cost: 0,
    casting_cost_manual_override: false,
    technician_cost_manual_override: false,
    plating_cost_x_manual_override: false,
    plating_cost_d_manual_override: false,
  };
}

export function buildCurrentTempProduct(input: BuildCurrentTempProductInput): Product {
  return {
    sku: input.detectedMasterSku || input.sku,
    prefix: input.sku.substring(0, 2),
    category: input.category,
    gender: input.gender || Gender.Unisex,
    image_url: input.imagePreview,
    weight_g: input.weight,
    secondary_weight_g: input.secondaryWeight,
    plating_type: input.plating,
    production_type: input.productionType,
    supplier_id: input.supplierId,
    supplier_sku: input.supplierSku,
    supplier_cost: input.supplierCost,
    active_price: 0,
    draft_price: 0,
    selling_price: input.sellingPrice,
    stock_qty: 0,
    sample_qty: 0,
    molds: input.selectedMolds,
    is_component: input.isSTX,
    description: input.stxDescription,
    recipe: input.recipe,
    labor: input.labor,
  };
}

export function getSecondaryWeightLabel(gender: Gender | '', category: string): string {
  if (gender === Gender.Men && category.includes('Δαχτυλίδι')) return 'Βάρος Καπακιού (g)';
  if (
    gender === Gender.Women &&
    (category.includes('Βραχιόλι') ||
      category.includes('Σκουλαρίκια') ||
      category.includes('Δαχτυλίδι') ||
      category.includes('Μενταγιόν'))
  ) {
    return 'Βάρος Καστονιού (g)';
  }
  return "Β' Βάρος (π.χ. Καστόνι) (g)";
}

export function getVariantTypeInfo(suffix: string, gender: Gender) {
  const { finish, stone } = getVariantComponents(suffix, gender);
  const finishColors: Record<string, string> = {
    X: 'bg-amber-100 text-amber-700 border-amber-200',
    H: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    D: 'bg-orange-100 text-orange-700 border-orange-200',
    P: 'bg-slate-100 text-slate-700 border-slate-200',
    '': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };

  return { finish, stone, color: finishColors[finish.code] || 'bg-slate-100 text-slate-700 border-slate-200' };
}

export function getMoldSuggestions(molds: Mold[], selectedMolds: ProductMold[], sku: string, moldSearch: string) {
  const upperSku = sku.toUpperCase();
  const usedMoldCodes = new Set(selectedMolds.map((mold) => mold.code));
  const availableMolds = molds.filter((mold) => !usedMoldCodes.has(mold.code));

  let suggestionKeyword: string | null = null;
  if (upperSku.startsWith('PN') || upperSku.startsWith('MN')) suggestionKeyword = 'κρίκος';
  else if (upperSku.startsWith('SK')) suggestionKeyword = 'καβαλάρης';

  const filteredMolds = availableMolds.filter(
    (mold) =>
      mold.code.toUpperCase().includes(moldSearch.toUpperCase()) ||
      mold.description.toLowerCase().includes(moldSearch.toLowerCase())
  );

  const suggested: Mold[] = [];
  const others: Mold[] = [];

  if (suggestionKeyword) {
    filteredMolds.forEach((mold) => {
      if (mold.description.toLowerCase().includes(suggestionKeyword!)) suggested.push(mold);
      else others.push(mold);
    });
  } else {
    others.push(...filteredMolds);
  }

  const sortFn = (a: Mold, b: Mold) => a.code.localeCompare(b.code, undefined, { numeric: true });
  suggested.sort(sortFn);
  others.sort(sortFn);

  return { suggestedMolds: suggested, otherMolds: others };
}

export function calculateIliosVariantPrice(
  suffix: string,
  currentTempProduct: Product,
  settings: any,
  materials: Material[],
  products: Product[],
  weight: number,
  secondaryWeight: number,
): number {
  const est = estimateVariantCost(currentTempProduct, suffix, settings, materials, products);
  const silverCost = est.breakdown.silver;
  const laborCost = est.breakdown.labor;
  const materialCost = est.breakdown.materials;
  const totalWeight = est.breakdown.details?.total_weight || (weight + secondaryWeight);

  return calculateSuggestedWholesalePrice(totalWeight, silverCost, laborCost, materialCost);
}

export function calculateIliosMasterPrice(
  currentTempProduct: Product,
  settings: any,
  materials: Material[],
  products: Product[],
  weight: number,
  secondaryWeight: number,
  costBreakdown: any,
): number {
  const est = calculateProductCost(currentTempProduct, settings, materials, products);
  const silverCost = costBreakdown?.silver ?? est.breakdown.silver ?? 0;
  const laborCost = costBreakdown?.labor ?? est.breakdown.labor ?? 0;
  const materialCost = costBreakdown?.materials ?? est.breakdown.materials ?? 0;
  return calculateSuggestedWholesalePrice(weight + secondaryWeight, silverCost, laborCost, materialCost);
}

export const buildIliosMasterPrice = calculateIliosMasterPrice;

export function buildIliosPricedVariants(
  inputVariants: ProductVariant[],
  currentTempProduct: Product,
  settings: any,
  materials: Material[],
  products: Product[],
  weight: number,
  secondaryWeight: number,
): ProductVariant[] {
  return inputVariants.map((variant) => ({
    ...variant,
    selling_price: calculateIliosVariantPrice(
      variant.suffix,
      currentTempProduct,
      settings,
      materials,
      products,
      weight,
      secondaryWeight,
    ),
  }));
}

export function buildNewProductVariantTypeInfo(suffix: string, gender: Gender) {
  return getVariantTypeInfo(suffix, gender);
}

export function createVariantDescription(suffix: string, gender: Gender, plating: PlatingType): string {
  return analyzeSuffix(suffix, gender, plating) || suffix;
}

export function getVariantFinishLabel(selectedFinishes: string[], plating: PlatingType): string {
  if (selectedFinishes.length > 0) {
    return selectedFinishes.map((finish) => (finish ? FINISH_CODES[finish] : 'Λουστρέ')).join(', ');
  }

  const platingToCode: Record<string, string> = {
    [PlatingType.None]: '',
    [PlatingType.GoldPlated]: 'X',
    [PlatingType.TwoTone]: 'D',
    [PlatingType.Platinum]: 'H',
  };
  const code = platingToCode[plating];
  return FINISH_CODES[code] || 'Λουστρέ';
}
