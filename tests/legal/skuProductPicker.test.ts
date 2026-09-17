import { describe, expect, it } from 'vitest';
import { ProductionType } from '../../types';
import {
  SKU_PICKER_DROPDOWN_Z_INDEX,
  allowsBareMasterSkuResolution,
  getCatalogSelectionPricing,
  isSkuProductSelectionInCatalog,
  isLustreOnlyProduct,
  resolveTypedSkuColorParts,
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
  it('ranks an exact full variant SKU first', () => {
    const options = searchSkuProductOptions(products, 'RNG001DLE', 8);
    expect(options[0]?.displaySku).toBe('RNG001DLE');
  });

  it('returns variant rows with suffix-specific prices', () => {
    const options = searchSkuProductOptions(products, 'RNG001D', 8);
    const variant = options.find((option) => option.displaySku === 'RNG001DLE');
    expect(variant?.price).toBe(145);
    expect(variant?.variant_suffix).toBe('DLE');
  });

  it('blocks a bare master when multiple variants exist without an explicit lustre row', () => {
    const ambiguous = [{
      ...products[2],
      sku: 'RN001',
      variants: [
        { suffix: 'P', description: 'Πατίνα', selling_price: 185, stock_qty: 2, stock_by_size: {}, location_stock: {} },
        { suffix: 'H', description: 'Επιπλατινωμένο', selling_price: 195, stock_qty: 2, stock_by_size: {}, location_stock: {} },
      ],
    }];

    expect(allowsBareMasterSkuResolution(ambiguous[0])).toBe(false);
    expect(resolveTypedSkuSelection('RN001', ambiguous)).toBeNull();
    const options = searchSkuProductOptions(ambiguous, 'RN001', 12);
    expect(options.some((option) => option.displaySku === 'RN001')).toBe(false);
    expect(options.map((option) => option.displaySku)).toEqual(['RN001H', 'RN001P']);
  });

  it('shows and resolves explicit lustre variants alongside H and X variants', () => {
    const st9845 = [{
      ...products[0],
      sku: 'ST9845',
      variants: [
        { suffix: '', description: 'Λουστρέ', selling_price: 120, stock_qty: 2, stock_by_size: {}, location_stock: {} },
        { suffix: 'H', description: 'Επιπλατινωμένο', selling_price: 140, stock_qty: 2, stock_by_size: {}, location_stock: {} },
        { suffix: 'X', description: 'Επίχρυσο', selling_price: 150, stock_qty: 2, stock_by_size: {}, location_stock: {} },
      ],
    }];

    expect(allowsBareMasterSkuResolution(st9845[0])).toBe(true);
    expect(resolveTypedSkuSelection('ST9845', st9845)).toMatchObject({
      sku: 'ST9845',
      variant_suffix: null,
      displaySku: 'ST9845',
    });
    expect(searchSkuProductOptions(st9845, 'ST9845', 12).map((option) => option.displaySku))
      .toEqual(['ST9845', 'ST9845H', 'ST9845X']);
    expect(searchSkuProductOptions(st9845, 'ST9845', 12)[0]).toMatchObject({
      hint: 'Λουστρέ',
      price: 120,
    });
  });

  it('resolves a bare master to its sole concrete variant and price', () => {
    const unique = [{
      ...products[0],
      sku: 'RN161',
      variants: [
        { suffix: 'P', description: 'Μοναδική παραλλαγή', selling_price: 199, stock_qty: 2, stock_by_size: {}, location_stock: {} },
      ],
    }];

    expect(allowsBareMasterSkuResolution(unique[0])).toBe(true);
    expect(resolveTypedSkuSelection('RN161', unique)).toMatchObject({
      sku: 'RN161',
      variant_suffix: 'P',
      displaySku: 'RN161P',
    });
    expect(searchSkuProductOptions(unique, 'RN161', 12)[0]).toMatchObject({
      displaySku: 'RN161P',
      price: 199,
    });
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
    expect(searchSkuProductOptions(lustreStonesOnly, 'RNG030', 12).map((option) => option.displaySku))
      .toEqual(['RNG030AK', 'RNG030TG']);
  });

  it('resolves variant-specific cost and selling price together', () => {
    const pricedProducts = [{
      ...products[0],
      variants: products[0].variants.map((variant) => variant.suffix === 'DLE'
        ? { ...variant, active_price: 88.4, selling_price: 145.5 }
        : variant),
    }];

    expect(getCatalogSelectionPricing(pricedProducts, {
      sku: 'RNG001',
      variant_suffix: 'DLE',
    })).toMatchObject({
      unitCost: 88.4,
      unitPrice: 145.5,
    });
  });

  it('does not fall back to a shorter master after an invalid suffix was typed', () => {
    const xr122 = [{
      ...products[0],
      sku: 'XR122',
      variants: [
        { suffix: 'P', description: 'Πατίνα', selling_price: 145, stock_qty: 2, stock_by_size: {}, location_stock: {} },
        { suffix: 'H', description: 'Επιπλατινωμένο', selling_price: 155, stock_qty: 2, stock_by_size: {}, location_stock: {} },
      ],
    }];

    expect(searchSkuProductOptions(xr122, 'XR1220H', 12)).toEqual([]);
    expect(resolveTypedSkuSelection('XR1220H', xr122)).toBeNull();
    expect(resolveTypedSkuSelection('XR122H', xr122)).toMatchObject({
      sku: 'XR122',
      variant_suffix: 'H',
      displaySku: 'XR122H',
    });
  });

  it('validates both the master and the exact suffix before catalog commit', () => {
    expect(isSkuProductSelectionInCatalog(products, { sku: 'RNG001', variant_suffix: 'DLE' })).toBe(true);
    expect(isSkuProductSelectionInCatalog(products, { sku: 'RNG001', variant_suffix: '0H' })).toBe(false);
    expect(isSkuProductSelectionInCatalog(products, { sku: 'XR1220H', variant_suffix: null })).toBe(false);
  });

  it('can search component SKUs only when the picker requests that catalog scope', () => {
    const component = {
      ...products[0],
      sku: 'CMP001',
      is_component: true,
      variants: [],
      active_price: 3.2,
      selling_price: 4.8,
    };
    const catalog = [...products, component];

    expect(searchSkuProductOptions(catalog, 'CMP001')).toHaveLength(0);
    expect(searchSkuProductOptions(catalog, 'CMP001', 12, { scope: 'components' })[0]?.sku).toBe('CMP001');
    expect(resolveTypedSkuSelection('CMP001', catalog, { scope: 'components' })).toMatchObject({
      sku: 'CMP001',
      variant_suffix: null,
    });
  });
});

describe('live SKU color overlay while typing', () => {
  it('keeps the suggestion layer above customer-service modals', () => {
    expect(SKU_PICKER_DROPDOWN_Z_INDEX).toBeGreaterThanOrEqual(300);
  });

  it('splits a typed full variant so finish and stone can be color-coded as the user types', () => {
    expect(resolveTypedSkuColorParts('RNG001DLE', products)).toMatchObject({
      master: 'RNG001',
      suffix: 'DLE',
    });
  });

  it('keeps a partial suffix attached to the matching master while typing', () => {
    expect(resolveTypedSkuColorParts('RNG001D', products)).toMatchObject({
      master: 'RNG001',
      suffix: 'D',
    });
  });

  it('falls back to heuristic split when the catalog has no matching master yet', () => {
    expect(resolveTypedSkuColorParts('SK', products)).toMatchObject({
      master: 'SK',
      suffix: '',
    });
  });
});
