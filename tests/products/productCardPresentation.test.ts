import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, Product, ProductionType } from '../../types';
import {
  SKIP_CASTING_LABEL,
  buildProductCardWeightPresentation,
  canConvertToImported,
  formatRecipeItemCountLabel,
  formatRegistryWeight,
  shouldShowCardInvoiceTotal,
} from '../../features/products/productCardPresentation';
import type { InvoiceTotalWeightResult } from '../../utils/invoiceTotalWeight';

const invoice = (
  overrides: Partial<InvoiceTotalWeightResult> = {},
): InvoiceTotalWeightResult => ({
  value: 2.4,
  source: 'automatic',
  missingItems: [],
  ...overrides,
});

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
    expect(view.recipeItemCount).toBe(2);
    expect(view.recipeItemCountLabel).toBe('2 υλικά');
  });

  it('keeps a simple casting-weight display for ordinary in-house products', () => {
    const view = buildProductCardWeightPresentation(makeProduct({ weight_g: 2.4 }), new Map());
    expect(view.skipCasting).toBe(false);
    expect(view.primaryMode).toBe('simple');
    expect(view.showCastingWeight).toBe(true);
    expect(view.totalWeight).toBe(2.4);
    expect(view.recipeItemCount).toBe(1);
    expect(view.recipeItemCountLabel).toBe('1 υλικό');
  });

  it('allows converting in-house finished goods but not STX or imported products', () => {
    expect(canConvertToImported(makeProduct())).toBe(true);
    expect(canConvertToImported(makeProduct({ is_component: true }))).toBe(false);
    expect(canConvertToImported(makeProduct({ production_type: ProductionType.Imported }))).toBe(false);
  });

  it('uses singular Greek for one recipe material and plural otherwise', () => {
    expect(formatRecipeItemCountLabel(1)).toBe('1 υλικό');
    expect(formatRecipeItemCountLabel(2)).toBe('2 υλικά');
    expect(buildProductCardWeightPresentation(makeProduct(), new Map()).recipeItemCountLabel).toBe('1 υλικό');
  });

  it('hides the invoice total when it matches the metal weight on a single-material SKU', () => {
    expect(shouldShowCardInvoiceTotal(1, 2.4, invoice({ value: 2.4 }))).toBe(false);
    expect(shouldShowCardInvoiceTotal(1, 2.4, invoice({ value: 2.401 }))).toBe(false);
    expect(shouldShowCardInvoiceTotal(1, 2.4, invoice({ value: null, source: 'missing' }))).toBe(false);
  });

  it('shows the invoice total when extra materials change the physical weight', () => {
    expect(shouldShowCardInvoiceTotal(3, 3.7, invoice({ value: 4.15 }))).toBe(true);
  });

  it('hides a matching STX-only invoice total even with more than one recipe item', () => {
    expect(shouldShowCardInvoiceTotal(2, 3, invoice({ value: 3 }))).toBe(false);
  });

  it('shows a missing invoice total only when the recipe has extra items', () => {
    expect(shouldShowCardInvoiceTotal(2, 2.4, invoice({ value: null, source: 'missing' }))).toBe(true);
  });

  it('shows a manual invoice override that differs from the metal weight', () => {
    expect(shouldShowCardInvoiceTotal(1, 2.4, invoice({ value: 5.5, source: 'manual' }))).toBe(true);
  });
});
