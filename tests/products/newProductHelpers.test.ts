import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, Product, ProductionType } from '../../types';
import { buildCostedVariants } from '../../features/products/newProductHelpers';
import { estimateVariantCost } from '../../utils/pricingEngine';

const settings = { silver_price_gram: 2.5 } as any;

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  sku: 'KL150',
  prefix: 'KL',
  category: 'Kolye',
  gender: Gender.Unisex,
  image_url: null,
  weight_g: 3,
  secondary_weight_g: 2,
  plating_type: PlatingType.None,
  production_type: ProductionType.InHouse,
  active_price: 0,
  draft_price: 0,
  selling_price: 0,
  stock_qty: 0,
  sample_qty: 0,
  molds: [],
  is_component: false,
  recipe: [],
  labor: {
    casting_cost: 0,
    setter_cost: 0.25,
    technician_cost: 0,
    stone_setting_cost: 0,
    plating_cost_x: 1.8,
    plating_cost_d: 1.2,
    subcontract_cost: 0.4,
    casting_cost_manual_override: false,
    technician_cost_manual_override: false,
    plating_cost_x_manual_override: false,
    plating_cost_d_manual_override: false,
  },
  ...overrides,
});

describe('new product variant cost helpers', () => {
  it('recalculates stale KL variant active prices with the pricing engine', () => {
    const product = makeProduct({
      variants: [
        {
          suffix: 'DLE',
          description: 'D finish',
          stock_qty: 3,
          active_price: 999,
          selling_price: 42,
        },
      ],
    });

    const [costedVariant] = buildCostedVariants(product.variants || [], product, settings, [], []);
    const expected = estimateVariantCost(product, 'DLE', settings, [], []).total;

    expect(costedVariant.active_price).toBe(expected);
  });

  it('preserves non-cost variant fields when recalculating active prices', () => {
    const product = makeProduct({
      variants: [
        {
          suffix: 'XPR',
          description: 'Gold with stone',
          stock_qty: 7,
          active_price: 1,
          selling_price: 55,
          selling_price_manual_override: true,
        },
      ],
    });

    const [costedVariant] = buildCostedVariants(product.variants || [], product, settings, [], []);

    expect(costedVariant).toMatchObject({
      suffix: 'XPR',
      description: 'Gold with stone',
      stock_qty: 7,
      selling_price: 55,
      selling_price_manual_override: true,
    });
    expect(costedVariant.active_price).not.toBe(1);
  });
});
