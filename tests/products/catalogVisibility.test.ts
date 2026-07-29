import { describe, expect, it } from 'vitest';
import { isVisibleProductCatalogRow } from '../../features/products/catalogVisibility';

describe('product catalog visibility', () => {
  it('hides every legal-only or reserved 000 row from the product registry', () => {
    expect(isVisibleProductCatalogRow({
      sku: '000',
      prefix: '000',
      legal_only: true,
    })).toBe(false);
    expect(isVisibleProductCatalogRow({
      sku: '000',
      prefix: '000',
      legal_only: false,
    })).toBe(false);
    expect(isVisibleProductCatalogRow({
      sku: 'RNG001',
      prefix: '000',
      legal_only: false,
    })).toBe(false);
  });

  it('keeps ordinary products visible', () => {
    expect(isVisibleProductCatalogRow({
      sku: 'RNG001',
      prefix: 'RNG',
      legal_only: false,
    })).toBe(true);
  });
});
