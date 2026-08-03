import { describe, expect, it } from 'vitest';
import { Gender, ProductionType } from '../../types';
import {
  buildSellerCatalogIndex,
  buildSellerCollectionSummaries,
  isSellerCatalogSnapshot,
  mergeSellerCatalogSnapshot,
  parseSellerCatalogRpcSnapshot,
  selectSellerCatalogProducts,
  SellerCatalogProduct,
  SellerCatalogSnapshot,
} from '../../features/sellerCatalog';

const rawProduct = (overrides: Record<string, unknown> = {}) => ({
  sku: 'BR100',
  category: 'Bracelet',
  gender: Gender.Women,
  image_url: 'catalog/br100.jpg',
  production_type: ProductionType.InHouse,
  created_at: '2026-01-01T00:00:00.000Z',
  selling_price: 20,
  stock_qty: 4,
  available_qty: 3,
  collection_ids: [1],
  variants: [{
    suffix: 'XON',
    description: 'Gold onyx',
    selling_price: 24,
    stock_qty: 2,
    available_qty: 1,
  }],
  ...overrides,
});

const rawSnapshot = (products: unknown[] = [rawProduct()]) => ({
  schema_version: 1,
  generated_at: '2026-08-03T09:00:00.000Z',
  products,
  collections: [{ id: 1, name: 'Core', description: 'Core range' }],
});

describe('seller catalogue snapshot mapper', () => {
  it('validates and maps the compact RPC response', () => {
    const snapshot = parseSellerCatalogRpcSnapshot(rawSnapshot(), 1234);

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.fullSyncedAt).toBe(1234);
    expect(snapshot.products[0].collections).toEqual([1]);
    expect(snapshot.products[0].image_url).toBe('https://ilios-image-handler.iliosdb.workers.dev/br100.jpg');
    expect(isSellerCatalogSnapshot(snapshot)).toBe(true);
  });

  it('rejects old, corrupt, and partially invalid snapshots', () => {
    expect(() => parseSellerCatalogRpcSnapshot({ ...rawSnapshot(), schema_version: 2 })).toThrow(/schema version/i);
    expect(() => parseSellerCatalogRpcSnapshot(rawSnapshot([rawProduct({ available_qty: 'bad' })]))).toThrow(/available_qty/i);
    expect(isSellerCatalogSnapshot({
      ...parseSellerCatalogRpcSnapshot(rawSnapshot()),
      products: [{ ...parseSellerCatalogRpcSnapshot(rawSnapshot()).products[0], variants: [{ suffix: 4 }] }],
    })).toBe(false);
  });
});

describe('seller catalogue local selectors', () => {
  it('indexes variant search, inventory, filters, and collection summaries once', () => {
    const snapshot = parseSellerCatalogRpcSnapshot(rawSnapshot());
    const index = buildSellerCatalogIndex(snapshot.products, (category) => category);

    expect(selectSellerCatalogProducts(index, {
      search: 'BR100XON',
      categoryGroup: 'All',
      gender: 'All',
      collection: 'All',
      finish: null,
      stone: null,
      stoneMode: 'with',
      productionType: 'All',
      onlyInStock: true,
      sortBy: 'sku',
    }).map((product) => product.sku)).toEqual(['BR100']);

    const summaries = buildSellerCollectionSummaries(snapshot.collections, snapshot.products);
    expect(summaries[0].products).toHaveLength(1);
    expect(summaries[0].previewProduct?.sku).toBe('BR100');
  });

  it('keeps filtering a representative 2,200 product / 7,500 variant fixture under 100ms', () => {
    const products: SellerCatalogProduct[] = Array.from({ length: 2200 }, (_, index) => {
      const variantCount = index < 900 ? 4 : 3;
      return {
        sku: `SKU${String(index).padStart(4, '0')}`,
        category: index % 2 ? 'Bracelet' : 'Ring',
        gender: index % 2 ? Gender.Women : Gender.Men,
        image_url: null,
        production_type: index % 3 ? ProductionType.InHouse : ProductionType.Imported,
        created_at: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
        selling_price: 10,
        stock_qty: 1,
        available_qty: index % 4 === 0 ? 0 : 1,
        collections: [index % 19],
        variants: Array.from({ length: variantCount }, (_, variantIndex) => ({
          suffix: ['XON', 'PAK', 'DLE', 'HCO'][variantIndex],
          description: '',
          selling_price: 10,
          stock_qty: 1,
          available_qty: variantIndex === 0 ? 1 : 0,
        })),
      };
    });
    expect(products.reduce((total, product) => total + product.variants.length, 0)).toBe(7500);
    const index = buildSellerCatalogIndex(products, (category) => category);
    const startedAt = performance.now();
    const result = selectSellerCatalogProducts(index, {
      search: 'sku21',
      categoryGroup: 'All',
      gender: Gender.Women,
      collection: 'All',
      finish: 'X',
      stone: null,
      stoneMode: 'with',
      productionType: 'All',
      onlyInStock: true,
      sortBy: 'sku',
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(100);
  });
});

describe('seller catalogue partial reconciliation', () => {
  it('merges changed products and removes requested products omitted by the RPC', () => {
    const base = parseSellerCatalogRpcSnapshot(rawSnapshot([rawProduct(), rawProduct({ sku: 'BR200' })]), 100);
    const partial = parseSellerCatalogRpcSnapshot(rawSnapshot([rawProduct({ sku: 'BR100', available_qty: 9 })]), 200);
    const merged = mergeSellerCatalogSnapshot(base, partial, ['BR100', 'BR200']);

    expect(merged.products).toHaveLength(1);
    expect(merged.products[0].available_qty).toBe(9);
    expect(merged.fullSyncedAt).toBe(100);
    expect(merged.generatedAt).toBe(partial.generatedAt);
  });
});
