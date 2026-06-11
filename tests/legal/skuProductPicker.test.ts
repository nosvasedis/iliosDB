import { describe, expect, it } from 'vitest';
import { ProductionType } from '../../types';
import { searchSkuProductOptions } from '../../components/legal/SkuProductPicker';

const products = [
  {
    sku: 'RNG001',
    prefix: 'RNG',
    category: 'Ring',
    description: 'Silver ring',
    gender: 'Unisex' as const,
    image_url: null,
    weight_g: 2,
    plating_type: 'None' as const,
    production_type: ProductionType.InHouse,
    active_price: 100,
    draft_price: 100,
    selling_price: 120,
    stock_qty: 10,
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
    collections: [],
  },
  {
    sku: 'RNG010',
    prefix: 'RNG',
    category: 'Ring',
    description: 'Gold ring',
    gender: 'Unisex' as const,
    image_url: null,
    weight_g: 2,
    plating_type: 'None' as const,
    production_type: ProductionType.InHouse,
    active_price: 150,
    draft_price: 150,
    selling_price: 180,
    stock_qty: 5,
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
    collections: [],
  },
];

describe('SkuProductPicker search', () => {
  it('ranks SKU prefix matches and exposes MANUAL when relevant', () => {
    const skuMatches = searchSkuProductOptions(products, 'RNG', true, 5);
    expect(skuMatches[0]?.sku).toBe('RNG001');
    expect(skuMatches.some((option) => option.sku === 'RNG010')).toBe(true);

    const manualMatches = searchSkuProductOptions(products, 'MA', true, 5);
    expect(manualMatches[0]?.sku).toBe('MANUAL');
  });
});
