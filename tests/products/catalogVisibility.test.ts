import { describe, expect, it } from 'vitest';
import { isVisibleProductCatalogRow } from '../../features/products/catalogVisibility';

describe('product catalog visibility', () => {
  it('hides reserved legal-only 000 and 001 rows from the product registry', () => {
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
    expect(isVisibleProductCatalogRow({
      sku: '001',
      prefix: '001',
      legal_only: true,
    })).toBe(false);
    expect(isVisibleProductCatalogRow({
      sku: '001',
      prefix: '001',
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
