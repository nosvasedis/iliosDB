import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, Product, ProductVariant, ProductionType } from '../../types';
import {
  buildProductSearchIndex,
  computeSmartSkuSuggestions,
  getActiveMasterSetMates,
  getCollectionCoreSiblings,
  getFamilyClusterSiblings,
  parseMasterSkuParts,
} from '../../features/orders/smartSkuSuggestions';

const makeProduct = (overrides: Partial<Product>): Product =>
  ({
    sku: 'PN1',
    prefix: 'PN',
    category: 'Μενταγιόν',
    gender: Gender.Men,
    image_url: null,
    weight_g: 1,
    plating_type: PlatingType.None,
    production_type: ProductionType.InHouse,
    active_price: 0,
    draft_price: 0,
    selling_price: 12,
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
    variants: [],
    ...overrides,
  }) as Product;

describe('smartSkuSuggestions', () => {
  it('parses master SKU letter and digit core', () => {
    expect(parseMasterSkuParts('DA023')).toEqual({ letters: 'DA', digits: '023', num: 23 });
    expect(parseMasterSkuParts('SK025')).toEqual({ letters: 'SK', digits: '025', num: 25 });
  });

  it('indexes collection+core siblings', () => {
    const products = [
      makeProduct({ sku: 'SK025', collections: [7] }),
      makeProduct({ sku: 'DA025', collections: [7] }),
      makeProduct({ sku: 'ZZ999', collections: [7] }),
    ];
    const index = buildProductSearchIndex(products);
    const sk = index.skuMap.get('SK025')!;
    const sibs = getCollectionCoreSiblings(index, sk);
    expect(sibs.map((p) => p.sku).sort()).toEqual(['DA025']);
  });

  it('finds family cluster mates when mod100 matches and num >= 100', () => {
    const products = [
      makeProduct({ sku: 'RN302', collections: [1] }),
      makeProduct({ sku: 'RN402', collections: [1] }),
      makeProduct({ sku: 'PN302', collections: [1] }),
    ];
    const index = buildProductSearchIndex(products);
    const rn302 = index.skuMap.get('RN302')!;
    const family = getFamilyClusterSiblings(index, rn302);
    expect(family.map((p) => p.sku).sort()).toEqual(['RN402']);
  });

  it('computes suggestions with search, set, and order context sections', () => {
    const v: ProductVariant = { suffix: 'DPCO', description: 'Δοκιμή', stock_qty: 0 };
    const products = [
      makeProduct({ sku: 'SK025', collections: [5], variants: [v] }),
      makeProduct({ sku: 'DA025', collections: [5], variants: [v] }),
      makeProduct({ sku: 'MN099', collections: [] }),
    ];
    const index = buildProductSearchIndex(products);
    const result = computeSmartSkuSuggestions({
      index,
      skuPart: 'SK02',
      orderContextMasterSkus: [],
    });
    expect(result).not.toBeNull();
    const headers = result!.virtualRows.filter((r) => r.kind === 'header').map((r) => r.label);
    expect(headers).toContain('Από αναζήτηση');
    expect(headers).toContain('Ίδιο σετ (συλλογή)');
    const skus = result!.virtualRows.filter((r) => r.kind === 'product').map((r) => r.product.sku);
    expect(skus).toContain('DA025');
  });

  it('filters set mates by variant suffix when typing full code', () => {
    const v1: ProductVariant = { suffix: 'DPCO', description: 'A', stock_qty: 0 };
    const v2: ProductVariant = { suffix: 'PAK', description: 'B', stock_qty: 0 };
    const products = [
      makeProduct({ sku: 'SK025', collections: [3], variants: [v1, v2] }),
      makeProduct({ sku: 'DA025', collections: [3], variants: [v1] }),
      makeProduct({ sku: 'MN025', collections: [3], variants: [v2] }),
    ];
    const index = buildProductSearchIndex(products);
    const result = computeSmartSkuSuggestions({
      index,
      skuPart: 'SK025DPCO',
      orderContextMasterSkus: [],
    });
    expect(result).not.toBeNull();
    const setSkus = result!.virtualRows
      .filter((r) => r.kind === 'product' && r.sectionId === 'set')
      .map((r) => (r as { product: Product }).product.sku);
    expect(setSkus).toEqual(['DA025']);
    expect(setSkus).not.toContain('MN025');
  });

  it('merges order-context collection mates', () => {
    const products = [
      makeProduct({ sku: 'SK010', collections: [9] }),
      makeProduct({ sku: 'DA010', collections: [9] }),
    ];
    const index = buildProductSearchIndex(products);
    const result = computeSmartSkuSuggestions({
      index,
      skuPart: 'XY',
      orderContextMasterSkus: ['SK010'],
    });
    expect(result).not.toBeNull();
    const orderSkus = result!.virtualRows
      .filter((r) => r.kind === 'product' && r.sectionId === 'order')
      .map((r) => (r as { product: Product }).product.sku);
    expect(orderSkus).toContain('DA010');
  });

  it('getActiveMasterSetMates respects typed variant tail', () => {
    const v: ProductVariant = { suffix: 'DPCO', description: 'A', stock_qty: 0 };
    const products = [
      makeProduct({ sku: 'SK025', collections: [2], variants: [v] }),
      makeProduct({ sku: 'DA025', collections: [2], variants: [v] }),
      makeProduct({ sku: 'MN025', collections: [2], variants: [] }),
    ];
    const index = buildProductSearchIndex(products);
    const master = index.skuMap.get('SK025')!;
    const mates = getActiveMasterSetMates(index, master, 'SK025DPCO');
    expect(mates.map((p) => p.sku)).toEqual(['DA025']);
  });
});
