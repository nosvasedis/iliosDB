import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, Product, ProductionType } from '../../types';
import { findDuplicateSkuIdentity } from '../../features/products/skuDuplicateValidation';

const makeProduct = (sku: string, suffixes: string[] = []): Product => ({
  sku,
  prefix: sku.slice(0, 2),
  category: 'Test',
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
  variants: suffixes.map((suffix) => ({
    suffix,
    description: suffix,
    stock_qty: 0,
  })),
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
});

describe('findDuplicateSkuIdentity', () => {
  it('blocks an existing master SKU', () => {
    const duplicate = findDuplicateSkuIdentity({
      rawSku: ' da050 ',
      finalMasterSku: 'DA050',
      finalVariants: [],
      products: [makeProduct('DA050')],
    });

    expect(duplicate?.existingFullSku).toBe('DA050');
    expect(duplicate?.kind).toBe('master');
  });

  it('blocks an existing full variant SKU', () => {
    const duplicate = findDuplicateSkuIdentity({
      rawSku: 'DA050PCO',
      finalMasterSku: 'DA050',
      finalVariants: [{ suffix: 'PCO', description: '', stock_qty: 0 }],
      products: [makeProduct('DA050', ['PCO'])],
    });

    expect(duplicate?.existingFullSku).toBe('DA050PCO');
    expect(duplicate?.kind).toBe('variant');
  });

  it('blocks a new suffix when the parsed master already exists', () => {
    const duplicate = findDuplicateSkuIdentity({
      rawSku: 'DA050PAK',
      finalMasterSku: 'DA050',
      finalVariants: [{ suffix: 'PAK', description: '', stock_qty: 0 }],
      products: [makeProduct('DA050', ['PCO'])],
    });

    expect(duplicate?.existingFullSku).toBe('DA050');
    expect(duplicate?.kind).toBe('master');
  });

  it('understands master prefixes before finish suffixes', () => {
    const duplicate = findDuplicateSkuIdentity({
      rawSku: 'DA752SDLE',
      finalMasterSku: 'DA752S',
      finalVariants: [{ suffix: 'DLE', description: '', stock_qty: 0 }],
      products: [makeProduct('DA752S', ['DLE'])],
    });

    expect(duplicate?.existingFullSku).toBe('DA752SDLE');
  });
});
