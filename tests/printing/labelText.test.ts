import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, ProductionType, Product, ProductVariant } from '../../types';
import {
  buildLabelText,
  composeStandardLabelPriceLine,
  formatStandardLabelSize,
  getLabelSourceSku,
  type LabelTextOverrides,
} from '../../features/printing/labelText';
import { SIZE_TYPE_LENGTH, SIZE_TYPE_NUMBER } from '../../utils/sizing';

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  sku: 'DA050',
  prefix: 'DA',
  category: 'Ring',
  description: '',
  gender: Gender.Women,
  image_url: null,
  weight_g: 1,
  plating_type: PlatingType.None,
  production_type: ProductionType.InHouse,
  active_price: 10,
  draft_price: 10,
  selling_price: 10,
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

const makeVariant = (overrides: Partial<ProductVariant> = {}): ProductVariant => ({
  suffix: 'XKR',
  description: 'Gold - Κοράλλι',
  stock_qty: 0,
  selling_price: 20,
  ...overrides,
});

describe('label text helpers', () => {
  it('formats numbered ring sizes without duplicating an existing No prefix', () => {
    expect(formatStandardLabelSize('53', SIZE_TYPE_NUMBER)).toBe('No53');
    expect(formatStandardLabelSize('No. 53', SIZE_TYPE_NUMBER)).toBe('No53');
  });

  it('formats bracelet lengths with exactly one cm suffix', () => {
    expect(formatStandardLabelSize('19', SIZE_TYPE_LENGTH)).toBe('19cm');
    expect(formatStandardLabelSize('19cm', SIZE_TYPE_LENGTH)).toBe('19cm');
    expect(formatStandardLabelSize('19 CM ', SIZE_TYPE_LENGTH)).toBe('19cm');
  });

  it('composes price and size only with the separators that are needed', () => {
    expect(composeStandardLabelPriceLine('20,00€', '53', SIZE_TYPE_NUMBER)).toBe('20,00€ / No53');
    expect(composeStandardLabelPriceLine('20,00€', '', SIZE_TYPE_NUMBER)).toBe('20,00€');
    expect(composeStandardLabelPriceLine('', '53', SIZE_TYPE_NUMBER)).toBe('No53');
    expect(composeStandardLabelPriceLine('18,00€', '53', undefined)).toBe('18,00€');
  });

  it('builds standard label text from the current product and variant defaults', () => {
    const text = buildLabelText({
      product: makeProduct(),
      variant: makeVariant(),
      format: 'standard',
      showPrice: true,
      priceTier: 'wholesale',
    });

    expect(text).toMatchObject({
      displaySku: 'DA050XKR',
      stone: 'Gold - Κοράλλι',
      brand: 'ILIOS',
      price: '20,00€',
      metal: '925°',
    });
  });

  it('applies printed-text overrides without changing the source SKU encoded in the QR', () => {
    const product = makeProduct();
    const variant = makeVariant();
    const overrides: LabelTextOverrides = {
      displaySku: 'SPECIAL-ONE',
      stone: 'Custom stone',
      brand: 'ILI',
      price: '€18',
      metal: '',
      size: '54',
    };

    const text = buildLabelText({
      product,
      variant,
      format: 'standard',
      showPrice: true,
      priceTier: 'wholesale',
      size: '52',
      overrides,
    });

    expect(text).toMatchObject({
      displaySku: 'SPECIAL-ONE',
      stone: 'Custom stone',
      brand: 'ILI',
      price: '€18',
      metal: '',
      size: '54',
    });
    expect(getLabelSourceSku(product, variant)).toBe('DA050XKR');
  });

  it('allows blank overrides to hide optional printed fields', () => {
    const text = buildLabelText({
      product: makeProduct(),
      variant: makeVariant(),
      format: 'standard',
      showPrice: true,
      priceTier: 'wholesale',
      overrides: {
        stone: '',
        price: '',
      },
    });

    expect(text.stone).toBe('');
    expect(text.price).toBe('');
  });
});
