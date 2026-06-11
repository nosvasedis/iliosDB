import { describe, expect, it } from 'vitest';
import { ProductionType } from '../../types';
import {
  allowsBareMasterSkuResolution,
  isLustreOnlyProduct,
  resolveTypedSkuSelection,
  searchSkuProductOptions,
} from '../../utils/skuProductPicker';

const labor = {
  casting_cost: 0,
  setter_cost: 0,
  technician_cost: 0,
  stone_setting_cost: 0,
  plating_cost_x: 0,
  plating_cost_d: 0,
  subcontract_cost: 0,
};

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
    labor,
    collections: [],
    variants: [
      { suffix: '', description: 'Λουστρέ', selling_price: 120, stock_qty: 5, stock_by_size: {}, location_stock: {} },
      { suffix: 'DLE', description: 'Gold plated ring', selling_price: 145, stock_qty: 3, stock_by_size: {}, location_stock: {} },
    ],
  },
  {
    sku: 'RNG010',
    prefix: 'RNG',
    category: 'Ring',
    description: 'Lustre ring',
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
    labor,
    collections: [],
    variants: [
      { suffix: '', description: 'Λουστρέ', selling_price: 180, stock_qty: 2, stock_by_size: {}, location_stock: {} },
      { suffix: 'TG', description: 'Λουστρέ - Μάτι Τίγρης', selling_price: 185, stock_qty: 2, stock_by_size: {}, location_stock: {} },
    ],
  },
  {
    sku: 'RNG020',
    prefix: 'RNG',
    category: 'Ring',
    description: 'Patina ring',
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
    labor,
    collections: [],
    variants: [
      { suffix: '', description: 'Λουστρέ', selling_price: 180, stock_qty: 2, stock_by_size: {}, location_stock: {} },
      { suffix: 'PDLE', description: 'Πατίνα - Δαχτυλίδι', selling_price: 185, stock_qty: 2, stock_by_size: {}, location_stock: {} },
    ],
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

  it('blocks bare master resolution when metal-finish variants exist', () => {
    expect(allowsBareMasterSkuResolution(products[2])).toBe(false);
    expect(isLustreOnlyProduct(products[2])).toBe(false);
    expect(resolveTypedSkuSelection('RNG020', products)).toBeNull();
    const options = searchSkuProductOptions(products, 'RNG020', true, 12);
    expect(options.some((option) => option.displaySku === 'RNG020' && option.variant_suffix === '')).toBe(true);
    expect(options.some((option) => option.displaySku === 'RNG020PDLE')).toBe(true);
  });

  it('allows bare master for lustre-only catalogs with an empty-suffix row', () => {
    expect(allowsBareMasterSkuResolution(products[1])).toBe(true);
    expect(isLustreOnlyProduct(products[1])).toBe(true);
    const resolved = resolveTypedSkuSelection('RNG010', products);
    expect(resolved).toMatchObject({ sku: 'RNG010', variant_suffix: null, displaySku: 'RNG010' });
  });

  it('rejects bare master when only stone lustre variants exist', () => {
    const lustreStonesOnly = [{
      ...products[1],
      sku: 'RNG030',
      variants: [
        { suffix: 'TG', description: 'Λουστρέ - Μάτι Τίγρης', selling_price: 185, stock_qty: 2, stock_by_size: {}, location_stock: {} },
        { suffix: 'AK', description: 'Λουστρέ - Ακάι', selling_price: 190, stock_qty: 2, stock_by_size: {}, location_stock: {} },
      ],
    }];
    expect(allowsBareMasterSkuResolution(lustreStonesOnly[0])).toBe(false);
    expect(resolveTypedSkuSelection('RNG030', lustreStonesOnly)).toBeNull();
  });
});
