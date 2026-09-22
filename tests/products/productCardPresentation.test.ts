import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, Product, ProductionType } from '../../types';
import {
  SKIP_CASTING_LABEL,
  buildProductCardWeightPresentation,
  canConvertToImported,
  formatRegistryWeight,
} from '../../features/products/productCardPresentation';

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  sku: 'PN1',
  prefix: 'PN',
  category: 'Βραχιόλι',
  gender: Gender.Women,
  image_url: null,
  weight_g: 2.4,
  secondary_weight_g: 0,
  plating_type: PlatingType.None,
  production_type: ProductionType.InHouse,
  active_price: 0,
  draft_price: 0,
  selling_price: 12,
  stock_qty: 0,
  sample_qty: 0,
  molds: [],
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
  },
  ...overrides,
});

describe('product card presentation', () => {
  it('formats registry weights with two Greek decimal places', () => {
    expect(formatRegistryWeight(0)).toBe('0,00');
    expect(formatRegistryWeight(2.4)).toBe('2,40');
  });

  it('does not show 0,00g as the hero weight for skip_casting products', () => {
    const view = buildProductCardWeightPresentation(makeProduct({
      skip_casting: true,
      weight_g: 0,
      secondary_weight_g: 0,
    }), new Map());

    expect(view.skipCasting).toBe(true);
    expect(view.skipCastingLabel).toBe(SKIP_CASTING_LABEL);
    expect(view.primaryMode).toBe('skip_casting');
    expect(view.showCastingWeight).toBe(false);
    expect(view.hasWeightBreakdown).toBe(false);
  });

  it('shows STX recipe weight when a skip_casting product has components', () => {
    const stx = makeProduct({ sku: 'STX1', is_component: true, weight_g: 1.25, secondary_weight_g: 0.25 });
    const product = makeProduct({
      skip_casting: true,
      weight_g: 0,
      recipe: [{ type: 'component', sku: 'STX1', quantity: 2 }],
    });
    const view = buildProductCardWeightPresentation(product, new Map([['STX1', stx]]));

    expect(view.primaryMode).toBe('skip_casting');
    expect(view.stxWeight).toBe(3);
    expect(view.totalWeight).toBe(3);
    expect(view.hasWeightBreakdown).toBe(true);
    expect(view.showCastingWeight).toBe(false);
  });

  it('keeps a simple casting-weight display for ordinary in-house products', () => {
    const view = buildProductCardWeightPresentation(makeProduct({ weight_g: 2.4 }), new Map());
    expect(view.skipCasting).toBe(false);
    expect(view.primaryMode).toBe('simple');
    expect(view.showCastingWeight).toBe(true);
    expect(view.totalWeight).toBe(2.4);
  });

  it('allows converting in-house finished goods but not STX or imported products', () => {
    expect(canConvertToImported(makeProduct())).toBe(true);
    expect(canConvertToImported(makeProduct({ is_component: true }))).toBe(false);
    expect(canConvertToImported(makeProduct({ production_type: ProductionType.Imported }))).toBe(false);
  });
});
