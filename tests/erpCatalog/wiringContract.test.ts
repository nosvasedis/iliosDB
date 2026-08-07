import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ERP catalogue wiring contracts', () => {
  it('routes ERP product-graph realtime through SKU refresh', () => {
    const source = readFileSync(
      resolve(__dirname, '../../hooks/api/useRealtimeInvalidation.ts'),
      'utf8',
    );
    expect(source).toContain('ERP_CATALOG_REALTIME_TABLES');
    expect(source).toContain('createErpCatalogRealtimeScheduler');
    expect(source).toContain('refreshErpProducts');
    expect(source).toContain('shouldRefreshErpCatalog');
  });

  it('uses SKU refresh on product mutation hooks', () => {
    const source = readFileSync(
      resolve(__dirname, '../../hooks/api/useProducts.ts'),
      'utf8',
    );
    expect(source).toContain('refreshErpProducts');
    expect(source).toContain('removeProductsFromCache');
  });
});
