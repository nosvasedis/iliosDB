import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, ProductionType, Product, ProductVariant } from '../../types';
import {
  buildLabelText,
  getLabelSourceSku,
  type LabelTextOverrides,
} from '../../features/printing/labelText';

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
