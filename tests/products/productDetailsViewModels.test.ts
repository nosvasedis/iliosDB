import { describe, expect, it } from 'vitest';
import { Gender, MaterialType, PlatingType, Product, ProductionType } from '../../types';
import { calculateProductCost } from '../../utils/pricingEngine';
import {
  applySkipCasting,
  buildEditableProduct,
  getAvailableMolds,
  getImportedCostAnalysisDisplay,
  getRecipeMaterialSubtitle,
  getProductDisplaySummary,
  getSecondaryWeightLabel,
  getSortedProductVariants,
  getVariantIndexBySuffix,
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
  it('zeros casting weights when skip_casting is enabled', () => {
    const product = applySkipCasting(makeProduct({ weight_g: 3.1, secondary_weight_g: 0.8 }), true);
    expect(product.skip_casting).toBe(true);
    expect(product.weight_g).toBe(0);
    expect(product.secondary_weight_g).toBe(0);
  });

  it('keeps existing weights when skip_casting is turned off', () => {
    const product = applySkipCasting(makeProduct({ skip_casting: true, weight_g: 2 }), false);
    expect(product.skip_casting).toBe(false);
    expect(product.weight_g).toBe(2);
  });

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
    expect(editable.skip_casting).toBe(false);
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

  it('selects the exact scanned suffix in the sorted variant list', () => {
    const product = makeProduct({
      sku: 'RN150',
      variants: [
        { suffix: 'XKO', description: 'Gold red stone', stock_qty: 1 },
        { suffix: '', description: 'Lustre', stock_qty: 1 },
        { suffix: 'PTG', description: 'Patina tiger eye', stock_qty: 1 },
      ],
    });
    const sorted = getSortedProductVariants(product, product.variants || []);

    expect(sorted.map((variant) => variant.suffix)).toEqual(['', 'PTG', 'XKO']);
    expect(getVariantIndexBySuffix(sorted, 'xko')).toBe(2);
    expect(getVariantIndexBySuffix(sorted, '')).toBe(0);
    expect(getVariantIndexBySuffix(sorted, 'missing')).toBe(0);
    expect(getVariantIndexBySuffix(sorted)).toBe(0);
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

  it('hides LSTX molds unless the search explicitly targets them', () => {
    const molds = [
      { code: 'L12', description: 'Κανονικό' },
      { code: 'LSTX01', description: 'Ειδικό' },
    ] as any[];

    expect(getAvailableMolds(molds, [], '').map((mold) => mold.code)).toEqual(['L12']);
    expect(getAvailableMolds(molds, [], 'LSTX').map((mold) => mold.code)).toEqual(['LSTX01']);
  });

  it('uses material descriptions in recipe rows and Greek type labels as fallback', () => {
    expect(
      getRecipeMaterialSubtitle({
        description: 'Όνυχας Ταγέ 3mm',
        type: MaterialType.Cord,
      } as any),
    ).toBe('Όνυχας Ταγέ 3mm');

    expect(
      getRecipeMaterialSubtitle({
        description: '',
        type: MaterialType.Stone,
      } as any),
    ).toBe('Πέτρα');

    expect(
      getRecipeMaterialSubtitle({
        type: MaterialType.Cord,
      } as any),
    ).toBe('Κορδόνι');
  });

  it('shows imported plating from the cost engine so the analysis card adds up', () => {
    const product = makeProduct({
      sku: 'RN221',
      production_type: ProductionType.Imported,
      weight_g: 2.6,
      labor: {
        ...makeProduct().labor,
        technician_cost: 1.2,
        plating_cost_x: 0.6,
      },
    });
    const costCalc = calculateProductCost(product, { silver_price_gram: 2.5 } as any, [], []);
    const display = getImportedCostAnalysisDisplay(costCalc);

    expect(costCalc.total).toBe(11.2);
    expect(display.silver).toBeCloseTo(6.5, 4);
    expect(display.technician).toBeCloseTo(3.12, 4);
    expect(display.plating).toBeCloseTo(1.56, 4);
    expect(display.stoneSetting).toBe(0);
    expect(display.weightG).toBeCloseTo(2.6, 4);
    expect(display.silver + display.technician + display.plating + display.stoneSetting)
      .toBeCloseTo(costCalc.rawTotal, 4);
  });
});
