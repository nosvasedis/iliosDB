import { LaborCost, Product, RecipeItem } from '../types';

export const DEFAULT_CASTING_RATE = 0.30;
export const DEFAULT_PLATING_RATE = 0.60;
export const STX_TECHNICIAN_RATE = 0.50;

export const TECHNICIAN_TIER_HINT =
  'Κλιμάκωση: ≤2,2g→1,30 · ≤4,2g→0,90 · ≤8,2g→0,70 · >8,2g→0,50 €/g';

/** Tier rate (€/g) for a given weight — mirrors calculateTechnicianCost tiers. */
export function getTechnicianRateForWeight(weight_g: number): number {
  if (weight_g <= 0) return 0;
  if (weight_g <= 2.2) return 1.30;
  if (weight_g <= 4.2) return 0.90;
  if (weight_g <= 8.2) return 0.70;
  return 0.50;
}

/** Total cost from tier table (same as pricingEngine.calculateTechnicianCost). */
export function calculateTechnicianCostFromWeight(weight_g: number): number {
  if (weight_g <= 0) return 0;
  return weight_g * getTechnicianRateForWeight(weight_g);
}

export function getTotalWeight(product: Pick<Product, 'weight_g' | 'secondary_weight_g'>): number {
  return product.weight_g + (product.secondary_weight_g || 0);
}

export function getCastingWeightBasis(product: Pick<Product, 'weight_g' | 'secondary_weight_g'>): number {
  return getTotalWeight(product);
}

export function getPlatingXWeightBasis(
  product: Pick<Product, 'weight_g' | 'recipe'>,
  allProducts: Product[],
): number {
  let totalPlatingWeight = product.weight_g;
  product.recipe.forEach((item) => {
    if (item.type === 'component') {
      const subProduct = allProducts.find((p) => p.sku === item.sku);
      if (subProduct) {
        totalPlatingWeight += subProduct.weight_g * item.quantity;
      }
    }
  });
  return totalPlatingWeight;
}

export function getPlatingDWeightBasis(
  product: Pick<Product, 'secondary_weight_g' | 'recipe'>,
  allProducts: Product[],
): number {
  let totalSecondaryWeight = product.secondary_weight_g || 0;
  product.recipe.forEach((item) => {
    if (item.type === 'component') {
      const subProduct = allProducts.find((p) => p.sku === item.sku);
      if (subProduct) {
        totalSecondaryWeight += (subProduct.secondary_weight_g || 0) * item.quantity;
      }
    }
  });
  return totalSecondaryWeight;
}

export interface VariantTechnicianContext {
  finishCode: string;
}

/**
 * Resolve casting cost for master and variant estimates (single source of truth).
 */
export function resolveCastingCost(
  labor: Partial<LaborCost>,
  product: Pick<Product, 'weight_g' | 'secondary_weight_g' | 'is_component'>,
): number {
  if (labor.casting_cost_manual_override) {
    return labor.casting_cost || 0;
  }
  if (product.is_component) return 0;
  return getCastingWeightBasis(product) * DEFAULT_CASTING_RATE;
}

export function calculateSplitTechnicianCost(
  product: Pick<Product, 'weight_g' | 'secondary_weight_g'>,
): number {
  const totalWeight = getTotalWeight(product);
  const primaryRate = getTechnicianRateForWeight(totalWeight);
  return parseFloat((
    product.weight_g * primaryRate +
    calculateTechnicianCostFromWeight(product.secondary_weight_g || 0)
  ).toFixed(4));
}

export const SPLIT_TECHNICIAN_HINT =
  'Δίχρωμο / D: κύριο βάρος × κλιμάκωση(συνολικού) + δευτερεύον × κλιμάκωση(δευτερεύοντος)';

export const MIXED_TECHNICIAN_VARIANT_HINT =
  '‹ › μεταξύ κανόνων παραλλαγής. Το πεδίο Εργατικά (master) αποθηκεύει την τιμή D.';

export const TECHNICIAN_LUMP_VARIANT_HINT =
  'Ίδιος κανόνας που χρησιμοποιεί το estimateVariantCost για παραλλαγές Λουστρέ / P / X / H.';

export const TECHNICIAN_D_VARIANT_HINT =
  'Ίδιος κανόνας που χρησιμοποιεί το estimateVariantCost για παραλλαγές D.';

export const TECHNICIAN_VARIANT_RULE_BADGE = 'κανόνας παραλλαγής';

export const TECHNICIAN_MASTER_BADGE = 'master';

/**
 * Resolve technician cost — master / product-level (Εργατικά auto-fill & master cost).
 * Uses D split when useSplitTechnician=true (TwoTone master or any D variant).
 */
export function resolveTechnicianCostMaster(
  labor: Partial<LaborCost>,
  product: Pick<Product, 'weight_g' | 'secondary_weight_g' | 'is_component'>,
  useSplitTechnician = false,
): number {
  if (labor.technician_cost_manual_override) {
    return labor.technician_cost || 0;
  }
  if (product.is_component) {
    return product.weight_g * STX_TECHNICIAN_RATE;
  }
  if (useSplitTechnician) {
    return calculateSplitTechnicianCost(product);
  }
  return calculateTechnicianCostFromWeight(getTotalWeight(product));
}

/**
 * Resolve technician cost for variant estimate — preserves D-variant split.
 */
export function resolveTechnicianCostVariant(
  labor: Partial<LaborCost>,
  product: Pick<Product, 'weight_g' | 'secondary_weight_g' | 'is_component'>,
  variantContext: VariantTechnicianContext,
): number {
  if (labor.technician_cost_manual_override) {
    return labor.technician_cost || 0;
  }
  if (product.is_component) {
    return product.weight_g * STX_TECHNICIAN_RATE;
  }
  const totalWeight = getTotalWeight(product);
  if (variantContext.finishCode === 'D') {
    return calculateSplitTechnicianCost(product);
  }
  return calculateTechnicianCostFromWeight(totalWeight);
}

/** Derive displayed rate from stored total when manually overridden. */
export function deriveRateFromTotal(total: number, weightBasis: number, fallbackRate: number): number {
  if (weightBasis > 0 && total > 0) {
    return parseFloat((total / weightBasis).toFixed(4));
  }
  return fallbackRate;
}

export interface LaborFormulaLine {
  rate: number;
  weightBasis: number;
  total: number;
  defaultRate: number;
  isOverridden: boolean;
  usesSplitTechnician?: boolean;
}

export function getCastingFormulaLine(
  labor: LaborCost,
  product: Pick<Product, 'weight_g' | 'secondary_weight_g' | 'is_component'>,
): LaborFormulaLine {
  const weightBasis = getCastingWeightBasis(product);
  const isOverridden = !!labor.casting_cost_manual_override;
  const defaultRate = product.is_component ? 0 : DEFAULT_CASTING_RATE;
  const total = isOverridden
    ? labor.casting_cost || 0
    : weightBasis * defaultRate;
  const rate = isOverridden
    ? deriveRateFromTotal(labor.casting_cost || 0, weightBasis, defaultRate)
    : defaultRate;
  return { rate, weightBasis, total, defaultRate, isOverridden };
}

export function getTechnicianFormulaLine(
  labor: LaborCost,
  product: Pick<Product, 'weight_g' | 'secondary_weight_g' | 'is_component'>,
  useSplitTechnician = false,
): LaborFormulaLine {
  const weightBasis = product.is_component ? product.weight_g : getTotalWeight(product);
  const isOverridden = !!labor.technician_cost_manual_override;
  const defaultRate = product.is_component
    ? STX_TECHNICIAN_RATE
    : getTechnicianRateForWeight(weightBasis);
  const total = isOverridden
    ? labor.technician_cost || 0
    : product.is_component
      ? product.weight_g * STX_TECHNICIAN_RATE
      : useSplitTechnician
        ? calculateSplitTechnicianCost(product)
        : calculateTechnicianCostFromWeight(weightBasis);
  const rate = isOverridden
    ? deriveRateFromTotal(labor.technician_cost || 0, weightBasis, defaultRate)
    : useSplitTechnician && weightBasis > 0 && !product.is_component
      ? parseFloat((total / weightBasis).toFixed(4))
      : defaultRate;
  return {
    rate,
    weightBasis,
    total,
    defaultRate,
    isOverridden,
    usesSplitTechnician: useSplitTechnician && !product.is_component,
  };
}

/** Auto technician formula per finish — mirrors resolveTechnicianCostVariant (no manual lock). */
export function getTechnicianAutoLineForFinish(
  product: Pick<Product, 'weight_g' | 'secondary_weight_g' | 'is_component'>,
  finishCode: string,
): LaborFormulaLine {
  const useSplit = finishCode === 'D';
  const emptyLabor = {
    technician_cost: 0,
    technician_cost_manual_override: false,
  } as LaborCost;
  return getTechnicianFormulaLine(emptyLabor, product, useSplit);
}

export function getTechnicianSplitDetailHint(
  product: Pick<Product, 'weight_g' | 'secondary_weight_g'>,
): string {
  const total = getTotalWeight(product);
  const primaryRate = getTechnicianRateForWeight(total);
  const sec = product.secondary_weight_g || 0;
  const secCost = calculateTechnicianCostFromWeight(sec);
  return `${product.weight_g}g×${primaryRate.toFixed(2)} + ${sec}g×${sec > 0 ? getTechnicianRateForWeight(sec).toFixed(2) : '0'}`;
}

export function getPlatingXFormulaLine(
  labor: LaborCost,
  product: Pick<Product, 'weight_g' | 'recipe'>,
  allProducts: Product[],
): LaborFormulaLine {
  const weightBasis = getPlatingXWeightBasis(product, allProducts);
  const isOverridden = !!labor.plating_cost_x_manual_override;
  const defaultRate = DEFAULT_PLATING_RATE;
  const total = isOverridden
    ? labor.plating_cost_x || 0
    : parseFloat((weightBasis * defaultRate).toFixed(2));
  const rate = isOverridden
    ? deriveRateFromTotal(labor.plating_cost_x || 0, weightBasis, defaultRate)
    : defaultRate;
  return { rate, weightBasis, total, defaultRate, isOverridden };
}

export function getPlatingDFormulaLine(
  labor: LaborCost,
  product: Pick<Product, 'secondary_weight_g' | 'recipe'>,
  allProducts: Product[],
): LaborFormulaLine {
  const weightBasis = getPlatingDWeightBasis(product, allProducts);
  const isOverridden = !!labor.plating_cost_d_manual_override;
  const defaultRate = DEFAULT_PLATING_RATE;
  const total = isOverridden
    ? labor.plating_cost_d || 0
    : parseFloat((weightBasis * defaultRate).toFixed(2));
  const rate = isOverridden
    ? deriveRateFromTotal(labor.plating_cost_d || 0, weightBasis, defaultRate)
    : defaultRate;
  return { rate, weightBasis, total, defaultRate, isOverridden };
}

/** Auto-recalculate labor totals when not manually overridden (UI sync). */
export function computeAutoLaborCosts(
  product: Product,
  allProducts: Product[],
  useSplitTechnician = false,
): Partial<LaborCost> {
  const labor = product.labor;
  const updates: Partial<LaborCost> = {};

  if (!labor.casting_cost_manual_override) {
    updates.casting_cost = product.is_component
      ? 0
      : parseFloat((getCastingWeightBasis(product) * DEFAULT_CASTING_RATE).toFixed(4));
  }

  if (!labor.technician_cost_manual_override) {
    updates.technician_cost = product.is_component
      ? parseFloat((product.weight_g * STX_TECHNICIAN_RATE).toFixed(4))
      : useSplitTechnician
        ? calculateSplitTechnicianCost(product)
        : parseFloat(calculateTechnicianCostFromWeight(getTotalWeight(product)).toFixed(4));
  }

  if (!labor.plating_cost_x_manual_override) {
    const platingXWeight = getPlatingXWeightBasis(product, allProducts);
    updates.plating_cost_x = parseFloat((platingXWeight * DEFAULT_PLATING_RATE).toFixed(2));
  }

  if (!labor.plating_cost_d_manual_override) {
    const platingDWeight = getPlatingDWeightBasis(product, allProducts);
    updates.plating_cost_d = parseFloat((platingDWeight * DEFAULT_PLATING_RATE).toFixed(2));
  }

  return updates;
}

export type LaborFormulaField = 'casting' | 'technician' | 'plating_x' | 'plating_d';

const OVERRIDE_KEYS: Record<LaborFormulaField, keyof LaborCost> = {
  casting: 'casting_cost_manual_override',
  technician: 'technician_cost_manual_override',
  plating_x: 'plating_cost_x_manual_override',
  plating_d: 'plating_cost_d_manual_override',
};

const COST_KEYS: Record<LaborFormulaField, keyof LaborCost> = {
  casting: 'casting_cost',
  technician: 'technician_cost',
  plating_x: 'plating_cost_x',
  plating_d: 'plating_cost_d',
};

function roundLaborTotal(field: LaborFormulaField, total: number): number {
  if (field === 'plating_x' || field === 'plating_d') {
    return parseFloat(total.toFixed(2));
  }
  return parseFloat(total.toFixed(4));
}

export function applyFormulaRateChange(
  field: LaborFormulaField,
  rate: number,
  weightBasis: number,
): Partial<LaborCost> {
  const total = roundLaborTotal(field, rate * weightBasis);
  return {
    [COST_KEYS[field]]: total,
    [OVERRIDE_KEYS[field]]: true,
  } as Partial<LaborCost>;
}

export function applyFormulaWeightChange(
  field: LaborFormulaField,
  labor: LaborCost,
  newWeightBasis: number,
  currentRate: number,
): Partial<LaborCost> {
  const isOverridden = !!labor[OVERRIDE_KEYS[field]];
  const total = roundLaborTotal(field, (isOverridden ? currentRate : getDefaultRateForField(field, labor)) * newWeightBasis);
  return {
    [COST_KEYS[field]]: total,
    ...(isOverridden ? { [OVERRIDE_KEYS[field]]: true } : {}),
  } as Partial<LaborCost>;
}

export function applyFormulaTotalChange(
  field: LaborFormulaField,
  total: number,
): Partial<LaborCost> {
  return {
    [COST_KEYS[field]]: roundLaborTotal(field, total),
    [OVERRIDE_KEYS[field]]: true,
  } as Partial<LaborCost>;
}

export function clearFormulaOverride(field: LaborFormulaField): Partial<LaborCost> {
  return { [OVERRIDE_KEYS[field]]: false } as Partial<LaborCost>;
}

function getDefaultRateForField(field: LaborFormulaField, labor: LaborCost): number {
  switch (field) {
    case 'casting':
      return DEFAULT_CASTING_RATE;
    case 'technician':
      return DEFAULT_CASTING_RATE; // unused when not overridden; caller passes effective rate
    case 'plating_x':
    case 'plating_d':
      return DEFAULT_PLATING_RATE;
    default:
      return 0;
  }
}

/** Sync product weight when casting/technician formula weight basis is edited. */
export function syncPrimaryWeightFromTotalBasis(
  product: Pick<Product, 'weight_g' | 'secondary_weight_g'>,
  newTotalBasis: number,
): number {
  const secondary = product.secondary_weight_g || 0;
  return Math.max(0, parseFloat((newTotalBasis - secondary).toFixed(4)));
}

export function syncSecondaryWeightFromPlatingDBasis(
  product: Pick<Product, 'weight_g' | 'secondary_weight_g' | 'recipe'>,
  allProducts: Product[],
  newSecondaryBasis: number,
): number {
  let componentSecondary = 0;
  product.recipe.forEach((item) => {
    if (item.type === 'component') {
      const sub = allProducts.find((p) => p.sku === item.sku);
      if (sub) componentSecondary += (sub.secondary_weight_g || 0) * item.quantity;
    }
  });
  return Math.max(0, parseFloat((newSecondaryBasis - componentSecondary).toFixed(4)));
}
