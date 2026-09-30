import { LaborCost, Product, RecipeItem } from '../types';
import { DEFAULT_PRICING_RULES, getPricingRules, type PricingSettings } from './pricingRules';

export const DEFAULT_CASTING_RATE = DEFAULT_PRICING_RULES.casting_rate;
export const DEFAULT_PLATING_RATE = DEFAULT_PRICING_RULES.plating_rate;
export const STX_TECHNICIAN_RATE = DEFAULT_PRICING_RULES.stx_technician_rate;

export const TECHNICIAN_TIER_HINT =
  'Κλιμάκωση: ≤2,2g→1,30 · ≤4,2g→0,90 · ≤8,2g→0,70 · >8,2g→0,50 €/g';

/** Tier rate (€/g) for a given weight — mirrors calculateTechnicianCost tiers. */
export function getTechnicianRateForWeight(weight_g: number, settings?: PricingSettings): number {
  if (weight_g <= 0) return 0;
  const r = getPricingRules(settings);
  if (weight_g <= r.technician_threshold_1) return r.technician_rate_1;
  if (weight_g <= r.technician_threshold_2) return r.technician_rate_2;
  if (weight_g <= r.technician_threshold_3) return r.technician_rate_3;
  return r.technician_rate_4;
}

/** Total cost from tier table (same as pricingEngine.calculateTechnicianCost). */
export function calculateTechnicianCostFromWeight(weight_g: number, settings?: PricingSettings): number {
  if (weight_g <= 0) return 0;
  return weight_g * getTechnicianRateForWeight(weight_g, settings);
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
  product: Pick<Product, 'weight_g' | 'secondary_weight_g' | 'is_component' | 'skip_casting'>,
  settings?: PricingSettings,
): number {
  if (labor.casting_cost_manual_override) {
    return labor.casting_cost || 0;
  }
  if (product.is_component || product.skip_casting) return 0;
  return getCastingWeightBasis(product) * getPricingRules(settings).casting_rate;
}

export function calculateSplitTechnicianCost(
  product: Pick<Product, 'weight_g' | 'secondary_weight_g'>,
  settings?: PricingSettings,
): number {
  const totalWeight = getTotalWeight(product);
  const primaryRate = getTechnicianRateForWeight(totalWeight, settings);
  return parseFloat((
    product.weight_g * primaryRate +
    calculateTechnicianCostFromWeight(product.secondary_weight_g || 0, settings)
  ).toFixed(4));
}

export const SPLIT_TECHNICIAN_HINT =
  'Δίχρωμο / D: κύριο βάρος × κλιμάκωση(συνολικού) + δευτερεύον × κλιμάκωση(δευτερεύοντος)';

/**
 * Resolve technician cost — master / product-level (Εργατικά auto-fill & master cost).
 * Uses D split when useSplitTechnician=true (TwoTone master or any D variant).
 */
export function resolveTechnicianCostMaster(
  labor: Partial<LaborCost>,
  product: Pick<Product, 'weight_g' | 'secondary_weight_g' | 'is_component'>,
  useSplitTechnician = false,
  settings?: PricingSettings,
): number {
  if (labor.technician_cost_manual_override) {
    return labor.technician_cost || 0;
  }
  if (product.is_component) {
    return product.weight_g * getPricingRules(settings).stx_technician_rate;
  }
  if (useSplitTechnician) {
    return calculateSplitTechnicianCost(product, settings);
  }
  return calculateTechnicianCostFromWeight(getTotalWeight(product), settings);
}

/**
 * Resolve technician cost for variant estimate — preserves D-variant split.
 */
export function resolveTechnicianCostVariant(
  labor: Partial<LaborCost>,
  product: Pick<Product, 'weight_g' | 'secondary_weight_g' | 'is_component'>,
  variantContext: VariantTechnicianContext,
  settings?: PricingSettings,
): number {
  if (labor.technician_cost_manual_override) {
    return labor.technician_cost || 0;
  }
  if (product.is_component) {
    return product.weight_g * getPricingRules(settings).stx_technician_rate;
  }
  const totalWeight = getTotalWeight(product);
  if (variantContext.finishCode === 'D') {
    return calculateSplitTechnicianCost(product, settings);
  }
  return calculateTechnicianCostFromWeight(totalWeight, settings);
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
  product: Pick<Product, 'weight_g' | 'secondary_weight_g' | 'is_component' | 'skip_casting'>,
  settings?: PricingSettings,
): LaborFormulaLine {
  const weightBasis = getCastingWeightBasis(product);
  const isOverridden = !!labor.casting_cost_manual_override;
  const defaultRate = (product.is_component || product.skip_casting) ? 0 : getPricingRules(settings).casting_rate;
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
  settings?: PricingSettings,
): LaborFormulaLine {
  const weightBasis = product.is_component ? product.weight_g : getTotalWeight(product);
  const isOverridden = !!labor.technician_cost_manual_override;
  const defaultRate = product.is_component
    ? getPricingRules(settings).stx_technician_rate
    : getTechnicianRateForWeight(weightBasis, settings);
  const total = isOverridden
    ? labor.technician_cost || 0
    : product.is_component
      ? product.weight_g * getPricingRules(settings).stx_technician_rate
      : useSplitTechnician
        ? calculateSplitTechnicianCost(product, settings)
        : calculateTechnicianCostFromWeight(weightBasis, settings);
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
  settings?: PricingSettings,
): LaborFormulaLine {
  const useSplit = finishCode === 'D';
  const emptyLabor = {
    technician_cost: 0,
    technician_cost_manual_override: false,
  } as LaborCost;
  return getTechnicianFormulaLine(emptyLabor, product, useSplit, settings);
}

export function getTechnicianSplitDetailHint(
  product: Pick<Product, 'weight_g' | 'secondary_weight_g'>,
  settings?: PricingSettings,
): string {
  const total = getTotalWeight(product);
  const primaryRate = getTechnicianRateForWeight(total, settings);
  const sec = product.secondary_weight_g || 0;
  const secCost = calculateTechnicianCostFromWeight(sec, settings);
  return `${product.weight_g}g×${primaryRate.toFixed(2)} + ${sec}g×${sec > 0 ? getTechnicianRateForWeight(sec, settings).toFixed(2) : '0'}`;
}

export function getPlatingXFormulaLine(
  labor: LaborCost,
  product: Pick<Product, 'weight_g' | 'recipe'>,
  allProducts: Product[],
  settings?: PricingSettings,
): LaborFormulaLine {
  const weightBasis = getPlatingXWeightBasis(product, allProducts);
  const isOverridden = !!labor.plating_cost_x_manual_override;
  const defaultRate = getPricingRules(settings).plating_rate;
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
  settings?: PricingSettings,
): LaborFormulaLine {
  const weightBasis = getPlatingDWeightBasis(product, allProducts);
  const isOverridden = !!labor.plating_cost_d_manual_override;
  const defaultRate = getPricingRules(settings).plating_rate;
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
  settings?: PricingSettings,
): Partial<LaborCost> {
  const labor = product.labor;
  const updates: Partial<LaborCost> = {};

  if (!labor.casting_cost_manual_override) {
    updates.casting_cost = (product.is_component || product.skip_casting)
      ? 0
      : parseFloat((getCastingWeightBasis(product) * getPricingRules(settings).casting_rate).toFixed(4));
  }

  if (!labor.technician_cost_manual_override) {
    updates.technician_cost = product.is_component
      ? parseFloat((product.weight_g * getPricingRules(settings).stx_technician_rate).toFixed(4))
      : useSplitTechnician
        ? calculateSplitTechnicianCost(product, settings)
        : parseFloat(calculateTechnicianCostFromWeight(getTotalWeight(product), settings).toFixed(4));
  }

  if (!labor.plating_cost_x_manual_override) {
    const platingXWeight = getPlatingXWeightBasis(product, allProducts);
    updates.plating_cost_x = parseFloat((platingXWeight * getPricingRules(settings).plating_rate).toFixed(2));
  }

  if (!labor.plating_cost_d_manual_override) {
    const platingDWeight = getPlatingDWeightBasis(product, allProducts);
    updates.plating_cost_d = parseFloat((platingDWeight * getPricingRules(settings).plating_rate).toFixed(2));
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
  settings?: PricingSettings,
): Partial<LaborCost> {
  const isOverridden = !!labor[OVERRIDE_KEYS[field]];
  const total = roundLaborTotal(field, (isOverridden ? currentRate : getDefaultRateForField(field, labor, settings)) * newWeightBasis);
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

function getDefaultRateForField(field: LaborFormulaField, labor: LaborCost, settings?: PricingSettings): number {
  switch (field) {
    case 'casting':
      return getPricingRules(settings).casting_rate;
    case 'technician':
      return getPricingRules(settings).casting_rate; // unused when not overridden; caller passes effective rate
    case 'plating_x':
    case 'plating_d':
      return getPricingRules(settings).plating_rate;
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
