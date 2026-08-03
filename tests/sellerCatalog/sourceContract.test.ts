import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('seller catalogue source contracts', () => {
  it('keeps the heavy product graph exclusive to order creation', () => {
    const sellerApp = source('components/seller/SellerApp.tsx');
    expect(sellerApp).toContain("const needsFullProducts = activePage === 'order-builder';");
    expect(sellerApp).toContain('queryFn: productsRepository.getProducts');
    expect(sellerApp).not.toContain("activePage === 'collections'");
  });

  it('does not invoke legacy pagination or collection reads from active seller screens', () => {
    const catalog = source('components/seller/SellerCatalog.tsx');
    const collections = source('components/seller/SellerCollections.tsx');
    expect(catalog).not.toMatch(/useInfiniteQuery|getProductsCatalog|productsCatalog|api\.getCollections/);
    expect(collections).not.toMatch(/useQuery|api\.getCollections|getProducts\(/);
  });

  it('keeps the legacy catalogue out of synchronous localStorage persistence', () => {
    const entrypoint = source('index.tsx');
    expect(entrypoint).not.toContain("'productsCatalog'");
  });

  it('caches only product images requested through the immutable image handler', () => {
    const serviceWorker = source('public/sw.js');
    expect(serviceWorker).toContain("request.destination === 'image'");
    expect(serviceWorker).toContain("'ilios-viewed-product-images-v1'");
    expect(serviceWorker).not.toContain('cache.addAll(PRECACHE_URLS.concat');
  });
});
