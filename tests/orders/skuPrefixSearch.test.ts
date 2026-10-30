import { describe, expect, it } from 'vitest';
import type { Product } from '../../types';
import { productHasVariantPrefix, searchMastersByPrefix } from '../../features/orders/skuPrefixSearch';
import { isOrionCollectionName, parseMasterSkuParts } from '../../features/orders/skuParts';

const product = (sku: string, extra: Partial<Product> = {}) => ({ sku, ...extra }) as Product;

describe('searchMastersByPrefix', () => {
  const products = [
    product('SK233'),
    product('BR333', { collections: [1] }),
    product('SK2331'),
    product('SK230'),
    product('SK23'),
    product('XSK233'),
    product('SK234', { is_component: true }),
  ];

  it('only returns SKUs that literally start with the typed term, in natural order', () => {
    const res = searchMastersByPrefix(products, 'sk23');
    expect(res?.products.map((p) => p.sku)).toEqual(['SK23', 'SK230', 'SK233', 'SK2331']);
    expect(res?.total).toBe(4);
    expect(res?.term).toBe('SK23');
  });

  it('never offers related-series SKUs', () => {
    const res = searchMastersByPrefix(products, 'SK233');
    expect(res?.products.map((p) => p.sku)).toEqual(['SK233', 'SK2331']);
  });

  it('caps the list but reports the full total', () => {
    const many = Array.from({ length: 40 }, (_, i) => product(`RN${100 + i}`));
    const res = searchMastersByPrefix(many, 'RN', 10);
    expect(res?.products).toHaveLength(10);
    expect(res?.total).toBe(40);
  });

  it('ignores terms shorter than two characters', () => {
    expect(searchMastersByPrefix(products, 'S')).toBeNull();
  });
});

describe('productHasVariantPrefix', () => {
  it('matches exact or prefix variant suffixes', () => {
    const p = product('SK1', { variants: [{ suffix: 'PCO', description: '', stock_qty: 0 }] });
    expect(productHasVariantPrefix(p, 'P')).toBe(true);
    expect(productHasVariantPrefix(p, 'PCO')).toBe(true);
    expect(productHasVariantPrefix(p, 'X')).toBe(false);
    expect(productHasVariantPrefix(p, null)).toBe(true);
  });
});

describe('skuParts', () => {
  it('parses master SKU letter and digit core', () => {
    expect(parseMasterSkuParts('DA023')).toEqual({ letters: 'DA', digits: '023', num: 23 });
    expect(parseMasterSkuParts('SK025')).toEqual({ letters: 'SK', digits: '025', num: 25 });
    expect(parseMasterSkuParts('??')).toBeNull();
  });

  it('detects Ωρίων / Orion collection names', () => {
    expect(isOrionCollectionName('Ωρίων')).toBe(true);
    expect(isOrionCollectionName('orion gold')).toBe(true);
    expect(isOrionCollectionName('Άλλη σειρά')).toBe(false);
  });
});
