import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, ProductionType } from '../../types';
import {
  normalizeVariantSuffix,
  resolveFinanceLineSku,
  variantRankingKey,
} from '../../utils/financeLineSku';

function product(sku: string, variants?: { suffix: string }[]) {
  return {
    sku,
    prefix: sku.slice(0, 2),
    category: 'Δαχτυλίδι',
    gender: Gender.Women,
    image_url: null,
    weight_g: 5,
    plating_type: PlatingType.None,
    production_type: ProductionType.InHouse,
    active_price: 10,
    draft_price: 10,
    selling_price: 30,
    stock_qty: 0,
    sample_qty: 0,
    molds: [],
    is_component: false,
    variants: variants?.map((v) => ({ ...v, description: '', stock_qty: 0, selling_price: 30 })),
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
  };
}

describe('financeLineSku', () => {
  it('normalizes variant suffix to uppercase', () => {
    expect(normalizeVariantSuffix('xtg')).toBe('XTG');
    expect(variantRankingKey('RN045', 'xtg')).toBe('RN045::XTG');
  });

  it('uses the normalized note only for SP ranking identity', () => {
    expect(variantRankingKey('SP', '', '  ΜΟΝΌΓΡΑΜΜΑ  ')).toBe(variantRankingKey('SP', '', 'μονόγραμμα'));
    expect(variantRankingKey('SP', '', 'Καρφίτσα')).not.toBe(variantRankingKey('SP', '', 'Μενταγιόν'));
    expect(variantRankingKey('RN045', 'X', 'ignored')).toBe(variantRankingKey('RN045', 'X'));
  });

  it('splits full sku when variant_suffix is missing', () => {
    const products = [product('RN045', [{ suffix: 'XTG' }, { suffix: 'TG' }])];
    const map = new Map(products.map((p) => [p.sku, p]));
    const resolved = resolveFinanceLineSku({ sku: 'RN045XTG', variant_suffix: null }, products, map);
    expect(resolved).toMatchObject({ masterSku: 'RN045', variantSuffix: 'XTG' });
  });

  it('resolves scanned full code via findProductByScannedCode', () => {
    const products = [product('DA752', [{ suffix: 'X' }, { suffix: 'XTG' }])];
    const map = new Map(products.map((p) => [p.sku, p]));
    const resolved = resolveFinanceLineSku({ sku: 'DA752XTG', variant_suffix: '' }, products, map);
    expect(resolved.masterSku).toBe('DA752');
    expect(resolved.variantSuffix).toBe('XTG');
  });

  it('keeps explicit suffix on master sku', () => {
    const products = [product('DA752', [{ suffix: 'XTG' }])];
    const map = new Map(products.map((p) => [p.sku, p]));
    const resolved = resolveFinanceLineSku({ sku: 'DA752', variant_suffix: 'xtg' }, products, map);
    expect(resolved).toMatchObject({ masterSku: 'DA752', variantSuffix: 'XTG' });
  });
});
