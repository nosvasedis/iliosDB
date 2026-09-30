import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, ProductionType, type GlobalSettings, type Product } from '../../types';
import { INITIAL_SETTINGS } from '../../constants';
import { DEFAULT_PRICING_RULES, getPricingRules, validatePricingRules } from '../../utils/pricingRules';
import { calculateProductCost, estimateVariantCost, getIliosSuggestedPriceForProduct, getLabelDisplayPrice, roundPrice } from '../../utils/pricingEngine';
import { computeAutoLaborCosts, getCastingFormulaLine, resolveTechnicianCostMaster, resolveTechnicianCostVariant } from '../../utils/laborFormula';
import { buildCatalogueRepricing, type PricingCatalogSnapshot } from '../../utils/catalogRepricing';

const product = (patch: Partial<Product> = {}): Product => ({
  sku: 'RN1', prefix: 'RN', category: 'Δαχτυλίδι', gender: Gender.Women, image_url: null,
  weight_g: 10, secondary_weight_g: 0, plating_type: PlatingType.None, production_type: ProductionType.InHouse,
  active_price: 0, draft_price: 0, selling_price: 0, stock_qty: 0, sample_qty: 0, is_component: false,
  molds: [], recipe: [], variants: [],
  labor: { casting_cost: 0, technician_cost: 0, setter_cost: 0, stone_setting_cost: 0, plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0 },
  ...patch,
});
const settings = (pricing_rules: GlobalSettings['pricing_rules'] = {}): GlobalSettings => ({ ...INITIAL_SETTINGS, silver_price_gram: 1, pricing_rules });

export const pricingSnapshotFixture = (): PricingCatalogSnapshot => ({
  fingerprint: 'test', settings: { ...settings(), id: 1 },
  products: [{ sku: 'RN1', prefix: 'RN', gender: Gender.Women, category: 'Δαχτυλίδι', production_type: ProductionType.InHouse, weight_g: 10, secondary_weight_g: 0, plating_type: PlatingType.None, active_price: 0, draft_price: 0, selling_price: 55, labor_casting: 1.5, labor_technician: 5 }],
  variants: [{ product_sku: 'RN1', suffix: '', active_price: 0, selling_price: 55 }, { product_sku: 'RN1', suffix: 'X', active_price: 0, selling_price: 70, selling_price_manual_override: true }],
  materials: [], recipes: [],
});

describe('configurable pricing policy', () => {
  it('defaults to 0.20 casting and doubles its contribution in masters and every finish', () => {
    const p = product();
    const old = settings({ casting_rate: 0.15 });
    expect(calculateProductCost(p, settings(), [], [p]).breakdown.details.casting_cost).toBe(2);
    for (const suffix of [null, '', 'P', 'X', 'H', 'D']) {
      expect(getIliosSuggestedPriceForProduct(p, suffix, settings(), [], [p]) - getIliosSuggestedPriceForProduct(p, suffix, old, [], [p])).toBeCloseTo(1);
    }
  });
  it('supports zero rates without falling back and validates tiers, blank values and multipliers', () => {
    expect(getPricingRules(settings({ casting_rate: 0, plating_rate: 0 })).casting_rate).toBe(0);
    expect(validatePricingRules({ casting_rate: NaN })).toBeTruthy();
    expect(validatePricingRules({ casting_rate: -1 })).toBeTruthy();
    expect(validatePricingRules({ technician_threshold_1: 5 })).toBeTruthy();
    expect(validatePricingRules({ retail_multiplier: 0 })).toBeTruthy();
    expect(validatePricingRules({ price_rounding_step: 0.001 })).toBeTruthy();
    expect(validatePricingRules({ price_rounding_step: 0.015 })).toBeTruthy();
    expect(getPricingRules(settings({ technician_threshold_1: 5 }))).toEqual(DEFAULT_PRICING_RULES);
  });
  it('keeps manual labor locks and skip-casting formulas consistent', () => {
    const p = product({ skip_casting: true });
    expect(getCastingFormulaLine(p.labor, p, settings({ casting_rate: 0.3 })).total).toBe(0);
    p.labor.casting_cost = 7; p.labor.casting_cost_manual_override = true;
    expect(getCastingFormulaLine(p.labor, p, settings({ casting_rate: 0.3 })).total).toBe(7);
    expect(estimateVariantCost(p, 'X', settings({ casting_rate: 0.3 }), [], [p]).breakdown.details.casting_cost).toBe(7);
    expect(computeAutoLaborCosts(p, [p], false, settings({ casting_rate: 0.3 })).casting_cost).toBeUndefined();
  });
  it('applies custom tier boundaries and rates to D split and STX', () => {
    const s = settings({ technician_threshold_1: 3, technician_threshold_2: 6, technician_threshold_3: 9, technician_rate_1: 2, technician_rate_2: 1, technician_rate_3: 0.8, technician_rate_4: 0.4, stx_technician_rate: 0.7 });
    const p = product({ weight_g: 4, secondary_weight_g: 2 });
    expect(resolveTechnicianCostMaster(p.labor, p, true, s)).toBe(8);
    expect(resolveTechnicianCostVariant(p.labor, p, { finishCode: 'D' }, s)).toBe(8);
    expect(resolveTechnicianCostVariant(p.labor, p, { finishCode: 'P' }, s)).toBe(6);
    p.is_component = true;
    expect(resolveTechnicianCostMaster(p.labor, p, false, s)).toBeCloseTo(2.8);
  });
  it('changes plating only when explicitly configured and preserves imported rate semantics', () => {
    const p = product({ plating_type: PlatingType.GoldPlated }); p.labor.plating_cost_x = 9;
    expect(calculateProductCost(p, settings({ casting_rate: 0.2 }), [], [p]).breakdown.details.plating_cost).toBe(9);
    expect(calculateProductCost(p, settings({ plating_rate: 0.4 }), [], [p]).breakdown.details.plating_cost).toBe(4);
    p.labor.plating_cost_x_manual_override = true;
    expect(calculateProductCost(p, settings({ plating_rate: 0.4 }), [], [p]).breakdown.details.plating_cost).toBe(9);
    p.production_type = ProductionType.Imported; p.labor.plating_cost_x = 0.8;
    expect(calculateProductCost(p, settings({ plating_rate: 0.4 }), [], [p]).breakdown.details.plating_cost).toBe(8);
  });
  it('uses custom formula, label multiplier and rounding without rounding stored order prices', () => {
    const p = product(); const s = settings({ ilios_labor_material_multiplier: 3, ilios_weight_surcharge: 1, retail_multiplier: 4, price_rounding_step: 0.5 });
    expect(getIliosSuggestedPriceForProduct(p, null, s, [], [p])).toBe(41);
    expect(getLabelDisplayPrice(41, 'retail', s)).toBe(164);
    expect(getLabelDisplayPrice(41, 'wholesale', s)).toBe(41);
    expect(roundPrice(1.26, s)).toBe(1.5);
  });
});

describe('catalogue repricing completeness and safety', () => {
  it('can explicitly replace flagged master and variant prices, including unchanged prices that need a flag reset', () => {
    const s = pricingSnapshotFixture();
    s.products[0].selling_price = 44;
    s.products[0].selling_price_manual_override = true;
    const plan = buildCatalogueRepricing(s, { replaceManualSelling: true });
    expect(plan.manualCount).toBe(2);
    expect(plan.rows.find(r => r.suffix === null)?.values.selling_price).toBe(44);
    expect(plan.rows.find(r => r.suffix === 'X')?.values.selling_price).toBe(44);
    expect(s.products[0].selling_price_manual_override).toBe(true);
    expect(s.variants[1].selling_price_manual_override).toBe(true);
  });
  it('includes masters with variants, empty-suffix variants, and protects manual selling', () => {
    const plan = buildCatalogueRepricing(pricingSnapshotFixture());
    expect(plan.masterCount).toBe(1); expect(plan.variantCount).toBe(2); expect(plan.manualCount).toBe(1);
    expect(plan.rows.find(r => r.suffix === null)?.values).toMatchObject({ active_price: 17, draft_price: 17, labor_casting: 2, selling_price: 44 });
    expect(plan.rows.find(r => r.suffix === '')?.values.selling_price).toBe(44);
    expect(plan.rows.find(r => r.suffix === 'X')?.values.selling_price).toBeUndefined();
  });
  it('preserves manual labor, imported inputs and reserved service fees', () => {
    const s = pricingSnapshotFixture();
    s.products[0].labor_casting_manual_override = true;
    s.products.push({ ...s.products[0], sku: '000', selling_price: 6 });
    const plan = buildCatalogueRepricing(s);
    expect(plan.serviceCount).toBe(1); expect(plan.rows.some(r => r.sku === '000')).toBe(false);
    expect(plan.rows.find(r => r.suffix === null)?.values.labor_casting).toBeUndefined();
  });
  it('fails closed on missing materials, missing components and circular recipes', () => {
    for (const recipe of [{ parent_sku: 'RN1', type: 'raw', material_id: 'missing', quantity: 1 }, { parent_sku: 'RN1', type: 'component', component_sku: 'missing', quantity: 1 }, { parent_sku: 'RN1', type: 'component', component_sku: 'RN1', quantity: 1 }]) {
      const s = pricingSnapshotFixture(); s.recipes.push(recipe);
      expect(() => buildCatalogueRepricing(s)).toThrow();
    }
  });
  it('retains existing signed recipe cost adjustments without editing the recipe', () => {
    const s = pricingSnapshotFixture();
    s.materials.push({ id: 'adjustment', cost_per_unit: 0.1 });
    s.recipes.push({ parent_sku: 'RN1', type: 'raw', material_id: 'adjustment', quantity: -2 });
    const before = JSON.stringify(s.recipes);
    const plan = buildCatalogueRepricing(s);
    expect(plan.rows.find(r => r.suffix === null)?.values.active_price).toBe(16.8);
    expect(JSON.stringify(s.recipes)).toBe(before);
  });
});
