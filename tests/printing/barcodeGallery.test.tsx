import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BarcodeGallery from '../../components/ProductRegistry/BarcodeGallery';
import { INITIAL_SETTINGS } from '../../constants';
import { Gender, PlatingType, ProductionType, Product, ProductVariant } from '../../types';

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

describe('registry BarcodeGallery', () => {
  it('shows bulk-print label controls and the selected wholesale price on previews', () => {
    const html = renderToStaticMarkup(
      <BarcodeGallery
        product={makeProduct()}
        variants={[makeVariant()]}
        onPrint={() => {}}
        settings={INITIAL_SETTINGS}
      />,
    );

    expect(html).toContain('Εμφάνιση τιμής');
    expect(html).toContain('Τιμή ετικέτας');
    expect(html).toContain('Λιανική ×3');
    expect(html).toContain('Προεπισκόπηση / επεξεργασία ετικέτας');
    expect(html).toContain('20,00€');
  });
});
