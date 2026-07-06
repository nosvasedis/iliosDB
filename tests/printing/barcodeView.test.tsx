import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BarcodeView from '../../components/BarcodeView';
import { Gender, PlatingType, ProductionType, Product, ProductVariant } from '../../types';

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  sku: 'DM036',
  prefix: 'DM',
  category: 'Ring',
  description: '',
  gender: Gender.Women,
  image_url: null,
  weight_g: 1,
  plating_type: PlatingType.None,
  production_type: ProductionType.Imported,
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
  suffix: 'H',
  description: 'Platinum',
  stock_qty: 0,
  selling_price: 20,
  ...overrides,
});

describe('BarcodeView', () => {
  it('renders DM ring sizes on standard labels', () => {
    const html = renderToStaticMarkup(
      <BarcodeView
        product={makeProduct()}
        variant={makeVariant()}
        width={50}
        height={30}
        format="standard"
        size="53"
        showPrice
        priceTier="wholesale"
      />,
    );

    expect(html).toContain('DM036H');
    expect(html).toContain('53');
  });
});
