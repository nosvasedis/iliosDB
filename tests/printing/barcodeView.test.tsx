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
  it('renders a DM ring size inline with the larger standard-label price', () => {
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
    expect(html).toContain('20,00€ / No53');
    expect(html).toContain('data-label-price-line="wholesale"');
    expect(html).toContain('font-size:3.8mm');
    expect(html).not.toContain('>53</span>');
  });

  it('renders bracelet sizes with one cm suffix on standard labels', () => {
    const html = renderToStaticMarkup(
      <BarcodeView
        product={makeProduct({ sku: 'BR100', prefix: 'BR', category: 'Bracelet' })}
        variant={makeVariant()}
        width={50}
        height={30}
        format="standard"
        size="19cm"
        showPrice
        priceTier="wholesale"
      />,
    );

    expect(html).toContain('20,00€ / 19cm');
    expect(html).not.toContain('19cmcm');
  });

  it('keeps the price large while rendering the size smaller and italicized', () => {
    const html = renderToStaticMarkup(
      <BarcodeView
        product={makeProduct({ sku: 'RN150', prefix: 'RN' })}
        variant={makeVariant({ suffix: 'P' })}
        width={50}
        height={30}
        format="standard"
        size="53"
        showPrice
        labelOverrides={{ price: '40,30€' }}
      />,
    );

    expect(html).toContain('aria-label="40,30€ / No53"');
    expect(html).toContain('grid-template-columns:auto minmax(0, 1fr) auto');
    expect(html).toContain('font-size:0.72em;font-style:italic');
    expect(html).toContain('>No53</span>');
  });

  it('keeps a formatted size visible when standard-label price display is disabled', () => {
    const html = renderToStaticMarkup(
      <BarcodeView
        product={makeProduct()}
        variant={makeVariant()}
        width={50}
        height={30}
        format="standard"
        size="53"
        showPrice={false}
      />,
    );

    expect(html).toContain('>No53</span>');
    expect(html).not.toContain('/ No53');
  });

  it('preserves the existing standalone size treatment on retail labels', () => {
    const html = renderToStaticMarkup(
      <BarcodeView
        product={makeProduct()}
        variant={makeVariant()}
        width={72}
        height={10}
        format="retail"
        size="53"
        showPrice
        priceTier="retail"
      />,
    );

    expect(html).toContain('60,00€');
    expect(html).toContain('>53</div>');
    expect(html).not.toContain('/ No53');
    expect(html).not.toContain('data-label-price-line="wholesale"');
  });
});
