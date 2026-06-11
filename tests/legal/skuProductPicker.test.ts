import { describe, expect, it } from 'vitest';
import { ProductionType } from '../../types';
import { searchSkuProductOptions } from '../../utils/skuProductPicker';

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
    variants: [
      { suffix: '', description: 'Base ring', selling_price: 120, stock_qty: 5, stock_by_size: {}, location_stock: {} },
      { suffix: 'DLE', description: 'Gold plated ring', selling_price: 145, stock_qty: 3, stock_by_size: {}, location_stock: {} },
    ],
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
    variants: [],
  },
];

describe('sku product picker search', () => {
  it('returns variant rows with suffix-specific prices', () => {
    const options = searchSkuProductOptions(products, 'RNG001D', true, 8);
    const variant = options.find((option) => option.displaySku === 'RNG001DLE');
    expect(variant?.price).toBe(145);
    expect(variant?.variant_suffix).toBe('DLE');
  });

  it('exposes MANUAL when the query matches it', () => {
    const options = searchSkuProductOptions(products, 'MA', true, 5);
    expect(options.some((option) => option.sku === 'MANUAL')).toBe(true);
  });
});
