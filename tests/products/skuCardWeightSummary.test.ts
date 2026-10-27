import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, ProductionType, type Product } from '../../types';
import { buildProductCardWeightPresentation } from '../../features/products/productCardPresentation';
import { describeWeightBreakdown } from '../../components/ProductDetails/WeightComposition';

const product = (patch: Partial<Product> = {}): Product => ({
  sku: 'KL201', prefix: 'KL', category: 'Κολιέ', gender: Gender.Women, image_url: null,
  weight_g: 1.4, secondary_weight_g: 0, plating_type: PlatingType.None, production_type: ProductionType.InHouse,
  active_price: 0, draft_price: 0, selling_price: 0, stock_qty: 0, sample_qty: 0, is_component: false,
  molds: [], recipe: [], variants: [],
  labor: { casting_cost: 0, technician_cost: 0, setter_cost: 0, stone_setting_cost: 0, plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0 },
  ...patch,
});

const stx = product({ sku: 'STX1', weight_g: 0.39, is_component: true });
const bySku = new Map([[stx.sku, stx]]);

describe('SKU card weight summary', () => {
  it('reads plain silver products like the registry card', () => {
    const view = buildProductCardWeightPresentation(product(), bySku);
    expect(view.totalWeight).toBe(1.4);
    expect(describeWeightBreakdown(view)).toBe('Ασήμι 925');
  });

  it('adds secondary weight and STX components from the recipe', () => {
    const view = buildProductCardWeightPresentation(product({
      secondary_weight_g: 0.2,
      recipe: [{ type: 'component', sku: 'STX1', quantity: 2 }],
    }), bySku);
    expect(view.stxWeight).toBeCloseTo(0.78);
    expect(describeWeightBreakdown(view, 'δευτ.')).toBe('1,40 κύριο + 0,20 δευτ. + 0,78 STX');
  });

  it('describes skip-casting products by their STX weight only', () => {
    const view = buildProductCardWeightPresentation(product({
      weight_g: 0,
      skip_casting: true,
      recipe: [{ type: 'component', sku: 'STX1', quantity: 1 }],
    }), bySku);
    expect(describeWeightBreakdown(view)).toBe('Χωρίς χύτευση · STX 0,39 g');
  });
});
