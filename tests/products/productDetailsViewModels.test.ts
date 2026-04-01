import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, Product, ProductionType } from '../../types';
import {
  buildEditableProduct,
  getAvailableMolds,
  getProductDisplaySummary,
  getSecondaryWeightLabel,
  getSortedProductVariants,
} from '../../features/products/productDetailsViewModels';

const makeProduct = (overrides: Partial<Product>): Product =>
  ({
    sku: 'BASE',
    prefix: 'BA',
    category: 'Βραχιόλι',
    gender: Gender.Women,
    image_url: null,
    weight_g: 1,
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
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }) as Product;

describe('product details view models', () => {
  it('builds a fully initialized editable product and stable derived labels', () => {
    const product = makeProduct({
      sku: 'R10',
      production_type: undefined,
      labor: {
        technician_cost: 3.2,
      } as any,
    });

    const editable = buildEditableProduct(product);

    expect(editable.production_type).toBe(ProductionType.InHouse);
    expect(editable.variants).toEqual([]);
    expect(editable.labor.technician_cost).toBe(3.2);
    expect(editable.labor.casting_cost).toBe(0);
    expect(getSecondaryWeightLabel(Gender.Men, 'Δαχτυλίδι')).toBe('Βάρος Καπακιού (g)');
    expect(getSecondaryWeightLabel(Gender.Women, 'Βραχιόλι')).toBe('Βάρος Καστονιού (g)');
  });

  it('sorts variants and summarizes plating in the same order as the editor', () => {
    const product = makeProduct({
      sku: 'R20',
      variants: [
        { suffix: 'X', description: 'Επίχρυσο', stock_qty: 1 },
        { suffix: '', description: 'Λουστρέ', stock_qty: 1 },
        { suffix: 'P', description: 'Πατίνα', stock_qty: 1 },
      ],
    });

    const sorted = getSortedProductVariants(product, product.variants || []);
    expect(sorted.map((variant) => variant.suffix)).toEqual(['', 'P', 'X']);

    const summary = getProductDisplaySummary(product, sorted);
    expect(summary.displayPlating).toBe('Λουστρέ, Πατίνα, Επίχρυσο');
    expect(summary.displayStones).toBe('');
  });

  it('filters and sorts available molds by the same rules as the editor', () => {
    const molds = [
      { code: 'B-2', description: 'Δεύτερο' },
      { code: 'A-1', description: 'Πρώτο' },
      { code: 'C-3', description: 'Τρίτο' },
    ] as any[];

    const available = getAvailableMolds(molds as any, [{ code: 'C-3' }], 'a');
    expect(available.map((mold) => mold.code)).toEqual(['A-1']);
  });
});
