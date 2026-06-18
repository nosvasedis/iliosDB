import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, ProductionType } from '../../types';
import { analyzeSuffix, calculateProductCost, estimateVariantCost, getVariantComponents } from '../../utils/pricingEngine';
import { DEFAULT_CASTING_RATE, resolveCastingCost } from '../../utils/laborFormula';

const baseSettings = { silver_price_gram: 2.5 } as any;

const makeInHouseProduct = (overrides: Record<string, unknown> = {}) => ({
  sku: 'KOU8',
  prefix: 'KO',
  category: 'Test',
  gender: Gender.Women,
  image_url: null,
  weight_g: 1.1,
  secondary_weight_g: 0,
  plating_type: PlatingType.None,
  production_type: ProductionType.InHouse,
  active_price: 0,
  draft_price: 0,
  selling_price: 0,
  stock_qty: 0,
  sample_qty: 0,
  is_component: false,
  recipe: [],
  labor: {
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
  },
  ...overrides,
} as any);

describe('casting cost at 0.30 €/g default', () => {
  it('calculates master casting as weight × 0.30', () => {
    const product = makeInHouseProduct();
    const { breakdown } = calculateProductCost(product, baseSettings, [], []);
    expect(breakdown.details.casting_cost).toBeCloseTo(1.1 * DEFAULT_CASTING_RATE, 4);
    expect(breakdown.details.casting_cost).toBeCloseTo(0.33, 4);
  });

  it('uses manual casting override on master and variant', () => {
    const product = makeInHouseProduct({
      labor: {
        ...makeInHouseProduct().labor,
        casting_cost: 0.99,
        casting_cost_manual_override: true,
      },
    });
    const master = calculateProductCost(product, baseSettings, [], []);
    const variant = estimateVariantCost(product, 'X', baseSettings, [], []);
    expect(master.breakdown.details.casting_cost).toBe(0.99);
    expect(variant.breakdown.details.casting_cost).toBe(0.99);
  });

  it('STX component has zero casting', () => {
    const product = makeInHouseProduct({ is_component: true, sku: 'STX-1' });
    expect(resolveCastingCost(product.labor, product)).toBe(0);
  });
});

describe('Swiss Blue stone code (SB)', () => {
  it('parses XSB suffix as finish X with stone SB', () => {
    const { stone, finish } = getVariantComponents('XSB', Gender.Women);
    expect(stone.code).toBe('SB');
    expect(stone.name).toBe('Swiss Blue');
    expect(finish.code).toBe('X');
  });

  it('generates Swiss Blue in auto variant description for DSB', () => {
    const description = analyzeSuffix('DSB', Gender.Women);
    expect(description).toContain('Swiss Blue');
    expect(description).not.toContain('Blue Sky Topaz');
  });
});

describe('Azurite-Malachite stone code (AZM)', () => {
  it('parses AZM suffix as lustre with stone AZM', () => {
    const { stone, finish } = getVariantComponents('AZM', Gender.Women);
    expect(stone.code).toBe('AZM');
    expect(stone.name).toBe('Αζουρίτης - Μαλαχίτης');
    expect(finish.code).toBe('');
  });

  it('parses PAZM suffix as finish P with stone AZM', () => {
    const { stone, finish } = getVariantComponents('PAZM', Gender.Women);
    expect(stone.code).toBe('AZM');
    expect(stone.name).toBe('Αζουρίτης - Μαλαχίτης');
    expect(finish.code).toBe('P');
  });

  it('generates Αζουρίτης - Μαλαχίτης in auto variant description for XAZM', () => {
    const description = analyzeSuffix('XAZM', Gender.Women);
    expect(description).toContain('Αζουρίτης - Μαλαχίτης');
  });
});
